/**
 * D-11 — ShowDirector without I/O: virtual clock + scheduler injected through DirectorOptions.
 * Run with `npm test` (scripts/test.mjs bundles *.test.ts and runs node --test).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import type { AppConfig, Cue, ShowFile, ShowState } from "../shared/types";
import type { Command } from "../shared/protocol";
import { ShowDirector, validateCommand, type DirectorHooks } from "./state";

// ---------------------------------------------------------------------------
// Fixtures

function makeShow(overrides: Partial<ShowFile> = {}): ShowFile {
  return {
    title: "Test",
    version: "t",
    videoDurationSec: 120,
    timingStatus: "provisional",
    preshowAutoStart: false,
    launchLeadInSec: 10,
    epilogueOnVideoEnd: true,
    variants: { "7-9": { label: "Copii 7–9", ageRange: "7-9" } },
    scenes: [
      { id: "intro", label: "Intro", phase: "preshow", start: 0, end: 30, theme: "prologue" },
      { id: "launch", label: "Lansare", phase: "play", start: -10, end: 60, theme: "launch" },
      { id: "light", label: "Lumină", phase: "play", start: 60, end: 120, theme: "light" },
      { id: "reentry", label: "Reintrare", phase: "epilogue", start: 0, end: 40, theme: "white" },
    ],
    cues: [
      { id: "pre-marker", phase: "preshow", at: 0, kind: "marker", label: "pre" },
      { id: "launch-theme", phase: "play", at: -10, kind: "theme", theme: "launch" },
      { id: "countdown", phase: "play", at: -10, kind: "countdown", from: 10, to: 0 },
      { id: "liftoff", phase: "play", at: 0, kind: "sfx", sfx: "liftoff-rumble" },
      { id: "cap-1", phase: "play", at: 9, kind: "voice", speaker: "CAPITANUL", text: { ro: "Salut echipaj." } },
      { id: "manual-only", phase: "play", at: 20, kind: "marker", label: "manual", manual: true },
      { id: "epi-thanks", phase: "epilogue", at: 5, kind: "tablet", interaction: { type: "thanks" } },
    ] as Cue[],
    ...overrides,
  };
}

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    role: "master",
    server: { port: 0, bindHost: "127.0.0.1" },
    lang: "ro",
    show: "assets/show/show.json",
    video: { path: "media/film.mp4", fit: "cover", preloadPoster: true },
    avatar: { glb: "assets/avatar.glb", corner: "bottom-left", widthPercent: 20, marginPx: 10 },
    audio: { voiceVolume: 1, sfxVolume: 1, outputDeviceId: "default" },
    screens: [
      { id: "center", displayIndex: 0, showAvatar: true, showSubtitles: true, showEntities: true, playAudio: true, kiosk: false },
      { id: "left", displayIndex: 1, showAvatar: false, showSubtitles: false, showEntities: true, playAudio: false, kiosk: false },
    ],
    sync: { clockHz: 4, seekThresholdSec: 0.3, rateNudge: 0.02 },
    dev: { openDevTools: false, windowed: true },
    ...overrides,
  };
}

interface Harness {
  director: ShowDirector;
  clock: { now: number; advance(ms: number): void };
  log: Array<{ kind: string; data?: unknown }>;
  applied: Command[];
  fired: Array<{ id: string; manual: boolean }>;
  states: ShowState[];
  scheduled: Array<{ fn: () => void; at: number }>;
  runStarts: number;
  lights: Array<{ theme: string; source: string }>;
  dynamic: string[];
}

function harness(show = makeShow(), config = makeConfig(), preflight: () => boolean | null = () => true): Harness {
  const clock = {
    now: 1_700_000_000_000,
    advance(ms: number) {
      this.now += ms;
    },
  };
  const h: Partial<Harness> = { clock, log: [], applied: [], fired: [], states: [], scheduled: [], runStarts: 0, lights: [], dynamic: [] };
  const hooks: DirectorHooks = {
    onApplyCmd: (cmd) => h.applied!.push(cmd),
    onStateChange: (state) => h.states!.push(state),
    onCueFired: (cue, manual) => h.fired!.push({ id: cue.id, manual }),
    onLog: (kind, data) => h.log!.push({ kind, data }),
    onRunStart: () => {
      h.runStarts! += 1;
    },
    onLights: (theme, _fade, source) => h.lights!.push({ theme, source }),
    onDynamicVoice: (msg) => h.dynamic!.push(msg.text),
  };
  h.director = new ShowDirector(show, config, hooks, {
    now: () => clock.now,
    schedule: (fn, ms) => h.scheduled!.push({ fn, at: clock.now + ms }),
    preflight,
  });
  return h as Harness;
}

/** Advance the virtual clock in 250 ms ticks (the real server ticks at clockHz; jumps > 3 s count as seeks). */
function runFor(h: Harness, ms: number, step = 250): void {
  let left = ms;
  while (left > 0) {
    const d = Math.min(step, left);
    h.clock.advance(d);
    h.director.tick();
    left -= d;
  }
}

