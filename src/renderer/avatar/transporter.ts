/**
 * Star Trek-style transporter wrapper for the avatar canvas (ported from
 * Exodus: Transporter.tsx + styles.css `aria-materialize` / `aria-transporter-fx`).
 *
 * The WebGL canvas stays mounted through every phase (rebuilding TalkingHead is
 * expensive); we animate opacity/filter on the body and mount a sparkle +
 * scan-beam overlay only during transitions. The energize sound comes from
 * ../voice/sfx (synthesized, no files).
 */
import { playTransporterSfx } from "../voice/sfx";

export type TransporterPhase = "hidden" | "in" | "shown" | "out";

// Must match the animation durations in the CSS below.
export const MATERIALIZE_MS = 1100;
export const DEMATERIALIZE_MS = 1000;

const STYLE_ID = "nava-transporter-css";

const CSS = `
.nava-transporter {
  position: relative;
  display: block;
  pointer-events: none;
  opacity: 0;
}
.nava-transporter.is-shown { opacity: 1; }
.nava-transporter.is-hidden { opacity: 0; }
.nava-transporter-body {
  position: absolute;
  inset: 0;
  will-change: opacity, filter;
}
.nava-transporter-body > canvas { display: block; width: 100% !important; height: 100% !important; }
.nava-transporter-body.is-in {
  animation: nava-materialize ${MATERIALIZE_MS}ms cubic-bezier(0.4, 0, 0.2, 1) both;
}
.nava-transporter-body.is-out {
  animation: nava-dematerialize ${DEMATERIALIZE_MS}ms cubic-bezier(0.4, 0, 0.2, 1) both;
}
@keyframes nava-materialize {
  0%   { opacity: 0;    filter: brightness(2.8) blur(4px); }
  14%  { opacity: 0.55; }
  26%  { opacity: 0.12; }
  44%  { opacity: 0.82; filter: brightness(1.7) blur(1.5px); }
  58%  { opacity: 0.38; }
  76%  { opacity: 0.95; filter: brightness(1.18) blur(0.5px); }
  100% { opacity: 1;    filter: none; }
}
@keyframes nava-dematerialize {
  0%   { opacity: 1;    filter: none; }
  20%  { opacity: 0.5;  }
  38%  { opacity: 0.9;  filter: brightness(1.8) blur(1px); }
  58%  { opacity: 0.22; }
  74%  { opacity: 0.55; filter: brightness(2.2) blur(2px); }
  100% { opacity: 0;    filter: brightness(3) blur(5px); }
}
/* Sparkle + scan-beam overlay, additive over the avatar. */
.nava-transporter-fx {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  mix-blend-mode: screen;
}
.nava-transporter-fx::before {
  content: "";
  position: absolute;
  inset: -12%;
  background-image:
    radial-gradient(rgba(255, 255, 255, 0.95) 1px, transparent 1.7px),
    radial-gradient(var(--hud-glow, oklch(0.85 0.18 200)) 1px, transparent 1.7px);
  background-size: 7px 7px, 11px 11px;
  background-position: 0 0, 3px 5px;
  animation: nava-sparkle ${MATERIALIZE_MS}ms linear both;
}
.nava-transporter-fx::after {
  content: "";
  position: absolute;
  left: -10%;
  right: -10%;
  height: 42%;
  background: linear-gradient(
    to bottom,
    transparent,
    color-mix(in oklab, var(--hud-glow, oklch(0.85 0.18 200)) 70%, transparent),
    #ffffff,
    color-mix(in oklab, var(--hud, oklch(0.78 0.16 215)) 55%, transparent),
    transparent
  );
  filter: blur(3px);
  animation: nava-beam ${MATERIALIZE_MS}ms ease-in-out both;
}
.nava-transporter-fx.is-out::before { animation-duration: ${DEMATERIALIZE_MS}ms; }
.nava-transporter-fx.is-out::after { animation-name: nava-beam-up; animation-duration: ${DEMATERIALIZE_MS}ms; }
@keyframes nava-sparkle {
  0%   { opacity: 0;    transform: translateY(9%) scale(1.04); }
  18%  { opacity: 1;    }
  82%  { opacity: 0.85; }
  100% { opacity: 0;    transform: translateY(-9%) scale(1); }
}
@keyframes nava-beam {
  0%   { top: -45%; opacity: 0; }
  18%  { opacity: 1; }
  100% { top: 100%; opacity: 0; }
}
@keyframes nava-beam-up {
  0%   { top: 100%; opacity: 0; }
  18%  { opacity: 1; }
  100% { top: -45%; opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .nava-transporter-body.is-in,
  .nava-transporter-body.is-out { animation: none; }
  .nava-transporter-fx { display: none; }
}
`;

