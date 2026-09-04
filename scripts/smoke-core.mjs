#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as esbuild from "esbuild";

const root = path.resolve(import.meta.dirname, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "nava-core-"));

async function bundle(entry, name) {
  const outfile = path.join(temp, `${name}.mjs`);
  await esbuild.build({
    entryPoints: [path.join(root, entry)],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    logLevel: "silent",
  });
  return import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);
}

try {
  const show = JSON.parse(fs.readFileSync(path.join(root, "assets/show/show.json"), "utf8"));
  const config = JSON.parse(fs.readFileSync(path.join(root, "config.example.json"), "utf8"));
  const rendererCss = fs.readFileSync(path.join(root, "src/renderer/styles.css"), "utf8");
  assert.match(
    rendererCss,
    /\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/,
    "renderer overlays with hidden=true must never remain visible above video/avatar",
  );
  const tabletSource = fs.readFileSync(path.join(root, "src/web/tablet/index.ts"), "utf8");
  assert.match(tabletSource, /DOAR PRIVESC/, "tablet observation copy must use natural Romanian");
  const { TABLET_POSTS } = await bundle("src/shared/types.ts", "types");
  assert.deepEqual(
    Object.values(TABLET_POSTS).map((post) => post.perspectives),
    [
      ["DIRECȚIE", "TRASEU"],
      ["ENERGIE", "STABILITATE"],
      ["CUVINTE", "SEMNAL"],
      ["PULS", "LEGĂTURĂ"],
      ["AMINTIRE", "TIMP"],
    ],
    "all five posts must expose two concrete, equal perspectives",
  );

  const { CueTracker } = await bundle("src/server/cues.ts", "cues");
  const firedByTracker = [];
  const tracker = new CueTracker(show, { onFired: (cue) => firedByTracker.push(cue.id) });
  tracker.enterPhase("play", 335);
  tracker.advance(335);
  tracker.advance(334.4); // a delayed video report after seek, not a second explicit seek
  tracker.advance(335.1);
  assert.equal(
    firedByTracker.filter((id) => id === "tech-adaptive-select").length,
    1,
    "backwards clock jitter must not fire the adaptive marker twice",
  );

  const { TabletRegistry } = await bundle("src/server/tablets.ts", "tablets");
  const socket = { readyState: 1, send() {} };
  const perspectiveCue = {
    id: "perspective-test",
    phase: "play",
    at: 10,
    kind: "tablet",
    interaction: {
      type: "paired-choice",
      mode: "perspective",
      prompt: "Ce păstrează o lume vie?",
      options: ["Curiozitatea", "Grija"],
      allowObserve: true,
    },
  };
  const tablets = new TabletRegistry();
  tablets.connect("tablet-1", socket);
  assert.equal(
    tablets.handleEvent({ type: "tablet", tabletId: "tablet-1", event: { kind: "set-post", post: 1 } }, null).error,
    undefined,
  );
  assert.equal(tablets.perspectiveBranch("perspective-test"), "observe", "no expressed choices must use observe branch");
  assert.equal(
    tablets.handleEvent(
      { type: "tablet", tabletId: "tablet-1", event: { kind: "choice", cueId: "perspective-test", zone: "A", value: "Curiozitatea" } },
      perspectiveCue,
    ).error,
    undefined,
  );
  assert.equal(tablets.perspectiveBranch("perspective-test"), "same", "one expressed value must use same branch");
  assert.equal(
    tablets.handleEvent(
      { type: "tablet", tabletId: "tablet-1", event: { kind: "choice", cueId: "perspective-test", zone: "B", value: "Grija" } },
      perspectiveCue,
    ).error,
    undefined,
  );
  assert.equal(tablets.perspectiveBranch("perspective-test"), "diverse", "different A/B values must use diverse branch");
  assert.match(
    tablets.handleEvent(
      { type: "tablet", tabletId: "tablet-1", event: { kind: "choice", cueId: "perspective-test", zone: "A", value: "Grija" } },
      perspectiveCue,
    ).error ?? "",
    /a răspuns deja/,
    "a zone cannot replace its first answer",
  );

  const observers = new TabletRegistry();
  observers.connect("tablet-2", socket);
  observers.handleEvent({ type: "tablet", tabletId: "tablet-2", event: { kind: "set-post", post: 2 } }, null);
  observers.handleEvent(
    { type: "tablet", tabletId: "tablet-2", event: { kind: "choice", cueId: "perspective-test", zone: "A", value: "observe" } },
    perspectiveCue,
  );
  assert.equal(observers.perspectiveBranch("perspective-test"), "observe", "explicit observation must use observe branch");

  const { ShowDirector } = await bundle("src/server/state.ts", "state");
  const applied = [];
  const fired = [];
  let runStarts = 0;
  const director = new ShowDirector(show, config, {
    onApplyCmd: (cmd) => applied.push(cmd),
    onStateChange: () => {},
    onCueFired: (cue) => fired.push(cue.id),
    onLog: () => {},
    onRunStart: () => runStarts++,
  });
  assert.equal(director.dispatchCommand({ action: "play" }).ok, true, "PLAY from IDLE must start the experience");
  assert.equal(director.playbackState, "playing");
  assert.ok(director.now() >= -10 && director.now() < -9.8, "server launch lead-in must begin at T-10");
  assert.equal(runStarts, 1, "PLAY from IDLE must open a new run");
  assert.deepEqual(applied.at(-1), { action: "play" });
  assert.ok(fired.includes("launch-theme"), "the first launch cue must fire immediately");

  let now = 0;
  let nextFrame = null;
  let playCalls = 0;
  Object.defineProperty(globalThis, "performance", { configurable: true, value: { now: () => now } });
  globalThis.requestAnimationFrame = (callback) => {
    nextFrame = callback;
    return 1;
  };
  globalThis.cancelAnimationFrame = () => {};
  globalThis.HTMLMediaElement = { HAVE_METADATA: 1 };

  class VideoMock {
    style = {};
    muted = false;
    loop = false;
    src = "";
    readyState = 1;
    duration = 741.78;
    currentTime = 0;
    playbackRate = 1;
    paused = true;
    videoWidth = 3840;
    videoHeight = 2052;
    error = null;
    listeners = new Map();
    load() {}
    pause() {
      this.paused = true;
    }
    play() {
      playCalls++;
      this.paused = false;
      return Promise.resolve();
    }
    addEventListener(name, callback) {
      this.listeners.set(name, callback);
    }
  }

  const { Player } = await bundle("src/renderer/player.ts", "player");
  let themeName = "prologue";
  let publishedVideoEnds = 0;
  const video = new VideoMock();
  const player = new Player({
    video,
    show,
    config,
    screen: config.screens[0],
    voice: {
      prepare: async () => {},
      getClip: async () => null,
      play: () => ({ done: Promise.resolve(), stop() {}, durationMs: 0 }),
      speakFallback: () => ({ done: new Promise(() => {}), stop() {}, durationMs: 1000 }),
      stopAll() {},
      setVolume() {},
      getAmplitude: () => 0,
      playSfx: () => ({ done: Promise.resolve(), stop() {}, durationMs: 0 }),
      unlock: async () => {},
    },
    avatar: {
      load: async () => {},
      lipsync() {},
      lipsyncSynthetic() {},
      stopSpeaking() {},
      setVisible() {},
      setMood() {},
      setAttention() {},
      resize() {},
      isSpeaking: () => false,
      dispose() {},
    },
    subtitles: { show() {}, hide() {}, hideAfter() {}, dispose() {} },
    countdown: { run: async () => {}, cancel() {}, isRunning: () => false },
    entities: { show() {}, hide() {}, hideAll() {}, setSpeaking() {}, resize() {}, dispose() {} },
    theme: {
      apply: (name) => {
        themeName = name;
      },
      current: () => themeName,
      dispose() {},
    },
    osd: { update() {}, setError() {}, setSpinner() {}, identify() {}, note() {}, setVisible() {} },
    log() {},
    onConfiguredVideoEnd: () => publishedVideoEnds++,
  });

  player.apply({ action: "start" });
  assert.equal(player.duration(), 465, "configured V3 cut must win over the longer physical master");
  assert.equal(player.getPlaybackState(), "playing");
  assert.ok(player.phaseTime() >= -10 && player.phaseTime() < -9.9, "renderer launch lead-in must begin at T-10");
  assert.equal(playCalls, 0, "video must remain frozen during launch lead-in");

  now = 1_000;
  nextFrame?.(now);
  player.apply({ action: "pause" });
  const pausedAt = player.phaseTime();
  now = 4_000;
  assert.equal(player.phaseTime(), pausedAt, "pause must freeze the launch countdown");
  player.apply({ action: "play" });

  now = 12_500;
  nextFrame?.(now);
  assert.ok(player.phaseTime() < 0);
  assert.equal(playCalls, 0);

  now = 13_050;
  nextFrame?.(now);
  assert.equal(playCalls, 1, "video must start when launch lead-in reaches zero");
  assert.ok(player.phaseTime() >= 0);

  video.currentTime = 465;
  nextFrame?.(13_100);
  assert.equal(player.getPlaybackState(), "epilogue", "renderer must enter epilogue immediately at the configured 465s cut");
  assert.equal(player.phase(), "epilogue");
  assert.equal(themeName, "white", "the continuous white transition must start at the cut, without a hold state");
  assert.equal(publishedVideoEnds, 1, "the clock source must publish the local cut exactly once");

  now = 14_100;
  const epilogueBeforeEcho = player.phaseTime();
  player.apply({ action: "epilogue" });
  assert.ok(player.phaseTime() >= epilogueBeforeEcho, "the echoed server command must not reset the local epilogue clock");

  now = 88_101;
  nextFrame?.(now);
  assert.equal(player.getPlaybackState(), "ended", "the renderer must end the local 75s epilogue deterministically");
  assert.equal(player.phaseTime(), 75, "the completed epilogue clock must clamp to its configured end");
  const callsBeforeEnded = playCalls;
  player.follow("ended", 120, 0, { seekThresholdSec: 0.35, rateNudge: 0.02 });
  assert.equal(player.getPlaybackState(), "ended");
  assert.equal(player.phase(), "epilogue", "an ended epilogue follower must remain in the epilogue phase");
  assert.equal(themeName, "white", "an ended epilogue follower must retain the epilogue theme");
  assert.equal(playCalls, callsBeforeEnded, "an ended epilogue follower must not restart the video");
  player.dispose();

  // Voice prepare() must fetch and decode the complete offline manifest. A later getClip() for a
  // scheduled cue must be a pure memory-cache hit, with no cue-time I/O or decode work.
  let decodeCalls = 0;
  const audioParam = () => ({
    value: 0,
    cancelScheduledValues() {},
    setTargetAtTime() {},
    setValueAtTime() {},
    exponentialRampToValueAtTime() {},
    linearRampToValueAtTime() {},
  });
  class AudioContextMock {
    state = "running";
    currentTime = 0;
    baseLatency = 0;
    destination = {};
    createGain() {
      return { gain: audioParam(), connect: (dest) => dest, disconnect() {} };
    }
    createAnalyser() {
      return { fftSize: 0, smoothingTimeConstant: 0, connect: (dest) => dest, getFloatTimeDomainData() {} };
    }
    async decodeAudioData() {
      decodeCalls++;
      return { duration: 0.5 };
    }
    async resume() {}
  }
  globalThis.window = { AudioContext: AudioContextMock, setTimeout, clearTimeout };
  const fakeClip = {
    cueId: "preloaded-cue",
    lang: "ro",
    speaker: "CAPITANUL",
    text: "Linie pregătită.",
    file: "preloaded-cue.mp3",
    mime: "audio/mpeg",
    durationMs: 500,
    words: ["Linie", "pregătită"],
    wtimes: [0, 200],
    wdurations: [150, 250],
    provider: "elevenlabs",
    generatedAt: "2026-09-04T00:00:00.000Z",
  };
  const failedClip = { ...fakeClip, cueId: "unavailable-cue", text: "Linie indisponibilă.", file: "unavailable-cue.mp3" };
  const fakeManifest = {
    lang: "ro",
    generatedAt: fakeClip.generatedAt,
    clips: { [fakeClip.cueId]: fakeClip, [failedClip.cueId]: failedClip },
  };
  const fetched = [];
  globalThis.fetch = async (url) => {
    fetched.push(String(url));
    if (String(url).endsWith("manifest.json")) return { ok: true, json: async () => fakeManifest };
    if (String(url).endsWith(failedClip.file)) return { ok: false, status: 404 };
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
  };
  const { createVoiceEngine } = await bundle("src/renderer/voice/index.ts", "voice");
  const voice = createVoiceEngine({
    voiceBaseUrl: "https://local.test/voice/",
    serverHttpUrl: null,
    lang: "ro",
    audible: false,
    initialVolume: 1,
  });
  const readinessWarnings = [];
  const originalWarn = console.warn;
  let prepared;
  let unavailable;
  try {
    console.warn = (...args) => readinessWarnings.push(args.map(String).join(" "));
    await voice.prepare("ro");
    prepared = await voice.getClip(fakeClip.cueId, fakeClip.speaker, fakeClip.text, "ro");
    unavailable = await voice.getClip(failedClip.cueId, failedClip.speaker, failedClip.text, "ro");
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(fetched.length, 3, "prepare must fetch the manifest and every declared audio clip");
  assert.equal(decodeCalls, 1, "prepare must decode each available manifest clip exactly once");
  assert.ok(prepared?.audio instanceof ArrayBuffer, "prepared clip must include cached audio bytes");
  assert.equal(fetched.length, 3, "getClip after prepare must not fetch at cue time");
  assert.equal(decodeCalls, 1, "getClip after prepare must not decode at cue time");
  assert.equal(unavailable, null, "an asset that failed readiness must resolve as unavailable");
  assert.equal(fetched.length, 3, "a failed readiness asset must not retry I/O on its cue boundary");
  assert.equal(decodeCalls, 1, "a failed readiness asset must not retry decode on its cue boundary");
  assert.ok(readinessWarnings.some((line) => line.includes("failed readiness")), "readiness failures must remain diagnosable");

  // A missing V3 production asset must remain silent; preloading must never make the browser TTS
  // fallback eligible for a cue that explicitly opts out of it.
  const { Timeline } = await bundle("src/renderer/timeline.ts", "timeline");
  let browserFallbackCalls = 0;
  const silentTimeline = new Timeline(
    {
      voice: {
        prepare: async () => {},
        getClip: async () => null,
        play: () => ({ done: Promise.resolve(), stop() {}, durationMs: 0 }),
        speakFallback: () => {
          browserFallbackCalls++;
          return { done: Promise.resolve(), stop() {}, durationMs: 0 };
        },
        stopAll() {},
        setVolume() {},
        getAmplitude: () => 0,
        playSfx: () => ({ done: Promise.resolve(), stop() {}, durationMs: 0 }),
        unlock: async () => {},
      },
      avatar: {
        load: async () => {},
        lipsync() {},
        lipsyncSynthetic() {},
        stopSpeaking() {},
        setVisible() {},
        setMood() {},
        setAttention() {},
        resize() {},
        isSpeaking: () => false,
        dispose() {},
      },
      subtitles: { show() {}, hide() {}, hideAfter() {}, dispose() {} },
      countdown: { run: async () => {}, cancel() {}, isRunning: () => false },
      entities: { show() {}, hide() {}, hideAll() {}, setSpeaking() {}, resize() {}, dispose() {} },
      theme: { apply() {}, current: () => "prologue", dispose() {} },
      log() {},
      getLang: () => "ro",
      getSfxGain: () => 1,
      now: () => 0,
      ensureAvatarVisible() {},
    },
    { ...show, cues: [], scenes: [] },
  );
  const silentLine = silentTimeline.speak({
    id: "missing-v3-production-line",
    speaker: "LUMINA",
    text: "Această replică rămâne intenționat tăcută.",
    subtitle: false,
    fallback: "silent",
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(browserFallbackCalls, 0, "fallback:silent must never invoke browser TTS");
  silentTimeline.stopVoice();
  await silentLine;

  console.log("[core] OK launch timing, deterministic epilogue, audio preload, and silent fallback");
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