/** Simulate the reference screen reporting a loaded video (sets videoReady). */
function reportVideoReady(h: Harness): void {
  h.clock.advance(1000); // past REPORT_GRACE_MS
  h.director.onReport({ type: "report", state: h.director.playbackState, phaseTime: h.director.now(), rate: h.director.currentRate(), videoReady: true, sceneId: null });
}

// ---------------------------------------------------------------------------
// Readiness

test("readiness: names missing screens, tablets, video and preflight; becomes ready when satisfied", () => {
  const h = harness(makeShow(), makeConfig({ autoRun: { enabled: false, requireScreens: ["center"], requireTablets: 2, startTrigger: "operator", resetAfterSec: 0 } }), () => null);
  let r = h.director.readiness();
  assert.equal(r.ready, false);
  assert.deepEqual(r.screensMissing.sort(), ["center", "left"]);
  assert.equal(r.tabletsRequired, 2);
  assert.equal(r.assetsOk, null);
  assert.ok(r.reasons.some((x) => x.includes("Ecrane lipsă")));
  assert.ok(r.reasons.some((x) => x.includes("Tablete conectate: 0/2")));
  assert.ok(r.reasons.some((x) => x.includes("Video")));

  h.director.setConnectedScreens(["center", "left"], 2);
  reportVideoReady(h);
  r = h.director.readiness();
  assert.deepEqual(r.screensMissing, []);
  assert.deepEqual(r.screensConnected, ["center", "left"]);
  assert.equal(r.videoReady, true);
  assert.equal(r.ready, true, `reasons: ${r.reasons.join("; ")}`);

  h.director.setPreflightProvider(() => false);
  r = h.director.readiness();
  assert.equal(r.ready, false);
  assert.equal(r.assetsOk, false);
  assert.ok(r.reasons.some((x) => /Preflight/.test(x)));
});

test("readiness: legacy setCounts (no ids) compares only the count", () => {
  const h = harness();
  h.director.setCounts(1, 0);
  assert.deepEqual(h.director.readiness().screensMissing, ["left"]);
  h.director.setCounts(2, 0);
  assert.deepEqual(h.director.readiness().screensMissing, []);
});

test("getState exposes readiness/autoRun/variant/ambient/lights and emits state only on change", () => {
  const h = harness(makeShow(), makeConfig({ variant: "7-9", ambient: { enabled: false, volume: 0.5, duck: 0.25 }, lights: { driver: "artnet", host: "10.0.0.5" } }));
  const s = h.director.getState();
  assert.equal(s.state, "idle");
  assert.equal(s.variant, "7-9");
  assert.equal(s.ambientEnabled, false);
  assert.equal(s.lightsDriver, "artnet");
  assert.equal(s.autoRun, false);
  assert.ok(s.readiness);
  const before = h.states.length;
  h.director.tick();
  h.director.tick();
  assert.equal(h.states.length - before, 1, "identical snapshots are not re-emitted");
});

// ---------------------------------------------------------------------------
// Start / lead-in / virtual clock

test("start enters play at phaseTime = -launchLeadInSec and the virtual clock advances", () => {
  const h = harness();
  const r = h.director.dispatchCommand({ action: "start" });
  assert.equal(r.ok, true);
  assert.equal(h.director.playbackState, "playing");
  assert.equal(h.director.currentPhase, "play");
  assert.equal(h.director.now(), -10);
  assert.equal(h.runStarts, 1);
  assert.deepEqual(h.applied, [{ action: "start" }]);
  // Cues at exactly -10 fire immediately.
  assert.deepEqual(h.fired.map((f) => f.id), ["launch-theme", "countdown"]);
  assert.equal(h.director.getState().theme, "launch");
  assert.ok(h.lights.some((l) => l.theme === "launch" && l.source === "theme"));

  h.clock.advance(5000);
  assert.ok(Math.abs(h.director.now() - -5) < 1e-9);
  h.director.tick();
  assert.equal(h.fired.length, 2, "nothing new before zero");

  runFor(h, 5000);
  assert.ok(h.fired.some((f) => f.id === "liftoff"), "liftoff fires at 0");
  runFor(h, 9000);
  assert.ok(h.fired.some((f) => f.id === "cap-1"));
  assert.equal(h.director.getState().lastVoiceCueId, "cap-1");
  assert.equal(h.director.getState().sceneId, "launch");

  runFor(h, 60_000, 1000);
  assert.equal(h.director.getState().sceneId, "light");
  assert.ok(!h.fired.some((f) => f.id === "manual-only"), "manual cues never auto-fire");
  assert.ok(h.log.some((e) => e.kind === "start.readiness"), "manual start logs the readiness verdict");
});

