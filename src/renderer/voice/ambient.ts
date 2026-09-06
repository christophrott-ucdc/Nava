/**
 * Procedural ambient beds per SceneTheme (Web Audio, no files) — R4 / B-03.
 * Synthesis style ported from Exodus src/lib/audio-synth.ts (startAmbient: detuned drone +
 * breathing LFO + filtered looping noise + timer-scheduled blips), extended per theme:
 *
 *   prologue  deep 55 Hz drone + slow breathing pad              tech   cold steel drone + crystalline high pings
 *   launch    rising pad + subtle sub pulse                       void   sub + sparse violet tones
 *   light     warm shimmering pad (gold), soft high sparkle       home   warm major pad
 *   nature    wet drone + rain texture + occasional low "breath"  white  soft airy pad
 *
 * Graph:  bed layers -> bedGain (crossfade) -> duck -> master (sfxVolume x ambient.volume) -> destination
 *   - crossfade 4 s on theme change (`crossfade` / `start`), stop fades out;
 *   - ducking to `duck` (0..1) while a voice plays (Timeline hooks setDucked);
 *   - `followTheme` auto-follows `theme` cues unless the show scripts an explicit ambient cue for that theme;
 *   - screens with playAudio=false get a silent engine (no graph, state only).
 */

import type { AmbientCue, Phase, SceneTheme } from "../../shared/types";
import { musicSilenceGain } from "../../shared/music";
import { createMusicFiles } from "./music-files";
import { createWaitingScore } from "./waiting-score";
import type { Logger } from "../log";
import { getAudioContext, unlockAudio } from "./context";
import { noiseBuffer } from "./sfx";

export interface AmbientOptions {
  /** false on screens with playAudio=false: no audio graph is built. */
  audible: boolean;
  enabled: boolean;
  /** 0..1 relative to sfxVolume (config.ambient.volume). */
  volume: number;
  /** Gain while a voice plays (config.ambient.duck, 0.25 = about -12 dB). */
  duck: number;
  /** config.audio.sfxVolume (updated by the setVolume command). */
  sfxVolume: number;
  log?: Logger;
  fileBaseUrl?: string;
}

export interface BedOptions {
  /** Bed level 0..1 (default 1). */
  gain?: number;
  /** Fade length in seconds (default 4 for crossfades, 2 for a cold start, 4 for stop). */
  fadeSec?: number;
}

export interface AmbientEngine {
  /** Command `ambient` on/off. Enabling resumes the bed of the last theme seen. */
  setEnabled(on: boolean): void;
  isEnabled(): boolean;
  /** Cue `ambient` action start (crossfades if a bed is already playing). */
  start(bed: SceneTheme, opts?: BedOptions): void;
  /** Cue `ambient` action crossfade (identical bed = only the gain is updated). */
  crossfade(bed: SceneTheme, opts?: BedOptions): void;
  /** Cue `ambient` action stop. */
  stop(opts?: BedOptions): void;
  /** A `theme` was applied: auto-follow unless the show scripts explicit ambient cues for it. */
  followTheme(theme: SceneTheme): void;
  /** Themes with explicit ambient cues in the current show (cue-scheduler.explicitAmbientBeds). */
  setExplicitBeds(beds: ReadonlySet<SceneTheme>): void;
  /** Voice playing -> duck. */
  setDucked(on: boolean, owner?: 'voice'|'narrator'): void;
  setFileCues(cues: readonly AmbientCue[]): void;
  syncFiles(phase:Phase|null,time:number,rate:number):void;
  /** Reception only; paused reception retains its position, a new run restarts it. */
  syncWaiting(runId:string,eligible:boolean,paused:boolean):void;
  stopWaiting():void;
  musicStatus():{loaded:string[];failed:string[];active:string[];silenceGain:number;duckGain:number};
  /** config.ambient.volume (0..1). */
  setVolume(v: number): void;
  /** config.audio.sfxVolume (0..1.5). */
  setSfxVolume(v: number): void;
  currentBed(): SceneTheme | null;
  dispose(): void;
}

const CROSSFADE_SEC = 4;
const START_SEC = 2;
const STOP_SEC = 4;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Layer primitives (all write into a Layers registry so the bed can be torn down)
// ---------------------------------------------------------------------------

interface Layers {
  ctx: AudioContext;
  out: GainNode;
  nodes: Array<{ stop(when?: number): void }>;
  timers: number[];
  disposed: boolean;
}

