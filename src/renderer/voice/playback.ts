/**
 * Voice playback through Web Audio with a per-speaker FX chain and an
 * analyser for amplitude metering. One voice at a time.
 *
 *  source -> fx.input ... fx.output -> analyser -> voiceGain -> master -> destination
 *
 * `master` is 0 on inaudible (follower) screens: the graph still runs so
 * timing/amplitude stay identical to the master screen.
 *
 * R4 / B-06 (rehearse): at playbackRate != 1 the clip is played through an
 * HTMLAudioElement (blob URL) with `preservesPitch = true`, routed into the same
 * FX/analyser graph via createMediaElementSource (AudioBufferSourceNode cannot
 * preserve pitch). Rate 1 keeps the sample-accurate AudioBufferSourceNode path.
 */
import type { PlaybackHandle } from "../../shared/contracts";
import { createFxChain, type FxChain, type FxName } from "./fx";

export interface VoicePlaybackHandle extends PlaybackHandle {
  /** performance.now() at which the source was scheduled (after decode, if needed). */
  started: Promise<number>;
}

/** Voices are compressed at most this much even when the video runs faster (intelligibility). */
export const MAX_VOICE_RATE = 2.5;

export interface RawClipAudio {
  bytes: ArrayBuffer;
  mime: string;
}

export class VoicePlayer {
  private readonly ctx: AudioContext;
  private readonly master: GainNode;
  private readonly voiceGain: GainNode;
  private readonly analyser: AnalyserNode;
  private readonly timeData: Float32Array<ArrayBuffer>;
  private readonly decoded = new Map<string, AudioBuffer>();
  private current: { fx: FxChain; stop(): void } | null = null;
  private amp = 0;
  private lastAmpAt = 0;
  private rate = 1;

