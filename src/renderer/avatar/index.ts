/**
 * Public AvatarController implementation.
 *
 * TalkingHead owns the WebGL model and its (muted) AudioContext. Audible
 * speech is deliberately left to VoiceEngine; a silent buffer only gives the
 * head a clock on which to schedule word/viseme animation.
 *
 * R4 additions (HANDOFF-LIVE.md §2, Agent C):
 *  - C-01 casting: `body` (option -> boot.config.avatar.body -> "M"), getCastingReport() and a
 *    loud warning when the shipped female GLB is cast as the Captain.
 *  - C-02 precomputed visemes are preferred over words when the clip carries them.
 *  - C-04 getFps() / getLastLipsyncLatencyMs() for the 1 Hz `perf` message (Agent B, perf.ts).
 */
import type { AvatarCastingReport, AvatarController, AvatarControllerOptions, CreateAvatarController, VoiceClip } from "../../shared/contracts";
import type { Lang } from "../../shared/types";
import { buildCastingReport, inferFemaleLookFromNodeNames, readBootAvatarConfig, resolveBody, type AvatarBody, type AvatarConfigLike } from "./casting";
import { distributeWordVisemes, wordsToVisemeTrack, type OculusViseme } from "./lipsync-ro";
import { FrameMeter, LipsyncLatencyProbe, firstVisemeOffset, type LatencySample } from "./perf-probe";
import { AVATAR_ASPECT, createHead, safeDispose, type CreatedHead } from "./talkinghead-setup";
import { Transporter } from "./transporter";

const SYNTHETIC_VISEMES: readonly OculusViseme[] = ["aa", "E", "I", "O", "U", "PP", "DD", "SS", "nn", "RR"];
const MIN_DURATION_MS = 80;

function lipsyncLanguage(lang: Lang): string {
  // The project supplies a Romanian processor and TalkingHead supplies EN.
  // French still gets a serviceable visual approximation through EN.
  return lang === "ro" ? "ro" : "en";
}

function finiteDuration(value: number): number {
  return Number.isFinite(value) ? Math.max(MIN_DURATION_MS, Math.round(value)) : 900;
}

function usableWordTimings(clip: VoiceClip): boolean {
  const n = clip.words.length;
  return n > 0 && clip.wtimes.length >= n && clip.wdurations.length >= n;
}

function usableVisemeTimings(clip: VoiceClip): clip is VoiceClip & {
  visemes: string[];
  vtimes: number[];
  vdurations: number[];
} {
  const n = clip.visemes?.length ?? 0;
  return n > 0 && (clip.vtimes?.length ?? 0) >= n && (clip.vdurations?.length ?? 0) >= n;
}

/** Everything the debug page / perf.ts may want in one call. */
export interface AvatarDiagnostics {
  loaded: boolean;
  fps: number | null;
  /** "head" = TalkingHead render calls; "raf" = compositor fallback; null = not attached. */
  fpsSource: "head" | "raf" | null;
  lipsyncLatencyMs: number | null;
  lipsyncSample: LatencySample | null;
  /** Which timing source the last lipsync() used. */
  lastLipsyncSource: "visemes" | "words" | "estimated" | "synthetic" | null;
  casting: AvatarCastingReport;
  visemesMissing: string[];
}

export interface NavaAvatarController extends AvatarController {
  getLastLipsyncLatencyMs(): number | null;
  getFps(): number | null;
  getCastingReport(): AvatarCastingReport;
  getDiagnostics(): AvatarDiagnostics;
}

function bridgeLog(level: "info" | "warn" | "error", msg: string, data?: unknown): void {
  try {
    (window as unknown as { nava?: { log?: (l: "info" | "warn" | "error", m: string, d?: unknown) => void } }).nava?.log?.(level, msg, data);
  } catch {
    /* no bridge (browser dev mode) */
  }
}

class AvatarControllerImpl implements NavaAvatarController {
  private readonly transporter: Transporter;
  private readonly frames = new FrameMeter();
  private readonly latency = new LipsyncLatencyProbe();
  private created: CreatedHead | null = null;
  private loadPromise: Promise<void> | null = null;
  private disposed = false;
  private generation = 0;
  private desiredVisible = false;
  private mood = "neutral";
  private attention: "camera" | "idle" = "camera";
  private speaking = false;
  private speakingTimer: number | null = null;
  private recoveryTimer: number | null = null;
  private canvasCleanup: (() => void) | null = null;
  private widthPx: number;
  private body: AvatarBody;
  private bootAvatar: AvatarConfigLike | null | undefined; // undefined = not read yet
  private casting: AvatarCastingReport;
  private lastLipsyncSource: AvatarDiagnostics["lastLipsyncSource"] = null;

