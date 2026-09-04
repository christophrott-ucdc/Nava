/**
 * Public AvatarController implementation.
 *
 * TalkingHead owns the WebGL model and its (muted) AudioContext. Audible
 * speech is deliberately left to VoiceEngine; a silent buffer only gives the
 * head a clock on which to schedule word/viseme animation.
 */
import type { AvatarController, CreateAvatarController, VoiceClip } from "../../shared/contracts";
import type { Lang } from "../../shared/types";
import { wordsToVisemeTrack, type OculusViseme } from "./lipsync-ro";
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

class AvatarControllerImpl implements AvatarController {
  private readonly transporter: Transporter;
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

  constructor(private readonly opts: Parameters<CreateAvatarController>[0]) {
    this.widthPx = Math.max(1, opts.widthPx);
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

  private async loadGeneration(generation: number): Promise<void> {
    try {
      const made = await createHead({
        mount: this.transporter.body,
        glbUrl: this.opts.glbUrl,
        body: "F",
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
      this.bindContextRecovery(made.canvas);
      this.resize(this.widthPx);
      this.applyMood();
      this.applyAttention();
      this.desiredVisible ? this.transporter.show(false) : this.transporter.hide(false);
      if (made.visemesMissing.length) {
        console.warn(`[avatar] missing Oculus morph targets: ${made.visemesMissing.join(", ")}`);
      }
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

  lipsync(clip: VoiceClip, startAtMs: number): void {
    const made = this.created;
    if (!made || this.disposed) return;
    this.stopSpeaking();

    const delayMs = Number.isFinite(startAtMs) ? Math.max(0, startAtMs - performance.now()) : 0;
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
      input.visemes = clip.visemes;
      input.vtimes = clip.vtimes.map((t) => Math.max(0, t + delayMs));
      input.vdurations = clip.vdurations.map((d) => Math.max(20, d));
      // TalkingHead only enters its word/viseme scheduling branch when words
      // exists. An empty sentinel is enough when a precomputed track is used.
      input.words = [];
      input.wtimes = [];
      input.wdurations = [];
    } else if (usableWordTimings(clip)) {
      input.words = clip.words;
      input.wtimes = clip.wtimes.map((t) => Math.max(0, t + delayMs));
      input.wdurations = clip.wdurations.map((d) => Math.max(20, d));
    } else {
      const estimated = this.estimatedWords(clip.text, durationMs);
      input.words = estimated.words;
      input.wtimes = estimated.wtimes.map((t) => t + delayMs);
      input.wdurations = estimated.wdurations;
    }

    this.startHeadSpeech(input, totalMs);
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
    this.startHeadSpeech({ audio, words: [], wtimes: [], wdurations: [], visemes, vtimes, vdurations }, duration);
  }

  private startHeadSpeech(input: Parameters<CreatedHead["head"]["speakAudio"]>[0], durationMs: number): void {
    const made = this.created;
    if (!made) return;
    try {
      made.head.speakAudio(input, { lipsyncLang: lipsyncLanguage(this.opts.lang), isRaw: true });
      this.speaking = true;
      this.speakingTimer = window.setTimeout(() => {
        this.speakingTimer = null;
        this.speaking = false;
      }, durationMs + 120);
    } catch (err) {
      this.speaking = false;
      this.reportError(err);
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

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation++;
    this.stopSpeaking();
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

export const createAvatarController: CreateAvatarController = (opts) => new AvatarControllerImpl(opts);

// Re-export the pure helpers for diagnostics/unit tests without exposing the
// TalkingHead implementation details to the player.
export { wordsToVisemeTrack };
