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

  const { ShowDirector } = await bundle("src/server/state.ts", "state");
  const applied = [];
  const fired = [];
  const director = new ShowDirector(show, config, {
    onApplyCmd: (cmd) => applied.push(cmd),
    onStateChange: () => {},
    onCueFired: (cue) => fired.push(cue.id),
    onLog: () => {},
    onRunStart: () => {},
  });
  assert.equal(director.dispatchCommand({ action: "start" }).ok, true);
  assert.equal(director.playbackState, "playing");
  assert.ok(director.now() >= -10 && director.now() < -9.8, "server launch lead-in must begin at T-10");
  assert.deepEqual(applied.at(-1), { action: "start" });
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
    duration = show.videoDurationSec;
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
  const player = new Player({
    video: new VideoMock(),
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
  });

  player.apply({ action: "start" });
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
  player.dispose();

  console.log("[core] OK server state machine and renderer launch lead-in");
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
