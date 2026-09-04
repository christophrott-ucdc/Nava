/**
 * Procedural "civilisation avatars" drawn on a 2D canvas in the centre of the screen:
 *   LUMINA     — golden flame of particles that dissolves and re-forms
 *   NATURA     — green branching tree growing organically, fine rain, two leaf-like glowing eyes
 *   TEHNOLOGIC — sharp cyan crystal lattice, mirror-symmetric rotating polygons
 * Each pulses with the voice amplitude (voice.getAmplitude()). DPR-aware, backing store
 * capped (cheap at 4K), rAF only while something is visible.
 */

import type { Speaker } from "../../shared/types";

export type EntityId = Exclude<Speaker, "AVATAR_AI" | "CAPITANUL">;
export const ENTITY_IDS: readonly EntityId[] = ["LUMINA", "NATURA", "TEHNOLOGIC"];

export function isEntityId(v: unknown): v is EntityId {
  return typeof v === "string" && (ENTITY_IDS as readonly string[]).includes(v);
}

export interface Entities {
  show(id: EntityId): void;
  hide(id: EntityId): void;
  hideAll(immediate?: boolean): void;
  /** Which entity is currently speaking (gets the full amplitude; others breathe softly). */
  setSpeaking(id: EntityId | null): void;
  visible(): EntityId[];
  setEnabled(enabled: boolean): void;
  dispose(): void;
}

interface Frame {
  ctx: CanvasRenderingContext2D;
  /** Seconds since renderer start. */
  t: number;
  dt: number;
  /** Smoothed amplitude 0..1 for this entity. */
  amp: number;
  /** Fade alpha 0..1 for this entity. */
  alpha: number;
  /** 1 px in unit space (unit space: centre 0,0; radius 1 = half the canvas). */
  px: number;
}

interface EntityRenderer {
  reset(): void;
  draw(f: Frame): void;
}

