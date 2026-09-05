/**
 * Pure cue-scheduling logic (no DOM, no timers) — the part of the Timeline that decides WHAT
 * happens; `timeline.ts` decides HOW (voice, subtitles, entities...). Unit-tested in
 * cue-scheduler.test.ts (node:test), see BRIEF §4 for the rules:
 *
 *   - every frame, all not-yet-fired cues of the current phase with `at <= phaseTime` fire, in order;
 *   - seek BACK  -> cues with `at >= phaseTime` re-arm;
 *   - seek FORWARD -> skipped cues are marked fired WITHOUT running, except that the derived state
 *     (latest `theme`, final `entity` show/hide, latest `ambient`) is applied;
 *   - `manual` cues never auto-fire;
 *   - the `play` phase starts at a NEGATIVE phaseTime (launch lead-in), so `at` may be negative.
 */

import type { AmbientCue, Cue, Phase, Scene, SceneTheme, ShowFile } from "../shared/types";
import { ENTITY_IDS, type EntityId } from "./ui/entities";

export type EntityAction = "show" | "hide";

export interface AmbientState {
  action: AmbientCue["action"];
  /** Bed resolved against the theme in effect when the cue fired (cue.bed wins). */
  bed: SceneTheme | null;
  gain?: number;
  fadeSec?: number;
}

export interface DerivedState {
  theme: SceneTheme | null;
  entities: Partial<Record<EntityId, EntityAction>>;
  /** Latest ambient cue up to `phaseTime` (null = no explicit ambient cue so far). */
  ambient: AmbientState | null;
}

export interface SeekPlan {
  /** Cue ids to remove from the fired set (they are at or after the new time). */
  rearm: string[];
  /** Cues to mark fired without running (forward seek only), in timeline order. */
  skipped: Cue[];
}

/** Cues of one phase, ordered by `at` (stable for equal times). */
export function sortCues(cues: readonly Cue[], phase: Phase): Cue[] {
  return cues
    .filter((c) => c.phase === phase)
    .map((c, i) => ({ c, i }))
    .sort((a, b) => a.c.at - b.c.at || a.i - b.i)
    .map((x) => x.c);
}

/** Cues that must fire now (auto): not manual, not fired yet, `at <= phaseTime`, in order. */
export function dueCues(phaseCues: readonly Cue[], fired: ReadonlySet<string>, phaseTime: number): Cue[] {
  const out: Cue[] = [];
  for (const c of phaseCues) {
    if (c.at > phaseTime) break;
    if (c.manual || fired.has(c.id)) continue;
    out.push(c);
  }
  return out;
}

/** Entering a phase at `phaseTime`: every non-manual cue strictly before it is skipped. */
export function enterPhase(phaseCues: readonly Cue[], phaseTime: number): { skipped: Cue[] } {
  return { skipped: phaseCues.filter((c) => !c.manual && c.at < phaseTime) };
}

/**
 * Seek inside the phase from `fromTime` to `toTime`.
 * Re-arm everything at or after `toTime`; on a forward seek, mark the non-manual cues before
 * `toTime` that never fired as skipped (so they do not retro-fire on the next frame).
 */
export function planSeek(phaseCues: readonly Cue[], fired: ReadonlySet<string>, fromTime: number, toTime: number): SeekPlan {
  const rearm: string[] = [];
  const stillFired = new Set(fired);
  for (const c of phaseCues) {
    if (c.at >= toTime && stillFired.has(c.id)) {
      rearm.push(c.id);
      stillFired.delete(c.id);
    }
  }
  const skipped: Cue[] = [];
  if (toTime > fromTime) {
    for (const c of phaseCues) {
      if (c.at >= toTime) break;
      if (!c.manual && !stillFired.has(c.id)) skipped.push(c);
    }
  }
  return { rearm, skipped };
}

/**
 * After a show reload (same phase): keep as fired every non-manual cue already in the past and
 * every cue (manual or not) that had actually fired; forget ids that no longer exist.
 */
export function retainOnReload(phaseCues: readonly Cue[], fired: ReadonlySet<string>, lastTime: number): Set<string> {
  const keep = new Set<string>();
  for (const c of phaseCues) {
    if (c.manual) {
      if (fired.has(c.id)) keep.add(c.id);
    } else if (c.at < lastTime || fired.has(c.id)) keep.add(c.id);
  }
  return keep;
}

/** Scene containing `phaseTime` in `phase` (the latest scene whose start <= phaseTime). */
export function sceneAt(scenes: readonly Scene[], phase: Phase | null, phaseTime: number): Scene | null {
  if (phase === null) return null;
  let best: Scene | null = null;
  for (const s of scenes) {
    if (s.phase !== phase) continue;
    if (phaseTime >= s.start && (best === null || s.start >= best.start)) best = s;
  }
  return best;
}

/**
 * Theme, entity visibility and ambient bed implied by all cues up to `phaseTime`.
 * Manual cues count only if they have fired. Falls back to the scene theme when no theme cue
 * has been passed yet.
 */
export function derivedState(
  phaseCues: readonly Cue[],
  fired: ReadonlySet<string>,
  phaseTime: number,
  scenes: readonly Scene[],
  phase: Phase | null,
): DerivedState {
  const counts = (c: Cue) => c.at <= phaseTime && (!c.manual || fired.has(c.id));
  let theme: SceneTheme | null = null;
  const entities: Partial<Record<EntityId, EntityAction>> = {};
  let ambient: AmbientState | null = null;
  for (const c of phaseCues) {
    if (c.at > phaseTime) break;
    if (!counts(c)) continue;
    switch (c.kind) {
      case "theme":
        theme = c.theme;
        break;
      case "entity":
        entities[c.entity] = c.action;
        break;
      case "ambient":
        if(c.source?.type==='file')break;
        ambient = {
          action: c.action,
          bed: c.bed ?? theme ?? sceneAt(scenes, phase, c.at)?.theme ?? null,
          gain: c.gain,
          fadeSec: c.fadeSec,
        };
        break;
      default:
        break;
    }
  }
  if (theme === null) theme = sceneAt(scenes, phase, phaseTime)?.theme ?? null;
  return { theme, entities, ambient };
}

/** Entity ids not mentioned by `state` are implicitly hidden (used to reset after seeks). */
export function entityActions(state: DerivedState): Array<[EntityId, EntityAction]> {
  return ENTITY_IDS.map((id) => [id, state.entities[id] === "show" ? "show" : "hide"]);
}

/**
 * Themes for which the show scripts an explicit `ambient` cue (bed given or implied by the theme in
 * effect). The ambient engine does NOT auto-follow `theme` cues for these themes (BRIEF R4 / B-03).
 */
export function explicitAmbientBeds(show: Pick<ShowFile, "cues" | "scenes">): Set<SceneTheme> {
  const beds = new Set<SceneTheme>();
  for (const phase of ["preshow", "play", "epilogue"] as const) {
    let theme: SceneTheme | null = null;
    for (const c of sortCues(show.cues, phase)) {
      if (c.kind === "theme") theme = c.theme;
      else if (c.kind === "ambient") {
        if(c.source?.type==='file')continue;
        const bed = c.bed ?? theme ?? sceneAt(show.scenes, phase, c.at)?.theme ?? null;
        if (bed) beds.add(bed);
      }
    }
  }
  return beds;
}
