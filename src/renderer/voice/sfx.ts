/**
 * Synthesized sound effects (Web Audio, no files). Ported/adapted from Exodus
 * src/lib/audio-synth.ts (transporter, envelopes, noise) and extended with the
 * show cues: liftoff-rumble, low-swell, wormhole-whoosh, arrival-chime, rain,
 * white-fade. Everything routes through the shared SFX bus (context.ts).
 */
import { getAudioContext, getSfxBus, unlockAudio } from "./context";
import { makeImpulseResponse } from "./fx";

export type SfxName = "liftoff-rumble" | "low-swell" | "wormhole-whoosh" | "arrival-chime" | "rain" | "white-fade";

export interface SfxHandle {
  done: Promise<void>;
  stop(): void;
  durationMs: number;
}

export interface SfxOptions {
  durationSec?: number;
  gain?: number;
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

type Envelope = { attack: number; decay: number; sustain: number; release: number };

function envGain(ctx: AudioContext, dest: AudioNode, peak: number, env: Envelope, dur: number, t0: number): GainNode {
  const g = ctx.createGain();
  const floor = 0.0001;
  g.gain.setValueAtTime(floor, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(floor, peak), t0 + env.attack);
  g.gain.exponentialRampToValueAtTime(Math.max(floor, peak * env.sustain), t0 + env.attack + env.decay);
  g.gain.setValueAtTime(Math.max(floor, peak * env.sustain), t0 + Math.max(env.attack + env.decay, dur - env.release));
  g.gain.exponentialRampToValueAtTime(floor, t0 + dur);
  g.connect(dest);
  return g;
}

function tone(ctx: AudioContext, dest: AudioNode, freq: number, type: OscillatorType, t0: number, dur: number): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  o.connect(dest);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
  return o;
}

const noiseCache = new WeakMap<AudioContext, Map<string, AudioBuffer>>();

/** Looping-friendly noise buffer, cached per context (also used by voice/ambient.ts). */
export function noiseBuffer(ctx: AudioContext, durSec: number, color: "white" | "pink" | "brown" = "white"): AudioBuffer {
  const key = `${color}|${Math.round(durSec * 10)}`;
  let per = noiseCache.get(ctx);
  if (!per) {
    per = new Map();
    noiseCache.set(ctx, per);
  }
  const hit = per.get(key);
  if (hit) return hit;
  const len = Math.max(1, Math.floor(ctx.sampleRate * durSec));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  if (color === "white") {
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  } else if (color === "pink") {
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.29703;
      b2 = 0.57 * b2 + w * 1.0908;
      data[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18;
    }
  } else {
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.5;
    }
  }
  per.set(key, buf);
  return buf;
}

interface Voice {
  master: GainNode;
  ctx: AudioContext;
  t0: number;
  stoppables: Array<{ stop(when?: number): void }>;
  timers: number[];
}

function beginVoice(volume: number): Voice {
  const ctx = getAudioContext();
  void unlockAudio();
  const master = ctx.createGain();
  master.gain.value = Math.max(0, volume);
  master.connect(getSfxBus());
  return { master, ctx, t0: ctx.currentTime + 0.02, stoppables: [], timers: [] };
}

function finishVoice(v: Voice, durationSec: number, fadeOutSec = 0.4): SfxHandle {
  const { ctx, master } = v;
  let stopped = false;
  let resolveDone: () => void = () => undefined;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  const cleanup = () => {
    for (const s of v.stoppables) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    for (const t of v.timers) window.clearTimeout(t);
    try {
      master.disconnect();
    } catch {
      /* ignore */
    }
    resolveDone();
  };
  const endTimer = window.setTimeout(() => {
    if (!stopped) {
      stopped = true;
      cleanup();
    }
  }, (durationSec + 0.3) * 1000);
  return {
    durationMs: Math.round(durationSec * 1000),
    done,
    stop() {
      if (stopped) return;
      stopped = true;
      window.clearTimeout(endTimer);
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now);
      master.gain.exponentialRampToValueAtTime(0.0001, now + fadeOutSec);
      window.setTimeout(cleanup, fadeOutSec * 1000 + 60);
    },
  };
}

