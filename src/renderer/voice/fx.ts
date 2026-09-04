/**
 * Per-speaker voice effects (Web Audio, no audio files).
 *
 *  clean     Captain            light EQ (presence)
 *  hologram  Avatar AI          subtle chorus/shimmer + high-shelf sparkle + light reverb
 *  choir     Lumina             long reverb + pitch-shifted layers (distant chorus)
 *  forest    Natura             low-pass ~4 kHz + warm reverb + slow tremolo
 *  crystal   Tehnologic         clarity boost + short bright reverb + light ring-mod/flanger
 *
 * Reverb impulse responses are synthesized (noise burst with exponential decay).
 * Pitch shifting uses two crossfaded sawtooth-modulated delay lines (native nodes).
 */

export type FxName = "clean" | "hologram" | "choir" | "forest" | "crystal";

export interface FxChain {
  input: AudioNode;
  output: AudioNode;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Impulse response synthesis
// ---------------------------------------------------------------------------

export interface ImpulseOptions {
  seconds: number;
  /** Exponential decay rate (1/s). Larger = shorter tail. */
  decay: number;
  tone?: "dark" | "neutral" | "bright";
  predelayMs?: number;
}

const irCache = new WeakMap<AudioContext, Map<string, AudioBuffer>>();

export function makeImpulseResponse(ctx: AudioContext, opts: ImpulseOptions): AudioBuffer {
  const key = `${opts.seconds}|${opts.decay}|${opts.tone ?? "neutral"}|${opts.predelayMs ?? 0}`;
  let perCtx = irCache.get(ctx);
  if (!perCtx) {
    perCtx = new Map();
    irCache.set(ctx, perCtx);
  }
  const hit = perCtx.get(key);
  if (hit) return hit;

  const sr = ctx.sampleRate;
  const len = Math.max(1, Math.floor(sr * opts.seconds));
  const pre = Math.floor((sr * (opts.predelayMs ?? 0)) / 1000);
  const buf = ctx.createBuffer(2, len + pre, sr);
  // One-pole coefficients for tone shaping.
  const lpCoef = opts.tone === "dark" ? 0.25 : opts.tone === "bright" ? 0.85 : 0.6;
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let lp = 0;
    let hp = 0;
    let prev = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      let n = (Math.random() * 2 - 1) * Math.exp(-opts.decay * t);
      // A few early reflections in the first 40 ms.
      if (t < 0.04 && Math.random() < 0.004) n += (Math.random() * 2 - 1) * 0.6;
      // Low-pass (warmth)
      lp += lpCoef * (n - lp);
      let v = lp;
      if (opts.tone === "bright") {
        // Gentle high-pass to thin the low end.
        hp = 0.9 * (hp + v - prev);
        prev = v;
        v = hp;
      }
      data[pre + i] = v;
    }
    // Normalize peak
    let peak = 0;
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
    if (peak > 0) for (let i = 0; i < data.length; i++) data[i] /= peak;
  }
  perCtx.set(key, buf);
  return buf;
}

// ---------------------------------------------------------------------------
// Pitch shifter (delay-line, two crossfaded grains)
// ---------------------------------------------------------------------------

export interface PitchShifter {
  input: GainNode;
  output: GainNode;
  stop(): void;
}

/**
 * Constant pitch shift via a delay line whose delay ramps linearly (sawtooth):
 * pitch factor p = 1 - d'(t). Two lines run 180 deg apart with complementary
 * raised-cosine gains so the ramp resets are inaudible (sin^2 + cos^2 = 1).
 */