function osc(l: Layers, type: OscillatorType, freq: number, detuneCents = 0): OscillatorNode {
  const o = l.ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detuneCents;
  o.start();
  l.nodes.push(o);
  return o;
}

function gainNode(l: Layers, value: number): GainNode {
  const g = l.ctx.createGain();
  g.gain.value = value;
  return g;
}

function filter(l: Layers, type: BiquadFilterType, freq: number, q = 0.7, gainDb?: number): BiquadFilterNode {
  const f = l.ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  if (gainDb !== undefined) f.gain.value = gainDb;
  return f;
}

/** LFO (sine) into an AudioParam: param = base + depth * sin. */
function lfo(l: Layers, param: AudioParam, hz: number, depth: number, phase = 0): void {
  const o = l.ctx.createOscillator();
  o.type = "sine";
  o.frequency.value = hz;
  const d = gainNode(l, depth);
  o.connect(d).connect(param);
  o.start(l.ctx.currentTime + phase / Math.max(0.001, hz) / TAU);
  l.nodes.push(o);
}

interface DroneSpec {
  freq: number;
  gain: number;
  type?: OscillatorType;
  /** Detune of the second oscillator (cents) for slow beating. */
  detune?: number;
  /** Breathing LFO on the gain (Hz, depth 0..1 of gain). */
  breathHz?: number;
  breathDepth?: number;
  /** Optional low-pass to tame sawtooth drones. */
  lpHz?: number;
}

function drone(l: Layers, s: DroneSpec): void {
  const g = gainNode(l, s.gain);
  const dest: AudioNode = s.lpHz ? filter(l, "lowpass", s.lpHz, 0.8) : g;
  if (s.lpHz) dest.connect(g);
  g.connect(l.out);
  const type = s.type ?? "sine";
  osc(l, type, s.freq).connect(dest);
  osc(l, type, s.freq, s.detune ?? 7).connect(dest);
  if (s.breathHz) lfo(l, g.gain, s.breathHz, s.gain * (s.breathDepth ?? 0.4));
}

interface PadSpec {
  freqs: number[];
  gain: number;
  type?: OscillatorType;
  /** Each note gets a +/- detuned pair (cents). */
  detune?: number;
  lpHz: number;
  /** Slow filter movement. */
  lpLfoHz?: number;
  lpLfoDepth?: number;
  /** Rising pad: sweep the low-pass from `sweepFromHz` to `lpHz` over `sweepSec`. */
  sweepFromHz?: number;
  sweepSec?: number;
  /** Shimmer: a modulated short delay mixed in (chorus). */
  shimmer?: boolean;
  /** Breathing on the pad gain. */
  breathHz?: number;
  breathDepth?: number;
}

function pad(l: Layers, s: PadSpec): void {
  const g = gainNode(l, s.gain);
  const lp = filter(l, "lowpass", s.lpHz, 0.6);
  lp.connect(g).connect(l.out);
  if (s.sweepFromHz && s.sweepSec) {
    const t = l.ctx.currentTime;
    lp.frequency.setValueAtTime(s.sweepFromHz, t);
    lp.frequency.exponentialRampToValueAtTime(s.lpHz, t + s.sweepSec);
  }
  if (s.lpLfoHz) lfo(l, lp.frequency, s.lpLfoHz, s.lpLfoDepth ?? s.lpHz * 0.25);
  if (s.breathHz) lfo(l, g.gain, s.breathHz, s.gain * (s.breathDepth ?? 0.3));
  const perNote = 1 / Math.max(1, s.freqs.length * 2);
  const type = s.type ?? "triangle";
  const det = s.detune ?? 6;
  const sum = gainNode(l, perNote);
  sum.connect(lp);
  for (const f of s.freqs) {
    osc(l, type, f, -det).connect(sum);
    osc(l, type, f, det).connect(sum);
  }
  if (s.shimmer) {
    const d = l.ctx.createDelay(0.05);
    d.delayTime.value = 0.018;
    lfo(l, d.delayTime, 0.23, 0.0025);
    const wet = gainNode(l, 0.45);
    sum.connect(d).connect(wet).connect(lp);
  }
}

interface NoiseSpec {
  color: "white" | "pink" | "brown";
  gain: number;
  filters: Array<{ type: BiquadFilterType; freq: number; q?: number }>;
  /** Slow level wobble (Hz, depth 0..1 of gain). */
  wobbleHz?: number;
  wobbleDepth?: number;
}