test("virtual clock: video end without a clock source enters the epilogue and ends after its last scene", () => {
  const h = harness();
  h.director.dispatchCommand({ action: "start" });
  runFor(h, 10_000 + 120_000, 1000);
  assert.equal(h.director.playbackState, "epilogue");
  assert.equal(h.director.currentPhase, "epilogue");
  assert.ok(h.applied.some((c) => c.action === "epilogue"));
  runFor(h, 6000);
  assert.ok(h.fired.some((f) => f.id === "epi-thanks"));
  assert.equal(h.director.cues.tablet?.id, "epi-thanks");
  runFor(h, 40_000, 1000);
  assert.equal(h.director.playbackState, "ended");
});

test("a clock jump larger than 3 s is treated as a seek: skipped cues are not fired, state-like cues are applied", () => {
  const h = harness();
  h.director.dispatchCommand({ action: "start" });
  h.director.dispatchCommand({ action: "epilogue" });
  h.clock.advance(6000);
  h.director.tick();
  assert.ok(!h.fired.some((f) => f.id === "epi-thanks"));
  assert.equal(h.director.cues.statusOf("epi-thanks"), "skipped");
  assert.equal(h.director.cues.tablet?.id, "epi-thanks", "tablet interaction still applied");
});

test("pause freezes the virtual clock; play resumes at the nominal rate; seek rearms cues", () => {
  const h = harness();
  h.director.dispatchCommand({ action: "start" });
  h.clock.advance(15_000);
  h.director.tick();
  h.director.dispatchCommand({ action: "pause" });
  const t = h.director.now();
  h.clock.advance(5000);
  assert.equal(h.director.now(), t);
  assert.equal(h.director.getState().rate, 0);
  h.director.dispatchCommand({ action: "play" });
  h.clock.advance(1000);
  assert.ok(Math.abs(h.director.now() - (t + 1)) < 1e-9);
  const firedBefore = h.fired.length;
  h.director.dispatchCommand({ action: "seek", time: -10 });
  assert.equal(h.director.now(), -10);
  assert.ok(h.fired.length > firedBefore, "cues at the seek target fire again");
  assert.equal(h.director.cues.statusOf("cap-1"), "pending");
});

// ---------------------------------------------------------------------------
// Rehearse / rate

test("rehearse sets the nominal rate (clock runs ×4); setRate 1 returns to normal; invalid rates are rejected", () => {
  const h = harness();
  assert.equal(h.director.dispatchCommand({ action: "rehearse", rate: 4 }).ok, true);
  assert.equal(h.director.rate, 4);
  assert.equal(h.director.getState().rate, 0, "idle: no advancing");
  h.director.dispatchCommand({ action: "start" });
  assert.equal(h.director.getState().rate, 4);
  h.clock.advance(1000);
  assert.ok(Math.abs(h.director.now() - -6) < 1e-9, "1 s wall clock = 4 s phase time");
  h.director.dispatchCommand({ action: "setRate", rate: 1 });
  const t = h.director.now();
  h.clock.advance(1000);
  assert.ok(Math.abs(h.director.now() - (t + 1)) < 1e-9);
  assert.equal(h.director.dispatchCommand({ action: "setRate", rate: 99 }).ok, false);
  assert.equal(h.director.dispatchCommand({ action: "rehearse", rate: 0 }).ok, false);
  assert.ok(h.applied.some((c) => c.action === "rehearse"), "rehearse is echoed to the screens");
});

// ---------------------------------------------------------------------------
// autoRun gating