export function createPitchShifter(ctx: AudioContext, semitones: number, windowSec = 0.06): PitchShifter {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const p = Math.pow(2, semitones / 12);
  const rate = Math.abs(1 - p); // |d'|
  if (rate < 1e-4) {
    input.connect(output);
    return { input, output, stop: () => undefined };
  }
  const f = rate / windowSec; // LFO frequency
  const N = 24;
  // Rising sawtooth s(θ) = θ/π - 1 (reset at θ = 0): s = -(2/π) Σ sin(kθ)/k
  const sawReal = new Float32Array(N);
  const sawImag = new Float32Array(N);
  const sawImagShift = new Float32Array(N); // s(θ + π)
  for (let k = 1; k < N; k++) {
    sawImag[k] = -2 / (k * Math.PI);
    sawImagShift[k] = sawImag[k] * (k % 2 === 0 ? 1 : -1);
  }
  const sawA = ctx.createPeriodicWave(sawReal, sawImag, { disableNormalization: true });
  const sawB = ctx.createPeriodicWave(sawReal, sawImagShift, { disableNormalization: true });
  // Window: gain = 0.5 - 0.5 cos(θ) (zero at the reset) and its complement.
  const winReal = new Float32Array([0, -0.5]);
  const winRealB = new Float32Array([0, 0.5]);
  const winImag = new Float32Array([0, 0]);
  const winA = ctx.createPeriodicWave(winReal, winImag, { disableNormalization: true });
  const winB = ctx.createPeriodicWave(winRealB, winImag, { disableNormalization: true });

  // Delay increases for pitch down (rising saw), decreases for pitch up.
  const depthSign = p < 1 ? 1 : -1;
  const oscillators: OscillatorNode[] = [];
  const t0 = ctx.currentTime + 0.01;

  const makeLine = (saw: PeriodicWave, win: PeriodicWave) => {
    const delay = ctx.createDelay(windowSec + 0.05);
    delay.delayTime.value = windowSec / 2;
    const lfo = ctx.createOscillator();
    lfo.setPeriodicWave(saw);
    lfo.frequency.value = f;
    const depth = ctx.createGain();
    depth.gain.value = (depthSign * windowSec) / 2;
    lfo.connect(depth).connect(delay.delayTime);
    const g = ctx.createGain();
    g.gain.value = 0.5;
    const wlfo = ctx.createOscillator();
    wlfo.setPeriodicWave(win);
    wlfo.frequency.value = f;
    wlfo.connect(g.gain);
    input.connect(delay).connect(g).connect(output);
    lfo.start(t0);
    wlfo.start(t0);
    oscillators.push(lfo, wlfo);
  };
  makeLine(sawA, winA);
  makeLine(sawB, winB);

  return {
    input,
    output,
    stop() {
      for (const o of oscillators) {
        try {
          o.stop();
        } catch {
          /* already stopped */
        }
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function biquad(ctx: AudioContext, type: BiquadFilterType, frequency: number, q?: number, gain?: number): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  if (q !== undefined) f.Q.value = q;
  if (gain !== undefined) f.gain.value = gain;
  return f;
}

function gain(ctx: AudioContext, value: number): GainNode {
  const g = ctx.createGain();
  g.gain.value = value;
  return g;
}

function lfo(ctx: AudioContext, frequency: number, depth: number, type: OscillatorType = "sine"): { osc: OscillatorNode; out: GainNode } {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = frequency;
  const out = gain(ctx, depth);
  osc.connect(out);
  osc.start();
  return { osc, out };
}

/** Modulated delay voice (chorus/flanger building block). */
function modDelay(
  ctx: AudioContext,
  src: AudioNode,
  dest: AudioNode,
  baseSec: number,
  depthSec: number,
  rateHz: number,
  level: number,
  feedback = 0,
): OscillatorNode[] {
  const d = ctx.createDelay(baseSec + depthSec + 0.05);
  d.delayTime.value = baseSec;
  const m = lfo(ctx, rateHz, depthSec);
  m.out.connect(d.delayTime);
  const g = gain(ctx, level);
  src.connect(d).connect(g).connect(dest);
  if (feedback > 0) {
    const fb = gain(ctx, feedback);
    d.connect(fb).connect(d);
  }
  return [m.osc];
}

function reverbSend(ctx: AudioContext, src: AudioNode, dest: AudioNode, ir: AudioBuffer, wet: number, pre?: BiquadFilterNode): void {
  const conv = ctx.createConvolver();
  conv.buffer = ir;
  const w = gain(ctx, wet);
  if (pre) src.connect(pre).connect(conv);
  else src.connect(conv);
  conv.connect(w).connect(dest);
}

// ---------------------------------------------------------------------------
// Chains
// ---------------------------------------------------------------------------

export function createFxChain(ctx: AudioContext, fx: FxName): FxChain {
  const input = gain(ctx, 1);
  const output = gain(ctx, 1);
  const oscillators: OscillatorNode[] = [];
  const shifters: PitchShifter[] = [];

  switch (fx) {
    case "clean": {
      // Captain: light EQ — remove rumble, a touch of presence.
      const hp = biquad(ctx, "highpass", 80, 0.7);
      const presence = biquad(ctx, "peaking", 2500, 1.0, 2);
      input.connect(hp).connect(presence).connect(output);
      break;
    }

    case "hologram": {
      // Avatar AI: warm, intelligible; dry dominant.
      const hp = biquad(ctx, "highpass", 90, 0.7);
      const sparkle = biquad(ctx, "highshelf", 6000, undefined, 3);
      const dry = gain(ctx, 0.9);
      input.connect(hp).connect(sparkle);
      sparkle.connect(dry).connect(output);
      // Subtle chorus/shimmer (two voices, slow, shallow)
      oscillators.push(...modDelay(ctx, sparkle, output, 0.012, 0.0015, 0.6, 0.22));
      oscillators.push(...modDelay(ctx, sparkle, output, 0.019, 0.0018, 0.9, 0.18));
      // Very light reverb
      const ir = makeImpulseResponse(ctx, { seconds: 1.2, decay: 4.5, tone: "neutral", predelayMs: 12 });
      reverbSend(ctx, sparkle, output, ir, 0.16, biquad(ctx, "highpass", 300, 0.7));
      break;
    }

    case "choir": {
      // Lumina: distant, ageless chorus. Detuned layers under a long reverb.
      const hp = biquad(ctx, "highpass", 160, 0.7);
      const lp = biquad(ctx, "lowpass", 7000, 0.7);
      input.connect(hp).connect(lp);
      const sum = gain(ctx, 1);
      lp.connect(gain(ctx, 0.62)).connect(sum);
      const layers: Array<[number, number]> = [
        [-12, 0.3],
        [7, 0.2],
        [3, 0.18],
        [-5, 0.16],
      ];
      for (const [semis, level] of layers) {
        const ps = createPitchShifter(ctx, semis, 0.06);
        shifters.push(ps);
        lp.connect(ps.input);
        ps.output.connect(gain(ctx, level)).connect(sum);
      }
      // Slow shimmer
      oscillators.push(...modDelay(ctx, lp, sum, 0.022, 0.003, 0.28, 0.2));
      const dry = gain(ctx, 0.7);
      sum.connect(dry).connect(output);
      const ir = makeImpulseResponse(ctx, { seconds: 4.5, decay: 1.1, tone: "neutral", predelayMs: 30 });
      reverbSend(ctx, sum, output, ir, 0.6, biquad(ctx, "highpass", 250, 0.7));
      break;
    }

    case "forest": {
      // Natura: soft, wooden, wet. Low-pass ~4 kHz, warm reverb, slow tremolo.
      const lp = biquad(ctx, "lowpass", 4000, 0.7);
      const warm = biquad(ctx, "lowshelf", 220, undefined, 3);
      input.connect(lp).connect(warm);
      const trem = gain(ctx, 0.85);
      const m = lfo(ctx, 4.2, 0.15);
      m.out.connect(trem.gain);
      oscillators.push(m.osc);
      warm.connect(trem);
      trem.connect(gain(ctx, 0.85)).connect(output);
      const ir = makeImpulseResponse(ctx, { seconds: 2.6, decay: 2.0, tone: "dark", predelayMs: 20 });
      reverbSend(ctx, trem, output, ir, 0.38);
      break;
    }

    case "crystal": {
      // Tehnologic: precise, glassy. Clarity boost, ring-mod tint, flanger, short bright reverb.
      const hp = biquad(ctx, "highpass", 120, 0.7);
      const clarity = biquad(ctx, "peaking", 3000, 1.2, 3);
      const shelf = biquad(ctx, "highshelf", 5000, undefined, 4);
      input.connect(hp).connect(clarity).connect(shelf);
      const sum = gain(ctx, 1);
      shelf.connect(gain(ctx, 0.85)).connect(sum);
      // Ring modulation (carrier 38 Hz -> metallic sidebands), low level
      const ring = gain(ctx, 0);
      const carrier = ctx.createOscillator();
      carrier.type = "sine";
      carrier.frequency.value = 38;
      carrier.connect(ring.gain);
      carrier.start();
      oscillators.push(carrier);
      shelf.connect(ring).connect(gain(ctx, 0.14)).connect(sum);
      // Light flanger
      oscillators.push(...modDelay(ctx, shelf, sum, 0.003, 0.0015, 0.25, 0.3, 0.3));
      sum.connect(output);
      const ir = makeImpulseResponse(ctx, { seconds: 0.9, decay: 5.0, tone: "bright", predelayMs: 8 });
      reverbSend(ctx, sum, output, ir, 0.3);
      break;
    }
  }

  return {
    input,
    output,
    dispose() {
      for (const o of oscillators) {
        try {
          o.stop();
        } catch {
          /* ignore */
        }
      }
      for (const s of shifters) s.stop();
      try {
        input.disconnect();
      } catch {
        /* ignore */
      }
      try {
        output.disconnect();
      } catch {
        /* ignore */
      }
    },
  };
}