function noise(l: Layers, s: NoiseSpec): GainNode {
  const src = l.ctx.createBufferSource();
  src.buffer = noiseBuffer(l.ctx, 6, s.color);
  src.loop = true;
  let node: AudioNode = src;
  for (const f of s.filters) {
    const b = filter(l, f.type, f.freq, f.q ?? 0.7);
    node.connect(b);
    node = b;
  }
  const g = gainNode(l, s.gain);
  node.connect(g).connect(l.out);
  if (s.wobbleHz) lfo(l, g.gain, s.wobbleHz, s.gain * (s.wobbleDepth ?? 0.3));
  src.start();
  l.nodes.push(src);
  return g;
}

interface PingSpec {
  freqs: number[];
  intervalMs: number;
  /** 0..1 random spread of the interval. */
  jitter: number;
  gain: number;
  /** Decay in seconds. */
  decay: number;
  type?: OscillatorType;
  attack?: number;
  /** Tiny random detune (cents) for a crystalline feel. */
  scatterCents?: number;
}

/** Sparse tones scheduled with setTimeout (short look-ahead), like the Exodus blips. */
function pings(l: Layers, s: PingSpec): void {
  const bus = gainNode(l, s.gain);
  bus.connect(l.out);
  const fire = () => {
    if (l.disposed) return;
    const ctx = l.ctx;
    const t = ctx.currentTime + 0.05;
    const f = s.freqs[Math.floor(Math.random() * s.freqs.length)];
    const o = ctx.createOscillator();
    o.type = s.type ?? "sine";
    o.frequency.value = f;
    o.detune.value = (Math.random() - 0.5) * (s.scatterCents ?? 0);
    const g = ctx.createGain();
    const a = s.attack ?? 0.01;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + s.decay);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + a + s.decay + 0.05);
    const next = s.intervalMs * (1 + (Math.random() - 0.5) * 2 * s.jitter);
    l.timers.push(window.setTimeout(fire, Math.max(150, next)));
  };
  l.timers.push(window.setTimeout(fire, 400 + Math.random() * s.intervalMs));
}

/** Gated sub: a sine whose gain is pulsed by a slow LFO (launch heartbeat). */
function pulse(l: Layers, freq: number, rateHz: number, gain: number): void {
  const g = gainNode(l, gain * 0.5);
  lfo(l, g.gain, rateHz, gain * 0.5);
  g.connect(l.out);
  osc(l, "sine", freq).connect(g);
}

/** Occasional low "breath": a brown-noise swell through a low-pass (nature). */
function breath(l: Layers, everyMs: number, gain: number, lenSec: number): void {
  const src = l.ctx.createBufferSource();
  src.buffer = noiseBuffer(l.ctx, 6, "brown");
  src.loop = true;
  const lp = filter(l, "lowpass", 260, 0.9);
  const g = gainNode(l, 0.0001);
  src.connect(lp).connect(g).connect(l.out);
  src.start();
  l.nodes.push(src);
  const swell = () => {
    if (l.disposed) return;
    const t = l.ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + lenSec * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + lenSec);
    l.timers.push(window.setTimeout(swell, everyMs * (0.7 + Math.random() * 0.6)));
  };
  l.timers.push(window.setTimeout(swell, 1500 + Math.random() * 2000));
}

/** Rain: band-limited pink noise with wobble + sparse droplet clicks (light version of sfx.ts rain). */
function rain(l: Layers, gain: number): void {
  noise(l, { color: "pink", gain, filters: [{ type: "highpass", freq: 900 }, { type: "lowpass", freq: 6500 }], wobbleHz: 0.13, wobbleDepth: 0.25 });
  const clickBus = gainNode(l, gain * 0.9);
  clickBus.connect(l.out);
  const clickNoise = noiseBuffer(l.ctx, 0.05, "white");
  let cursor = l.ctx.currentTime + 0.1;
  const schedule = () => {
    if (l.disposed) return;
    const ctx = l.ctx;
    const horizon = ctx.currentTime + 0.4;
    if (cursor < ctx.currentTime) cursor = ctx.currentTime + 0.02;
    while (cursor < horizon) {
      const src = ctx.createBufferSource();
      src.buffer = clickNoise;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1800 + Math.random() * 3200;
      bp.Q.value = 4 + Math.random() * 6;
      const g = ctx.createGain();
      const len = 0.006 + Math.random() * 0.014;
      g.gain.setValueAtTime(0.06 + Math.random() * 0.2, cursor);
      g.gain.exponentialRampToValueAtTime(0.0001, cursor + len);
      src.connect(bp).connect(g).connect(clickBus);
      src.start(cursor);
      src.stop(cursor + len + 0.01);
      cursor += 0.05 + Math.random() * 0.25;
    }
    l.timers.push(window.setTimeout(schedule, 180));
  };
  schedule();
}

