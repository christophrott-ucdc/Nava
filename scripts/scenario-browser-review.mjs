#!/usr/bin/env node
/** Real Chromium tablet UI against real Hono/WS and actual authored voice packs.
 * Five isolated browser sessions represent the five physical tablets. No fake snapshots.
 * Captures are stored under runs/debug/scenarios-new. Film/TV playback is a separate review.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { cp, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import * as esbuild from 'esbuild';
import WebSocket from 'ws';
import { ROOT, PROFILES, WINDOWS, createHarness, waitFor } from './smoke-scenarios.mjs';
const require = createRequire(import.meta.url);
const temp = await mkdtemp(path.join(os.tmpdir(), 'nava-browser-scenarios-'));
const out = path.join(ROOT, 'runs/debug/scenarios-new'); await mkdir(out, { recursive: true });
await cp(path.join(ROOT, 'src/web/tablet'), path.join(temp, 'web/tablet'), { recursive: true });
await cp(path.join(ROOT, 'src/web/shared'), path.join(temp, 'web/shared'), { recursive: true });
await esbuild.build({ entryPoints: [path.join(ROOT, 'src/web/tablet/index.ts')], outfile: path.join(temp, 'web/tablet/app.js'), bundle: true, platform: 'browser', format: 'iife', logLevel: 'warning' });
const h = await createHarness({ webDir: path.join(temp, 'web'), connectTablets: false });
const probe = net.createServer(); await new Promise(r => probe.listen(0, '127.0.0.1', r)); const port = probe.address().port; await new Promise(r => probe.close(r));
const main = path.join(temp, 'browser.cjs');
await writeFile(main, `const {app,BrowserWindow}=require('electron');const windows=[];app.whenReady().then(async()=>{for(let post=1;post<=5;post++){const w=new BrowserWindow({width:1920,height:1080,useContentSize:true,show:false,webPreferences:{partition:'qa-post-'+post,offscreen:true,backgroundThrottling:false,contextIsolation:true,sandbox:true}});windows.push(w);await w.loadURL(${JSON.stringify(h.base)}+'/tablet/?post='+post);}console.log('BROWSERS_READY');});process.stdin.on('data',()=>app.quit());`);
const child = spawn(require('electron'), [`--remote-debugging-port=${port}`, main], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
let stderr = ''; child.stderr.on('data', data => { stderr += String(data); });
const pages = [];
async function cdp(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  let serial = 0, snapshot = null; const pending = new Map(), errors = [];
  ws.on('message', raw => {
    const m = JSON.parse(String(raw));
    if (m.id) { const p = pending.get(m.id); if (!p) return; pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
    if (m.method === 'Network.webSocketFrameReceived') { try { const frame = JSON.parse(m.params.response.payloadData); if (frame.type === 'mission') snapshot = frame.snapshot; } catch {} }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text);
  });
  function call(method, params = {}) { return new Promise((resolve, reject) => { const id = ++serial; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP ${method} timeout`)); }, 12000); pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params })); }); }
  const page = { ws, errors, call, get snapshot() { return snapshot; }, async evaluate(expression) { const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; } };
  await call('Network.enable'); await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await call('Page.reload');
  return page;
}
async function press(page, value, zone) {
  const previous = page.snapshot.revision;
  const pressed = await page.evaluate(`(()=>{const b=[...document.querySelectorAll('.mission-zone[data-zone="${zone}"] button')].find(b=>b.dataset.value===${JSON.stringify(value)});if(!b||b.disabled)return false;b.click();return true;})()`);
  assert(pressed, `enabled button ${zone}/${value}`);
  await waitFor(() => page.snapshot, s => s.revision > previous, `confirmed ${zone}/${value}`);
  await waitFor(() => page.evaluate(`!document.querySelector('.mission-zone[data-zone="${zone}"] .mission-delivery')?.textContent.includes('Trimitem')`), Boolean, 'ACK rendered');
}
const reviews = [];
async function review(profile, stage, suffix, capture = true) {
  for (let n = 0; n < pages.length; n++) {
    const page = pages[n];
    const geometry = await page.evaluate(`(()=>({viewport:[innerWidth,innerHeight],overflows:[...document.querySelectorAll('#interaction,.mission-zone,.mission-pair')].filter(e=>e.scrollHeight>e.clientHeight+2||e.scrollWidth>e.clientWidth+2).map(e=>({class:e.className,height:e.clientHeight,scroll:e.scrollHeight})),zones:[...document.querySelectorAll('.mission-zone')].map(e=>({zone:e.dataset.zone||e.className,x:e.getBoundingClientRect().x,width:e.getBoundingClientRect().width})),minTarget:Math.min(...[...document.querySelectorAll('.mission-option')].map(e=>e.getBoundingClientRect().height)),bodyOverflow:document.documentElement.scrollHeight>innerHeight+2}))()`);
    reviews.push({ profile, stage, post: n + 1, suffix, ...geometry });
    assert.deepEqual(geometry.viewport, [1920, 1080]);
    assert.deepEqual(geometry.overflows, [], `${profile}/${stage}/${n + 1}/${suffix} overflow`);
    assert.equal(geometry.bodyOverflow, false);
    if (geometry.zones.length === 2) assert(geometry.zones[0].x < 960 && geometry.zones[1].x >= 960, 'A left / B right');
    if (geometry.minTarget !== null) assert(geometry.minTarget >= 56, 'touch targets >=56px');
    if (capture) { const image = await page.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await writeFile(path.join(out, `${profile}-stage${stage}-post${n + 1}-${suffix}.png`), Buffer.from(image.data, 'base64')); }
  }
}
try {
  const targets = await waitFor(async () => { try { return await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json()); } catch { return []; } }, a => a.filter(t => t.url.includes('/tablet/')).length === 5, 'five Chromium tablets', 20000);
  for (let post = 1; post <= 5; post++) pages.push(await cdp(targets.find(t => t.url.includes(`post=${post}`))));
  await Promise.all(pages.map((p, n) => waitFor(() => p.snapshot, s => s?.post === n + 1, 'browser tablet assignment')));
  for (const profile of PROFILES.filter(p => !process.env.NAVA_QA_PROFILE || p === process.env.NAVA_QA_PROFILE)) {
    await h.select(profile);
    const show = (await h.api('/api/show')).body;
    const subtitleCue = show.cues.filter(c => c.kind === 'voice' && !c.manual).sort((a, b) => (b.text?.ro?.length || 0) - (a.text?.ro?.length || 0))[0];
    for (let post = 1; post <= 5; post++) assert.equal((await h.api('/api/mission/accessibility', { post, settings: { textScale: 1.3, reducedMotion: true, contrastMode: post === 5 } })).status, 200);
    await h.command({ action: 'start' });
    for (let stage = 1; stage <= 3; stage++) {
      await h.command({ action: 'seek', time: WINDOWS[profile][stage - 1] });
      await Promise.all(pages.map(p => waitFor(() => p.snapshot, s => s?.scenarioId === profile && s.stage === stage, 'live stage')));
      // Real manual cue dispatch exercises the subtitle component during the active controls.
      await h.command({ action: 'fireCue', cueId: subtitleCue.id });
      await Promise.all(pages.map(p => waitFor(() => p.evaluate(`!document.querySelector('#subtitle').classList.contains('hidden')`), Boolean, 'live subtitle')));
      await review(profile, stage, 'initial');
      for (const page of pages) for (const zone of ['A', 'B']) {
        if (zone === 'B') await page.evaluate(`document.querySelector('.mission-zone[data-zone="A"] h2')?.focus()`);
        if (profile === 'age-5-10') { if (stage === 1) await press(page, `shape:${page.snapshot.view.zones[zone].items[0].label}`, zone); else if (stage === 2) { await press(page, 'select', zone); await press(page, 'fit', zone); } else await press(page, 'link', zone); }
        else if (profile === 'age-10-15') { if (stage === 1) await press(page, 'far', zone); else if (stage === 2) { await press(page, 'measure:0', zone); for (const n of zone === 'A' ? [1, 3, 2] : [3, 1, 2]) await press(page, `piece:${n}`, zone); await press(page, 'send', zone); } else { await press(page, 'relay', zone); await press(page, 'attach:repeated', zone); } }
        else if (profile === 'age-15-18') await press(page, stage === 1 ? zone === 'A' ? 'execute' : 'conflict' : stage === 2 ? zone === 'A' ? 'agree' : 'conflict' : zone === 'A' ? 'propose' : 'keep', zone);
        else await press(page, stage === 1 ? zone === 'A' ? 'wide' : 'fine' : stage === 2 ? zone === 'A' ? 'protect' : 'passive' : zone === 'A' ? 'observation' : 'probe', zone);
        if (zone === 'B') assert.equal(await page.evaluate(`document.activeElement.closest('.mission-zone')?.dataset.zone`), 'A', 'B updates preserve independent A keyboard focus');
      }
      await review(profile, stage, 'confirmed');
    }
    await h.command({ action: 'epilogue' });
    await Promise.all(pages.map(p => waitFor(() => p.snapshot, s => s?.state.state === 'epilogue', 'epilogue')));
    await review(profile, 0, 'summary');
    const certificates = await waitFor(async () => (await h.api('/api/certificates')).body, b => b.runs?.some(r => r.files.length === 5), 'five actual rendered certificates');
    assert(certificates.runs.length > 0);
    await h.command({ action: 'restart' });
  }
  for (const p of pages) assert.deepEqual(p.errors, [], 'browser runtime exceptions');
  await writeFile(path.join(out, `browser-review${process.env.NAVA_QA_PROFILE ? '-' + process.env.NAVA_QA_PROFILE : ''}.json`), JSON.stringify({ checkedAt: new Date().toISOString(), kind: 'real-browser-http-ws', subtitleStress: 'longest unconditional real cue manually dispatched during each interaction', independentFocus: 'B updates preserve A focus', reviews }, null, 2));
  console.log(`Browser review passed: ${reviews.length} tablet states. Captures: ${out}`);
} finally {
  for (const p of pages) p.ws.close(); child.stdin.write('close');
  await new Promise(resolve => { const timer = setTimeout(() => { child.kill(); resolve(); }, 5000); child.once('exit', () => { clearTimeout(timer); resolve(); }); });
  await h.close(); await rm(temp, { recursive: true, force: true });
}