/** Deterministic PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TAU = Math.PI * 2;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v: number) => {
  const x = clamp01(v);
  return x * x * (3 - 2 * x);
};

// ---------------------------------------------------------------------------
// LUMINA — flame of particles
// ---------------------------------------------------------------------------

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  s1: number;
  s2: number;
  s3: number;
  phase: number;
  speed: number;
  size: number;
  color: number;
}

const LUMINA_COLORS = ["#fcd34d", "#fde68a", "#ffffff", "#f59e0b"];

class LuminaRenderer implements EntityRenderer {
  private particles: Particle[] = [];
  private seed = 1;

  reset(): void {
    const r = rng(this.seed++ * 7919 + 13);
    const n = 520;
    this.particles = [];
    for (let i = 0; i < n; i++) {
      const s1 = r();
      this.particles.push({
        x: (r() - 0.5) * 1.4,
        y: (r() - 0.5) * 1.4,
        vx: 0,
        vy: 0,
        s1,
        s2: r(),
        s3: r(),
        phase: r() * TAU,
        speed: 2 + r() * 5,
        size: 0.006 + r() * 0.012 * (1 - s1 * 0.5),
        color: r() < 0.55 ? 0 : r() < 0.6 ? 1 : r() < 0.85 ? 2 : 3,
      });
    }
  }

  private target(p: Particle, t: number, amp: number, out: { x: number; y: number }): void {
    // Flame shape: wide near the bottom, tapering to the top; slow breathing + flicker.
    const v = p.s1; // 0 bottom .. 1 top
    const breathe = 1 + 0.08 * Math.sin(t * 1.1) + 0.3 * amp;
    const flick = 0.06 * Math.sin(t * 6.3 + p.phase) * v;
    const hw = 0.34 * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.9)), 0.6) * (1 - 0.35 * v);
    const x = hw * (2 * p.s2 - 1) * (0.55 + 0.45 * p.s3) * breathe + flick;
    const y = (0.42 - 0.95 * v) * breathe;
    // gentle swirl around the axis
    const sw = Math.sin(t * 0.7 + v * 4) * 0.04 * (1 - v);
    out.x = x + sw;
    out.y = y;
  }

  draw(f: Frame): void {
    const { ctx, t, dt, amp, alpha } = f;
    // Cohesion cycle (~9 s): flame holds, dissolves, re-forms.
    const cyc = (t % 9) / 9;
    const cohesion = cyc < 0.62 ? 1 : cyc < 0.78 ? 1 - smooth((cyc - 0.62) / 0.16) : smooth((cyc - 0.78) / 0.22);

    ctx.globalCompositeOperation = "lighter";

    // Core glow
    const coreR = 0.42 + amp * 0.18;
    const g = ctx.createRadialGradient(0, 0.05, 0, 0, 0.05, coreR);
    g.addColorStop(0, `rgba(255, 244, 200, ${0.55 * alpha * (0.6 + 0.4 * cohesion)})`);
    g.addColorStop(0.35, `rgba(252, 211, 77, ${0.28 * alpha * cohesion})`);
    g.addColorStop(1, "rgba(245, 158, 11, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0.05, coreR, 0, TAU);
    ctx.fill();

    const tmp = { x: 0, y: 0 };
    const k = 6.5;
    const damp = Math.exp(-3.2 * dt);
    for (const p of this.particles) {
      this.target(p, t, amp, tmp);
      const ax = (tmp.x - p.x) * k * (0.15 + 0.85 * cohesion);
      const ay = (tmp.y - p.y) * k * (0.15 + 0.85 * cohesion);
      const turb = (1 - cohesion) * 1.4 + 0.12;
      const nx = Math.sin(p.y * 5.1 + t * 1.7 + p.phase) * Math.cos(p.x * 3.7 - t * 0.9);
      const ny = Math.cos(p.x * 4.3 - t * 1.3 + p.phase) * Math.sin(p.y * 2.9 + t * 0.7);
      p.vx = p.vx * damp + (ax + nx * turb) * dt;
      p.vy = p.vy * damp + (ay + ny * turb - 0.5 * (1 - cohesion)) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * p.speed + p.phase));
      const a = alpha * tw * (0.35 + 0.65 * cohesion) * (0.75 + 0.25 * amp);
      if (a < 0.02) continue;
      ctx.globalAlpha = Math.min(1, a);
      ctx.fillStyle = LUMINA_COLORS[p.color];
      const rad = p.size * (1 + amp * 0.6) * (0.6 + 0.4 * cohesion);
      ctx.beginPath();
      ctx.arc(p.x, p.y, rad, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
}

// ---------------------------------------------------------------------------
// NATURA — organic tree + rain + eyes
// ---------------------------------------------------------------------------

interface Segment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  depth: number;
  /** Growth start / end in 0..1 of the growth duration. */
  b0: number;
  b1: number;
  width: number;
  tip: boolean;
}

interface Drop {
  x: number;
  y: number;
  len: number;
  v: number;
  a: number;
}

class NaturaRenderer implements EntityRenderer {
  private segs: Segment[] = [];
  private drops: Drop[] = [];
  private seed = 1;
  private cycleStart = 0;
  private started = false;
  private nextBlink = 2.5;
  private blinkT = -1;
  private static readonly GROW = 11;
  private static readonly HOLD = 9;
  private static readonly FADE = 2.2;

  reset(): void {
    this.started = false;
    this.build();
    const r = rng(99 + this.seed);
    this.drops = [];
    for (let i = 0; i < 150; i++) {
      this.drops.push({ x: (r() - 0.5) * 2.2, y: (r() - 0.5) * 2.2, len: 0.05 + r() * 0.12, v: 1.2 + r() * 1.4, a: 0.15 + r() * 0.35 });
    }
  }

  private build(): void {
    const r = rng(this.seed++ * 104729 + 7);
    const segs: Segment[] = [];
    const maxDepth = 7;
    const grow = (x: number, y: number, ang: number, len: number, depth: number, b0: number, width: number) => {
      if (depth > maxDepth || segs.length > 520) return;
      const x1 = x + Math.cos(ang) * len;
      const y1 = y + Math.sin(ang) * len;
      const b1 = b0 + len * 1.15;
      const children = depth === 0 ? 3 : r() < 0.28 ? 3 : r() < 0.9 ? 2 : 1;
      const isTip = depth >= maxDepth - 1 || len < 0.045;
      segs.push({ x0: x, y0: y, x1, y1, depth, b0, b1, width, tip: isTip });
      if (isTip) return;
      for (let c = 0; c < children; c++) {
        const spread = 0.28 + r() * 0.5;
        const dir = children === 1 ? (r() - 0.5) * 0.4 : (c - (children - 1) / 2) * spread + (r() - 0.5) * 0.15;
        const upBias = -Math.PI / 2;
        const nAng = ang + dir + (upBias - ang) * 0.12;
        grow(x1, y1, nAng, len * (0.66 + r() * 0.12), depth + 1, b1, width * 0.68);
      }
    };
    grow(0, 0.78, -Math.PI / 2 + (r() - 0.5) * 0.1, 0.34, 0, 0, 1);
    // Normalise birth times.
    let maxB = 0;
    for (const s of segs) maxB = Math.max(maxB, s.b1);
    for (const s of segs) {
      s.b0 /= maxB;
      s.b1 /= maxB;
    }
    this.segs = segs;
  }