// ---------------------------------------------------------------------------
// Beds per theme
// ---------------------------------------------------------------------------

function buildLayers(l: Layers, theme: SceneTheme): void {
  switch (theme) {
    case "prologue":
      // Deep 55 Hz drone + slow breathing pad (A1 / A2 / E3), dark noise floor.
      drone(l, { freq: 55, gain: 0.26, detune: 6, breathHz: 0.11, breathDepth: 0.45 });
      pad(l, { freqs: [110, 164.81, 220], gain: 0.09, type: "triangle", lpHz: 520, lpLfoHz: 0.045, lpLfoDepth: 160, breathHz: 0.07, breathDepth: 0.35 });
      noise(l, { color: "brown", gain: 0.05, filters: [{ type: "lowpass", freq: 220, q: 0.5 }] });
      break;
    case "launch":
      // Rising pad (D minor-ish stack) with an opening filter + subtle sub pulse.
      pad(l, { freqs: [146.83, 220, 293.66, 440], gain: 0.11, type: "sawtooth", detune: 9, lpHz: 1600, sweepFromHz: 380, sweepSec: 24, lpLfoHz: 0.08, lpLfoDepth: 350 });
      pulse(l, 49, 1.15, 0.14);
      drone(l, { freq: 73.42, gain: 0.1, detune: 5, type: "triangle", breathHz: 0.2, breathDepth: 0.3 });
      noise(l, { color: "pink", gain: 0.05, filters: [{ type: "bandpass", freq: 800, q: 0.8 }], wobbleHz: 0.3, wobbleDepth: 0.3 });
      break;
    case "light":
      // Warm shimmering pad (C major, gold) + very soft high sparkle.
      pad(l, { freqs: [261.63, 329.63, 392, 523.25], gain: 0.12, type: "triangle", detune: 7, lpHz: 2400, lpLfoHz: 0.06, lpLfoDepth: 500, shimmer: true, breathHz: 0.09, breathDepth: 0.25 });
      drone(l, { freq: 130.81, gain: 0.08, detune: 4, breathHz: 0.13 });
      pings(l, { freqs: [1567.98, 2093, 2637.02], intervalMs: 5200, jitter: 0.6, gain: 0.035, decay: 1.6, attack: 0.08, type: "sine" });
      break;
    case "nature":
      // Wet drone + rain texture + occasional low breath.
      drone(l, { freq: 65.41, gain: 0.14, detune: 8, breathHz: 0.1, breathDepth: 0.4 });
      rain(l, 0.075);
      breath(l, 11000, 0.16, 3.2);
      pad(l, { freqs: [196, 246.94, 293.66], gain: 0.045, type: "sine", lpHz: 900, breathHz: 0.05 });
      break;
    case "tech":
      // Cold steel drone (sawtooth stack through a low-pass) + crystalline high pings.
      drone(l, { freq: 58.27, gain: 0.13, detune: 11, type: "sawtooth", lpHz: 240, breathHz: 0.17, breathDepth: 0.25 });
      drone(l, { freq: 116.54, gain: 0.03, detune: 3, type: "square", lpHz: 400 });
      noise(l, { color: "white", gain: 0.022, filters: [{ type: "bandpass", freq: 1200, q: 0.9 }], wobbleHz: 0.45, wobbleDepth: 0.4 });
      pings(l, { freqs: [2400, 3200, 3600, 4800], intervalMs: 2600, jitter: 0.7, gain: 0.04, decay: 0.35, attack: 0.004, type: "sine", scatterCents: 30 });
      break;
    case "void":
      // Sub + sparse violet tones (D# minor pentatonic), near-black noise floor.
      drone(l, { freq: 36.71, gain: 0.26, detune: 3, breathHz: 0.06, breathDepth: 0.35 });
      pings(l, { freqs: [155.56, 207.65, 233.08, 311.13, 415.3], intervalMs: 8500, jitter: 0.5, gain: 0.07, decay: 4.5, attack: 1.8, type: "triangle" });
      noise(l, { color: "brown", gain: 0.035, filters: [{ type: "lowpass", freq: 120, q: 0.4 }] });
      break;
    case "home":
      // Warm major pad (G major) with slow breathing.
      pad(l, { freqs: [196, 246.94, 293.66, 392], gain: 0.13, type: "triangle", detune: 6, lpHz: 1800, lpLfoHz: 0.05, lpLfoDepth: 350, breathHz: 0.08, breathDepth: 0.3 });
      drone(l, { freq: 98, gain: 0.09, detune: 5, breathHz: 0.1 });
      noise(l, { color: "pink", gain: 0.03, filters: [{ type: "lowpass", freq: 500, q: 0.5 }] });
      break;
    case "white":
      // Soft airy pad (A major) + air.
      pad(l, { freqs: [220, 329.63, 440, 554.37], gain: 0.1, type: "sine", detune: 5, lpHz: 3000, lpLfoHz: 0.04, lpLfoDepth: 600, shimmer: true, breathHz: 0.06, breathDepth: 0.25 });
      noise(l, { color: "pink", gain: 0.04, filters: [{ type: "highpass", freq: 2500, q: 0.5 }], wobbleHz: 0.09, wobbleDepth: 0.3 });
      break;
    default: {
      const never: never = theme;
      void never;
    }
  }
}