  constructor(private readonly opts: AvatarControllerOptions) {
    this.widthPx = Math.max(1, opts.widthPx);
    this.body = resolveBody(opts.body, null);
    this.casting = buildCastingReport(opts.glbUrl, this.body);
    this.transporter = new Transporter(opts.container);
    this.resize(this.widthPx);
    this.transporter.hide(false);
  }

  load(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error("AvatarController has been disposed"));
    if (this.created) return Promise.resolve();
    if (this.loadPromise) return this.loadPromise;
    const generation = ++this.generation;
    this.loadPromise = this.loadGeneration(generation).finally(() => {
      if (this.generation === generation) this.loadPromise = null;
    });
    return this.loadPromise;
  }

  private async resolveCasting(): Promise<void> {
    if (this.bootAvatar === undefined) this.bootAvatar = await readBootAvatarConfig();
    this.body = resolveBody(this.opts.body, this.bootAvatar);
    this.casting = buildCastingReport(this.opts.glbUrl, this.body);
  }

  private async loadGeneration(generation: number): Promise<void> {
    try {
      await this.resolveCasting();
      if (this.disposed || generation !== this.generation) return;
      const made = await createHead({
        mount: this.transporter.body,
        glbUrl: this.opts.glbUrl,
        body: this.body,
        lipsyncLang: lipsyncLanguage(this.opts.lang),
        onProgress: (ev) => {
          if (ev.lengthComputable && ev.total > 0 && ev.loaded === ev.total) {
            console.info(`[avatar] GLB loaded (${Math.round(ev.total / 1024)} KiB)`);
          }
        },
      });
      if (this.disposed || generation !== this.generation) {
        safeDispose(made.head);
        return;
      }
      this.created = made;
      this.frames.attach(made.head);
      this.bindContextRecovery(made.canvas);
      this.resize(this.widthPx);
      this.applyMood();
      this.applyAttention();
      this.desiredVisible ? this.transporter.show(false) : this.transporter.hide(false);
      if (made.visemesMissing.length) {
        console.warn(`[avatar] missing Oculus morph targets: ${made.visemesMissing.join(", ")}`);
      }
      this.reportCasting(made);
      try {
        this.opts.onReady?.();
      } catch (err) {
        console.warn("[avatar] onReady callback failed:", err);
      }
    } catch (err) {
      if (!this.disposed && generation === this.generation) this.reportError(err);
      throw err;
    }
  }

  /** Refine the casting report with what the loaded scene reveals, then log it once per load. */
  private reportCasting(made: CreatedHead): void {
    const names: string[] = [];
    try {
      made.head.armature?.traverse((obj) => {
        if (obj.name) names.push(obj.name);
      });
      for (const mesh of made.head.morphs ?? []) if (mesh.name) names.push(mesh.name);
    } catch {
      /* scene graph not inspectable — keep the filename rule */
    }
    const inferred = inferFemaleLookFromNodeNames(names);
    this.casting = buildCastingReport(this.opts.glbUrl, this.body, inferred);
    const summary = `[avatar] casting: glb=${this.casting.glb} body=${this.casting.body} lipsync=${this.casting.speakerWithLipsync} visemes=${made.visemesPresent.length}/14`;
    if (this.casting.mismatchWarning) {
      console.warn(summary);
      console.warn(this.casting.mismatchWarning);
      bridgeLog("warn", "avatar casting mismatch", this.casting);
    } else {
      console.info(summary);
      bridgeLog("info", "avatar casting", this.casting);
    }
  }

  lipsync(clip: VoiceClip, startAtMs: number): void {
    const made = this.created;
    if (!made || this.disposed) return;
    this.stopSpeaking();

    const callNow = performance.now();
    const delayMs = Number.isFinite(startAtMs) ? Math.max(0, startAtMs - callNow) : 0;
    const durationMs = finiteDuration(clip.durationMs);
    const totalMs = durationMs + delayMs;
    const audio = made.head.audioCtx.createBuffer(1, Math.max(1, Math.ceil((totalMs / 1000) * made.head.audioCtx.sampleRate)), made.head.audioCtx.sampleRate);

    const input: {
      audio: AudioBuffer;
      words?: string[];
      wtimes?: number[];
      wdurations?: number[];
      visemes?: string[];
      vtimes?: number[];
      vdurations?: number[];
    } = { audio };

    if (usableVisemeTimings(clip)) {
      // C-02: precomputed track (scripts/precompute-visemes.mjs) — same Romanian rules, no runtime mapping.
      input.visemes = clip.visemes;
      input.vtimes = clip.vtimes.map((t) => Math.max(0, t + delayMs));
      input.vdurations = clip.vdurations.map((d) => Math.max(20, d));
      // TalkingHead only enters its word/viseme scheduling branch when words
      // exists. An empty sentinel is enough when a precomputed track is used.
      input.words = [];
      input.wtimes = [];
      input.wdurations = [];
      this.lastLipsyncSource = "visemes";
    } else if (usableWordTimings(clip)) {
      // Fallback: TalkingHead maps words at runtime through the registered RO/EN processor.
      input.words = clip.words;
      input.wtimes = clip.wtimes.map((t) => Math.max(0, t + delayMs));
      input.wdurations = clip.wdurations.map((d) => Math.max(20, d));
      this.lastLipsyncSource = "words";
    } else {
      const estimated = this.estimatedWords(clip.text, durationMs);
      input.words = estimated.words;
      input.wtimes = estimated.wtimes.map((t) => t + delayMs);
      input.wdurations = estimated.wdurations;
      this.lastLipsyncSource = "estimated";
    }

    const started = this.startHeadSpeech(input, totalMs);
    if (started) {
      // C-04: expected wall-clock time of the first mouth shape (buffer starts "now").
      const offset = firstVisemeOffset(input.visemes, input.vtimes) ?? (input.wtimes?.length ? Math.min(...input.wtimes) : null);
      if (offset !== null) this.latency.start(made.head, callNow + offset);
    }
  }

  lipsyncSynthetic(durationMs: number): void {
    const made = this.created;
    if (!made || this.disposed) return;
    this.stopSpeaking();
    const duration = finiteDuration(durationMs);
    const audio = made.head.audioCtx.createBuffer(1, Math.max(1, Math.ceil((duration / 1000) * made.head.audioCtx.sampleRate)), made.head.audioCtx.sampleRate);
    const step = 145;
    const visemes: string[] = [];
    const vtimes: number[] = [];
    const vdurations: number[] = [];
    for (let t = 45, i = 0; t < duration - 60; t += step, i++) {
      // Deterministic alternation looks speech-like without flickering and is
      // consistent on every synchronized screen.
      visemes.push(SYNTHETIC_VISEMES[(i * 7 + 3) % SYNTHETIC_VISEMES.length]);
      vtimes.push(t);
      vdurations.push(Math.min(step * 0.82, duration - t));
    }
    this.lastLipsyncSource = "synthetic";
    const started = this.startHeadSpeech({ audio, words: [], wtimes: [], wdurations: [], visemes, vtimes, vdurations }, duration);
    if (started && vtimes.length) this.latency.start(made.head, performance.now() + vtimes[0]);
  }

  private startHeadSpeech(input: Parameters<CreatedHead["head"]["speakAudio"]>[0], durationMs: number): boolean {
    const made = this.created;
    if (!made) return false;
    try {
      made.head.speakAudio(input, { lipsyncLang: lipsyncLanguage(this.opts.lang), isRaw: true });
      this.speaking = true;
      this.speakingTimer = window.setTimeout(() => {
        this.speakingTimer = null;
        this.speaking = false;
      }, durationMs + 120);
      return true;
    } catch (err) {
      this.speaking = false;
      this.reportError(err);
      return false;
    }
  }

  private estimatedWords(text: string, durationMs: number): { words: string[]; wtimes: number[]; wdurations: number[] } {
    const words = text.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) ?? [];
    if (!words.length) return { words: [], wtimes: [], wdurations: [] };
    const weights = words.map((word) => Math.max(1, Math.pow([...word].length, 0.72)));
    const total = weights.reduce((a, b) => a + b, 0);
    const wtimes: number[] = [];
    const wdurations: number[] = [];
    let cursor = Math.min(80, durationMs * 0.03);
    const usable = Math.max(1, durationMs - cursor - Math.min(100, durationMs * 0.04));
    for (const weight of weights) {
      const slice = (usable * weight) / total;
      wtimes.push(cursor);
      wdurations.push(Math.max(40, slice * 0.88));
      cursor += slice;
    }
    return { words, wtimes, wdurations };
  }

  stopSpeaking(): void {
    if (this.speakingTimer !== null) {
      window.clearTimeout(this.speakingTimer);
      this.speakingTimer = null;
    }
    this.speaking = false;
    this.latency.cancel();
    try {
      this.created?.head.stopSpeaking();
      this.created?.head.resetLips();
    } catch {
      /* model may be rebuilding after context loss */
    }
  }

  setVisible(visible: boolean, animate = true): void {
    if (this.disposed) return;
    this.desiredVisible = visible;
    visible ? this.transporter.show(animate) : this.transporter.hide(animate);
  }

  setMood(mood: string): void {
    if (!mood) return;
    this.mood = mood;
    this.applyMood();
  }

  private applyMood(): void {
    const head = this.created?.head;
    if (!head) return;
    try {
      const names = head.getMoodNames();
      head.setMood(names.includes(this.mood) ? this.mood : "neutral");
    } catch (err) {
      console.warn("[avatar] setMood failed:", err);
    }
  }

  setAttention(mode: "camera" | "idle"): void {
    this.attention = mode;
    this.applyAttention();
  }

  private applyAttention(): void {
    const head = this.created?.head;
    if (!head) return;
    try {
      if (this.attention === "camera") head.lookAtCamera(450);
      else head.lookAt(Math.round(window.innerWidth * 0.58), Math.round(window.innerHeight * 0.46), 650);
    } catch {
      /* ignored while the avatar is not fully initialized */
    }
  }

  resize(widthPx: number): void {
    this.widthPx = Math.max(1, widthPx);
    this.transporter.setSize(this.widthPx, this.widthPx / AVATAR_ASPECT);
    try {
      this.created?.head.onResize();
    } catch {
      /* no renderer yet */
    }
  }

  isSpeaking(): boolean {
    return this.speaking || !!this.created?.head.isSpeaking;
  }

  // ---- R4 diagnostics ------------------------------------------------------

  getLastLipsyncLatencyMs(): number | null {
    return this.latency.getLastLatencyMs();
  }

  getFps(): number | null {
    return this.created ? this.frames.getFps() : null;
  }

  getCastingReport(): AvatarCastingReport {
    return { ...this.casting };
  }

  getDiagnostics(): AvatarDiagnostics {
    return {
      loaded: !!this.created,
      fps: this.getFps(),
      fpsSource: this.frames.getMode(),
      lipsyncLatencyMs: this.getLastLipsyncLatencyMs(),
      lipsyncSample: this.latency.getLastSample(),
      lastLipsyncSource: this.lastLipsyncSource,
      casting: this.getCastingReport(),
      visemesMissing: this.created?.visemesMissing ?? [],
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation++;
    this.stopSpeaking();
    this.frames.detach();
    this.clearRecoveryTimer();
    this.canvasCleanup?.();
    this.canvasCleanup = null;
    if (this.created) safeDispose(this.created.head);
    this.created = null;
    this.transporter.dispose();
  }

  private bindContextRecovery(canvas: HTMLCanvasElement | null): void {
    this.canvasCleanup?.();
    this.canvasCleanup = null;
    if (!canvas) return;
    const lost = (event: Event) => {
      event.preventDefault();
      if (this.disposed) return;
      this.reportError(new Error("Contextul WebGL al avatarului a fost pierdut; reîncarc modelul."));
      this.scheduleRecovery();
    };
    canvas.addEventListener("webglcontextlost", lost);
    this.canvasCleanup = () => canvas.removeEventListener("webglcontextlost", lost);
  }

  private scheduleRecovery(): void {
    if (this.recoveryTimer !== null || this.disposed) return;
    this.recoveryTimer = window.setTimeout(() => {
      this.recoveryTimer = null;
      if (this.disposed) return;
      this.canvasCleanup?.();
      this.canvasCleanup = null;
      this.frames.detach();
      if (this.created) safeDispose(this.created.head);
      this.created = null;
      this.loadPromise = null;
      void this.load().catch((err) => console.warn("[avatar] WebGL recovery failed:", err));
    }, 500);
  }

  private clearRecoveryTimer(): void {
    if (this.recoveryTimer !== null) {
      window.clearTimeout(this.recoveryTimer);
      this.recoveryTimer = null;
    }
  }

  private reportError(err: unknown): void {
    try {
      this.opts.onError?.(err);
    } catch (callbackError) {
      console.warn("[avatar] onError callback failed:", callbackError);
    }
  }
}

