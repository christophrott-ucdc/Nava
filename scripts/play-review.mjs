#!/usr/bin/env node
/** Direct gesture QA: real Electron surfaces, real Hono/WS, real SQLite and production show packs.
 * Controlled seeks keep each short show window open while its alternative inputs are inspected.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { cp, mkdtemp, mkdir, writeFile, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import * as esbuild from 'esbuild';
import WebSocket from 'ws';
import { ROOT, PROFILES, WINDOWS, createHarness, waitFor } from './smoke-scenarios.mjs';

const require = createRequire(import.meta.url), temp = await mkdtemp(path.join(os.tmpdir(), 'nava-play-review-'));
const out = path.join(ROOT, 'runs/debug/play-experience'); await mkdir(out, { recursive: true });
await cp(path.join(ROOT, 'src/web/tablet'), path.join(temp, 'web/tablet'), { recursive: true });
await cp(path.join(ROOT, 'src/web/shared'), path.join(temp, 'web/shared'), { recursive: true });
await esbuild.build({ entryPoints: [path.join(ROOT, 'src/web/tablet/index.ts')], outfile: path.join(temp, 'web/tablet/app.js'), bundle: true, platform: 'browser', format: 'iife', logLevel: 'warning' });
const h = await createHarness({ webDir: path.join(temp, 'web'), connectTablets: false });
const probe = net.createServer(); await new Promise(r => probe.listen(0, '127.0.0.1', r)); const port = probe.address().port; await new Promise(r => probe.close(r));
const main = path.join(temp, 'browser.cjs');
await writeFile(main, `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(temp)});const windows=[];app.whenReady().then(async()=>{for(let post=1;post<=5;post++){const w=new BrowserWindow({width:1920,height:1080,useContentSize:true,show:true,x:0,y:0,webPreferences:{partition:'play-post-'+post,offscreen:false,backgroundThrottling:false,contextIsolation:true,sandbox:true}});windows.push(w);await w.loadURL(${JSON.stringify(h.base)}+'/tablet/?post='+post);}});process.stdin.on('data',()=>app.quit());`);
const child = spawn(require('electron'), [`--remote-debugging-port=${port}`, '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', main], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
let stderr = ''; child.stderr.on('data', data => { stderr += String(data); });
const pages = [], reviews = [], behaviors = [], themes = [];
const subtitleStress = process.env.NAVA_QA_STRESS === '1';
const pause = ms => new Promise(r => setTimeout(r, ms));
async function cdp(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  let serial = 0, snapshot = null, lastAck = null; const pending = new Map(), errors = [];
  ws.on('message', raw => {
    const m = JSON.parse(String(raw));
    if (m.id) { const p = pending.get(m.id); if (!p) return; pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
    if (m.method === 'Network.webSocketFrameReceived') { try { const frame = JSON.parse(m.params.response.payloadData); if (frame.type === 'mission') snapshot = frame.snapshot; if (frame.type === 'missionAck') lastAck = frame; } catch {} }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text);
  });
  function call(method, params = {}) { return new Promise((resolve, reject) => { const id = ++serial; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP ${method} timeout`)); }, 12000); pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params })); }); }
  const page = { ws, errors, call, get snapshot() { return snapshot; }, get lastAck() { return lastAck; }, async evaluate(expression) { const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; } };
  await call('Network.enable'); await call('Runtime.enable'); await call('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false }); await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] }); await call('Page.reload'); return page;
}
const within = (zone, selector) => `.play-panel[data-zone="${zone}"] ${selector}`;
async function center(page, selector) {
  const point = await page.evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled||n.getAttribute('aria-disabled')==='true')return null;const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height};})()`);
  assert(point && point.width > 0 && point.height > 0, `visible enabled target ${selector}`); return { x: point.x, y: point.y };
}
async function settled(page, revision, label) {
  await waitFor(() => page.snapshot, s => s.revision > revision, label);
  await waitFor(() => page.evaluate(`![...document.querySelectorAll('.play-feedback')].some(n=>n.textContent==='Trimitem…')`), Boolean, 'ACK reflected in controls');
  assert.equal(page.lastAck?.ok, true, `${label}: ${JSON.stringify(page.lastAck)}`);
}
async function click(page, zone, selector, commit = true) {
  const revision = page.snapshot.revision, pt = await center(page, within(zone, selector));
  await page.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...pt, button: 'left', clickCount: 1 });
  await page.call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...pt, button: 'left', clickCount: 1 });
  if (commit) await settled(page, revision, selector); else await page.evaluate('new Promise(r=>requestAnimationFrame(r))');
}
async function drag(page, zone, fromSelector, toSelector, commit = true) {
  const revision = page.snapshot.revision, from = await center(page, within(zone, fromSelector)), to = await center(page, within(zone, toSelector));
  await page.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...from, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 5; i++) await page.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x + (to.x - from.x) * i / 5, y: from.y + (to.y - from.y) * i / 5, button: 'left', buttons: 1 });
  await page.call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...to, button: 'left', clickCount: 1 });
  if (commit) await settled(page, revision, `drag ${fromSelector}`); else { await pause(40); assert.equal(page.snapshot.revision, revision, 'local rearrangement does not advance server state'); }
}
async function range(page, zone, angle) {
  const revision = page.snapshot.revision;
  await page.evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(within(zone, 'input[data-play="play:tune"]'))});n.value=${angle};n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await settled(page, revision, 'antenna setting');
}
async function capture(page, name) {
  await page.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  const shot = await page.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await writeFile(path.join(out, name + '.png'), Buffer.from(shot.data, 'base64'));
}
async function keyboardAndPeerGesture() {
  const page = pages[0], a = page.snapshot.view.zones.A.play, b = page.snapshot.view.zones.B.play;
  const wrongA = a.candidates.find(s => s !== a.shape), wrongB = b.candidates.find(s => s !== b.shape);
  const selectorA = within('A', `[data-play="play:match:${wrongA}"]`), selectorB = within('B', `[data-play="play:match:${wrongB}"]`);
  let revision = page.snapshot.revision;
  await page.evaluate(`document.querySelector(${JSON.stringify(selectorA)}).focus()`);
  await page.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await page.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await settled(page, revision, 'SVG Enter activates a trial'); assert.equal(page.snapshot.view.zones.A.play.solved, false);
  const from = await center(page, selectorA);
  await page.evaluate(`(()=>{window.navaHeldElement=document.querySelector(${JSON.stringify(selectorA)});window.navaHeldElement.addEventListener('pointerdown',e=>window.navaHeldPointer=e.pointerId,{once:true});})()`);
  await page.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...from, button: 'left', clickCount: 1 });
  await page.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x + 35, y: from.y + 20, button: 'left', buttons: 1 });
  const transform = await page.evaluate('window.navaHeldElement.getAttribute("transform")');
  revision = page.snapshot.revision;
  await page.evaluate(`document.querySelector(${JSON.stringify(selectorB)}).dispatchEvent(new MouseEvent('click',{bubbles:true,detail:0}))`);
  await settled(page, revision, 'other side completes an independent trial during held pointer');
  const preserved = await page.evaluate(`({same:window.navaHeldElement===document.querySelector(${JSON.stringify(selectorA)}),transform:window.navaHeldElement.getAttribute('transform'),captured:window.navaHeldElement.closest('svg').hasPointerCapture(window.navaHeldPointer)})`);
  assert.equal(preserved.same, true); assert.equal(preserved.transform, transform); assert.equal(preserved.captured, true);
  await page.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: from.x + 35, y: from.y + 20, button: 'left', clickCount: 1 });
  behaviors.push({ svgEnter: true, peerSnapshotDuringHeldPointer: preserved });
}
async function review(profile, stage, suffix) {
  for (const [index, page] of pages.entries()) {
    const geometry = await page.evaluate(`(()=>({viewport:[innerWidth,innerHeight],visible:document.visibilityState,zones:[...document.querySelectorAll('.play-panel')].map(e=>({zone:e.dataset.zone,kind:e.dataset.kind,rect:e.getBoundingClientRect().toJSON(),text:e.innerText})),overflows:[...document.querySelectorAll('#interaction,.mission-pair,.play-panel,.play-host')].filter(e=>e.scrollHeight>e.clientHeight+3||e.scrollWidth>e.clientWidth+3).map(e=>({class:e.className,client:[e.clientWidth,e.clientHeight],scroll:[e.scrollWidth,e.scrollHeight]})),bodyOverflow:document.documentElement.scrollHeight>innerHeight+2,oldFigures:document.querySelectorAll('.play-panel .education-figure').length,art:[...document.querySelectorAll('.young-toy-scene,.older-scene')].map(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,paths:e.querySelectorAll('path,circle,rect').length})),smallTargets:[...document.querySelectorAll('.play-panel button,.play-panel summary')].filter(e=>e.getBoundingClientRect().height>0&&e.getBoundingClientRect().height<63).map(e=>({label:e.textContent,height:e.getBoundingClientRect().height}))}))()`);
    geometry.smallSvgTargets = await page.evaluate(`(()=>[...document.querySelectorAll('.play-panel svg [role=button]')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&(r.width<63||r.height<63)}).map(e=>({label:e.getAttribute('aria-label'),rect:e.getBoundingClientRect().toJSON()})))()`);
    geometry.coveredButtons = await page.evaluate(`(()=>[...document.querySelectorAll('.play-panel button')].filter(e=>{if(e.disabled)return false;const r=e.getBoundingClientRect();if(!r.width||!r.height)return false;const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return !top||(!e.contains(top)&&e!==top)}).map(e=>e.textContent))()`);
    reviews.push({ profile, stage, suffix, post: index + 1, ...geometry });
    await capture(page, `${geometry.overflows.length || geometry.bodyOverflow ? 'FAIL-' : ''}${profile}-stage${stage}-post${index + 1}-${suffix}`);
    assert.deepEqual(geometry.viewport, [1920, 1080]); assert.equal(geometry.visible, 'visible'); assert.equal(geometry.zones.length, 2);
    assert(geometry.zones[0].rect.x < 960 && geometry.zones[1].rect.x >= 960, 'A left, B right');
    assert.deepEqual(geometry.overflows, [], `${profile}/${stage}/${index + 1}/${suffix} overflow`); assert.equal(geometry.bodyOverflow, false);
    assert.equal(geometry.oldFigures, 0); assert.equal(geometry.art.length, 2); assert(geometry.art.every(a => a.width > 400 && a.height > 180 && a.paths >= 5), 'both interactive instruments occupy real screen area');
    assert.deepEqual(geometry.smallTargets, [], 'HTML touch targets at least64px');
    assert.deepEqual(geometry.smallSvgTargets, [], 'SVG touch targets at least64px in both dimensions');
    assert.deepEqual(geometry.coveredButtons, [], 'subtitle and overlays leave active buttons reachable');
    for (const zone of ['A', 'B']) assert(geometry.zones.find(z => z.zone === zone).text.includes(page.snapshot.view.zones[zone].play.instruction), 'current task is readable');
  }
}
async function restoreStage(profile, stage) {
  const instances = pages.map(p => p.snapshot.cueInstanceId);
  await h.command({ action: 'seek', time: WINDOWS[profile][stage - 1] });
  await Promise.all(pages.map((p, i) => waitFor(() => p.snapshot, s => s?.scenarioId === profile && s.stage === stage && !s.suspended && s.cueInstanceId !== instances[i], 'live play stage')));
}
async function themeAudit(profile) {
  for (const theme of ['prologue', 'launch', 'light', 'nature', 'tech', 'void', 'home', 'white']) {
    const result = await pages[0].evaluate(`(()=>{document.documentElement.dataset.theme=${JSON.stringify(theme)};document.body.dataset.theme=${JSON.stringify(theme)};return {theme:document.documentElement.dataset.theme,panels:[...document.querySelectorAll('.play-panel')].map(e=>({color:getComputedStyle(e).color,background:getComputedStyle(e).backgroundColor})),titles:[...document.querySelectorAll('.play-instruction')].map(e=>getComputedStyle(e).fontSize)};})()`);
    assert.equal(result.panels.length, 2); themes.push({ profile, ...result });
    if (profile === 'age-5-10') await capture(pages[0], `theme-${theme}`);
  }
}
async function effectsAndMotion() {
  const page = pages[0];
  for (const p of pages) {
    const effects = await p.evaluate('window.navaPlayQaEffects');
    assert.equal(effects.confirm - p.effectsBefore.confirm, 2, 'one sound per new A/B solved circuit');
    const flags = await p.evaluate(`({osReduce:matchMedia('(prefers-reduced-motion: reduce)').matches,operatorMotion:document.body.dataset.missionMotion,operatorQuiet:document.body.dataset.missionQuiet})`);
    assert.equal(effects.confetti - p.effectsBefore.confetti, 24, 'one12-piece confetti burst per solved circuit; ' + JSON.stringify(flags));
  }
  const before = await page.evaluate('window.navaPlayQaEffects');
  for (let n = 0; n < 4; n++) await click(page, 'A', 'button[data-play="play:wire:0"]');
  await pause(50); assert.deepEqual(await page.evaluate('window.navaPlayQaEffects'), before, 'reopening and reconnecting a solved circuit never repeats reward');
  await page.call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  assert.equal(await page.evaluate(`getComputedStyle(document.querySelector('.toy-current')).animationName`), 'none', 'OS preference stops decorative current');
  await page.call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  assert.equal((await h.api('/api/mission/accessibility', { post: 1, settings: { textScale: 1.3, reducedMotion: true } })).status, 200);
  await waitFor(() => page.evaluate(`document.querySelector('.young-toy')?.dataset.quiet`), s => s === 'true', 'operator reduced motion arrives');
  assert.equal(await page.evaluate(`getComputedStyle(document.querySelector('.toy-current')).animationName`), 'none');
  await capture(page, 'reduced-motion');
  behaviors.push({ effects: 'one confirmation sound and12 confetti pieces per new solved side; no repeat on replay', osReducedMotion: true, operatorReducedMotion: true });
}
async function shutterPause() {
  const page = pages[0];
  await restoreStage('adults', 2);
  await click(page, 'A', '[data-value="play:shield:protect"]');
  await pause(200); await h.command({ action: 'pause' });
  await waitFor(() => page.evaluate(`document.querySelector('.play-panel[data-zone="A"]').dataset.blocked`), s => s === 'true', 'pause blocks instrument');
  const frozen = await page.evaluate(`Number(document.querySelector('.play-panel[data-zone="A"] .older-toy').dataset.animationMs)`);
  assert(Number.isFinite(frozen) && frozen < 1000, 'three second animation genuinely began');
  await pause(600);
  assert.equal(await page.evaluate(`Number(document.querySelector('.play-panel[data-zone="A"] .older-toy').dataset.animationMs)`), frozen, 'show pause freezes shutter duration');
  await capture(page, 'adults-shutter-paused');
  await h.command({ action: 'play' }); await pause(3100);
  assert.equal(await page.evaluate(`document.querySelector('.play-panel[data-zone="A"] .older-toy').dataset.running`), 'false');
  assert.equal(await page.evaluate(`document.querySelector('.play-panel[data-zone="A"] .older-toy').dataset.gapCount`), '3');
  behaviors.push({ shutter: 'three real seconds, pause freezes elapsed time, replay spends no further credit', frozenAtMs: frozen });
}
async function playStage(profile, stage) {
  for (const page of pages) for (const zone of ['A', 'B']) {
    let v = page.snapshot.view.zones[zone].play;
    if (profile === 'age-5-10') {
      if (stage === 1) {
        await click(page, zone, `[data-play="play:match:${v.candidates.find(s => s !== v.shape)}"]`);
        assert.equal(page.snapshot.view.zones[zone].play.solved, false, 'wrong piece is a saved trial, not a success');
        await click(page, zone, `[data-play="play:match:${v.shape}"]`);
      } else if (stage === 2) {
        if (v.shape !== 'Cerc') { await drag(page, zone, '.young-toy-scene [data-play="play:rotate"]', '.young-toy-scene [data-play="play:fit"]'); assert.equal(page.snapshot.view.zones[zone].play.solved, false, 'misaligned drop can be retried'); }
        for (let turn = 0; v.shape !== 'Cerc' && page.snapshot.view.zones[zone].play.rotation !== 0 && turn < 4; turn++) await click(page, zone, 'button[data-play="play:rotate"]');
        await drag(page, zone, '.young-toy-scene [data-play="play:rotate"]', '.young-toy-scene [data-play="play:fit"]');
      } else {
        await click(page, zone, 'button[data-play="play:wire:0"]'); assert.equal(page.snapshot.view.zones[zone].play.wireConnected, false);
        await click(page, zone, 'button[data-play="play:wire:1"]'); assert.equal(page.snapshot.view.zones[zone].play.wireConnected, true);
      }
      assert.equal(page.snapshot.view.zones[zone].play.solved, true);
    } else if (profile === 'age-10-15') {
      if (stage === 1) { await range(page, zone, v.targetAngle); await click(page, zone, 'button[data-play="play:hypothesis:far"]'); }
      if (stage === 2) {
        await range(page, zone, v.targetAngle > 0 ? -60 : 60);
        await click(page, zone, 'button[data-play="play:signal"]'); assert.equal(page.snapshot.view.zones[zone].play.records.at(-1).received, null);
        await range(page, zone, v.targetAngle);
        await click(page, zone, 'button[data-play="play:signal"]');
        await drag(page, zone, '[data-play="draft:beat:0"]', '[data-play="draft:beat:2"]', false);
        await click(page, zone, 'button[data-play="play:signal"]');
        v = page.snapshot.view.zones[zone].play; assert.equal(v.solved, true); assert.notDeepEqual(v.records.at(-1).input, v.records.at(-2).input); assert.deepEqual(v.records.at(-1).received, v.records.at(-1).input);
      }
      if (stage === 3) { await drag(page, zone, '[data-play="draft:record:1"]', '[data-play="play:conclude:relay"]'); assert.equal(page.snapshot.view.zones[zone].play.verdict, 'relay'); }
    } else if (profile === 'age-15-18') {
      if (stage !== 2) await click(page, zone, `[data-value="play:rule:${stage === 1 ? zone === 'A' ? 'execute' : 'conflict' : zone === 'A' ? 'propose' : 'always'}"]`);
      if (stage >= 2) {
        await click(page, zone, '[data-value="play:pilot:agree"]'); await click(page, zone, '[data-value="play:pilot:conflict"]');
        v = page.snapshot.view.zones[zone].play; assert.equal(v.decision, stage === 2 ? 'confirm' : 'propose');
      }
    } else {
      if (stage === 1) {
        const revision = page.snapshot.revision;
        await click(page, zone, `.older-scan-modes .older-button:nth-child(${zone === 'A' ? 1 : 2})`, false); assert.equal(page.snapshot.revision, revision, 'choosing a scan mode is free local preview');
        const before = page.snapshot.revision;
        await page.evaluate(`document.querySelector(${JSON.stringify(within(zone, '.older-scan-window'))}).focus()`);
        await page.call('Input.dispatchKeyEvent', { type: 'keyDown', key: zone === 'A' ? 'Home' : 'End', code: zone === 'A' ? 'Home' : 'End', windowsVirtualKeyCode: zone === 'A' ? 36 : 35 });
        await page.call('Input.dispatchKeyEvent', { type: 'keyUp', key: zone === 'A' ? 'Home' : 'End', code: zone === 'A' ? 'Home' : 'End' });
        await settled(page, before, 'scanner target'); assert.equal(page.snapshot.view.zones[zone].play.credits, 2);
        await click(page, zone, '[data-play-action="scan"]');
        v = page.snapshot.view.zones[zone].play; assert.equal(v.credits, zone === 'A' ? 1 : 0); assert.equal(v.documents[0].values.filter(n => n !== null).length, zone === 'A' ? 9 : 3);
      }
      if (stage === 2) {
        await click(page, zone, `[data-value="play:shield:${zone === 'A' ? 'protect' : 'passive'}"]`);
        v = page.snapshot.view.zones[zone].play; const doc = v.documents.find(d => d.id === 'probe');
        assert.equal(doc.values.filter(n => n === null).length, zone === 'A' ? 3 : 0); assert.equal(doc.uncertainty.filter(Boolean).length, zone === 'A' ? 0 : 3);
      }
      if (stage === 3) { await drag(page, zone, `[data-document="${zone === 'A' ? 'observation' : 'probe'}"]`, '.older-capsule'); assert.equal(page.snapshot.view.zones[zone].play.selectedDocument, zone === 'A' ? 'observation' : 'probe'); }
    }
  }
}
try {
  const targets = await waitFor(async () => { try { return await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { return []; } }, list => list.filter(t => t.url.includes('/tablet/')).length === 5, 'five real browser surfaces');
  for (let post = 1; post <= 5; post++) pages.push(await cdp(targets.find(t => t.url.includes(`post=${post}`))));
  await Promise.all(pages.map((p, n) => waitFor(() => p.snapshot, s => s?.post === n + 1, 'tablet assigned')));
  for (const page of pages) await page.evaluate(`(()=>{window.navaPlayQaEffects={confirm:0,confetti:0};const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(...args){if(this.src.endsWith('/sfx/confirm.mp3'))window.navaPlayQaEffects.confirm++;return play.apply(this,args)};new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes)if(n.nodeType===1&&n.tagName==='I'&&n.style.zIndex==='999')window.navaPlayQaEffects.confetti++}).observe(document.body,{childList:true});})()`);
  for (const profile of PROFILES.filter(p => !process.env.NAVA_QA_PROFILE || p === process.env.NAVA_QA_PROFILE)) {
    await h.select(profile);
    const show = (await h.api('/api/show')).body;
    const subtitleCue = show.cues.filter(c => c.kind === 'voice' && !c.manual).sort((a, b) => (b.text?.ro?.length || 0) - (a.text?.ro?.length || 0))[0];
    for (let post = 1; post <= 5; post++) assert.equal((await h.api('/api/mission/accessibility', { post, settings: { textScale: 1.3, reducedMotion: false, contrastMode: post === 5 } })).status, 200);
    await h.command({ action: 'start' });
    for (let stage = 1; stage <= 3; stage++) {
      await restoreStage(profile, stage); if (!subtitleStress) await review(profile, stage, 'before');
      if (stage === 1 && !subtitleStress) await themeAudit(profile);
      await restoreStage(profile, stage);
      if (profile === 'age-5-10' && stage === 1) await keyboardAndPeerGesture();
      if (profile === 'age-5-10' && stage === 3) for (const page of pages) page.effectsBefore = await page.evaluate('window.navaPlayQaEffects');
      let mutedEffects;
      if (profile === 'age-5-10' && stage === 2) {
        await h.command({ action: 'tabletSfx', enabled: false });
        await Promise.all(pages.map(p => waitFor(() => p.snapshot, s => s.state.tabletSfx === false, 'operator mute arrives')));
        mutedEffects = await Promise.all(pages.map(p => p.evaluate('window.navaPlayQaEffects.confirm')));
      }
      await playStage(profile, stage);
      if (mutedEffects) {
        assert.deepEqual(await Promise.all(pages.map(p => p.evaluate('window.navaPlayQaEffects.confirm'))), mutedEffects, 'operator mute suppresses confirmation audio during actual successful drops');
        await h.command({ action: 'tabletSfx', enabled: true });
        await Promise.all(pages.map(p => waitFor(() => p.snapshot, s => s.state.tabletSfx === true, 'operator unmutes')));
        behaviors.push({ tabletSfx: 'operator mute reaches all five tablets; successful fits play no confirmation; unmute restored before circuit reward' });
      }
      if (profile === 'age-5-10' && stage === 3) await effectsAndMotion();
      if (profile === 'age-15-18' && stage >= 2) { await capture(pages[4], `${profile}-stage${stage}-during`); await pause(2200); }
      if (profile === 'adults' && stage === 2) {
        await capture(pages[4], 'adults-shutter-during');
        await pause(3300);
        for (const page of pages) assert.equal(await page.evaluate(`document.querySelector('.play-panel[data-zone="A"] .older-toy').dataset.running`), 'false', 'real shutter demonstration ends after three seconds');
        await shutterPause();
      }
      if (subtitleStress) {
        await restoreStage(profile, stage);
        await h.command({ action: 'fireCue', cueId: subtitleCue.id });
        await Promise.all(pages.map(p => waitFor(() => p.evaluate(`!document.querySelector('#subtitle').classList.contains('hidden')`), Boolean, 'real longest subtitle visible')));
        await review(profile, stage, 'subtitle');
      } else await review(profile, stage, 'after');
      behaviors.push({ profile, stage, tenZonesPlayed: true, directGestures: true });
    }
    const page = pages[0], saved = structuredClone(page.snapshot.view), runId = page.snapshot.runId;
    const persisted = (await h.api('/api/runs/' + runId + '/summary')).body.progress;
    assert(Object.values(persisted.zones).every(z => z.play?.version === 1), 'ten independently persisted direct-play states');
    await page.call('Page.reload'); await waitFor(() => page.snapshot, s => s?.runId === runId && s.view, 'reload current run');
    await waitFor(() => page.evaluate(`document.querySelectorAll('.play-panel').length`), n => n === 2, 'restored boards');
    assert.deepEqual(page.snapshot.view, saved, 'reload restores exact authoritative results');
    behaviors.push({ profile, reloadRestoredExactView: true, sqliteTenZones: true });
    const epoch = page.snapshot.serverEpoch;
    await h.restartServer();
    const recovery = await h.api('/api/recovery');
    assert.equal(recovery.body.pending, true); assert.equal(recovery.body.mission.runId, runId); assert.equal(recovery.body.mission.suspended, true);
    assert.notEqual(recovery.body.mission.serverEpoch, epoch);
    assert.deepEqual((await h.api('/api/runs/' + runId + '/summary')).body.progress, persisted, 'cold SQLite restart restores every exact experiment');
    for (const [index, p] of pages.entries()) await p.call('Page.navigate', { url: h.base + '/tablet/?post=' + (index + 1) });
    await Promise.all(pages.map(p => waitFor(() => p.snapshot, s => s?.runId === runId && s.serverEpoch !== epoch, 'browser reconnects to recovered host')));
    assert.equal((await h.api('/api/recovery/resume', {})).status, 200);
    behaviors.push({ profile, coldSqliteRestore: true, suspendedUntilResume: true });
    await h.command({ action: 'restart' });
  }
  for (const page of pages) assert.deepEqual(page.errors, [], 'browser exceptions');
  const files = (await readdir(out)).filter(n => n.endsWith('.png') && !n.startsWith('FAIL-')).sort();
  await writeFile(path.join(out, subtitleStress ? 'review-subtitle-stress.json' : process.env.NAVA_QA_PROFILE ? `review-${process.env.NAVA_QA_PROFILE}.json` : 'review.json'), JSON.stringify({ checkedAt: new Date().toISOString(), scope: 'Real native Electron, Hono/WS and SQLite. Controlled seeks allow exhaustive input inspection within short stage windows. Hardware performance and public playtesting are separate.', subtitleStress, reviews, behaviors, themes }, null, 2));
  await writeFile(path.join(out, 'index.html'), '<!doctype html><html lang="ro"><meta charset="utf-8"><title>Jocuri interactive · Nava</title><style>body{margin:32px;background:#edf3f7;color:#152c40;font:16px system-ui}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(460px,1fr));gap:24px}figure{margin:0;background:white;border-radius:16px;padding:12px}img{width:100%}figcaption{padding:10px;overflow-wrap:anywhere}a{color:#185f7c}</style><h1>Jocuri interactive · verificare reală</h1><p>Cinci posturi, zonele A și B, 1920 × 1080, text mărit la 130%. Capturi înaintea și după gesturi executate în browser.</p><p>Galerie actualizată: ' + new Date().toISOString() + '. <a href="review.json">Raportul verificării complete</a> · <a href="review-subtitle-stress.json">Raportul verificării cu subtitrări</a>.</p><p>Capturile „subtitle” declanșează manual cea mai lungă replică pentru verificarea spațiului; nu reprezintă ordinea spectacolului. Fișierele FAIL și failure.json păstrează diagnostice istorice și sunt excluse din galerie.</p><main>' + files.map(n => '<figure><a href="' + n + '"><img loading="lazy" src="' + n + '" alt="' + n + '"></a><figcaption>' + n + '</figcaption></figure>').join('') + '</main></html>');
  console.log(`Direct play review passed: ${reviews.length} tablet states; ${behaviors.length} behavior reports. ${out}`);
} catch (error) {
  await writeFile(path.join(out, 'failure.json'), JSON.stringify({ message: String(error), stack: error.stack, reviews, behaviors, stderr }, null, 2));
  for (const [n, page] of pages.entries()) { try { await capture(page, 'FAIL-current-post' + (n + 1)); } catch {} }
  throw error;
} finally {
  for (const page of pages) page.ws.close(); child.stdin.write('close');
  await new Promise(resolve => { const timer = setTimeout(() => { child.kill(); resolve(); }, 5000); child.once('exit', () => { clearTimeout(timer); resolve(); }); });
  await h.close(); assert(path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep + 'nava-play-review-')); await rm(temp, { recursive: true, force: true, maxRetries: 30, retryDelay: 100 });
}
