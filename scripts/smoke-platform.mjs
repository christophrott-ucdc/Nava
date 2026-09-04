#!/usr/bin/env node
/**
 * End-to-end smoke test for the embedded Hono/WebSocket platform.
 *
 * It bundles the real TypeScript server into a temporary directory, starts it on an ephemeral
 * loopback port, drives control/screen/tablet clients through a short show, verifies REST/static/QR
 * responses and the state machine, then checks that shutdown completes while clients are open.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import WebSocket from "ws";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

function socketClient(url, hello) {
  const ws = new WebSocket(url);
  const queued = [];
  const waiters = new Set();
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    for (const waiter of waiters) {
      if (waiter.predicate(msg)) {
        waiters.delete(waiter);
        clearTimeout(waiter.timer);
        waiter.resolve(msg);
        return;
      }
    }
    queued.push(msg);
  });
  const opened = new Promise((resolve, reject) => {
    ws.once("open", () => {
      ws.send(JSON.stringify(hello));
      resolve();
    });
    ws.once("error", reject);
  });
  const next = async (predicate, label, timeoutMs = 3000) => {
    await opened;
    const index = queued.findIndex(predicate);
    if (index >= 0) return queued.splice(index, 1)[0];
    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        timer: setTimeout(() => {
          waiters.delete(waiter);
          reject(new Error(`timeout waiting for ${label}; queued=${queued.map((m) => m.type).join(",")}`));
        }, timeoutMs),
      };
      waiters.add(waiter);
    });
  };
  return { ws, opened, next, send: (msg) => ws.send(JSON.stringify(msg)) };
}

async function main() {
  const temp = await mkdtemp(path.join(os.tmpdir(), "nava-platform-smoke-"));
  let handle = null;
  try {
    const bundle = path.join(temp, "server.cjs");
    await esbuild.build({
      entryPoints: [path.join(ROOT, "src/server/index.ts")],
      outfile: bundle,
      bundle: true,
      platform: "node",
      format: "cjs",
      target: "node22",
      logLevel: "warning",
    });

    const webDir = path.join(temp, "web");
    await mkdir(path.join(webDir, "control"), { recursive: true });
    await mkdir(path.join(webDir, "tablet"), { recursive: true });
    await writeFile(path.join(webDir, "control", "index.html"), "<!doctype html><title>control smoke</title>");
    await writeFile(path.join(webDir, "tablet", "index.html"), "<!doctype html><title>tablet smoke</title>");

    const showPath = path.join(temp, "show.json");
    await writeFile(
      showPath,
      JSON.stringify({
        title: "Smoke",
        version: "1",
        videoDurationSec: 0.2,
        timingStatus: "aligned",
        preshowAutoStart: false,
        launchLeadInSec: 2,
        epilogueOnVideoEnd: true,
        scenes: [
          { id: "intro", label: "Intro", phase: "preshow", start: 0, end: 5, theme: "prologue" },
          { id: "launch", label: "Launch", phase: "play", start: -2, end: 0.2, theme: "launch" },
          { id: "reentry", label: "Re-entry", phase: "epilogue", start: 0, end: 0.2, theme: "white" },
        ],
        cues: [
          {
            id: "posts",
            phase: "preshow",
            at: 0,
            kind: "tablet",
            interaction: { type: "post-assign", posts: ["Navigator", "Propulsie", "Comunicații", "Biosemnale", "Memorie"] },
          },
          { id: "launch-theme", phase: "play", at: -2, kind: "theme", theme: "launch" },
          {
            id: "tech-tablet-perspectives",
            phase: "play",
            at: -1.5,
            kind: "tablet",
            interaction: {
              type: "paired-choice",
              mode: "perspective",
              prompt: "Ce păstrează o lume vie?",
              options: ["Curiozitatea", "Grija"],
              allowObserve: true,
            },
          },
          {
            id: "v3-tech-0635-diverse",
            phase: "play",
            at: -0.5,
            kind: "voice",
            speaker: "TEHNOLOGIC",
            text: { ro: "Diverse." },
            manual: true,
            fallback: "silent",
          },
          {
            id: "v3-tech-0635-same",
            phase: "play",
            at: -0.5,
            kind: "voice",
            speaker: "TEHNOLOGIC",
            text: { ro: "La fel." },
            manual: true,
            fallback: "silent",
          },
          {
            id: "v3-tech-0635-observe",
            phase: "play",
            at: -0.5,
            kind: "voice",
            speaker: "TEHNOLOGIC",
            text: { ro: "Observă." },
            manual: true,
            fallback: "silent",
          },
          { id: "tech-adaptive-select", phase: "play", at: -0.5, kind: "marker", label: "adaptive" },
          { id: "epi-theme", phase: "epilogue", at: 0, kind: "theme", theme: "white" },
        ],
      }),
    );

    const { startServer } = require(bundle);
    const config = {
      role: "master",
      server: { port: 0, bindHost: "127.0.0.1" },
      lang: "ro",
      show: showPath,
      video: { path: "missing-smoke.mp4", fit: "cover", preloadPoster: false },
      avatar: { glb: "missing-smoke.glb", corner: "bottom-left", widthPercent: 22, marginPx: 40 },
      audio: { voiceVolume: 1, sfxVolume: 0.8, outputDeviceId: "default" },
      screens: [{ id: "center", displayIndex: 0, showAvatar: true, showSubtitles: true, showEntities: true, playAudio: true, kiosk: false }],
      sync: { clockHz: 10, seekThresholdSec: 0.25, rateNudge: 0.03 },
      dev: { openDevTools: false, windowed: true },
    };
    handle = await startServer({
      config,
      appRoot: ROOT,
      webDir,
      showPath,
      cacheDir: path.join(temp, "cache"),
      runsDir: path.join(temp, "runs"),
      log: () => {},
    });
    assert.ok(handle.port > 0, "ephemeral port was resolved");
    const http = `http://127.0.0.1:${handle.port}`;
    const wsUrl = `ws://127.0.0.1:${handle.port}/ws`;

    const health = await fetch(`${http}/api/health`).then((r) => r.json());
    assert.equal(health.ok, true);
    assert.equal(health.state, "idle");
    assert.match(await fetch(`${http}/control/`).then((r) => r.text()), /control smoke/);
    assert.equal((await fetch(`${http}/control/missing.js`)).status, 404);
    const qr = new Uint8Array(await fetch(`${http}/api/qr?size=96`).then((r) => r.arrayBuffer()));
    assert.deepEqual([...qr.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);

    const control = socketClient(wsUrl, { type: "hello", client: "control", id: "control-smoke" });
    const screen = socketClient(wsUrl, { type: "hello", client: "screen", id: "center", isClockSource: true });
    const tablet = socketClient(wsUrl, { type: "hello", client: "tablet", id: "tablet-smoke" });
    assert.equal((await control.next((m) => m.type === "welcome", "control welcome")).state.state, "idle");
    await screen.next((m) => m.type === "welcome", "screen welcome");
    await tablet.next((m) => m.type === "welcome", "tablet welcome");

    control.send({ type: "cmd", cmd: { action: "preshow" } });
    await screen.next((m) => m.type === "applyCmd" && m.cmd.action === "preshow", "preshow apply");
    await tablet.next((m) => m.type === "tabletView" && m.interaction?.type === "post-assign", "post assignment view");
    tablet.send({ type: "tablet", tabletId: "spoofed", event: { kind: "set-post", post: 6 } });
    await tablet.next((m) => m.type === "error" && /post invalid/.test(m.reason), "invalid post rejection");
    tablet.send({ type: "tablet", tabletId: "spoofed", event: { kind: "set-post", post: 1 } });
    const postUpdate = await control.next(
      (m) => m.type === "tablets" && m.tablets.some((t) => t.id === "tablet-smoke" && t.post === 1 && t.role === "Navigator"),
      "post update",
    );
    assert.equal(postUpdate.tablets[0].connected, true);
    await tablet.next((m) => m.type === "tabletView" && m.post === 1 && m.lens === "Navigator", "personalized post view");

    screen.send({ type: "cmd", cmd: { action: "restart" } });
    await screen.next((m) => m.type === "error" && /doar consola/.test(m.reason), "screen command rejection");
    control.send({ type: "cmd", cmd: { action: "start" } });
    await screen.next((m) => m.type === "applyCmd" && m.cmd.action === "start", "start apply");
    const started = await control.next((m) => m.type === "state" && m.state.state === "playing", "playing state");
    assert.ok(started.state.phaseTime >= -2 && started.state.phaseTime < -1.5);

    const seekResponse = await fetch(`${http}/api/cmd`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "seek", time: -1.5 }),
    });
    assert.equal(seekResponse.status, 200);
    await tablet.next((m) => m.type === "tabletView" && m.interaction?.type === "paired-choice", "paired choice view");
    tablet.send({ type: "tablet", tabletId: "spoofed", event: { kind: "choice", cueId: "tech-tablet-perspectives", zone: "A", value: "Curiozitatea" } });
    await control.next(
      (m) => m.type === "tablets" && m.answers.some((a) => a.text === "Curiozitatea" && a.post === 1 && a.zone === "A"),
      "zone A answer update",
    );
    await tablet.next(
      (m) => m.type === "tabletView" && m.zoneChoices?.A?.value === "Curiozitatea" && m.zoneChoices?.B === undefined,
      "private zone A confirmation",
    );
    tablet.send({ type: "tablet", tabletId: "spoofed", event: { kind: "choice", cueId: "tech-tablet-perspectives", zone: "B", value: "Grija" } });
    await control.next((m) => m.type === "tablets" && m.answers.some((a) => a.text === "Grija" && a.zone === "B"), "zone B answer update");
    await screen.next(
      (m) => m.type === "applyCmd" && m.cmd.action === "fireCue" && m.cmd.cueId === "v3-tech-0635-diverse",
      "adaptive diverse voice dispatch",
    );

    // Reports inside the post-command grace window are deliberately ignored; this one represents the
    // reference renderer genuinely reaching the end after it has applied the command.
    await new Promise((resolve) => setTimeout(resolve, 650));
    screen.send({ type: "report", state: "ended", phaseTime: 0.2, rate: 0, videoReady: true, sceneId: "launch" });
    await screen.next((m) => m.type === "applyCmd" && m.cmd.action === "epilogue", "automatic epilogue");

    control.send({ type: "cmd", cmd: { action: "restart" } });
    await screen.next((m) => m.type === "applyCmd" && m.cmd.action === "restart", "restart apply");
    const reset = await control.next(
      (m) => m.type === "tablets" && m.tablets.some((t) => t.id === "tablet-smoke" && t.post === 1) && m.answers.length === 0,
      "tablet session reset",
    );
    assert.equal(reset.answers.length, 0);

    const duplicate = socketClient(wsUrl, { type: "hello", client: "control", id: "duplicate-test" });
    await duplicate.next((m) => m.type === "welcome", "duplicate test welcome");
    duplicate.send({ type: "hello", client: "tablet", id: "role-escalation" });
    await duplicate.next((m) => m.type === "error" && /deja/.test(m.reason), "duplicate hello rejection");

    // A bad hot-reload must be rejected without replacing the currently running show.
    await writeFile(showPath, JSON.stringify({ title: "Broken", scenes: [], cues: [{ id: "bad", kind: "voice" }] }));
    const badReload = await fetch(`${http}/api/show/reload`, { method: "POST" });
    assert.equal(badReload.status, 500);
    assert.equal((await fetch(`${http}/api/show`).then((r) => r.json())).title, "Smoke");
    assert.ok((await fetch(`${http}/api/health`).then((r) => r.json())).showError);

    const beforeStop = Date.now();
    await handle.stop();
    handle = null;
    assert.ok(Date.now() - beforeStop < 2000, "server shutdown stayed bounded");
    console.log("platform smoke: PASS (HTTP, static, QR, WS roles, state machine, tablets, shutdown)");
  } finally {
    if (handle) await handle.stop().catch(() => {});
    await rm(temp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("platform smoke: FAIL");
  console.error(err);
  process.exitCode = 1;
});
