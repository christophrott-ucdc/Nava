/**
 * Server-side mirror of the renderer's cue engine (BRIEF §4), for consumers that are not screens
 * (operator console, tablets, run log). It never plays anything: it decides WHICH cues have been
 * crossed by the authoritative phase time and derives state-like values from them
 * (current theme, current subtitle, current tablet interaction).
 *
 * Rules mirrored:
 *  - every cue of the current phase with `at <= t`, not fired and not `manual`, fires in order;
 *  - an explicit seek back rearms cues with `at > t`; a late clock report that moves backwards
 *    keeps statuses intact so a marker/voice cannot fire twice;
 *  - seek forward: skipped cues are marked "skipped" WITHOUT firing, except state-like cues
 *    (`theme`, and here also `tablet`) whose last value is applied;
 *  - one voice at a time: a new voice cue replaces the current subtitle.
 */

import type { Cue, Phase, SceneTheme, ShowFile, TabletCue, VoiceCue, Lang } from "../shared/types";
import { SPEAKERS } from "../shared/types";

export type CueStatus = "pending" | "fired" | "skipped";

export interface CueTrackerHooks {
  /** A cue was fired (automatically or manually) — broadcast `cueFired`, log, etc. */
  onFired(cue: Cue, manual: boolean): void;
}

export interface Subtitle {
  speaker: string;
  text: string;
  color: string;
}

/** Rough speech duration estimate (ms) used to expire tablet subtitles when no audio duration is known. */
export function estimateSpeechMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(2000, words * 420 + 600);
}

/** Subtitles stay visible this long after the (estimated) end of the audio (BRIEF §7). */
const SUBTITLE_HOLD_MS = 800;
/** A jump in the clock larger than this (seconds) without a command is treated as a seek. */
export const JUMP_AS_SEEK_SEC = 3;

export class CueTracker {
  private show: ShowFile;
  private phase: Phase | null = null;
  private lastT = 0;
  private status = new Map<string, CueStatus>();

  /** Last theme cue applied in the current phase (null -> use the scene theme). */
  theme: SceneTheme | null = null;
  /** Current voice cue (subtitle) with its expiry. */
  voice: { cue: VoiceCue; firedAtMs: number; untilMs: number } | null = null;
  /** Current tablet interaction cue (null -> tablets show the waiting view). */
  tablet: TabletCue | null = null;

  constructor(show: ShowFile, private readonly hooks: CueTrackerHooks) {
    this.show = show;
  }

  /** Replace the show (reloadShow). Keeps phase/time; statuses are recomputed as if seeking to `t`. */
  setShow(show: ShowFile): void {
    this.show = show;
    if (this.phase !== null) {
      this.status.clear();
      this.theme = null;
      this.voice = null;
      this.tablet = null;
      this.applySkipped(this.phase, this.lastT);
    }
  }

  get currentPhase(): Phase | null {
    return this.phase;
  }

  /** Back to idle: nothing fired, no theme/subtitle/interaction. */
  reset(): void {
    this.phase = null;
    this.lastT = 0;
    this.status.clear();
    this.theme = null;
    this.voice = null;
    this.tablet = null;
  }

  /**
   * Enter a phase at time `t` (preshow/start/epilogue/skipToScene across phases).
   * Cues with `at < t` are marked skipped (state-like ones applied); cues at `at >= t` are pending.
   */
  enterPhase(phase: Phase, t: number): void {
    this.phase = phase;
    this.lastT = t;
    this.status.clear();
    this.theme = null;
    this.voice = null;
    this.tablet = null;
    this.applySkipped(phase, t);
  }

  /** Seek inside the current phase (forward or backward). */
  seekTo(t: number): void {
    if (this.phase === null) return;
    const phase = this.phase;
    for (const cue of this.cuesOf(phase)) {
      if (cue.at >= t) {
        // Seek back (or landing exactly on a cue): becomes pending again.
        this.status.delete(cue.id);
      }
    }
    // Recompute the state-like values from scratch for this time.
    this.theme = null;
    this.tablet = null;
    // A seek never replays speech. Keeping a pre-seek subtitle alive would show words that no
    // longer correspond to what the audience hears at the new timeline position.
    this.voice = null;
    this.applySkipped(phase, t);
    this.lastT = t;
  }