  constructor(ctx: AudioContext, audible: boolean, initialVolume: number) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = audible ? 1 : 0;
    this.voiceGain = ctx.createGain();
    this.voiceGain.gain.value = Math.max(0, initialVolume);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.5;
    this.timeData = new Float32Array(this.analyser.fftSize) as Float32Array<ArrayBuffer>;
    this.analyser.connect(this.voiceGain).connect(this.master).connect(ctx.destination);
  }

  setAudible(on: boolean): void {
    this.master.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.02);
  }

  setVolume(v: number): void {
    this.voiceGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.voiceGain.gain.setTargetAtTime(Math.max(0, Math.min(2, v)), this.ctx.currentTime, 0.03);
  }

  /** Playback rate for the NEXT clips (clamped to 0.25..MAX_VOICE_RATE); 1 = Web Audio path. */
  setPlaybackRate(rate: number): void {
    this.rate = Number.isFinite(rate) && rate > 0 ? Math.min(MAX_VOICE_RATE, Math.max(0.25, rate)) : 1;
  }

  getPlaybackRate(): number {
    return this.rate;
  }

  /** Decode (and cache by key). The input buffer is copied; the caller keeps ownership. */
  async decode(bytes: ArrayBuffer, key: string): Promise<AudioBuffer> {
    const hit = this.decoded.get(key);
    if (hit) return hit;
    const buf = await this.ctx.decodeAudioData(bytes.slice(0));
    this.decoded.set(key, buf);
    return buf;
  }

  getDecoded(key: string): AudioBuffer | undefined {
    return this.decoded.get(key);
  }

  isPlaying(): boolean {
    return this.current !== null;
  }

  /**
   * Start playback. If `buffer` is a promise (not yet decoded) the source starts
   * as soon as it resolves; `started` tells the caller when that happened.
   * `raw` (bytes + mime) enables the pitch-preserving element path when rate != 1.
   */
  play(buffer: AudioBuffer | Promise<AudioBuffer>, fx: FxName, durationMs: number, raw?: RawClipAudio): VoicePlaybackHandle {
    this.stop();
    if (Math.abs(this.rate - 1) > 1e-3 && raw && raw.bytes.byteLength > 0) return this.playElement(raw, fx, durationMs);
    const ctx = this.ctx;
    const chain = createFxChain(ctx, fx);
    chain.output.connect(this.analyser);
    const source = ctx.createBufferSource();
    source.connect(chain.input);

    let finished = false;
    let resolveDone: () => void = () => undefined;
    let resolveStarted: (t: number) => void = () => undefined;
    const done = new Promise<void>((r) => {
      resolveDone = r;
    });
    const started = new Promise<number>((r) => {
      resolveStarted = r;
    });
    let safety: number | null = null;

    const finish = () => {
      if (finished) return;
      finished = true;
      if (safety !== null) window.clearTimeout(safety);
      try {
        source.onended = null;
        source.stop();
      } catch {
        /* already stopped */
      }
      try {
        source.disconnect();
      } catch {
        /* ignore */
      }
      // Let reverb tails ring out before tearing the chain down.
      window.setTimeout(() => chain.dispose(), 5000);
      if (this.current === entry) this.current = null;
      resolveDone();
    };

    const entry = { fx: chain, stop: finish };
    this.current = entry;

    const begin = (buf: AudioBuffer) => {
      if (finished) return;
      source.buffer = buf;
      source.onended = finish;
      source.start(ctx.currentTime);
      resolveStarted(performance.now());
      // In case `ended` never fires (context suspended...), close out anyway.
      safety = window.setTimeout(finish, buf.duration * 1000 + 2500);
    };

    if (buffer instanceof Promise) {
      buffer.then(begin).catch((err) => {
        console.warn("[voice] decode failed:", err);
        finish();
      });
    } else {
      begin(buffer);
    }

    return { done, stop: finish, durationMs, started };
  }

  /** Rehearse path: HTMLAudioElement (preservesPitch) -> MediaElementSource -> fx -> analyser. */
  private playElement(raw: RawClipAudio, fx: FxName, durationMs: number): VoicePlaybackHandle {
    const ctx = this.ctx;
    const rate = this.rate;
    const chain = createFxChain(ctx, fx);
    chain.output.connect(this.analyser);
    const url = URL.createObjectURL(new Blob([raw.bytes], { type: raw.mime || "audio/mpeg" }));
    const el = new Audio();
    el.preload = "auto";
    el.src = url;
    try {
      el.preservesPitch = true;
    } catch {
      /* older engines */
    }
    el.playbackRate = rate;
    el.volume = 1;
    let mediaSource: MediaElementAudioSourceNode | null = null;
    try {
      mediaSource = ctx.createMediaElementSource(el);
      mediaSource.connect(chain.input);
    } catch (err) {
      console.warn("[voice] createMediaElementSource failed; element plays directly:", err);
    }

    let finished = false;
    let resolveDone: () => void = () => undefined;
    let resolveStarted: (t: number) => void = () => undefined;
    const done = new Promise<void>((r) => {
      resolveDone = r;
    });
    const started = new Promise<number>((r) => {
      resolveStarted = r;
    });
    const effectiveMs = Math.round(durationMs / rate);
    let safety: number | null = null;

    const finish = () => {
      if (finished) return;
      finished = true;
      if (safety !== null) window.clearTimeout(safety);
      try {
        el.onended = null;
        el.pause();
        el.removeAttribute("src");
        el.load();
      } catch {
        /* ignore */
      }
      try {
        mediaSource?.disconnect();
      } catch {
        /* ignore */
      }
      URL.revokeObjectURL(url);
      window.setTimeout(() => chain.dispose(), 5000);
      if (this.current === entry) this.current = null;
      resolveDone();
    };

    const entry = { fx: chain, stop: finish };
    this.current = entry;
    el.onended = finish;
    el.onerror = () => {
      console.warn("[voice] element playback error (rehearse path)");
      finish();
    };
    el.onplaying = () => resolveStarted(performance.now());
    safety = window.setTimeout(finish, effectiveMs + 2500);
    el.play().catch((err: unknown) => {
      console.warn("[voice] element play() rejected:", err);
      finish();
    });

    return { done, stop: finish, durationMs: effectiveMs, started };
  }

  stop(): void {
    const cur = this.current;
    if (cur) {
      this.current = null;
      cur.stop();
    }
  }

  /** 0..1 smoothed loudness of the voice going through the analyser. */
  getAmplitude(): number {
    const now = performance.now();
    const dt = Math.min(100, Math.max(1, now - this.lastAmpAt));
    this.lastAmpAt = now;
    if (!this.current) {
      this.amp *= Math.exp(-dt / 120);
      return this.amp < 0.005 ? 0 : this.amp;
    }
    this.analyser.getFloatTimeDomainData(this.timeData);
    let sum = 0;
    for (let i = 0; i < this.timeData.length; i++) sum += this.timeData[i] * this.timeData[i];
    const rms = Math.sqrt(sum / this.timeData.length);
    // Speech RMS ~0.03..0.25 -> perceptual-ish curve into 0..1
    const target = Math.min(1, Math.pow(Math.min(1, rms * 4), 0.7));
    const tau = target > this.amp ? 25 : 140; // fast attack, slower release
    this.amp += (target - this.amp) * (1 - Math.exp(-dt / tau));
    return this.amp;
  }
}
