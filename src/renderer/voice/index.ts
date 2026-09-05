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
import { MAX_VOICE_RATE, VoicePlayer } from "./playback";
import { playSfx as synthesizeSfx, type SfxHandle } from "./sfx";

export { setTtsAuthToken } from "./manifest";

/**
 * R4 / B-06 — rehearse support is NOT part of the shared VoiceEngine contract (src/shared is frozen
 * for agents); the real engine implements it and callers probe for it with `setVoicePlaybackRate`.
 * Proposed contract addition: `setPlaybackRate?(rate: number): void`.
 */
export interface RateAwareVoiceEngine extends VoiceEngine {
  setVoiceBaseUrl(url:string):Promise<void>;
  isPrepared(lang:Lang):boolean;
  /** Voices play at min(rate, MAX_VOICE_RATE) with pitch preserved (HTMLAudioElement path when rate != 1). */
  setPlaybackRate(rate: number): void;
}

export function setVoicePlaybackRate(voice: VoiceEngine, rate: number): void {
  const maybe = voice as Partial<RateAwareVoiceEngine>;
  if (typeof maybe.setPlaybackRate === "function") maybe.setPlaybackRate(rate);
}

function clipKey(clip: VoiceClip): string {
  return `${clip.lang}|${clip.cueId}|${clip.provider}|${clip.generatedAt}|${clip.file}`;
}

function requestKey(lang: Lang, cueId: string, speaker: Speaker, text: string): string {
  return `${lang}|${cueId}|${speaker}|${text}`;
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

class VoiceEngineImpl implements RateAwareVoiceEngine {
  private sourceEpoch=0;
  async setVoiceBaseUrl(url:string):Promise<void> {
    if(this.opts.voiceBaseUrl===url){await this.prepare('ro');return;}
    this.sourceEpoch++;this.opts.voiceBaseUrl=url;
    this.manifests.clear();this.preparing.clear();this.clips.clear();this.inflight.clear();this.preloadFailures.clear();
    await this.prepare('ro');
  }
  private readonly player: VoicePlayer;
  isPrepared(lang:Lang):boolean{return !!this.manifests.get(lang)&&!this.preparing.has(lang)&&this.preloadFailures.size===0;}
  private readonly manifests = new Map<Lang, VoiceManifest | null>();
  private readonly preparing = new Map<Lang, Promise<void>>();
  private readonly clips = new Map<string, VoiceClip>();
  /** Manifest entries that failed readiness; never retry their I/O on the live cue boundary. */
  private readonly preloadFailures = new Set<string>();
  private readonly inflight = new Map<string, Promise<VoiceClip | null>>();
  private readonly sfx = new Set<SfxHandle>();
  private volume: number;
  private rate = 1;

  constructor(private readonly opts: Parameters<CreateVoiceEngine>[0]) {
    this.volume = Math.max(0, Math.min(2, opts.initialVolume));
    this.player = new VoicePlayer(getAudioContext(), opts.audible, this.volume);
    setSfxAudible(opts.audible);
  }

  prepare(lang: Lang): Promise<void> {
    const epoch=this.sourceEpoch;
    const existing = this.preparing.get(lang);
    if (existing) return existing;
    if (this.manifests.has(lang)) return Promise.resolve();
    const request = loadManifest(this.opts.voiceBaseUrl, lang)
      .then(async (manifest) => {
        if(epoch!==this.sourceEpoch)return;
        this.manifests.set(lang, manifest);
        if (!manifest) console.info(`[voice] no offline ${lang} manifest; each cue's fallback policy will be enforced`);
        else await this.preloadManifest(manifest,epoch,this.opts.voiceBaseUrl);
      })
      .catch((err) => {
        if(epoch!==this.sourceEpoch)return;
        // prepare() is contractually non-throwing for a missing or bad file.
        this.manifests.set(lang, null);
        console.warn(`[voice] manifest ${lang} failed:`, err);
      })
      .finally(() => {if(epoch===this.sourceEpoch)this.preparing.delete(lang);});
    this.preparing.set(lang, request);
    return request;
  }

  async getClip(cueId: string, speaker: Speaker, text: string, lang: Lang): Promise<VoiceClip | null> {
    const key = requestKey(lang, cueId, speaker, text);
    const cached = this.clips.get(key);
    if (cached) return cached;
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const request = this.resolveClip(cueId, speaker, text, lang)
      .then((clip) => {
        if (clip) this.clips.set(key, clip);
        return clip;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, request);
    return request;
  }

  /**
   * Fetch and decode the complete offline manifest before the show can be armed. Cue playback then
   * reads an already-decoded buffer from memory instead of racing the next tightly-spaced cue.
   * Individual failures stay non-fatal but are remembered: production cues still honour
   * `fallback: "silent"`, without retrying network I/O or decode on the live cue boundary.
   */
  private async preloadManifest(manifest: VoiceManifest,epoch:number,base:string): Promise<void> {
    const entries = Object.values(manifest.clips);
    if (!entries.length) return;
    let cursor = 0;
    const workers = Array.from({ length: Math.min(6, entries.length) }, async () => {
      while (cursor < entries.length) {
        if(epoch!==this.sourceEpoch)return;
        const meta = entries[cursor++];
        if (!validClipMeta(meta, meta.cueId, meta.speaker, meta.text, manifest.lang)) {
          console.warn(`[voice] skipping malformed manifest entry for ${meta?.cueId ?? "?"}`);
          this.preloadFailures.add(meta?.cueId??'invalid');
          continue;
        }
        const key = requestKey(manifest.lang, meta.cueId, meta.speaker, meta.text);
        if (this.clips.has(key)) continue;
        try {
          const audio = await fetchClipBytes(clipFileUrl(base, manifest.lang, meta.file));
          if (!audio.byteLength) throw new Error("empty audio file");
          const clip: VoiceClip = { ...meta, audio };
          await this.player.decode(audio, clipKey(clip));
          if(epoch!==this.sourceEpoch)return;
          this.clips.set(key, clip);
          this.preloadFailures.delete(key);
        } catch (err) {
          if(epoch!==this.sourceEpoch)return;
          this.preloadFailures.add(key);
          console.warn(`[voice] preload failed for ${meta.cueId}:`, err);
        }
      }
    });
    await Promise.all(workers);
  }

  private async resolveClip(cueId: string, speaker: Speaker, text: string, lang: Lang): Promise<VoiceClip | null> {
    await this.prepare(lang);
    const meta = this.manifests.get(lang)?.clips[cueId];
    if (meta) {
      const key = requestKey(lang, cueId, speaker, text);
      if (this.preloadFailures.has(key)) {
        console.warn(`[voice] ${cueId} failed readiness; skipping cue-time fetch/decode`);
        return null;
      }
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
    return this.player.play(decoded, SPEAKERS[speaker].fx, clip.durationMs, { bytes: clip.audio, mime: clip.mime });
  }

  speakFallback(text: string, speaker: Speaker, lang: Lang): PlaybackHandle {
    this.player.stop();
    return speakWithBrowser(text, speaker, lang, { volume: this.opts.audible ? Math.min(1, this.volume) : 0, rate: this.rate });
  }

  /** R4 / B-06 — rehearse: voices at min(rate, MAX_VOICE_RATE), pitch preserved. */
  setPlaybackRate(rate: number): void {
    this.rate = Number.isFinite(rate) && rate > 0 ? Math.min(MAX_VOICE_RATE, Math.max(0.25, rate)) : 1;
    this.player.setPlaybackRate(this.rate);
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
