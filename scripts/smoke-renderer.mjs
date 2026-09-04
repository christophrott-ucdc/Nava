/**
 * Live Electron rendering smoke test.
 *
 * Start the app with `electron --remote-debugging-port=19191 ...`, then run
 * `npm run smoke:renderer`. The test drives the real show through HTTP and
 * inspects/captures the Chromium compositor through CDP.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import WebSocket from "ws";

const root = path.resolve(import.meta.dirname, "..");
const cdpPort = Number(process.env.NAVA_CDP_PORT ?? 19191);
const serverPort = Number(process.env.NAVA_SERVER_PORT ?? 4321);
const cdpBase = `http://127.0.0.1:${cdpPort}`;
const serverBase = `http://127.0.0.1:${serverPort}`;
const deadline = (ms) => Date.now() + ms;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(read, accept, timeoutMs, label) {
  const until = deadline(timeoutMs);
  let last;
  while (Date.now() < until) {
    try {
      last = await read();
      if (accept(last)) return last;
    } catch (error) {
      last = error;
    }
    await sleep(200);
  }
  throw new Error(`${label} timed out; last value: ${JSON.stringify(last)}`);
}

async function command(action) {
  const response = await fetch(`${serverBase}/api/cmd`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cmd: { action } }),
  });
  assert.equal(response.status, 200, `${action} command must be accepted`);
  const body = await response.json();
  assert.equal(body.ok, true, `${action} command must return ok`);
}

const targets = await waitFor(
  () => fetch(`${cdpBase}/json/list`).then((response) => response.json()),
  (items) => Array.isArray(items) && items.some((item) => item.type === "page" && item.url.includes("/dist/renderer/index.html")),
  10_000,
  "Electron CDP renderer target",
);
const target = targets.find((item) => item.type === "page" && item.url.includes("/dist/renderer/index.html"));
assert.ok(target?.webSocketDebuggerUrl, "renderer target must expose a debugger WebSocket");

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.once("open", resolve);
  ws.once("error", reject);
});

let nextId = 1;
const pending = new Map();
ws.on("message", (raw) => {
  const message = JSON.parse(String(raw));
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});

function cdp(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function capture(file, clip) {
  const result = await cdp("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
    ...(clip ? { clip: { ...clip, scale: 1 } } : {}),
  });
  const data = Buffer.from(result.data, "base64");
  await fs.writeFile(file, data);
  return data;
}

try {
  await cdp("Runtime.enable");
  await cdp("Page.enable");
  await command("restart");
  await sleep(500);

  const overlay = await evaluate(`(() => {
    const veil = document.querySelector("#veil");
    const rect = veil.getBoundingClientRect();
    const top = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    return {
      hidden: veil.hidden,
      display: getComputedStyle(veil).display,
      width: rect.width,
      height: rect.height,
      topInsideVeil: !!top?.closest("#veil"),
    };
  })()`);
  assert.equal(overlay.hidden, true, "autoplay veil should be hidden before a rejection");
  assert.equal(overlay.display, "none", "hidden veil must not cover the player");
  assert.equal(overlay.topInsideVeil, false, "veil must not win hit-testing while hidden");

  await command("start");
  const leadIn = await fetch(`${serverBase}/api/state`).then((response) => response.json());
  assert.equal(leadIn.state, "playing");
  assert.ok(leadIn.phaseTime < 0, "START must begin in the intentional T-10 lead-in");

  const first = await waitFor(
    () => evaluate(`(() => {
      const video = document.querySelector("#video");
      const r = video.getBoundingClientRect();
      const q = typeof video.getVideoPlaybackQuality === "function" ? video.getVideoPlaybackQuality() : null;
      return { currentTime: video.currentTime, paused: video.paused, readyState: video.readyState,
        frames: q?.totalVideoFrames ?? null, rect: { x: r.x, y: r.y, width: r.width, height: r.height } };
    })()`),
    (sample) => sample.currentTime >= 1 && !sample.paused && sample.readyState >= 3,
    18_000,
    "real video playback",
  );
  const outputDir = path.join(root, "runs");
  await fs.mkdir(outputDir, { recursive: true });
  const frameA = await capture(path.join(outputDir, "renderer-smoke-frame-a.png"), first.rect);
  await sleep(1000);
  const second = await evaluate(`(() => {
    const video = document.querySelector("#video");
    const q = typeof video.getVideoPlaybackQuality === "function" ? video.getVideoPlaybackQuality() : null;
    return { currentTime: video.currentTime, paused: video.paused, frames: q?.totalVideoFrames ?? null };
  })()`);
  const frameB = await capture(path.join(outputDir, "renderer-smoke-frame-b.png"), first.rect);
  assert.ok(second.currentTime - first.currentTime >= 0.5, "video currentTime must advance between rendered samples");
  if (first.frames !== null && second.frames !== null) {
    assert.ok(second.frames > first.frames, "Chromium must present additional video frames");
  }
  assert.notEqual(
    crypto.createHash("sha256").update(frameA).digest("hex"),
    crypto.createHash("sha256").update(frameB).digest("hex"),
    "two video captures one second apart must differ",
  );

  const avatar = await waitFor(
    () => evaluate(`(() => {
      const host = document.querySelector("#avatar");
      const transporter = host?.querySelector(".nava-transporter");
      const canvas = host?.querySelector("canvas");
      const r = canvas?.getBoundingClientRect();
      const gl = canvas?.getContext("webgl2") || canvas?.getContext("webgl");
      return { shown: transporter?.classList.contains("is-shown") ?? false,
        opacity: transporter ? getComputedStyle(transporter).opacity : "0",
        canvasWidth: canvas?.width ?? 0, canvasHeight: canvas?.height ?? 0,
        cssWidth: r?.width ?? 0, cssHeight: r?.height ?? 0,
        contextLost: gl?.isContextLost() ?? true };
    })()`),
    (sample) => sample.shown && Number(sample.opacity) > 0.9 && sample.cssWidth > 100 && sample.cssHeight > 100 && !sample.contextLost,
    15_000,
    "Captain avatar visibility at its first cue",
  );
  const finalShot = path.join(outputDir, "renderer-smoke-avatar.png");
  const screenshot = await capture(finalShot);
  assert.ok(screenshot.length > 50_000, "final player screenshot must contain rendered visual data");

  console.log("renderer smoke: PASS", {
    veil: overlay,
    video: { first, second },
    avatar,
    screenshot: finalShot,
  });
} finally {
  ws.close();
}