test("autoRun immediate: blocked while not ready (logged once), then preshow → gated start at preshow end", () => {
  const cfg = makeConfig({ autoRun: { enabled: true, requireScreens: ["center"], requireTablets: 0, startTrigger: "immediate", resetAfterSec: 0 } });
  const h = harness(makeShow(), cfg);
  h.director.tick();
  h.director.tick();
  assert.equal(h.director.playbackState, "idle");
  assert.equal(h.log.filter((e) => e.kind === "autostart.blocked").length, 1, "blocked reasons are logged once per distinct reason set");
  assert.equal(h.director.isAutoRunEnabled, true);

  h.director.setConnectedScreens(["center", "left"]);
  reportVideoReady(h);
  h.director.tick();
  assert.equal(h.director.playbackState, "preshow");
  assert.equal(h.director.now(), 0);
  assert.ok(h.fired.some((f) => f.id === "pre-marker"));
  assert.equal(h.runStarts, 0, "preshow is not a run yet");

  h.clock.advance(30_000);
  h.director.tick();
  assert.equal(h.director.playbackState, "playing");
  assert.equal(h.director.now(), -10);
  assert.equal(h.runStarts, 1);
  const startLog = h.log.find((e) => e.kind === "cmd" && (e.data as { cmd: Command }).cmd.action === "start");
  assert.equal((startLog?.data as { source: string }).source, "autoRun");
});

test("autoRun: preshow does not auto-start while readiness turns red", () => {
  const cfg = makeConfig({ autoRun: { enabled: true, requireScreens: ["center"], requireTablets: 0, startTrigger: "operator", resetAfterSec: 0 } });
  const h = harness(makeShow(), cfg, () => false);
  h.director.dispatchCommand({ action: "preshow" });
  h.clock.advance(31_000);
  h.director.tick();
  assert.equal(h.director.playbackState, "preshow", "preflight failed → gated start refused");
  assert.ok(h.log.some((e) => e.kind === "autostart.blocked"));
  h.director.setPreflightProvider(() => true);
  h.director.setConnectedScreens(["center", "left"]);
  reportVideoReady(h);
  h.director.tick();
  assert.equal(h.director.playbackState, "playing");
});

test("autoRun tablet trigger: requestStart is honoured only in autoRun/tablet mode, from idle, when ready", () => {
  const operatorOnly = harness();
  assert.equal(operatorOnly.director.requestStart("tablet:t1").ok, false);

  const cfg = makeConfig({ autoRun: { enabled: true, requireScreens: ["center"], requireTablets: 1, startTrigger: "tablet", resetAfterSec: 5 } });
  const h = harness(makeShow(), cfg);
  h.director.tick();
  assert.equal(h.director.playbackState, "idle", "tablet trigger never starts on its own");
  let r = h.director.requestStart("tablet:t1");
  assert.equal(r.ok, false);
  assert.match(r.reason ?? "", /nu este pregătită/);

  h.director.setConnectedScreens(["center", "left"], 1);
  reportVideoReady(h);
  r = h.director.requestStart("tablet:t1");
  assert.equal(r.ok, true);
  assert.equal(h.director.playbackState, "preshow");
  assert.equal(h.director.requestStart("tablet:t1").ok, false, "already running");

  // ended → idle after resetAfterSec
  h.director.dispatchCommand({ action: "start" });
  runFor(h, 10_000 + 120_000, 1000);
  runFor(h, 40_000, 1000);
  assert.equal(h.director.playbackState, "ended");
  h.clock.advance(4000);
  h.director.tick();
  assert.equal(h.director.playbackState, "ended");
  h.clock.advance(1500);
  h.director.tick();
  assert.equal(h.director.playbackState, "idle");
  assert.equal(h.director.now(), 0);
});

test("autoRun command toggles the mode without echoing to screens", () => {
  const h = harness();
  const before = h.applied.length;
  h.director.dispatchCommand({ action: "autoRun", enabled: true });
  assert.equal(h.director.isAutoRunEnabled, true);
  assert.equal(h.director.getState().autoRun, true);
  assert.equal(h.applied.length, before);
});

// ---------------------------------------------------------------------------
// Other R4 commands