// ---------------------------------------------------------------------------
// Transporter (Exodus port): electric beam sweep + hum + metallic ring + zap
// ---------------------------------------------------------------------------

export function playTransporterSfx(direction: "in" | "out", volume = 0.4): SfxHandle {
  const v = beginVoice(volume);
  const { ctx, master, t0 } = v;
  const dur = 0.8;
  const up = direction === "in";

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(1, t0 + (up ? 0.1 : 0.04));
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  env.connect(master);

  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  const k = 40;
  for (let i = 0; i < 1024; i++) {
    const x = (i * 2) / 1024 - 1;
    curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
  }
  shaper.curve = curve;
  shaper.oversample = "2x";
  shaper.connect(env);

  const trem = ctx.createGain();
  trem.gain.value = 0.5;
  trem.connect(shaper);
  const lfo = ctx.createOscillator();
  lfo.type = "square";
  lfo.frequency.setValueAtTime(up ? 18 : 34, t0);
  lfo.frequency.linearRampToValueAtTime(up ? 44 : 11, t0 + dur);
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0.5;
  lfo.connect(lfoDepth).connect(trem.gain);
  lfo.start(t0);
  lfo.stop(t0 + dur + 0.05);
  v.stoppables.push(lfo);

  const fStart = up ? 180 : 760;
  const fEnd = up ? 760 : 150;
  for (const cents of [-22, -7, 8, 21]) {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(fStart, t0);
    o.frequency.exponentialRampToValueAtTime(fEnd, t0 + dur);
    o.detune.value = cents;
    const og = ctx.createGain();
    og.gain.value = 0.2;
    o.connect(og).connect(trem);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
    v.stoppables.push(o);
  }

  const hum = ctx.createOscillator();
  hum.type = "sawtooth";
  hum.frequency.setValueAtTime(up ? 58 : 112, t0);
  hum.frequency.linearRampToValueAtTime(up ? 112 : 52, t0 + dur);
  const humG = ctx.createGain();
  humG.gain.value = 0.32;
  hum.connect(humG).connect(shaper);
  hum.start(t0);
  hum.stop(t0 + dur + 0.05);
  v.stoppables.push(hum);

  const ns = ctx.createBufferSource();
  ns.buffer = noiseBuffer(ctx, dur + 0.1, "white");
  const ring = ctx.createBiquadFilter();
  ring.type = "bandpass";
  ring.frequency.setValueAtTime(up ? 1800 : 3600, t0);
  ring.frequency.exponentialRampToValueAtTime(up ? 5200 : 900, t0 + dur);
  ring.Q.value = 18;
  const ringG = ctx.createGain();
  ringG.gain.setValueAtTime(0.0001, t0);
  ringG.gain.exponentialRampToValueAtTime(0.6, t0 + dur * 0.45);
  ringG.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  ns.connect(ring).connect(ringG).connect(env);
  ns.start(t0);
  ns.stop(t0 + dur + 0.05);
  v.stoppables.push(ns);

  const zap = ctx.createOscillator();
  zap.type = "square";
  zap.frequency.setValueAtTime(up ? 900 : 1500, t0);
  zap.frequency.exponentialRampToValueAtTime(up ? 2600 : 280, t0 + 0.09);
  const zapG = ctx.createGain();
  zapG.gain.setValueAtTime(0.5, t0);
  zapG.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.13);
  zap.connect(zapG).connect(shaper);
  zap.start(t0);
  zap.stop(t0 + 0.15);
  v.stoppables.push(zap);

  return finishVoice(v, dur + 0.1, 0.1);
}

// ---------------------------------------------------------------------------
// Show SFX
// ---------------------------------------------------------------------------

