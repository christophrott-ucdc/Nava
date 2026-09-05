/**
 * R4 / B-02 — 1 Hz performance sampler. EVERY screen builds a PerfSample and sends it to the
 * server (`{type:"perf", sample}` through SyncClient.sendPerf); the debug page aggregates them.
 *
 *   videoDropped/videoTotal  video.getVideoPlaybackQuality()
 *   videoFps                 frames presented in the last interval (requestVideoFrameCallback
 *                            counter; falls back to the totalVideoFrames delta)
 *   avatarFps                avatar.getFps?.()               (C-04, null on the null avatar)
 *   lipsyncLatencyMs         avatar.getLastLipsyncLatencyMs?.()
 *   driftSec                 last sync drift (null on the clock source)
 *   roomLevel                room-mic RMS 0..1 (B-09; null when off)
 *   heapMb                   performance.memory.usedJSHeapSize (Chromium only)
 *   audioOutput              label of the routed output device (B-01)
 *
 * The pure helpers (computeFps, formatPerfLine) are unit-tested in perf.test.ts.
 */

import type { AvatarController } from "../shared/contracts";
import type { PerfSample } from "../shared/types";
import type { Logger } from "./log";

export interface PerfDeps {
  screenId: string;
  video: HTMLVideoElement;
  avatar: AvatarController;
  getDriftSec: () => number | null;
  /** B-09 room microphone level (null = disabled). */
  getRoomLevel?: () => number | null;
  /** B-01 output device label (null = unknown). */
  getAudioOutput?: () => string | null;
  /** Transport (SyncClient.sendPerf). Called only when a sample was built. */
  send: (sample: PerfSample) => void;
  /** OSD hook. */
  onSample?: (sample: PerfSample, line: string) => void;
  log?: Logger;
  /** Default 1000 ms. */
  intervalMs?: number;
}

export interface PerfMonitor {
  start(): void;
  stop(): void;
  last(): PerfSample | null;
}

/** Frames per second from a frame counter over `elapsedMs`; null when nothing can be measured. */
export function computeFps(frames: number, elapsedMs: number): number | null {
  if (!Number.isFinite(frames) || !Number.isFinite(elapsedMs) || elapsedMs <= 0 || frames < 0) return null;
  return Math.round((frames * 1000) / elapsedMs);
}

/** Compact OSD line, e.g. "video 60 fps · 3/8123 pierdute · avatar 58 fps · lipsync 42 ms · heap 312 MB · HDMI". */
export function formatPerfLine(s: PerfSample): string {
  const parts: string[] = [];
  parts.push(s.videoFps === null ? "video — fps" : `video ${s.videoFps} fps`);
  if (s.videoTotal > 0) parts.push(`${s.videoDropped}/${s.videoTotal} pierdute`);
  if (s.avatarFps !== null) parts.push(`avatar ${s.avatarFps} fps`);
  if (s.lipsyncLatencyMs !== null) parts.push(`lipsync ${Math.round(s.lipsyncLatencyMs)} ms`);
  if (s.roomLevel !== null) parts.push(`sală ${Math.round(s.roomLevel * 100)}%`);
  if (s.heapMb !== null) parts.push(`heap ${Math.round(s.heapMb)} MB`);
  if (s.audioOutput) parts.push(s.audioOutput);
  return parts.join(" · ");
}

interface PerfMemory {
  usedJSHeapSize?: number;
}

export function readHeapMb(): number | null {
  try {
    const mem = (performance as Performance & { memory?: PerfMemory }).memory;
    const used = mem?.usedJSHeapSize;
    return typeof used === "number" && Number.isFinite(used) ? Math.round(used / 1048576) : null;
  } catch {
    return null;
  }
}

type RvfcVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: unknown) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

export function createPerfMonitor(deps: PerfDeps): PerfMonitor {
  const interval = Math.max(250, deps.intervalMs ?? 1000);
  let timer: ReturnType<typeof setInterval> | null = null;
  let last: PerfSample | null = null;
  let lastAt = 0;
  let rvfcFrames = 0;
  let rvfcHandle = 0;
  let lastTotal: number | null = null;
  const video = deps.video as RvfcVideo;
  const hasRvfc = typeof video.requestVideoFrameCallback === "function";

  const armRvfc = () => {
    if (!hasRvfc || timer === null) return;
    rvfcHandle = video.requestVideoFrameCallback!(() => {
      rvfcFrames++;
      armRvfc();
    });
  };

  const sample = () => {
    const now = performance.now();
    const elapsed = lastAt ? now - lastAt : interval;
    lastAt = now;
    let dropped = 0;
    let total = 0;
    try {
      const q = typeof deps.video.getVideoPlaybackQuality === "function" ? deps.video.getVideoPlaybackQuality() : null;
      if (q) {
        dropped = q.droppedVideoFrames;
        total = q.totalVideoFrames;
      }
    } catch {
      /* ignore */
    }
    let fps: number | null;
    if (hasRvfc) {
      fps = computeFps(rvfcFrames, elapsed);
      rvfcFrames = 0;
    } else {
      fps = lastTotal === null ? null : computeFps(total - lastTotal, elapsed);
      lastTotal = total;
    }
    if (deps.video.paused) fps = fps ?? 0;
    let avatarFps: number | null = null;
    let lipsync: number | null = null;
    try {
      avatarFps = deps.avatar.getFps?.() ?? null;
      lipsync = deps.avatar.getLastLipsyncLatencyMs?.() ?? null;
    } catch {
      /* diagnostics must never break the loop */
    }
    const s: PerfSample = {
      screenId: deps.screenId,
      atMs: Date.now(),
      videoDropped: dropped,
      videoTotal: total,
      videoFps: fps,
      avatarFps,
      lipsyncLatencyMs: lipsync,
      driftSec: deps.getDriftSec(),
      roomLevel: deps.getRoomLevel?.() ?? null,
      heapMb: readHeapMb(),
      audioOutput: deps.getAudioOutput?.() ?? null,
    };
    last = s;
    try {
      deps.send(s);
    } catch (err) {
      deps.log?.("warn", `perf send failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    try {
      deps.onSample?.(s, formatPerfLine(s));
    } catch {
      /* ignore */
    }
  };

  return {
    start() {
      if (timer !== null) return;
      lastAt = performance.now();
      rvfcFrames = 0;
      timer = setInterval(sample, interval);
      armRvfc();
    },
    stop() {
      if (timer !== null) clearInterval(timer);
      timer = null;
      if (hasRvfc && rvfcHandle) {
        try {
          video.cancelVideoFrameCallback?.(rvfcHandle);
        } catch {
          /* ignore */
        }
      }
      rvfcHandle = 0;
    },
    last: () => last,
  };
}