export function ensureTransporterStyles(doc: Document = document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

export interface TransporterOptions {
  /** Play the energize sound (default true). */
  sound?: boolean;
  onPhase?: (phase: TransporterPhase) => void;
}

export class Transporter {
  readonly root: HTMLDivElement;
  /** Mount point for the TalkingHead canvas. */
  readonly body: HTMLDivElement;
  private fx: HTMLDivElement | null = null;
  private phase: TransporterPhase = "hidden";
  private timer: number | null = null;
  private readonly opts: TransporterOptions;

  constructor(container: HTMLElement, opts: TransporterOptions = {}) {
    this.opts = opts;
    ensureTransporterStyles(container.ownerDocument);
    this.root = container.ownerDocument.createElement("div");
    this.root.className = "nava-transporter is-hidden";
    this.root.setAttribute("aria-hidden", "true");
    this.body = container.ownerDocument.createElement("div");
    this.body.className = "nava-transporter-body";
    this.root.appendChild(this.body);
    container.appendChild(this.root);
  }

  getPhase(): TransporterPhase {
    return this.phase;
  }

  isVisible(): boolean {
    return this.phase === "shown" || this.phase === "in";
  }

  setSize(widthPx: number, heightPx: number): void {
    this.root.style.width = `${Math.round(widthPx)}px`;
    this.root.style.height = `${Math.round(heightPx)}px`;
  }

  show(animate = true): void {
    if (this.phase === "shown" || this.phase === "in") return;
    if (!animate) {
      this.settle("shown");
      return;
    }
    this.transition("in");
  }

  hide(animate = true): void {
    if (this.phase === "hidden" || this.phase === "out") return;
    if (!animate) {
      this.settle("hidden");
      return;
    }
    this.transition("out");
  }

  dispose(): void {
    this.clearTimer();
    this.removeFx();
    this.root.remove();
  }

  private transition(next: "in" | "out"): void {
    this.clearTimer();
    this.removeFx();
    this.phase = next;
    // During a transition the keyframes own opacity (fill: both).
    this.root.classList.remove("is-hidden", "is-shown");
    this.root.style.opacity = "";
    this.body.classList.remove("is-in", "is-out");
    // Force a reflow so re-adding the class restarts the animation.
    void this.body.offsetWidth;
    this.body.classList.add(next === "in" ? "is-in" : "is-out");

    this.fx = this.root.ownerDocument.createElement("div");
    this.fx.className = `nava-transporter-fx ${next === "in" ? "is-in" : "is-out"}`;
    this.root.appendChild(this.fx);

    if (this.opts.sound !== false) {
      try {
        playTransporterSfx(next);
      } catch {
        /* audio not available */
      }
    }
    this.opts.onPhase?.(this.phase);

    const ms = next === "in" ? MATERIALIZE_MS : DEMATERIALIZE_MS;
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.settle(next === "in" ? "shown" : "hidden");
    }, ms);
  }

  private settle(phase: "shown" | "hidden"): void {
    this.clearTimer();
    this.removeFx();
    this.phase = phase;
    this.body.classList.remove("is-in", "is-out");
    this.root.classList.toggle("is-shown", phase === "shown");
    this.root.classList.toggle("is-hidden", phase === "hidden");
    this.root.setAttribute("aria-hidden", phase === "hidden" ? "true" : "false");
    this.opts.onPhase?.(phase);
  }

  private removeFx(): void {
    if (this.fx) {
      this.fx.remove();
      this.fx = null;
    }
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
