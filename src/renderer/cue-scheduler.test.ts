/**
 * Unit tests for the pure cue scheduler (npm test -> scripts/test.mjs -> node --test).
 * Covers BRIEF §4: ordered firing, seek back re-arms, seek forward skips + derived state,
 * manual cues, negative lead-in times, show reload retention, ambient derivation.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Cue, Scene } from "../shared/types";
import {
  derivedState,
  dueCues,
  enterPhase,
  entityActions,
  explicitAmbientBeds,
  planSeek,
  retainOnReload,
  sceneAt,
  sortCues,
} from "./cue-scheduler";

const cues: Cue[] = [
  { id: "cd", phase: "play", at: -10, kind: "countdown", from: 10, to: 0 },
  { id: "v-init", phase: "play", at: -9.5, kind: "voice", speaker: "AVATAR_AI", text: { ro: "Inițiez secvența de lansare." } },
  { id: "th-launch", phase: "play", at: -10, kind: "theme", theme: "launch" },
  { id: "sfx-lift", phase: "play", at: 0, kind: "sfx", sfx: "liftoff-rumble" },
  { id: "v-1", phase: "play", at: 5, kind: "voice", speaker: "CAPITANUL", text: { ro: "Am decolat." } },
  { id: "manual-1", phase: "play", at: 6, kind: "marker", label: "manual", manual: true },
  { id: "th-light", phase: "play", at: 60, kind: "theme", theme: "light" },
  { id: "e-lumina-show", phase: "play", at: 70, kind: "entity", entity: "LUMINA", action: "show" },
  { id: "amb-stop", phase: "play", at: 80, kind: "ambient", action: "stop" },
  { id: "e-lumina-hide", phase: "play", at: 130, kind: "entity", entity: "LUMINA", action: "hide" },
  { id: "th-nature", phase: "play", at: 144, kind: "theme", theme: "nature" },
  { id: "amb-nature", phase: "play", at: 150, kind: "ambient", action: "start", gain: 0.7 },
  { id: "pre-1", phase: "preshow", at: 4, kind: "voice", speaker: "AVATAR_AI", text: { ro: "Bun venit." } },
  { id: "epi-white", phase: "epilogue", at: 0, kind: "theme", theme: "white" },
];

const scenes: Scene[] = [
  { id: "s-pre", label: "Prolog", phase: "preshow", start: 0, end: 50, theme: "prologue" },
  { id: "s-launch", label: "Lansare", phase: "play", start: -10, end: 60, theme: "launch" },
  { id: "s-light", label: "Lumina", phase: "play", start: 60, end: 144, theme: "light" },
  { id: "s-nature", label: "Natura", phase: "play", start: 144, end: 246, theme: "nature" },
  { id: "s-epi", label: "Epilog", phase: "epilogue", start: 0, end: 75, theme: "white" },
];

const play = sortCues(cues, "play");
const ids = (list: Cue[]) => list.map((c) => c.id);

describe("sortCues", () => {
  it("keeps only the phase, orders by at, stable for equal times", () => {
    assert.deepEqual(ids(play).slice(0, 3), ["cd", "th-launch", "v-init"]);
    assert.equal(play.length, 12);
    assert.deepEqual(ids(sortCues(cues, "preshow")), ["pre-1"]);
  });
});

describe("dueCues", () => {
  it("fires nothing before the lead-in starts", () => {
    assert.deepEqual(dueCues(play, new Set(), -10.5), []);
  });
  it("fires negative lead-in cues in order when the clock reaches them", () => {
    assert.deepEqual(ids(dueCues(play, new Set(), -9.5)), ["cd", "th-launch", "v-init"]);
  });
  it("skips fired and manual cues", () => {
    const fired = new Set(["cd", "th-launch", "v-init", "sfx-lift"]);
    assert.deepEqual(ids(dueCues(play, fired, 6.5)), ["v-1"]);
  });
  it("fires a burst in order after a stall (frame drop)", () => {
    const fired = new Set(["cd", "th-launch", "v-init", "sfx-lift", "v-1"]);
    assert.deepEqual(ids(dueCues(play, fired, 75)), ["th-light", "e-lumina-show"]);
  });
});

describe("enterPhase", () => {
  it("skips everything strictly before the entry time, including negative times", () => {
    assert.deepEqual(ids(enterPhase(play, -9.5).skipped), ["cd", "th-launch"]);
    assert.deepEqual(ids(enterPhase(play, -10).skipped), []);
  });
  it("never skips manual cues", () => {
    assert.ok(!ids(enterPhase(play, 100).skipped).includes("manual-1"));
  });
});

describe("planSeek", () => {
  const firedAt75 = new Set(["cd", "th-launch", "v-init", "sfx-lift", "v-1", "th-light", "e-lumina-show"]);

  it("seek back re-arms cues at or after the target and skips nothing", () => {
    const plan = planSeek(play, firedAt75, 75, 3);
    assert.deepEqual(plan.rearm, ["v-1", "th-light", "e-lumina-show"]);
    assert.deepEqual(plan.skipped, []);
  });
  it("seek back into the lead-in re-arms the countdown", () => {
    const plan = planSeek(play, firedAt75, 75, -10);
    assert.ok(plan.rearm.includes("cd"));
    assert.ok(plan.rearm.includes("th-launch"));
  });
  it("seek forward skips the non-manual cues jumped over", () => {
    const plan = planSeek(play, firedAt75, 75, 200);
    assert.deepEqual(plan.rearm, []);
    assert.deepEqual(ids(plan.skipped), ["amb-stop", "e-lumina-hide", "th-nature", "amb-nature"]);
  });
  it("seek forward also catches cues missed earlier, but never manual ones", () => {
    const plan = planSeek(play, new Set(["cd"]), -9, 10);
    assert.deepEqual(ids(plan.skipped), ["th-launch", "v-init", "sfx-lift", "v-1"]);
  });
  it("seek to the same time is a no-op", () => {
    const plan = planSeek(play, firedAt75, 75, 75);
    assert.deepEqual(plan, { rearm: [], skipped: [] });
  });
});

describe("derivedState", () => {
  it("uses the scene theme when no theme cue has passed", () => {
    const st = derivedState(sortCues(cues, "preshow"), new Set(), 2, scenes, "preshow");
    assert.equal(st.theme, "prologue");
    assert.deepEqual(st.entities, {});
    assert.equal(st.ambient, null);
  });
  it("has no theme before the phase's first scene (before the lead-in)", () => {
    assert.equal(derivedState(play, new Set(), -10.5, scenes, "play").theme, null);
  });
  it("applies the latest theme and final entity state at the target time", () => {
    const st = derivedState(play, new Set(), 100, scenes, "play");
    assert.equal(st.theme, "light");
    assert.deepEqual(st.entities, { LUMINA: "show" });
    assert.deepEqual(entityActions(st), [
      ["LUMINA", "show"],
      ["NATURA", "hide"],
      ["TEHNOLOGIC", "hide"],
    ]);
  });
  it("hides an entity whose hide cue has passed", () => {
    const st = derivedState(play, new Set(), 140, scenes, "play");
    assert.deepEqual(st.entities, { LUMINA: "hide" });
  });
  it("counts manual cues only when fired", () => {
    const manualTheme: Cue = { id: "m-th", phase: "play", at: 20, kind: "theme", theme: "void", manual: true };
    const list = sortCues([...cues, manualTheme], "play");
    assert.equal(derivedState(list, new Set(), 30, scenes, "play").theme, "launch");
    assert.equal(derivedState(list, new Set(["m-th"]), 30, scenes, "play").theme, "void");
  });
  it("derives the latest ambient state, resolving an implicit bed from the theme in effect", () => {
    assert.deepEqual(derivedState(play, new Set(), 90, scenes, "play").ambient, { action: "stop", bed: "light", gain: undefined, fadeSec: undefined });
    assert.deepEqual(derivedState(play, new Set(), 160, scenes, "play").ambient, { action: "start", bed: "nature", gain: 0.7, fadeSec: undefined });
  });
  it("returns nulls outside a phase", () => {
    assert.deepEqual(derivedState([], new Set(), 0, scenes, null), { theme: null, entities: {}, ambient: null });
  });
});

describe("sceneAt", () => {
  it("finds the scene containing a negative lead-in time", () => {
    assert.equal(sceneAt(scenes, "play", -4)?.id, "s-launch");
    assert.equal(sceneAt(scenes, "play", 60)?.id, "s-light");
    assert.equal(sceneAt(scenes, "play", -11), null);
    assert.equal(sceneAt(scenes, null, 10), null);
  });
});

describe("retainOnReload", () => {
  it("keeps past non-manual cues and actually-fired manual cues, drops unknown ids", () => {
    const fired = new Set(["cd", "manual-1", "ghost"]);
    const keep = retainOnReload(play, fired, 6.5);
    assert.deepEqual([...keep].sort(), ["cd", "manual-1", "sfx-lift", "th-launch", "v-init", "v-1"].sort());
  });
  it("does not retain a manual cue that never fired", () => {
    assert.ok(!retainOnReload(play, new Set(), 100).has("manual-1"));
  });
});

describe("explicitAmbientBeds", () => {
  it("collects explicit and implied beds so the engine does not auto-follow those themes", () => {
    const beds = explicitAmbientBeds({ cues, scenes });
    assert.deepEqual([...beds].sort(), ["light", "nature"]);
  });
  it("is empty for a show without ambient cues", () => {
    assert.equal(explicitAmbientBeds({ cues: cues.filter((c) => c.kind !== "ambient"), scenes }).size, 0);
  });
});
