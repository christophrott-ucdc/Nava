/**
 * R4 / B-09 (skeleton) — room noise detector. OFF unless the page URL carries `?mic=1`
 * (the kiosk never opens a microphone by default). Measures the RMS of the default input
 * through an AnalyserNode (never connected to the output) and exposes a smoothed 0..1 level
 * that perf.ts reports as `roomLevel`. Never throws: without permission/device the level stays null.
 */

import type { Logger } from "./log";
import { getAudioContext } from "./voice/context";

export interface RoomMic {
  start(): Promise<void>;
  /** 0..1 smoothed loudness, null while off / unavailable. */
  getLevel(): number | null;
  isActive(): boolean;
  dispose(): void;
}

/** `?mic=1` (or `mic=true`) enables the detector. */
export function roomMicRequested(search: string): boolean {
  try {
    const v = new URLSearchParams(search).get("mic");
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

/** Speech/room RMS ~0.01..0.3 -> perceptual-ish 0..1. */
export function rmsToLevel(rms: number): number {
  if (!Number.isFinite(rms) || rms <= 0) return 0;
  return Math.min(1, Math.pow(Math.min(1, rms * 4), 0.6));
}

export function createRoomMic(opts: { enabled: boolean; log?: Logger }): RoomMic {
  let stream: MediaStream | null = null;
  let analyser: AnalyserNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let data: Float32Array<ArrayBuffer> | null = null;
  let level: number | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let disposed = false;

  const measure = () => {
    if (!analyser || !data) return;
    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    const target = rmsToLevel(Math.sqrt(sum / data.length));
    const cur = level ?? 0;
    level = cur + (target - cur) * (target > cur ? 0.5 : 0.15);
  };

  return {
    async start() {
      if (!opts.enabled || disposed || stream) return;
      if (!navigator.mediaDevices?.getUserMedia) {
        opts.log?.("warn", "room-mic: getUserMedia indisponibil");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
        if (disposed) {
          for (const t of stream.getTracks()) t.stop();
          stream = null;
          return;
        }
        const ctx = getAudioContext();
        source = ctx.createMediaStreamSource(stream);
        analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.6;
        data = new Float32Array(analyser.fftSize) as Float32Array<ArrayBuffer>;
        source.connect(analyser); // never to destination
        level = 0;
        timer = setInterval(measure, 100);
        opts.log?.("info", "room-mic: activ (RMS 0..1 → perf.roomLevel)");
      } catch (err) {
        opts.log?.("warn", `room-mic: indisponibil — ${err instanceof Error ? err.message : String(err)}`);
        level = null;
      }
    },
    getLevel: () => (level === null ? null : Math.round(level * 1000) / 1000),
    isActive: () => stream !== null,
    dispose() {
      disposed = true;
      if (timer !== null) clearInterval(timer);
      timer = null;
      try {
        source?.disconnect();
      } catch {
        /* ignore */
      }
      for (const t of stream?.getTracks() ?? []) t.stop();
      stream = null;
      level = null;
    },
  };
}
