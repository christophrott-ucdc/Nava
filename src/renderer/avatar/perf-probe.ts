/**
 * Performance probes for the avatar (R4 / C-04), consumed by src/renderer/perf.ts (Agent B):
 *
 *  - FrameMeter: frames/s of TalkingHead's own render loop. The library calls `this.render()`
 *    from its rAF handler (throttled to opt.modelFPS), so wrapping the instance's `render`
 *    counts exactly the frames that reach the GPU. If the head is not wrappable, a private rAF
 *    loop measures the compositor rate instead (documented as such).
 *  - LipsyncLatencyProbe: after `lipsync(clip, startAtMs)`, polls the viseme morph targets each
 *    animation frame and records how late the first non-sil viseme actually appears compared to
 *    its scheduled time (0 = on time; 30-70 ms = one or two throttled frames late).
 */
import type { TalkingHead } from "@met4citizen/talkinghead";
import { OCULUS_VISEMES } from "./lipsync-ro";

const WINDOW_MS = 2000;
const STALL_MS = 1500;

export class FrameMeter {
  private stamps: number[] = [];
  private unwrap: (() => void) | null = null;
  private raf: number | null = null;
  private mode: "head" | "raf" | null = null;

  /** Wrap `head.render`; falls back to an own rAF loop. Idempotent per head. */
  attach(head: TalkingHead): void {
    this.detach();
    this.stamps = [];
    const original = (head as unknown as { render?: () => void }).render;
    if (typeof original === "function") {
      const bound = original.bind(head);
      const wrapped = (): void => {
        this.tick(performance.now());
        bound();
      };
      (head as unknown as { render: () => void }).render = wrapped;
      this.unwrap = () => {
        // Only restore if nobody else re-wrapped in between.
        if ((head as unknown as { render: () => void }).render === wrapped) delete (head as unknown as { render?: () => void }).render;
      };
      this.mode = "head";
      return;
    }
    this.mode = "raf";
    const loop = (t: number): void => {
      this.tick(t);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  detach(): void {
    this.unwrap?.();
    this.unwrap = null;
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.mode = null;
  }

  /** "head" = TalkingHead render calls; "raf" = compositor rate (fallback); null = not attached. */
  getMode(): "head" | "raf" | null {
    return this.mode;
  }

  /** null until attached and at least two frames were seen; 0 when the loop stalled. */
  getFps(): number | null {
    if (!this.mode) return null;
    const now = performance.now();
    this.trim(now);
    const n = this.stamps.length;
    if (n === 0) return null;
    if (now - this.stamps[n - 1] > STALL_MS) return 0;
    if (n < 2) return null;
    const span = this.stamps[n - 1] - this.stamps[0];
    return span > 0 ? Math.round(((n - 1) / span) * 1000 * 10) / 10 : null;
  }

  private tick(t: number): void {
    this.stamps.push(t);
    if (this.stamps.length > 400) this.trim(t);
  }

  private trim(now: number): void {
    const cutoff = now - WINDOW_MS;
    let i = 0;
    while (i < this.stamps.length && this.stamps[i] < cutoff) i++;
    if (i) this.stamps.splice(0, i);
  }
}

export interface LatencySample {
  /** Scheduled (expected) wall-clock time of the first non-sil viseme (performance.now() ms). */
  expectedAtMs: number;
  /** When a viseme morph target first exceeded the threshold; null if never within the window. */
  detectedAtMs: number | null;
  /** detected - expected, clamped at 0 (the ramp legitimately starts slightly before `expected`). */
  latencyMs: number | null;
  viseme: string | null;
}

const NON_SIL = OCULUS_VISEMES.filter((v) => v !== "sil").map((v) => `viseme_${v}`);

export class LipsyncLatencyProbe {
  private raf: number | null = null;
  private last: LatencySample | null = null;
  private warned = false;

  constructor(
    private readonly threshold = 0.05,
    private readonly windowMs = 500,
  ) {}

  /**
   * Start polling. `expectedAtMs` is the absolute time at which TalkingHead should show the first
   * non-sil viseme. Any probe already running is superseded (its sample is discarded).
   */
  start(head: TalkingHead, expectedAtMs: number): void {
    this.cancel();
    const sample: LatencySample = { expectedAtMs, detectedAtMs: null, latencyMs: null, viseme: null };
    const deadline = expectedAtMs + this.windowMs;
    // Values left over from the previous line are zeroed by resetLips(); still, arm on a
    // "was below threshold" observation so a decaying tail cannot count as the new onset.
    let armed = false;
    const poll = (): void => {
      this.raf = null;
      const now = performance.now();
      let hit: string | null = null;
      let maxValue = 0;
      for (const name of NON_SIL) {
        const value = head.getValue(name);
        if (typeof value !== "number" || !Number.isFinite(value)) continue;
        if (value > maxValue) maxValue = value;
        if (value > this.threshold) {
          hit = name;
          break;
        }
      }
      if (!armed) {
        // Arm as soon as the mouth is (nearly) closed, or after 120 ms regardless.
        if (maxValue <= this.threshold || now > expectedAtMs - 120) armed = true;
        else hit = null;
      }
      if (armed && hit) {
        sample.detectedAtMs = now;
        sample.latencyMs = Math.max(0, Math.round(now - expectedAtMs));
        sample.viseme = hit.replace(/^viseme_/, "");
        this.last = sample;
        return;
      }
      if (now > deadline) {
        this.last = sample; // latencyMs stays null: nothing moved
        if (!this.warned) {
          this.warned = true;
          console.warn(`[avatar] no viseme reached ${this.threshold} within ${this.windowMs} ms of its schedule — check morph targets / render loop`);
        }
        return;
      }
      this.raf = requestAnimationFrame(poll);
    };
    this.raf = requestAnimationFrame(poll);
  }

  cancel(): void {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  getLastSample(): LatencySample | null {
    return this.last;
  }

  /** Last measured latency in ms; null = never measured or the last line produced no viseme. */
  getLastLatencyMs(): number | null {
    return this.last?.latencyMs ?? null;
  }
}

/** First scheduled non-sil viseme time (ms, relative to the buffer start) or null. */
export function firstVisemeOffset(visemes: readonly string[] | undefined, vtimes: readonly number[] | undefined): number | null {
  if (!visemes?.length || !vtimes?.length) return null;
  let best: number | null = null;
  for (let i = 0; i < visemes.length && i < vtimes.length; i++) {
    if (visemes[i] === "sil" || !Number.isFinite(vtimes[i])) continue;
    if (best === null || vtimes[i] < best) best = vtimes[i];
  }
  return best;
}
