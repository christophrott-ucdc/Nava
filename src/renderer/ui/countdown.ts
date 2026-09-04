/**
 * Centre-screen countdown (from -> to over durationSec). Driven by the PHASE CLOCK
 * (not wall time), so pausing the show freezes the digits and every screen shows the
 * same digit at the same phaseTime. Silent unless the caller wires `onTick` (spoken).
 */

export interface CountdownRun {
  from: number;
  to: number;
  durationSec: number;
  /** phaseTime at which the countdown started (cue.at, or "now" for manual fire). */
  startAt: number;
  /** Current phaseTime getter. */
  now: () => number;
  /** Called once per digit change (including the first digit). */
  onTick?: (value: number) => void;
  /** How long to hold the last digit before fading (ms). Default 900. */
  holdMs?: number;
}

export interface Countdown {
  /** Starts a run; cancels any previous one. Resolves when the countdown finished or was cancelled. */
  run(opts: CountdownRun): Promise<void>;
  cancel(): void;
  isRunning(): boolean;
  setEnabled(enabled: boolean): void;
}

export function createCountdown(el: HTMLElement, opts: { enabled: boolean }): Countdown {
  const digitEl = el.querySelector<HTMLElement>(".digit") ?? el;
  let enabled = opts.enabled;
  let raf = 0;
  let running = false;
  let finish: (() => void) | null = null;

  const stop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    running = false;
    el.classList.remove("on");
    digitEl.classList.remove("pulse", "zero");
    const f = finish;
    finish = null;
    f?.();
  };

  const showDigit = (value: number) => {
    if (!enabled) return;
    digitEl.textContent = String(value);
    digitEl.classList.toggle("zero", value === 0);
    // Restart the pulse animation.
    digitEl.classList.remove("pulse");
    void digitEl.offsetWidth;
    digitEl.classList.add("pulse");
    el.classList.add("on");
  };

  return {
    run(o) {
      stop();
      const steps = Math.abs(o.from - o.to);
      const dir = o.to < o.from ? -1 : 1;
      const stepSec = steps > 0 ? o.durationSec / steps : o.durationSec;
      const holdSec = (o.holdMs ?? 900) / 1000;
      let lastValue: number | null = null;
      running = true;

      return new Promise<void>((resolve) => {
        finish = resolve;
        const frame = () => {
          if (!running) return;
          const elapsed = o.now() - o.startAt;
          if (elapsed < -0.05) {
            // Phase clock moved before the start (seek back): the cue re-arms, we stop.
            stop();
            return;
          }
          const idx = Math.min(steps, Math.max(0, Math.floor(elapsed / stepSec + 1e-6)));
          const value = o.from + dir * idx;
          if (value !== lastValue) {
            lastValue = value;
            showDigit(value);
            try {
              o.onTick?.(value);
            } catch {
              /* ignore tick errors */
            }
          }
          if (elapsed >= o.durationSec + holdSec) {
            stop();
            return;
          }
          raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
      });
    },
    cancel: stop,
    isRunning: () => running,
    setEnabled(v) {
      enabled = v;
      if (!v) el.classList.remove("on");
    },
  };
}
