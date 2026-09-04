/** Public VoiceEngine: offline manifest -> master TTS -> browser speech. */
import type { CreateVoiceEngine, PlaybackHandle, VoiceClip, VoiceEngine } from "../../shared/contracts";
import { SPEAKERS, type Lang, type Speaker, type VoiceManifest } from "../../shared/types";
import { cancelBrowserSpeech, speakWithBrowser, syntheticAmplitude, waitForVoices } from "./browser-tts";
import { getAudioContext, setSfxAudible, unlockAudio } from "./context";
import {
  base64ToArrayBuffer,
  clipFileUrl,
  fetchClipBytes,
  loadManifest,
  metaFromServer,
  requestServerTts,
} from "./manifest";
import { VoicePlayer } from "./playback";
import { playSfx as synthesizeSfx, type SfxHandle } from "./sfx";

function clipKey(clip: VoiceClip): string {
  return `${clip.lang}|${clip.cueId}|${clip.provider}|${clip.generatedAt}|${clip.file}`;
}

function validClipMeta(meta: VoiceManifest["clips"][string], cueId: string, speaker: Speaker, text: string, lang: Lang): boolean {
  return (
    meta.cueId === cueId &&
    meta.speaker === speaker &&
    meta.lang === lang &&
    meta.text.trim() === text.trim() &&
    typeof meta.file === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:mp3|wav)$/i.test(meta.file) &&
    (meta.mime === "audio/mpeg" || meta.mime === "audio/wav") &&
    (meta.provider === "elevenlabs" || meta.provider === "gemini" || meta.provider === "browser") &&
    typeof meta.generatedAt === "string" &&
    Number.isFinite(meta.durationMs) &&
    meta.durationMs > 0 &&
    Array.isArray(meta.words) &&
    meta.words.every((word) => typeof word === "string") &&
    Array.isArray(meta.wtimes) &&
    meta.wtimes.every(Number.isFinite) &&
    Array.isArray(meta.wdurations) &&
    meta.wdurations.every(Number.isFinite)
  );
}

class VoiceEngineImpl implements VoiceEngine {
  private readonly player: VoicePlayer;
  private readonly manifests = new Map<Lang, VoiceManifest | null>();
  private readonly preparing = new Map<Lang, Promise<void>>();
  private readonly clips = new Map<string, VoiceClip>();
  private readonly inflight = new Map<string, Promise<VoiceClip | null>>();
  private readonly sfx = new Set<SfxHandle>();
  private volume: number;

  constructor(private readonly opts: Parameters<CreateVoiceEngine>[0]) {
    this.volume = Math.max(0, Math.min(2, opts.initialVolume));
    this.player = new VoicePlayer(getAudioContext(), opts.audible, this.volume);
    setSfxAudible(opts.audible);
  }

  prepare(lang: Lang): Promise<void> {
    if (this.manifests.has(lang)) return Promise.resolve();
    const existing = this.preparing.get(lang);
    if (existing) return existing;
    const request = loadManifest(this.opts.voiceBaseUrl, lang)
      .then((manifest) => {
        this.manifests.set(lang, manifest);
        if (!manifest) console.info(`[voice] no offline ${lang} manifest; live/browser fallback enabled`);
      })
      .catch((err) => {
        // prepare() is contractually non-throwing for a missing or bad file.
        this.manifests.set(lang, null);
        console.warn(`[voice] manifest ${lang} failed:`, err);
      })
      .finally(() => this.preparing.delete(lang));
    this.preparing.set(lang, request);
    return request;
  }

  async getClip(cueId: string, speaker: Speaker, text: string, lang: Lang): Promise<VoiceClip | null> {
    const requestKey = `${lang}|${cueId}|${speaker}|${text}`;
    const cached = this.clips.get(requestKey);
    if (cached) return cached;
    const pending = this.inflight.get(requestKey);
    if (pending) return pending;
    const request = this.resolveClip(cueId, speaker, text, lang)
      .then((clip) => {
        if (clip) this.clips.set(requestKey, clip);
        return clip;
      })
      .finally(() => this.inflight.delete(requestKey));
    this.inflight.set(requestKey, request);
    return request;
  }

  private async resolveClip(cueId: string, speaker: Speaker, text: string, lang: Lang): Promise<VoiceClip | null> {
    await this.prepare(lang);
    const meta = this.manifests.get(lang)?.clips[cueId];
    if (meta) {
      if (!validClipMeta(meta, cueId, speaker, text, lang)) {
        console.warn(`[voice] ignoring stale/invalid manifest entry for ${cueId}`);
      } else {
        try {
          const audio = await fetchClipBytes(clipFileUrl(this.opts.voiceBaseUrl, lang, meta.file));
          if (!audio.byteLength) throw new Error("empty audio file");
          const clip: VoiceClip = { ...meta, audio };
          await this.player.decode(audio, clipKey(clip));
          return clip;
        } catch (err) {
          console.warn(`[voice] offline clip ${cueId} could not be decoded:`, err);
        }
      }
    }

    if (!this.opts.serverHttpUrl) return null;
    const response = await requestServerTts(this.opts.serverHttpUrl, { cueId, speaker, text, lang });
    if (!response.ok) {
      console.info(`[voice] live TTS unavailable for ${cueId}: ${response.reason}`);
      return null;
    }
    try {
      const audio = base64ToArrayBuffer(response.audioBase64);
      if (!audio.byteLength) throw new Error("empty server audio");
      const clip: VoiceClip = { ...metaFromServer(response, cueId, lang, speaker, text), audio };
      await this.player.decode(audio, clipKey(clip));
      return clip;
    } catch (err) {
      console.warn(`[voice] live clip ${cueId} could not be decoded:`, err);
      return null;
    }
  }

  play(clip: VoiceClip, speaker: Speaker): PlaybackHandle {
    if (!clip.audio) throw new Error(`Voice clip ${clip.cueId} has no audio bytes`);
    cancelBrowserSpeech();
    const key = clipKey(clip);
    const decoded = this.player.getDecoded(key) ?? this.player.decode(clip.audio, key);
    return this.player.play(decoded, SPEAKERS[speaker].fx, clip.durationMs);
  }

  speakFallback(text: string, speaker: Speaker, lang: Lang): PlaybackHandle {
    this.player.stop();
    return speakWithBrowser(text, speaker, lang, { volume: this.opts.audible ? Math.min(1, this.volume) : 0 });
  }

  stopAll(): void {
    this.player.stop();
    cancelBrowserSpeech();
    for (const handle of [...this.sfx]) handle.stop();
    this.sfx.clear();
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(2, Number.isFinite(v) ? v : 0));
    this.player.setVolume(this.volume);
  }

  getAmplitude(): number {
    return Math.max(this.player.getAmplitude(), syntheticAmplitude());
  }

  playSfx(name: Parameters<VoiceEngine["playSfx"]>[0], opts?: Parameters<VoiceEngine["playSfx"]>[1]): PlaybackHandle {
    const handle = synthesizeSfx(name, opts);
    this.sfx.add(handle);
    void handle.done.finally(() => this.sfx.delete(handle));
    return handle;
  }

  async unlock(): Promise<void> {
    await unlockAudio();
    // Warm the platform voice list without blocking boot for long. Chromium
    // populates it asynchronously on Windows.
    void waitForVoices();
  }
}

export const createVoiceEngine: CreateVoiceEngine = (opts) => new VoiceEngineImpl(opts);