  draw(f: Frame): void {
    const { ctx, t, dt, amp, alpha, px } = f;
    if (!this.started) {
      this.started = true;
      this.cycleStart = t;
    }
    const G = NaturaRenderer.GROW;
    const H = NaturaRenderer.HOLD;
    const F = NaturaRenderer.FADE;
    let ct = t - this.cycleStart;
    if (ct > G + H + F) {
      this.build();
      this.cycleStart = t;
      ct = 0;
    }
    const growth = clamp01(ct / G);
    const treeAlpha = ct > G + H ? 1 - smooth((ct - G - H) / F) : 1;
    const sway = Math.sin(t * 0.8) * 0.02 + Math.sin(t * 2.7) * 0.008 * amp;

    // ---- rain (behind)
    ctx.globalCompositeOperation = "source-over";
    ctx.lineCap = "round";
    ctx.lineWidth = 1.2 * px;
    for (const d of this.drops) {
      d.y += d.v * dt;
      d.x -= d.v * 0.12 * dt;
      if (d.y > 1.15) {
        d.y = -1.15 - Math.random() * 0.2;
        d.x = (Math.random() - 0.5) * 2.2;
      }
      if (d.x < -1.15) d.x += 2.3;
      ctx.strokeStyle = `rgba(134, 239, 172, ${d.a * alpha * 0.7})`;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - d.len * 0.12, d.y - d.len);
      ctx.stroke();
    }

    // ---- soft ground glow
    const gg = ctx.createRadialGradient(0, 0.2, 0, 0, 0.2, 0.95);
    gg.addColorStop(0, `rgba(34, 197, 94, ${0.16 * alpha * (0.6 + 0.4 * amp)})`);
    gg.addColorStop(1, "rgba(34, 197, 94, 0)");
    ctx.fillStyle = gg;
    ctx.fillRect(-1.1, -1.1, 2.2, 2.2);