function liftoffRumble(v: Voice, dur: number): void {
  const { ctx, master, t0 } = v;
  // Sub sweep 30 -> 60 Hz, two detuned sines
  const subEnv: Envelope = { attack: dur * 0.35, decay: dur * 0.2, sustain: 0.8, release: dur * 0.3 };
  const g = envGain(ctx, master, 0.9, subEnv, dur, t0);
  for (const det of [0, 5]) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(30, t0);
    o.frequency.exponentialRampToValueAtTime(60, t0 + dur * 0.8);
    o.detune.value = det;
    o.connect(g);
    o.start(t0);
    o.stop(t0 + dur + 0.1);
    v.stoppables.push(o);
  }
  // Harmonic growl
  const growl = ctx.createOscillator();
  growl.type = "sawtooth";
  growl.frequency.setValueAtTime(45, t0);
  growl.frequency.exponentialRampToValueAtTime(90, t0 + dur * 0.8);
  const growlLp = ctx.createBiquadFilter();
  growlLp.type = "lowpass";
  growlLp.frequency.setValueAtTime(90, t0);
  growlLp.frequency.exponentialRampToValueAtTime(260, t0 + dur * 0.7);
  const growlG = envGain(ctx, master, 0.25, subEnv, dur, t0);
  growl.connect(growlLp).connect(growlG);
  growl.start(t0);
  growl.stop(t0 + dur + 0.1);
  v.stoppables.push(growl);
  // Filtered noise swell
  const ns = ctx.createBufferSource();
  ns.buffer = noiseBuffer(ctx, 4, "brown");
  ns.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(120, t0);
  lp.frequency.exponentialRampToValueAtTime(420, t0 + dur * 0.75);
  lp.Q.value = 0.8;
  const ng = envGain(ctx, master, 0.7, { attack: dur * 0.45, decay: dur * 0.15, sustain: 0.9, release: dur * 0.3 }, dur, t0);
  ns.connect(lp).connect(ng);
  ns.start(t0);
  ns.stop(t0 + dur + 0.1);
  v.stoppables.push(ns);
}

function lowSwell(v: Voice, dur: number): void {
  const { ctx, master, t0 } = v;
  const env: Envelope = { attack: dur * 0.45, decay: dur * 0.1, sustain: 0.85, release: dur * 0.4 };
  const g = envGain(ctx, master, 0.7, env, dur, t0);
  for (const [f, type, lvl] of [
    [55, "sine", 1],
    [82.5, "sine", 0.5],
    [110, "triangle", 0.25],
  ] as Array<[number, OscillatorType, number]>) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const og = ctx.createGain();
    og.gain.value = lvl;
    o.connect(og).connect(g);
    o.start(t0);
    o.stop(t0 + dur + 0.1);
    v.stoppables.push(o);
  }
  const ns = ctx.createBufferSource();
  ns.buffer = noiseBuffer(ctx, 4, "pink");
  ns.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 300;
  const ng = envGain(ctx, master, 0.2, env, dur, t0);
  ns.connect(lp).connect(ng);
  ns.start(t0);
  ns.stop(t0 + dur + 0.1);
  v.stoppables.push(ns);
}

