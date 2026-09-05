#!/usr/bin/env node
/**
 * Smoke test for R4 authentication: bundles src/server/index.ts with esbuild into a temp dir, starts the
 * server on a random port with a throw-away appRoot, and exercises PIN login, roles, users CRUD, guards
 * and WebSocket hello authentication. Run: `node scripts/smoke-auth.mjs`  (no Electron needed).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as esbuild from "esbuild";

const root = path.resolve(import.meta.dirname, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "nava-auth-"));
const appRoot = path.join(temp, "app");
fs.mkdirSync(path.join(appRoot, "assets", "show"), { recursive: true });
fs.copyFileSync(path.join(root, "assets/show/show.json"), path.join(appRoot, "assets/show/show.json"));
const outfile = path.join(temp, "server.mjs");

await esbuild.build({
  entryPoints: [path.join(root, "src/server/index.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  logLevel: "warning",
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});

const { startServer } = await import(pathToFileURL(outfile).href);
const logs = [];
const log = (level, msg, data) => logs.push({ level, msg, data });
const config = {
  role: "master",
  server: { port: 0, bindHost: "127.0.0.1" },
  lang: "ro",
  show: "assets/show/show.json",
  video: { path: "media/none.mp4", fit: "cover", preloadPoster: true },
  avatar: { glb: "assets/avatar/none.glb", corner: "bottom-left", widthPercent: 22, marginPx: 40 },
  audio: { voiceVolume: 1, sfxVolume: 0.8, outputDeviceId: "default" },
  screens: [{ id: "center", displayIndex: 0, showAvatar: true, showSubtitles: true, showEntities: true, playAudio: true, kiosk: false }],
  sync: { clockHz: 4, seekThresholdSec: 0.25, rateNudge: 0.03 },
  dev: { openDevTools: false, windowed: true },
  security: { operatorPin: "4078", screenToken: "screen-secret-token", sessionTtlMin: 60, usersFile: "data/users.json", publicState: true },
};

const handle = await startServer({
  config,
  appRoot,
  webDir: path.join(root, "dist/web"),
  showPath: path.join(appRoot, "assets/show/show.json"),
  cacheDir: path.join(temp, "cache"),
  runsDir: path.join(temp, "runs"),
  log,
});
const base = `http://127.0.0.1:${handle.port}`;
const step = (name) => console.log(`  ok  ${name}`);

try {
  // --- public endpoints
  let r = await fetch(`${base}/api/health`);
  assert.equal(r.status, 200);
  step("GET /api/health public");
  r = await fetch(`${base}/api/state`);
  assert.equal(r.status, 200, "publicState=true -> /api/state public");
  step("GET /api/state public (publicState)");

  // --- guards without auth
  r = await fetch(`${base}/api/cmd`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cmd: { action: "pause" } }) });
  assert.equal(r.status, 401);
  step("POST /api/cmd without session -> 401");
  r = await fetch(`${base}/api/show`);
  assert.equal(r.status, 401);
  step("GET /api/show without session -> 401");
  r = await fetch(`${base}/api/debug/summary`);
  assert.equal(r.status, 401);
  step("GET /api/debug/summary without session -> 401");
  r = await fetch(`${base}/api/tts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  assert.equal(r.status, 401);
  step("POST /api/tts without token -> 401");
  r = await fetch(`${base}/api/tts`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer screen-secret-token" }, body: "{}" });
  assert.notEqual(r.status, 401);
  step(`POST /api/tts with screen token passes auth (status ${r.status})`);

  // --- login
  r = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: "0000" }) });
  assert.equal(r.status, 401);
  step("login wrong PIN -> 401");
  r = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: "4078" }) });
  assert.equal(r.status, 200);
  const login = await r.json();
  assert.equal(login.ok, true);
  assert.equal(login.user.role, "admin");
  const cookie = r.headers.get("set-cookie");
  assert.ok(cookie && cookie.includes("nava_session="), "cookie set");
  assert.ok(cookie.includes("HttpOnly"));
  const adminTok = login.token;
  step("login PIN 4078 -> admin session + HttpOnly cookie");

  const asAdmin = { Authorization: `Bearer ${adminTok}`, "Content-Type": "application/json" };
  r = await fetch(`${base}/api/auth/me`, { headers: asAdmin });
  assert.equal((await r.json()).user.role, "admin");
  step("GET /api/auth/me with bearer");

  // cookie path too
  r = await fetch(`${base}/api/show`, { headers: { Cookie: cookie.split(";")[0] } });
  assert.equal(r.status, 200);
  step("GET /api/show with cookie -> 200");

  // --- users CRUD (admin)
  r = await fetch(`${base}/api/users`, { headers: asAdmin });
  assert.equal(r.status, 200);
  const list0 = await r.json();
  assert.equal(list0.users.length, 1);
  step("GET /api/users as admin (1 default admin)");
  r = await fetch(`${base}/api/users`, { method: "POST", headers: asAdmin, body: JSON.stringify({ name: "Ana", role: "operator", pin: "1234" }) });
  const anaBody = await r.json();
  assert.equal(r.status, 201, JSON.stringify(anaBody));
  const ana = anaBody.user;
  step("POST /api/users create operator Ana / 1234");
  r = await fetch(`${base}/api/users`, { method: "POST", headers: asAdmin, body: JSON.stringify({ name: "Dup", role: "viewer", pin: "1234" }) });
  assert.equal(r.status, 409);
  step("duplicate PIN rejected 409");
  r = await fetch(`${base}/api/users`, { method: "POST", headers: asAdmin, body: JSON.stringify({ name: "Vio", role: "viewer", pin: "5555" }) });
  assert.equal(r.status, 201);
  step("create viewer Vio / 5555");

  // --- operator
  r = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: "1234" }) });
  const opTok = (await r.json()).token;
  const asOp = { Authorization: `Bearer ${opTok}`, "Content-Type": "application/json" };
  r = await fetch(`${base}/api/cmd`, {method:'POST',headers:asOp,body:JSON.stringify({cmd:{action:'tabletSfx',enabled:false}})});
  assert.equal(r.status,200);
  assert.equal((await fetch(`${base}/api/state`).then(r=>r.json())).tabletSfx,false);
  r = await fetch(`${base}/api/cmd`, {method:'POST',headers:asOp,body:JSON.stringify({cmd:{action:'tabletSfx',enabled:'false'}})});
  assert.equal(r.status,400);
  step('tabletSfx: operator change and invalid boolean rejection');
  r = await fetch(`${base}/api/users`, { headers: asOp });
  assert.equal(r.status, 403);
  step("operator GET /api/users -> 403");
  r = await fetch(`${base}/api/cmd`, { method: "POST", headers: asOp, body: JSON.stringify({ cmd: { action: "preflight" } }) });
  const pf = await r.json();
  assert.ok(pf.preflight, "preflight object returned");
  assert.equal(pf.preflight.voice.total, 51);
  step(`operator POST /api/cmd preflight -> ${r.status} (voci ${pf.preflight.voice.ok}/${pf.preflight.voice.total}, ok=${pf.preflight.ok})`);
  r = await fetch(`${base}/api/debug/summary`, { headers: asOp });
  assert.equal(r.status, 200);
  const sum = await r.json();
  assert.equal(sum.config.security.operatorPin, "****");
  assert.ok(String(sum.config.security.screenToken).startsWith("scre"));
  step("operator GET /api/debug/summary -> 200, secrets redacted");

  // --- viewer
  r = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: "5555" }) });
  const viewTok = (await r.json()).token;
  const asView = { Authorization: `Bearer ${viewTok}`, "Content-Type": "application/json" };
  for(const headers of [asView,{'Content-Type':'application/json'}]){r=await fetch(`${base}/api/cmd`,{method:'POST',headers,body:JSON.stringify({cmd:{action:'tabletSfx',enabled:true}})});assert.equal(r.status,headers===asView?403:401)}
  step('tabletSfx: viewer and anonymous changes rejected');
  r = await fetch(`${base}/api/cmd`, { method: "POST", headers: asView, body: JSON.stringify({ cmd: { action: "pause" } }) });
  assert.equal(r.status, 403);
  step("viewer POST /api/cmd -> 403");
  r = await fetch(`${base}/api/state`, { headers: asView });
  assert.equal(r.status, 200);
  step("viewer GET /api/state -> 200");

  // --- PIN change invalidates sessions
  r = await fetch(`${base}/api/users/${ana.id}/pin`, { method: "POST", headers: asAdmin, body: JSON.stringify({ pin: "2468" }) });
  assert.equal(r.status, 200);
  r = await fetch(`${base}/api/auth/me`, { headers: asOp });
  assert.equal(r.status, 401);
  step("PIN change -> old operator session invalid");

  // --- delete guards
  r = await fetch(`${base}/api/users/${login.user.id}`, { method: "DELETE", headers: asAdmin });
  assert.equal(r.status, 400);
  step("admin cannot delete self -> 400");
  r = await fetch(`${base}/api/users/${ana.id}`, { method: "DELETE", headers: asAdmin });
  assert.equal(r.status, 200);
  step("delete Ana -> 200");

  // --- persistence
  const usersFile = JSON.parse(fs.readFileSync(path.join(appRoot, "data/users.json"), "utf8"));
  assert.equal(usersFile.users.length, 2);
  // Random UUIDs, salts or hashes can legitimately contain these four digits.
  // Check stored credential fields and whole values, not a random substring.
  for (const stored of usersFile.users) {
    assert.match(stored.pinHash, /^[a-f0-9]{64}$/);
    assert.ok(!Object.hasOwn(stored, 'pin'), 'no clear-text PIN field');
    assert.ok(!Object.values(stored).includes('4078'), 'PIN never stored as a clear-text value');
  }
  step("data/users.json persisted, no clear-text PIN");

  // --- WebSocket hello auth
  const wsHello = (hello) =>
    new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${handle.port}/ws`);
      const out = { messages: [], closeCode: null };
      const timer = setTimeout(() => {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        resolve(out);
      }, 1500);
      ws.onopen = () => ws.send(JSON.stringify(hello));
      ws.onmessage = (ev) => out.messages.push(JSON.parse(ev.data));
      ws.onclose = (ev) => {
        out.closeCode = ev.code;
        clearTimeout(timer);
        resolve(out);
      };
    });
  let w = await wsHello({ type: "hello", client: "control", id: "control" });
  assert.equal(w.closeCode, 4401);
  step("WS control hello without token -> close 4401");
  w = await wsHello({ type: "hello", client: "control", id: "control", token: adminTok });
  assert.ok(w.messages.some((m) => m.type === "welcome"), "welcome received");
  step("WS control hello with session token -> welcome");
  w = await wsHello({ type: "hello", client: "screen", id: "center", isClockSource: true, token: "wrong" });
  assert.equal(w.closeCode, 4401);
  step("WS screen hello with wrong screenToken -> 4401");
  w = await wsHello({ type: "hello", client: "screen", id: "center", isClockSource: true, token: "screen-secret-token" });
  assert.ok(w.messages.some((m) => m.type === "welcome"));
  step("WS screen hello with screenToken -> welcome");
  w = await wsHello({ type: "hello", client: "tablet", id: "t1" });
  assert.equal(w.messages.find(m=>m.type==='welcome')?.state.tabletSfx,false,'tablet welcome carries operator tabletSfx setting');
  assert.ok(w.messages.some((m) => m.type === "welcome"));
  step("WS tablet hello anonymous -> welcome");

  // --- login rate limit
  let limited = false;
  for (let i = 0; i < 10; i++) {
    r = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: "9999" }) });
    if (r.status === 429) limited = true;
  }
  assert.ok(limited, "rate limit after 8 bad attempts");
  step("login rate limit -> 429");

  console.log("\nsmoke-auth: ALL OK");
} catch (err) {
  console.error("\nsmoke-auth FAILED:", err);
  console.error(logs.slice(-15));
  process.exitCode = 1;
} finally {
  await handle.stop();
  fs.rmSync(temp, { recursive: true, force: true });
}