  /**
   * Advance the clock to `t`: fires all pending non-manual cues with `at <= t`, in order.
   * A jump larger than JUMP_AS_SEEK_SEC is treated as a seek (skip without firing).
   */
  advance(t: number): Cue[] {
    if (this.phase === null) return [];
    if (t < this.lastT - 0.05) {
      // Media seek/buffering reports can briefly trail the extrapolated server clock. Explicit
      // seek commands already call seekTo(); treating report jitter as another seek rearms cues
      // and can dispatch adaptive/manual voices twice.
      this.lastT = t;
      return [];
    }
    if (t > this.lastT + JUMP_AS_SEEK_SEC) {
      this.seekTo(t);
      // fall through: cues at exactly `t` fire below
    }
    const fired: Cue[] = [];
    for (const cue of this.cuesOf(this.phase)) {
      if (cue.at > t) break;
      if (cue.manual) continue;
      if (this.status.has(cue.id)) continue;
      this.status.set(cue.id, "fired");
      this.applyEffects(cue);
      fired.push(cue);
      this.hooks.onFired(cue, false);
    }
    this.lastT = t;
    return fired;
  }

  /** Operator fired a cue now (any phase, any `at`). */
  fireManual(cueId: string): Cue | null {
    const cue = this.show.cues.find((c) => c.id === cueId);
    if (!cue) return null;
    this.status.set(cue.id, "fired");
    this.applyEffects(cue);
    this.hooks.onFired(cue, true);
    return cue;
  }

  statusOf(cueId: string): CueStatus {
    return this.status.get(cueId) ?? "pending";
  }

  statuses(): Record<string, CueStatus> {
    const out: Record<string, CueStatus> = {};
    for (const cue of this.show.cues) out[cue.id] = this.statusOf(cue.id);
    return out;
  }

  /** Current subtitle for tablets/console (expires after the estimated speech duration + hold). */
  currentSubtitle(nowMs: number, lang: Lang): Subtitle | null {
    const v = this.voice;
    if (!v) return null;
    if (nowMs > v.untilMs) return null;
    const prof = SPEAKERS[v.cue.speaker];
    const text = v.cue.text[lang] ?? v.cue.text.ro;
    return { speaker: prof?.label ?? v.cue.speaker, text, color: prof?.color ?? "#e2e8f0" };
  }

  /** `stopVoice` or a new voice replaces the current one. */
  clearVoice(): void {
    this.voice = null;
  }

  // ---------------------------------------------------------------------------

  private cuesOf(phase: Phase): Cue[] {
    // Stable order: by `at`, then by position in the file.
    return this.show.cues
      .map((c, i) => ({ c, i }))
      .filter((x) => x.c.phase === phase)
      .sort((a, b) => a.c.at - b.c.at || a.i - b.i)
      .map((x) => x.c);
  }

  /** Mark cues with `at < t` as skipped (unless already fired) and apply state-like cues. */
  private applySkipped(phase: Phase, t: number): void {
    for (const cue of this.cuesOf(phase)) {
      if (cue.at >= t) break;
      if (cue.manual) continue;
      if (!this.status.has(cue.id)) this.status.set(cue.id, "skipped");
      if (cue.kind === "theme") this.theme = cue.theme;
      else if (cue.kind === "tablet") this.tablet = cue;
    }
  }

  private applyEffects(cue: Cue): void {
    const nowMs = Date.now();
    switch (cue.kind) {
      case "voice": {
        const holdMs = cue.subtitleHoldMs ?? SUBTITLE_HOLD_MS;
        this.voice = { cue, firedAtMs: nowMs, untilMs: nowMs + estimateSpeechMs(cue.text.ro) + holdMs };
        break;
      }
      case "theme":
        this.theme = cue.theme;
        break;
      case "tablet":
        this.tablet = cue;
        break;
      default:
        break;
    }
  }
}