function wormholeWhoosh(v: Voice, dur: number): void {
  const { ctx, master, t0 } = v;
  // Noise bandpass sweep 200 -> 4000 Hz, then fall
  const ns = ctx.createBufferSource();
  ns.buffer = noiseBuffer(ctx, 4, "white");
  ns.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 6;
  bp.frequency.setValueAtTime(200, t0);
  bp.frequency.exponentialRampToValueAtTime(4000, t0 + dur * 0.7);
  bp.frequency.exponentialRampToValueAtTime(600, t0 + dur);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t0);
  ng.gain.exponentialRampToValueAtTime(0.8, t0 + dur * 0.65);
  ng.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  ns.connect(bp).connect(ng).connect(master);
  ns.start(t0);
  ns.stop(t0 + dur + 0.1);
  v.stoppables.push(ns);
  // Second, wider layer for body
  const ns2 = ctx.createBufferSource();
  ns2.buffer = noiseBuffer(ctx, 4, "pink");
  ns2.loop = true;
  const bp2 = ctx.createBiquadFilter();
  bp2.type = "bandpass";
  bp2.Q.value = 1.2;
  bp2.frequency.setValueAtTime(150, t0);
  bp2.frequency.exponentialRampToValueAtTime(2500, t0 + dur * 0.7);
  const ng2 = ctx.createGain();
  ng2.gain.setValueAtTime(0.0001, t0);
  ng2.gain.exponentialRampToValueAtTime(0.5, t0 + dur * 0.6);
  ng2.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  ns2.connect(bp2).connect(ng2).connect(master);
  ns2.start(t0);
  ns2.stop(t0 + dur + 0.1);
  v.stoppables.push(ns2);
  // Sub 40 -> 80 Hz
  const subEnv: Envelope = { attack: dur * 0.5, decay: dur * 0.1, sustain: 0.6, release: dur * 0.35 };
  const g = envGain(ctx, master, 0.7, subEnv, dur, t0);
  const sub = ctx.createOscillator();
  sub.type = "sine";
  sub.frequency.setValueAtTime(40, t0);
  sub.frequency.exponentialRampToValueAtTime(80, t0 + dur);
  sub.connect(g);
  sub.start(t0);
  sub.stop(t0 + dur + 0.1);
  v.stoppables.push(sub);
}

function arrivalChime(v: Voice, dur: number): void {
  const { ctx, master, t0 } = v;
  // Light reverb on the chime
  const conv = ctx.createConvolver();
  conv.buffer = makeImpulseResponse(ctx, { seconds: 2.2, decay: 2.2, tone: "bright", predelayMs: 10 });
  const wet = ctx.createGain();
  wet.gain.value = 0.35;
  const bus = ctx.createGain();
  bus.connect(master);
  bus.connect(conv).connect(wet).connect(master);
  const note = (freq: number, at: number, len: number, level: number) => {
    // Bell: fundamental + 2 inharmonic partials with faster decays
    for (const [ratio, lvl, decayMul] of [
      [1, 1, 1],
      [2.76, 0.35, 0.6],
      [5.4, 0.15, 0.4],
    ] as Array<[number, number, number]>) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(level * lvl, t0 + at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len * decayMul);
      g.connect(bus);
      const o = tone(ctx, g, freq * ratio, "sine", t0 + at, len * decayMul);
      v.stoppables.push(o);
    }
  };
  const base = 880; // A5
  note(base, 0, Math.min(2.4, dur), 0.5);
  note(base * 1.5, 0.28, Math.min(2.4, dur - 0.28), 0.42); // fifth
  note(base * 2, 0.62, Math.min(2.6, dur - 0.62), 0.32); // octave
}

function rain(v: Voice, dur: number): void {
  const { ctx, master, t0 } = v;
  const fadeIn = Math.min(1.5, dur * 0.2);
  const fadeOut = Math.min(2.0, dur * 0.25);
  // Steady patter: pink noise, band-limited, slowly varying level
  const ns = ctx.createBufferSource();
  ns.buffer = noiseBuffer(ctx, 6, "pink");
  ns.loop = true;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 900;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 6500;
  const bed = ctx.createGain();
  bed.gain.setValueAtTime(0.0001, t0);
  bed.gain.exponentialRampToValueAtTime(0.55, t0 + fadeIn);
  bed.gain.setValueAtTime(0.55, t0 + dur - fadeOut);
  bed.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  const wobble = ctx.createOscillator();
  wobble.type = "sine";
  wobble.frequency.value = 0.13;
  const wobbleDepth = ctx.createGain();
  wobbleDepth.gain.value = 0.12;
  wobble.connect(wobbleDepth).connect(bed.gain);
  wobble.start(t0);
  wobble.stop(t0 + dur + 0.1);
  ns.connect(hp).connect(lp).connect(bed).connect(master);
  ns.start(t0);
  ns.stop(t0 + dur + 0.1);
  v.stoppables.push(ns, wobble);

  // Droplet clicks: scheduled in 250 ms batches with 200 ms look-ahead
  const clickBus = ctx.createGain();
  clickBus.gain.setValueAtTime(0.0001, t0);
  clickBus.gain.exponentialRampToValueAtTime(0.5, t0 + fadeIn);
  clickBus.gain.setValueAtTime(0.5, t0 + dur - fadeOut);
  clickBus.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  clickBus.connect(master);
  const clickNoise = noiseBuffer(ctx, 0.05, "white");
  let cursor = t0 + 0.05;
  const end = t0 + dur;
  const schedule = () => {
    const horizon = ctx.currentTime + 0.35;
    while (cursor < horizon && cursor < end) {
      const src = ctx.createBufferSource();
      src.buffer = clickNoise;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1800 + Math.random() * 3200;
      bp.Q.value = 4 + Math.random() * 6;
      const g = ctx.createGain();
      const len = 0.006 + Math.random() * 0.014;
      const lvl = 0.08 + Math.random() * 0.25;
      g.gain.setValueAtTime(lvl, cursor);
      g.gain.exponentialRampToValueAtTime(0.0001, cursor + len);
      src.connect(bp).connect(g).connect(clickBus);
      src.start(cursor);
      src.stop(cursor + len + 0.01);
      cursor += 0.015 + Math.random() * 0.09;
    }
    if (cursor < end) v.timers.push(window.setTimeout(schedule, 150));
  };
  schedule();
}

