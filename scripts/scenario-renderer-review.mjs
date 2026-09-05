#!/usr/bin/env node
/** Actual Electron/Chromium renderer, real film, GLB and generated ElevenLabs audio.
 * Isolated loopback server and SQLite; no generated media substitutes or packageReady spoofing.
 * Uses the renderer's documented development boot URLs; native wall-window layout is separate QA.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
import WebSocket from 'ws';
import { ROOT, PROFILES, WINDOWS, createHarness, waitFor, completeStage } from './smoke-scenarios.mjs';
const require = createRequire(import.meta.url), temp = await mkdtemp(path.join(os.tmpdir(), 'nava-renderer-scenarios-'));
const out = path.join(ROOT, 'runs/debug/scenarios-new'); await mkdir(out, { recursive: true });
const rendererDir = path.join(temp, 'dist/renderer'); await cp(path.join(ROOT, 'src/renderer'), rendererDir, { recursive: true });
await cp(path.join(ROOT, 'src/web/shared'), path.join(rendererDir, 'shared'), { recursive: true });
await cp(path.join(ROOT, 'node_modules/@met4citizen/talkinghead/modules/playback-worklet.js'), path.join(rendererDir, 'playback-worklet.js'));
await esbuild.build({ entryPoints: [path.join(ROOT, 'src/renderer/index.ts')], outfile: path.join(rendererDir, 'renderer.js'), bundle: true, platform: 'browser', format: 'iife', target: 'chrome130', define: { 'process.env.NODE_ENV': '"production"', 'import.meta.url': '__navaModuleUrl' }, banner: { js: 'var __navaModuleUrl = document.baseURI;' }, alias: { three: 'three' }, logLevel: 'warning' });
const screen = { id: 'center', displayIndex: 0, showAvatar: true, showSubtitles: true, showEntities: true, playAudio: true, kiosk: false };
const h = await createHarness({ screens: [screen] });
const config = JSON.parse(await readFile(path.join(ROOT, 'config.json'), 'utf8'));
const url = pathToFileURL(path.join(rendererDir, 'index.html'));
url.search = new URLSearchParams({ screen: 'center', role: 'master', dev: '0', ws: h.base.replace('http:', 'ws:') + '/ws', video: pathToFileURL(path.resolve(ROOT, config.video.path)).href, glb: pathToFileURL(path.resolve(ROOT, config.avatar.glb)).href, voice: pathToFileURL(path.join(ROOT, 'assets/voice') + path.sep).href, show: pathToFileURL(path.resolve(ROOT, config.show)).href }).toString();
const probe = net.createServer(); await new Promise(r => probe.listen(0, '127.0.0.1', r)); const port = probe.address().port; await new Promise(r => probe.close(r));
const main = path.join(temp, 'renderer-main.cjs');
await writeFile(main, `const {app,BrowserWindow}=require('electron');app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');let w;app.whenReady().then(async()=>{w=new BrowserWindow({width:1600,height:900,useContentSize:true,show:false,webPreferences:{offscreen:true,backgroundThrottling:false,autoplayPolicy:'no-user-gesture-required',contextIsolation:true,sandbox:true}});await w.loadURL(${JSON.stringify(url.href)});});process.stdin.on('data',()=>app.quit());`);
const child = spawn(require('electron'), [`--remote-debugging-port=${port}`, main], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
let childErrors = ''; child.stderr.on('data', b => { childErrors += String(b); });
let ws; const records = [], frames = [], errors = [], loadingFailures = [], ready = new Set();
try {
  const targets = await waitFor(async () => { try { return await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json()); } catch { return []; } }, a => a.some(t => t.url.includes('index.html')), 'Electron renderer target', 20000);
  ws = new WebSocket(targets.find(t => t.url.includes('index.html')).webSocketDebuggerUrl); await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
  let serial = 0; const pending = new Map();
  ws.on('message', raw => { const m = JSON.parse(String(raw));
    if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } }
    if (m.method === 'Network.webSocketFrameSent' || m.method === 'Network.webSocketFrameReceived') { try { const v = JSON.parse(m.params.response.payloadData); frames.push(v); if (v.type === 'packageReady' && v.ok) ready.add(v.contentHash); } catch {} }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails);
    if (m.method === 'Network.loadingFailed' && !m.params.canceled) loadingFailures.push(m.params.errorText);
  });
  function call(method, params = {}) { return new Promise((resolve, reject) => { const id = ++serial; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP ${method} timeout`)); }, 20000); pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params })); }); }
  async function evaluate(expression) { const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; }
  async function size(width, height) { await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }); }
  async function shot(name) { const r = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await writeFile(path.join(out, name + '.png'), Buffer.from(r.data, 'base64')); }
  async function metric() { return evaluate(`(()=>{const v=document.querySelector('#video'),a=document.querySelector('#avatar'),c=a.querySelector('canvas'),t=a.querySelector('.nava-transporter'),s=document.querySelector('#subtitles'),q=v.getVideoPlaybackQuality(),g=c?.getContext('webgl2')||c?.getContext('webgl');return {viewport:[innerWidth,innerHeight],video:{time:v.currentTime,frames:q.totalVideoFrames,dropped:q.droppedVideoFrames,paused:v.paused,ready:v.readyState},avatar:{shown:!!t?.classList.contains('is-shown'),opacity:t?getComputedStyle(t).opacity:'0',canvas:[c?.width||0,c?.height||0],contextLost:g?.isContextLost()??true},subtitle:s?.textContent||'',overlay:document.querySelector('.mission-tv')?.textContent||document.querySelector('[data-mission]')?.textContent||'',veil:document.querySelector('#veil').hidden}})()`); }
  await call('Network.enable'); await call('Runtime.enable'); await call('Page.reload');
  await waitFor(async () => (await h.api('/api/state')).body, s => s.readiness?.ready, 'real renderer/video readiness', 30000);
  for (const profile of PROFILES) {
    await h.select(profile);
    const show = (await h.api('/api/show')).body;
    await waitFor(() => ready.has(show.scenario.contentHash), Boolean, `${profile} real audio package preload`, 45000);
    await waitFor(async () => (await h.api('/api/state')).body, s => s.readiness?.ready, `${profile} ready`, 15000);
    await size(3840, 2160); await h.command({ action: 'start' });
    if (profile !== PROFILES[0]) await h.command({ action: 'seek', time: 2 });
    const first = await waitFor(metric, m => !m.video.paused && m.video.ready >= 3 && m.video.time >= 1, 'actual film playback', 20000);
    await shot(`${profile}-tv-film-a-3840`); await new Promise(r => setTimeout(r, 1100)); const second = await metric();
    assert(second.video.time > first.video.time + 0.5); assert(second.video.frames > first.video.frames); await shot(`${profile}-tv-film-b-3840`);
    const captain = show.cues.find(c => c.kind === 'voice' && c.phase === 'play' && c.speaker === 'CAPITANUL' && !c.manual);
    await h.command({ action: 'fireCue', cueId: captain.id });
    const avatar = await waitFor(metric, m => m.avatar.shown && Number(m.avatar.opacity) > 0.9 && !m.avatar.contextLost && m.avatar.canvas[0] > 100 && m.subtitle.includes(captain.text.ro), 'real GLB / voice subtitle', 25000);
    await shot(`${profile}-tv-captain-3840`);
    await size(1600, 900); await shot(`${profile}-tv-captain-windowed`);
    records.push({ profile, contentHash: show.scenario.contentHash, packageReady: true, first, second, avatar });
    if (profile === PROFILES[0]) {
      for (let stage = 1; stage <= 3; stage++) {
        await h.command({ action: 'seek', time: WINDOWS[profile][stage - 1] });
        await Promise.all(h.tablets.map(t => waitFor(() => t.snapshot, s => s.stage === stage, 'live child stage')));
        await completeStage(h, profile, stage);
        if (stage === 1) {
          const marker = show.cues.find(c => c.kind === 'marker' && c.id === 'branch-play-122'); assert(marker);
          const expected = show.cues.find(c => c.id === 'k510-012-C'); frames.length = 0;
          await h.command({ action: 'seek', time: 121.7 });
          await waitFor(() => frames, a => a.some(m => m.type === 'applyCmd' && m.cmd?.action === 'fireCue' && m.cmd.cueId === expected.id), 'automatic complete branch dispatch', 8000);
          await waitFor(metric, m => m.subtitle.includes(expected.text.ro), 'selected branch subtitle');
          await shot('age-5-10-tv-confirmed-branch-windowed');
        }
      }
    }
    await h.command({ action: 'epilogue' }); await new Promise(r => setTimeout(r, 700));
    await size(3840, 2160); await shot(`${profile}-tv-summary-3840`); records.push({ profile, final: await metric() });
    await size(1600, 900); await shot(`${profile}-tv-summary-windowed`);
    await h.command({ action: 'restart' });
  }
  assert.deepEqual(errors, [], 'renderer runtime exceptions');
  assert.deepEqual(loadingFailures, [], 'failed real asset loads');
  await writeFile(path.join(out, 'renderer-review.json'), JSON.stringify({ checkedAt: new Date().toISOString(), realMedia: true, boot: 'documented renderer dev boot; real server / generated voice packages', records, errors, loadingFailures }, null, 2));
  console.log(`Real renderer review passed: ${PROFILES.length} profiles, film + GLB + audio preloads, 4K/windowed, complete child branch and final overlays.`);
  if (process.argv.includes('--hold')) {
    await h.select('legacy-v3');
    const handoff = path.join(temp, 'renderer-auth.json');
    await writeFile(handoff, JSON.stringify({ base: h.base, cdpPort: port, operatorPin: '9384', token: h.token }));
    console.log(`Renderer ready for legacy smoke. Local authentication fixture: ${handoff}`);
    await new Promise(resolve => { process.once('SIGINT', resolve); process.once('SIGTERM', resolve); });
  }
} finally {
  ws?.close(); child.stdin.write('close'); await new Promise(resolve => { const timer = setTimeout(() => { child.kill(); resolve(); }, 5000); child.once('exit', () => { clearTimeout(timer); resolve(); }); });
  await h.close(); await rm(temp, { recursive: true, force: true });
}