    // ---- tree
    ctx.save();
    ctx.translate(0, 0.78);
    ctx.rotate(sway);
    ctx.translate(0, -0.78);
    ctx.globalCompositeOperation = "lighter";
    for (let pass = 0; pass < 2; pass++) {
      for (const s of this.segs) {
        if (growth <= s.b0) continue;
        const k = clamp01((growth - s.b0) / Math.max(1e-4, s.b1 - s.b0));
        const x1 = s.x0 + (s.x1 - s.x0) * k;
        const y1 = s.y0 + (s.y1 - s.y0) * k;
        const w = (0.9 + s.width * 3.2) * (1 + amp * 0.35);
        if (pass === 0) {
          ctx.lineWidth = (w + 5) * px;
          ctx.strokeStyle = `rgba(34, 197, 94, ${0.12 * alpha * treeAlpha * (0.5 + amp)})`;
        } else {
          ctx.lineWidth = w * px;
          const bright = s.depth >= 4 ? "134, 239, 172" : "74, 222, 128";
          ctx.strokeStyle = `rgba(${bright}, ${(0.55 + 0.45 * amp) * alpha * treeAlpha})`;
        }
        ctx.beginPath();
        ctx.moveTo(s.x0, s.y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        if (pass === 1 && s.tip && k >= 1) {
          // leaf bud at the tip
          const pulse = 0.5 + 0.5 * Math.sin(t * 3 + s.x1 * 20);
          ctx.fillStyle = `rgba(134, 239, 172, ${(0.35 + 0.5 * pulse * (0.5 + amp)) * alpha * treeAlpha})`;
          ctx.beginPath();
          ctx.arc(s.x1, s.y1, (2.2 + amp * 2) * px, 0, TAU);
          ctx.fill();
        }
      }
    }
    ctx.restore();

    // ---- eyes (leaf-shaped), appear once the crown has grown
    const eyesIn = smooth((growth - 0.55) / 0.3) * treeAlpha;
    if (eyesIn > 0.01) {
      if (this.blinkT < 0 && t > this.nextBlink) {
        this.blinkT = t;
        this.nextBlink = t + 2.5 + Math.random() * 4;
      }
      let blink = 1;
      if (this.blinkT >= 0) {
        const bt = (t - this.blinkT) / 0.22;
        blink = bt >= 1 ? 1 : 1 - Math.sin(bt * Math.PI) * 0.92;
        if (bt >= 1) this.blinkT = -1;
      }
      const glow = 0.45 + 0.55 * amp;
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(side * 0.19, -0.12);
        ctx.rotate(side * 0.35);
        ctx.scale(1, Math.max(0.06, blink));
        ctx.globalCompositeOperation = "lighter";
        const eg = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.26);
        eg.addColorStop(0, `rgba(187, 247, 208, ${0.55 * glow * alpha * eyesIn})`);
        eg.addColorStop(1, "rgba(34, 197, 94, 0)");
        ctx.fillStyle = eg;
        ctx.beginPath();
        ctx.arc(0, 0, 0.26, 0, TAU);
        ctx.fill();
        // leaf outline: two quadratic curves
        ctx.fillStyle = `rgba(134, 239, 172, ${(0.75 + 0.25 * amp) * alpha * eyesIn})`;
        ctx.beginPath();
        ctx.moveTo(-0.11, 0);
        ctx.quadraticCurveTo(0, -0.075, 0.11, 0);
        ctx.quadraticCurveTo(0, 0.075, -0.11, 0);
        ctx.fill();
        ctx.fillStyle = `rgba(255, 255, 255, ${(0.7 + 0.3 * amp) * alpha * eyesIn})`;
        ctx.beginPath();
        ctx.arc(0.01, 0, 0.022 + amp * 0.008, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.globalCompositeOperation = "source-over";
  }
}

// ---------------------------------------------------------------------------
// TEHNOLOGIC — crystal lattice
// ---------------------------------------------------------------------------

interface Ring {
  r: number;
  n: number;
  w: number; // angular velocity
  phase: number;
}

class TehnologicRenderer implements EntityRenderer {
  private rings: Ring[] = [];
  private glitchAt = 0;
  private nextGlitch = 1.5;

  reset(): void {
    this.rings = [
      { r: 0.14, n: 6, w: 0.5, phase: 0 },
      { r: 0.27, n: 6, w: -0.32, phase: Math.PI / 6 },
      { r: 0.42, n: 8, w: 0.22, phase: 0 },
      { r: 0.58, n: 12, w: -0.16, phase: 0 },
      { r: 0.76, n: 6, w: 0.11, phase: Math.PI / 6 },
      { r: 0.92, n: 24, w: -0.06, phase: 0 },
    ];
    this.glitchAt = -1;
    this.nextGlitch = 1.5;
  }

  private poly(ctx: CanvasRenderingContext2D, r: number, n: number, rot: number): void {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = rot + (i / n) * TAU;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  }

  draw(f: Frame): void {
    const { ctx, t, amp, alpha, px } = f;
    if (this.glitchAt < 0 && t > this.nextGlitch) {
      this.glitchAt = t;
      this.nextGlitch = t + 1.6 + Math.random() * 3.5;
    }
    let glitch = 0;
    if (this.glitchAt >= 0) {
      const g = (t - this.glitchAt) / 0.12;
      glitch = g >= 1 ? 0 : 1;
      if (g >= 1) this.glitchAt = -1;
    }
    const scale = 1 + amp * 0.14;
    const c1 = "165, 243, 252"; // #a5f3fc
    const c2 = "103, 232, 249"; // #67e8f9

    ctx.save();
    ctx.scale(scale, scale);
    // Mirror symmetry: the horizontal glitch offset is applied mirrored on both halves.
    const gx = glitch ? (Math.random() - 0.5) * 0.05 : 0;

    // background halo
    ctx.globalCompositeOperation = "lighter";
    const hg = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    hg.addColorStop(0, `rgba(${c2}, ${0.16 * alpha * (0.5 + amp)})`);
    hg.addColorStop(0.5, `rgba(${c2}, ${0.05 * alpha})`);
    hg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = hg;
    ctx.fillRect(-1.1, -1.1, 2.2, 2.2);

    // radar sweep
    const sweepA = (t * 0.9) % TAU;
    ctx.fillStyle = `rgba(${c1}, ${0.08 * alpha})`;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 0.95, sweepA, sweepA + 0.5);
    ctx.closePath();
    ctx.fill();