interface Bed {
  theme: SceneTheme;
  gain: GainNode;
  level: number;
  layers: Layers;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export function createAmbient(opts: AmbientOptions): AmbientEngine {
  const log: Logger = opts.log ?? (() => undefined);
  const audible = opts.audible;
  let enabled = opts.enabled;
  let volume = clamp01(opts.volume);
  let sfxVolume = Math.max(0, Math.min(1.5, opts.sfxVolume));
  let duckLevel = 10 ** (-9 / 20);
  let ducked = false;
  const speakers=new Set<string>();
  let fileCues:readonly AmbientCue[]=[];
  let files:ReturnType<typeof createMusicFiles>|null=null;
  let waiting:ReturnType<typeof createWaitingScore>|null=null;
  let waitingRun='',waitingEligible=false,waitingPaused=false;
  let showPhase:Phase|null=null;
  let silenceGain=1;
  let explicitBeds: ReadonlySet<SceneTheme> = new Set();
  let lastTheme: SceneTheme | null = null;
  let current: Bed | null = null;
  let disposed = false;

  // Graph is created lazily (and only when audible).
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let duck: GainNode | null = null;
  let silence: GainNode | null = null;

  const masterTarget = () => sfxVolume * volume;

  const graph = (): { ctx: AudioContext; duck: GainNode } | null => {
    if (!audible || disposed) return null;
    if (!ctx || ctx.state === "closed") {
      ctx = getAudioContext();
      master = ctx.createGain();
      master.gain.value = masterTarget();
      duck = ctx.createGain();
      duck.gain.value = ducked ? duckLevel : 1;
      silence=ctx.createGain();silence.gain.value=silenceGain;
      duck.connect(silence).connect(master).connect(ctx.destination);
      if(opts.fileBaseUrl){files=createMusicFiles(ctx,duck,opts.fileBaseUrl,log);files.preload(fileCues);}
      if(opts.fileBaseUrl)waiting=createWaitingScore(ctx,duck,opts.fileBaseUrl,log);
    }
    void unlockAudio();
    return { ctx, duck: duck! };
  };

  const disposeBed = (bed: Bed, afterSec: number) => {
    const l = bed.layers;
    window.setTimeout(() => {
      l.disposed = true;
      for (const t of l.timers) window.clearTimeout(t);
      for (const n of l.nodes) {
        try {
          n.stop();
        } catch {
          /* already stopped */
        }
      }
      try {
        bed.gain.disconnect();
      } catch {
        /* ignore */
      }
    }, afterSec * 1000 + 100);
  };

  const fadeOut = (bed: Bed, fadeSec: number) => {
    const t = bed.layers.ctx.currentTime;
    bed.gain.gain.cancelScheduledValues(t);
    bed.gain.gain.setValueAtTime(Math.max(0.0001, bed.gain.gain.value), t);
    bed.gain.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.05, fadeSec));
    disposeBed(bed, fadeSec);
  };

  const setLevel = (bed: Bed, level: number, sec: number) => {
    bed.level = level;
    const t = bed.layers.ctx.currentTime;
    bed.gain.gain.cancelScheduledValues(t);
    bed.gain.gain.setValueAtTime(Math.max(0.0001, bed.gain.gain.value), t);
    bed.gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, level), t + Math.max(0.05, sec));
  };

  const play = (theme: SceneTheme, o: BedOptions | undefined, defaultFade: number) => {
    if (!enabled || waitingEligible && showPhase===null) return;
    const g = graph();
    if (!g) {
      current = null;
      return;
    }
    const level = clamp01(o?.gain ?? 1);
    const fade = Math.max(0.05, o?.fadeSec ?? defaultFade);
    if (current && current.theme === theme) {
      if (Math.abs(current.level - level) > 0.001) setLevel(current, level, fade);
      return;
    }
    const prev = current;
    const layers: Layers = { ctx: g.ctx, out: g.ctx.createGain(), nodes: [], timers: [], disposed: false };
    const bedGain = g.ctx.createGain();
    bedGain.gain.value = 0.0001;
    layers.out.connect(bedGain).connect(g.duck);
    try {
      buildLayers(layers, theme);
    } catch (err) {
      log("warn", `ambient: bed ${theme} failed to build: ${err instanceof Error ? err.message : String(err)}`);
    }
    const bed: Bed = { theme, gain: bedGain, level, layers };
    current = bed;
    setLevel(bed, level, fade);
    if (prev) fadeOut(prev, fade);
    log("info", `ambient: ${prev ? `${prev.theme} -> ` : ""}${theme} (${fade.toFixed(1)} s, level ${level.toFixed(2)})`);
  };

  const stop = (o?: BedOptions) => {
    const cur = current;
    current = null;
    if (!cur) return;
    fadeOut(cur, o?.fadeSec ?? STOP_SEC);
    log("info", `ambient: stop ${cur.theme}`);
  };

  const applyMaster = () => {
    if (!ctx || !master) return;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(masterTarget(), ctx.currentTime, 0.05);
  };

  return {
    setEnabled(on) {
      if (enabled === on) return;
      enabled = on;
      waiting?.sync(waitingRun,on&&waitingEligible&&!waitingPaused&&showPhase===null);
      if (!on) stop({ fadeSec: 1.5 });
      else if (lastTheme) this.followTheme(lastTheme);
    },
    isEnabled: () => enabled,
    start: (bed, o) => play(bed, o, current ? CROSSFADE_SEC : START_SEC),
    crossfade: (bed, o) => play(bed, o, CROSSFADE_SEC),
    stop,
    followTheme(theme) {
      lastTheme = theme;
      if (!enabled || explicitBeds.has(theme)) return;
      play(theme, undefined, current ? CROSSFADE_SEC : START_SEC);
    },
    setExplicitBeds(beds) {
      explicitBeds = beds;
    },
    setFileCues(cues){fileCues=cues;const g=audible&&enabled?graph():null;if(g)files?.preload(cues);},
    syncFiles(phase,time,rate){
      showPhase=phase;
      // Stop reception before the first show source can start, including local launch commands.
      waiting?.sync(waitingRun,enabled&&waitingEligible&&!waitingPaused&&phase===null);
      silenceGain=musicSilenceGain(phase,time);if(silence)silence.gain.value=silenceGain;
      if(audible&&enabled&&fileCues.length&&!files)graph();
      files?.sync(fileCues,phase,time,rate,enabled);
    },
    syncWaiting(runId,eligible,paused){
      waitingRun=runId;waitingEligible=eligible;waitingPaused=paused;
      if(eligible&&enabled&&audible&&!waiting)graph();
      if(eligible&&showPhase===null&&current)stop({fadeSec:.1});
      waiting?.sync(runId,enabled&&eligible&&!paused&&showPhase===null);
    },
    stopWaiting(){waitingEligible=false;waiting?.sync(waitingRun,false);},
    musicStatus(){return {...(files?.status()??{loaded:[],failed:[],active:[]}),silenceGain,duckGain:duck?.gain.value??1};},
    setDucked(on,owner='voice') {
      if(on)speakers.add(owner);else speakers.delete(owner);
      on=speakers.size>0;
      if (ducked === on) return;
      ducked = on;
      if (!ctx || !duck) return;
      const t = ctx.currentTime;
      duck.gain.cancelScheduledValues(t);
      duck.gain.setValueAtTime(duck.gain.value,t);
      duck.gain.linearRampToValueAtTime(on ? duckLevel : 1,t+(on?.3:.8));
    },
    setVolume(v) {
      volume = clamp01(v);
      applyMaster();
    },
    setSfxVolume(v) {
      sfxVolume = Math.max(0, Math.min(1.5, Number.isFinite(v) ? v : 0));
      applyMaster();
    },
    currentBed: () => current?.theme ?? null,
    dispose() {
      disposed = true;
      files?.dispose();
      waiting?.dispose();
      stop({ fadeSec: 0.2 });
      duckLevel = 0;
    },
  };
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}