/** Factory (contract signature); the returned object also implements NavaAvatarController. */
export const createAvatarController: CreateAvatarController & ((opts: AvatarControllerOptions) => NavaAvatarController) = (opts) =>
  new AvatarControllerImpl(opts);

/**
 * Safe accessor for perf.ts / debug: works on the null avatar too (returns nulls).
 * Usage: `const { fps, lipsyncLatencyMs } = readAvatarPerf(avatar);`
 */
export function readAvatarPerf(avatar: AvatarController): { avatarFps: number | null; lipsyncLatencyMs: number | null } {
  let avatarFps: number | null = null;
  let lipsyncLatencyMs: number | null = null;
  try {
    avatarFps = avatar.getFps?.() ?? null;
    lipsyncLatencyMs = avatar.getLastLipsyncLatencyMs?.() ?? null;
  } catch {
    /* diagnostics must never break the perf loop */
  }
  return { avatarFps, lipsyncLatencyMs };
}

// Re-export the pure helpers for diagnostics/unit tests without exposing the
// TalkingHead implementation details to the player.
export { wordsToVisemeTrack, distributeWordVisemes };
export { buildCastingReport, resolveBody, resolveGlbForSpeaker, isKnownFemaleGlb } from "./casting";
export type { AvatarCastingReport } from "../../shared/contracts";