function whiteFade(v: Voice, dur: number): void {
  const { ctx, master, t0 } = v;
  // Soft rising pad: A3 E4 A4 C#5 detuned pairs through an opening low-pass
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(300, t0);
  lp.frequency.exponentialRampToValueAtTime(3200, t0 + dur * 0.7);
  lp.Q.value = 0.5;
  const env: Envelope = { attack: dur * 0.6, decay: dur * 0.1, sustain: 0.9, release: dur * 0.3 };
  const g = envGain(ctx, master, 0.45, env, dur, t0);
  lp.connect(g);
  for (const f of [220, 329.63, 440, 554.37]) {
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = f;
      o.detune.value = det;
      const og = ctx.createGain();
      og.gain.value = f > 400 ? 0.12 : 0.2;
      o.connect(og).connect(lp);
      o.start(t0);
      o.stop(t0 + dur + 0.1);
      v.stoppables.push(o);
    }
  }
  // Air
  const ns = ctx.createBufferSource();
  ns.buffer = noiseBuffer(ctx, 4, "pink");
  ns.loop = true;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 2500;
  const ng = envGain(ctx, master, 0.08, env, dur, t0);
  ns.connect(hp).connect(ng);
  ns.start(t0);
  ns.stop(t0 + dur + 0.1);
  v.stoppables.push(ns);
}

const DEFAULT_DURATION: Record<SfxName, number> = {
  "liftoff-rumble": 6,
  "low-swell": 4,
  "wormhole-whoosh": 8,
  "arrival-chime": 3,
  rain: 30,
  "white-fade": 6,
};

const DEFAULT_GAIN: Record<SfxName, number> = {
  "liftoff-rumble": 0.9,
  "low-swell": 0.7,
  "wormhole-whoosh": 0.8,
  "arrival-chime": 0.6,
  rain: 0.35,
  "white-fade": 0.5,
};

export function playSfx(name: SfxName, opts: SfxOptions = {}): SfxHandle {
  const dur = Math.max(0.3, opts.durationSec ?? DEFAULT_DURATION[name]);
  const v = beginVoice(opts.gain ?? DEFAULT_GAIN[name]);
  switch (name) {
    case "liftoff-rumble":
      liftoffRumble(v, dur);
      break;
    case "low-swell":
      lowSwell(v, dur);
      break;
    case "wormhole-whoosh":
      wormholeWhoosh(v, dur);
      break;
    case "arrival-chime":
      arrivalChime(v, dur);
      break;
    case "rain":
      rain(v, dur);
      break;
    case "white-fade":
      whiteFade(v, dur);
      break;
  }
  return finishVoice(v, dur, name === "rain" ? 1.5 : 0.4);
}