    ctx.lineJoin = "miter";
    ctx.lineCap = "butt";
    for (let k = 0; k < this.rings.length; k++) {
      const ring = this.rings[k];
      const rot = ring.phase + t * ring.w;
      const emph = k % 2 === 0 ? 1 : 0.7;
      // Draw mirrored halves (left/right) to guarantee symmetry even with the glitch offset.
      for (const side of [1, -1]) {
        ctx.save();
        ctx.scale(side, 1);
        ctx.translate(gx, 0);
        ctx.beginPath();
        ctx.rect(0, -1.2, 1.2, 2.4);
        ctx.clip();
        // glow pass
        ctx.lineWidth = 5 * px;
        ctx.strokeStyle = `rgba(${c2}, ${0.1 * alpha * emph * (0.5 + amp)})`;
        this.poly(ctx, ring.r, ring.n, side === 1 ? rot : -rot);
        ctx.stroke();
        // sharp pass
        ctx.lineWidth = (1.2 + 0.8 * emph) * px;
        ctx.strokeStyle = `rgba(${c1}, ${(0.5 + 0.45 * amp) * alpha * emph})`;
        this.poly(ctx, ring.r, ring.n, side === 1 ? rot : -rot);
        ctx.stroke();
        // nodes
        ctx.fillStyle = `rgba(255, 255, 255, ${(0.55 + 0.45 * amp) * alpha * emph})`;
        const nodeR = (1.4 + amp * 1.5) * px;
        for (let i = 0; i < ring.n; i++) {
          const a = (side === 1 ? rot : -rot) + (i / ring.n) * TAU;
          const x = Math.cos(a) * ring.r;
          if (x < -0.001) continue;
          const y = Math.sin(a) * ring.r;
          ctx.fillRect(x - nodeR, y - nodeR, nodeR * 2, nodeR * 2);
        }
        // chords to the next ring (every vertex to the nearest angle on the outer ring)
        if (k + 1 < this.rings.length) {
          const outer = this.rings[k + 1];
          const orot = outer.phase + t * outer.w;
          ctx.lineWidth = 0.8 * px;
          ctx.strokeStyle = `rgba(${c1}, ${0.28 * alpha * (0.6 + amp * 0.6)})`;
          ctx.beginPath();
          for (let i = 0; i < ring.n; i++) {
            const a = (side === 1 ? rot : -rot) + (i / ring.n) * TAU;
            const rel = a - (side === 1 ? orot : -orot);
            const j = Math.round((rel / TAU) * outer.n);
            const b = (side === 1 ? orot : -orot) + (j / outer.n) * TAU;
            ctx.moveTo(Math.cos(a) * ring.r, Math.sin(a) * ring.r);
            ctx.lineTo(Math.cos(b) * outer.r, Math.sin(b) * outer.r);
          }
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // inner star (connect every second vertex of ring 0/1)
    const r1 = this.rings[1];
    const rot1 = r1.phase + t * r1.w;
    ctx.lineWidth = 1.2 * px;
    ctx.strokeStyle = `rgba(255,255,255, ${(0.35 + 0.5 * amp) * alpha})`;
    ctx.beginPath();
    for (let i = 0; i < r1.n; i++) {
      const a = rot1 + (i / r1.n) * TAU;
      const b = rot1 + (((i + 2) % r1.n) / r1.n) * TAU;
      ctx.moveTo(Math.cos(a) * r1.r, Math.sin(a) * r1.r);
      ctx.lineTo(Math.cos(b) * r1.r, Math.sin(b) * r1.r);
    }
    ctx.stroke();

    // core
    const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.12 + amp * 0.06);
    cg.addColorStop(0, `rgba(255,255,255, ${(0.8 + 0.2 * amp) * alpha})`);
    cg.addColorStop(0.4, `rgba(${c1}, ${0.5 * alpha})`);
    cg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(0, 0, 0.12 + amp * 0.06, 0, TAU);
    ctx.fill();

    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

interface Slot {
  id: EntityId;
  renderer: EntityRenderer;
  alpha: number;
  target: number;
  amp: number;
}

const FADE_IN_S = 0.9;
const FADE_OUT_S = 0.7;
const MAX_BACKING_PX = 1080;

export function createEntities(canvas: HTMLCanvasElement, opts: { enabled: boolean; getAmplitude: () => number }): Entities {
  const ctx = canvas.getContext("2d", { alpha: true });
  let enabled = opts.enabled && !!ctx;
  const slots: Record<EntityId, Slot> = {
    LUMINA: { id: "LUMINA", renderer: new LuminaRenderer(), alpha: 0, target: 0, amp: 0 },
    NATURA: { id: "NATURA", renderer: new NaturaRenderer(), alpha: 0, target: 0, amp: 0 },
    TEHNOLOGIC: { id: "TEHNOLOGIC", renderer: new TehnologicRenderer(), alpha: 0, target: 0, amp: 0 },
  };
  let speaking: EntityId | null = null;
  let raf = 0;
  let lastNow = 0;
  const t0 = performance.now();
  let disposed = false;

  const fit = () => {
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, rect.width);
    const cssH = Math.max(1, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = Math.min(dpr, MAX_BACKING_PX / Math.max(cssW, cssH));
    const w = Math.round(cssW * scale);
    const h = Math.round(cssH * scale);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  };

  const anyActive = () => Object.values(slots).some((s) => s.alpha > 0.001 || s.target > 0);

  const frame = (now: number) => {
    raf = 0;
    if (disposed || !ctx) return;
    const dt = Math.min(0.05, Math.max(0.001, (now - lastNow) / 1000));
    lastNow = now;
    const t = (now - t0) / 1000;
    fit();
    const w = canvas.width;
    const h = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const S = Math.min(w, h) / 2;
    const rawAmp = clamp01(opts.getAmplitude());

    for (const s of Object.values(slots)) {
      // fade
      if (s.target > s.alpha) s.alpha = Math.min(1, s.alpha + dt / FADE_IN_S);
      else if (s.target < s.alpha) s.alpha = Math.max(0, s.alpha - dt / FADE_OUT_S);
      if (s.alpha <= 0.001) continue;
      // amplitude: the speaker gets the full envelope; others a soft echo
      const targetAmp = speaking === null ? rawAmp * 0.6 : speaking === s.id ? rawAmp : rawAmp * 0.25;
      s.amp += (targetAmp - s.amp) * (targetAmp > s.amp ? 0.55 : 0.1);
      ctx.setTransform(S, 0, 0, S, w / 2, h / 2);
      s.renderer.draw({ ctx, t, dt, amp: s.amp, alpha: smooth(s.alpha), px: 1 / S });
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    if (anyActive()) raf = requestAnimationFrame(frame);
    else {
      canvas.classList.remove("on");
      ctx.clearRect(0, 0, w, h);
    }
  };

  const ensureLoop = () => {
    if (!enabled || disposed || raf) return;
    canvas.classList.add("on");
    lastNow = performance.now();
    raf = requestAnimationFrame(frame);
  };

  return {
    show(id) {
      const s = slots[id];
      if (!s) return;
      if (s.target !== 1 && s.alpha <= 0.001) s.renderer.reset();
      s.target = 1;
      ensureLoop();
    },
    hide(id) {
      const s = slots[id];
      if (!s) return;
      s.target = 0;
      if (speaking === id) speaking = null;
    },
    hideAll(immediate) {
      for (const s of Object.values(slots)) {
        s.target = 0;
        if (immediate) s.alpha = 0;
      }
      speaking = null;
      if (immediate && ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.classList.remove("on");
      }
    },
    setSpeaking(id) {
      speaking = id;
    },
    visible: () => Object.values(slots).filter((s) => s.target > 0).map((s) => s.id),
    setEnabled(v) {
      enabled = v && !!ctx;
      if (!enabled) {
        for (const s of Object.values(slots)) {
          s.target = 0;
          s.alpha = 0;
        }
        canvas.classList.remove("on");
      }
    },
    dispose() {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}
