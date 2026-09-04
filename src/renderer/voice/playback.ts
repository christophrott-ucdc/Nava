/**
 * Voice playback through Web Audio with a per-speaker FX chain and an
 * analyser for amplitude metering. One voice at a time.
 *
 *  source -> fx.input ... fx.output -> analyser -> voiceGain -> master -> destination
 *
 * `master` is 0 on inaudible (follower) screens: the graph still runs so
 * timing/amplitude stay identical to the master screen.
 */
import type { PlaybackHandle } from "../../shared/contracts";
import { createFxChain, type FxChain, type FxName } from "./fx";

export interface VoicePlaybackHandle extends PlaybackHandle {
  /** performance.now() at which the source was scheduled (after decode, if needed). */
  started: Promise<number>;
}

export class VoicePlayer {
  private readonly ctx: AudioContext;
  private readonly master: GainNode;
  private readonly voiceGain: GainNode;
  private readonly analyser: AnalyserNode;
  private readonly timeData: Float32Array<ArrayBuffer>;
  private readonly decoded = new Map<string, AudioBuffer>();
  private current: { source: AudioBufferSourceNode; fx: FxChain; stop(): void } | null = null;
  private amp = 0;
  private lastAmpAt = 0;

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
   */
  play(buffer: AudioBuffer | Promise<AudioBuffer>, fx: FxName, durationMs: number): VoicePlaybackHandle {
    this.stop();
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
      if (this.current?.source === source) this.current = null;
      resolveDone();
    };

    const entry = { source, fx: chain, stop: finish };
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