test("say → dynamicVoice hook + live subtitle; lights → onLights; setVariant validates; ambient toggles", () => {
  const h = harness();
  assert.equal(h.director.dispatchCommand({ action: "say", speaker: "CAPITANUL", text: "  Bun venit la bord.  " }).ok, true);
  assert.deepEqual(h.dynamic, ["Bun venit la bord."]);
  const sub = h.director.cues.currentSubtitle(h.clock.now, "ro");
  assert.equal(sub?.text, "Bun venit la bord.");
  assert.equal(sub?.speaker, "CĂPITANUL");

  assert.equal(h.director.dispatchCommand({ action: "lights", theme: "void" }).ok, true);
  assert.deepEqual(h.lights.at(-1), { theme: "void", source: "command" });

  assert.equal(h.director.dispatchCommand({ action: "setVariant", variant: "13+" }).ok, false);
  assert.equal(h.director.dispatchCommand({ action: "setVariant", variant: "7-9" }).ok, true);
  assert.equal(h.director.currentVariant, "7-9");
  assert.equal(h.director.dispatchCommand({ action: "setVariant", variant: null }).ok, true);
  assert.equal(h.director.currentVariant, null);

  assert.equal(h.director.getState().ambientEnabled, true);
  h.director.dispatchCommand({ action: "ambient", enabled: false });
  assert.equal(h.director.getState().ambientEnabled, false);
});

test("photo: countdown → capture through the injected scheduler; captured photo is shown then hidden", () => {
  const h = harness();
  const photos: string[] = [];
  const d = new ShowDirector(makeShow(), makeConfig(), {
    onApplyCmd: () => undefined,
    onStateChange: () => undefined,
    onCueFired: () => undefined,
    onLog: () => undefined,
    onRunStart: () => undefined,
    onPhoto: (msg) => photos.push(msg.action),
  }, { now: () => h.clock.now, schedule: (fn, ms) => h.scheduled.push({ fn, at: h.clock.now + ms }) });
  d.dispatchCommand({ action: "photo" });
  assert.deepEqual(photos, ["countdown"]);
  assert.equal(h.scheduled.length, 1);
  h.scheduled.shift()!.fn();
  assert.deepEqual(photos, ["countdown", "capture"]);
  d.onPhotoCaptured({ type: "photoCaptured", cueId: null, dataUrl: "data:image/jpeg;base64,/9j/4AAQ" });
  assert.deepEqual(photos, ["countdown", "capture", "show"]);
  assert.ok(d.lastPhoto);
  assert.equal(h.scheduled.length, 1, "hide is scheduled");
  h.scheduled.shift()!.fn();
  assert.deepEqual(photos, ["countdown", "capture", "show", "hide"]);
  d.onPhotoCaptured({ type: "photoCaptured", cueId: null, dataUrl: "not-a-data-url" });
  assert.equal(photos.length, 4, "invalid dataUrl is rejected");
});

test("setShow resets an unknown variant and recomputes cue statuses", () => {
  const h = harness(makeShow(), makeConfig({ variant: "7-9" }));
  h.director.dispatchCommand({ action: "start" });
  h.director.setShow(makeShow({ variants: {} }));
  assert.equal(h.director.currentVariant, null);
  assert.ok(h.log.some((e) => e.kind === "variant.reset"));
  assert.equal(h.director.playbackState, "playing");
});

// ---------------------------------------------------------------------------
// validateCommand (R4)

test("validateCommand accepts/normalizes the R4 commands and rejects malformed ones", () => {
  assert.deepEqual(validateCommand({ action: "rehearse", rate: 4.004 }), { action: "rehearse", rate: 4 });
  assert.equal(validateCommand({ action: "rehearse", rate: 100 }), null);
  assert.deepEqual(validateCommand({ action: "setRate", rate: 1 }), { action: "setRate", rate: 1 });
  assert.deepEqual(validateCommand({ action: "autoRun", enabled: true }), { action: "autoRun", enabled: true });
  assert.equal(validateCommand({ action: "autoRun", enabled: "yes" }), null);
  assert.deepEqual(validateCommand({ action: "lights", theme: "nature" }), { action: "lights", theme: "nature" });
  assert.equal(validateCommand({ action: "lights", theme: "disco" }), null);
  assert.deepEqual(validateCommand({ action: "say", speaker: "LUMINA", text: " a b   c " }), { action: "say", speaker: "LUMINA", text: "a b c" });
  assert.equal(validateCommand({ action: "say", speaker: "NOBODY", text: "x" }), null);
  assert.equal(validateCommand({ action: "say", speaker: "LUMINA", text: "   " }), null);
  assert.deepEqual(validateCommand({ action: "setVariant", variant: null }), { action: "setVariant", variant: null });
  assert.equal(validateCommand({ action: "setVariant", variant: "bad variant!" }), null);
  assert.deepEqual(validateCommand({ action: "photo" }), { action: "photo" });
  assert.deepEqual(validateCommand({ action: "preflight" }), { action: "preflight" });
  assert.equal(validateCommand({ action: "nope" }), null);
  assert.equal(validateCommand(null), null);
});
