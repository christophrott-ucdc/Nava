#!/usr/bin/env node
/** Focused EXODUS7 branding review. Real Electron renderer, configured film/GLB,
 * isolated loopback server and SQLite. Does not operate the live installation.
 * The panorama fixture checks renderer geometry, not physical TV calibration.
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
import { ROOT, createHarness, waitFor } from './smoke-scenarios.mjs';

const require = createRequire(import.meta.url);
const temp = await mkdtemp(path.join(os.tmpdir(), 'nava-exodus-logo-'));
const out = path.join(ROOT, 'runs/debug/exodus-logo-tv');
const rendererDir = path.join(temp, 'dist/renderer');
const records = [], errors = [], loadingFailures = [];
let harness, child, ws, evaluate, childErrors = '';
const settle = () => new Promise(resolve => setTimeout(resolve, 180));

try {
  await mkdir(out, { recursive: true });
  await cp(path.join(ROOT, 'src/renderer'), rendererDir, { recursive: true });
  await cp(path.join(ROOT, 'src/web/shared'), path.join(rendererDir, 'shared'), { recursive: true });
  await cp(path.join(ROOT, 'node_modules/@met4citizen/talkinghead/modules/playback-worklet.js'), path.join(rendererDir, 'playback-worklet.js'));
  await esbuild.build({
    entryPoints: [path.join(ROOT, 'src/renderer/index.ts')], outfile: path.join(rendererDir, 'renderer.js'),
    bundle: true, platform: 'browser', format: 'iife', target: 'chrome130',
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.url': '__navaModuleUrl' },
    banner: { js: 'var __navaModuleUrl = document.baseURI;' }, alias: { three: 'three' }, logLevel: 'warning',
  });
  const screen = { id: 'center', displayIndex: 0, showAvatar: true, showSubtitles: true, showEntities: true, playAudio: true, kiosk: false };
  harness = await createHarness({ screens: [screen], tutorial: true, connectTablets: false });
  const config = JSON.parse(await readFile(path.join(ROOT, 'config.json'), 'utf8'));
  const videoUrl = pathToFileURL(path.resolve(ROOT, config.video.path)).href;
  const url = pathToFileURL(path.join(rendererDir, 'index.html'));
  url.search = new URLSearchParams({
    screen: 'center', role: 'master', dev: '0', ws: harness.base.replace('http:', 'ws:') + '/ws',
    video: videoUrl, glb: pathToFileURL(path.resolve(ROOT, config.avatar.glb)).href,
    voice: pathToFileURL(path.join(ROOT, 'assets/voice') + path.sep).href,
    show: pathToFileURL(path.resolve(ROOT, config.show)).href,
  }).toString();
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const main = path.join(temp, 'renderer-main.cjs');
  await writeFile(main, `const {app,BrowserWindow}=require('electron');
app.setPath('userData',${JSON.stringify(path.join(temp, 'electron-data'))});
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
let window;app.whenReady().then(async()=>{window=new BrowserWindow({width:1920,height:1080,useContentSize:true,show:false,webPreferences:{offscreen:true,backgroundThrottling:false,autoplayPolicy:'no-user-gesture-required',contextIsolation:true,sandbox:true}});await window.loadURL(${JSON.stringify(url.href)});});
process.stdin.on('data',()=>app.quit());`);
  const electronEnv = { ...process.env };
  delete electronEnv.ELECTRON_RUN_AS_NODE;
  child = spawn(require('electron'), [`--remote-debugging-port=${port}`, main], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env: electronEnv });
  child.stderr.on('data', value => { childErrors += String(value); });
  const targets = await waitFor(async () => {
    try { return await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json()); } catch { return []; }
  }, value => value.some(target => target.url.includes('index.html')), 'Electron renderer target', 20000);
  ws = new WebSocket(targets.find(target => target.url.includes('index.html')).webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  let serial = 0;
  const pending = new Map();
  ws.on('message', raw => {
    const message = JSON.parse(String(raw));
    if (message.id) {
      const request = pending.get(message.id);
      if (request) { pending.delete(message.id); clearTimeout(request.timer); message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result); }
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (message.method === 'Network.loadingFailed' && !message.params.canceled) loadingFailures.push(message.params.errorText);
  });
  function call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++serial;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP ${method} timeout`)); }, 20000);
      pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
    });
  }
  evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  async function size(width, height) {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  }
  async function screenshot(name) {
    const result = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(path.join(out, name + '.png'), Buffer.from(result.data, 'base64'));
  }
  async function metrics() {
    return evaluate(`(()=>{
      const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
      const visible=e=>!!e&&e.getBoundingClientRect().width>0&&getComputedStyle(e).visibility==='visible'&&!e.closest('[hidden]');
      const logos=[...document.querySelectorAll('.exodus-brand')].map(e=>({className:e.getAttribute('class'),parent:e.parentElement.getAttribute('class'),visible:visible(e),rect:rect(e),viewBox:e.getAttribute('viewBox'),image:e.querySelector('image')?.getAttribute('href')}));
      const experience=document.querySelector('.experience-tv'),avatar=document.querySelector('#avatar'),transporter=avatar?.querySelector('.nava-transporter'),canvas=avatar?.querySelector('canvas'),subtitles=document.querySelector('#subtitles'),video=document.querySelector('#video');
      return {viewport:[innerWidth,innerHeight],logos,launchVisible:visible(document.querySelector('#launch-controls')),experience:{visible:visible(experience),final:experience?.classList.contains('experience-final')??false,zIndex:experience?getComputedStyle(experience).zIndex:null,overflow:experience?experience.scrollHeight>experience.clientHeight+1:false,rect:rect(experience),title:rect(experience?.querySelector('h1'))},avatar:{shown:transporter?.classList.contains('is-shown')??false,opacity:transporter?getComputedStyle(transporter).opacity:'0',canvas:[canvas?.width??0,canvas?.height??0],rect:rect(avatar)},subtitles:{shown:subtitles?.classList.contains('on')??false,text:subtitles?.innerText??'',rect:rect(subtitles)},video:{ready:video?.readyState??0,frames:video?.getVideoPlaybackQuality().totalVideoFrames??0},overflow:document.documentElement.scrollWidth>innerWidth+1};
    })()`);
  }
  async function imagesDecoded() {
    assert.equal(await evaluate(`Promise.all([...document.querySelectorAll('.exodus-brand image')].map(e=>new Promise(resolve=>{const image=new Image();image.onload=()=>resolve(image.naturalWidth===2172&&image.naturalHeight===724);image.onerror=()=>resolve(false);image.src=e.getAttribute('href');}))).then(results=>results.length>=3&&results.every(Boolean))`), true, 'shared branding asset decodes in every SVG');
  }
  function assertLogo(metric, parentClass) {
    const logo = metric.logos.find(entry => `${entry.parent} ${entry.className}`.includes(parentClass) && entry.visible);
    assert(logo, `visible ${parentClass} logo`);
    assert(logo.rect.width > 0 && logo.rect.height > 0);
    assert(logo.rect.x >= -1 && logo.rect.y >= -1 && logo.rect.right <= metric.viewport[0] + 1 && logo.rect.bottom <= metric.viewport[1] + 1, 'logo stays within viewport');
    assert.equal(logo.viewBox, '55 60 2070 562');
    assert.equal(metric.overflow, false);
    return logo;
  }
  async function capture(name, inspect) {
    await settle(); const metric = await metrics(); inspect(metric);
    await screenshot(name); records.push({ name, ...metric }); console.log(`${name}: PASS`);
    return metric;
  }
  const snapshot = async () => (await harness.api('/api/mission')).body;
  async function experience(action, extra = {}) {
    const result = await harness.api('/api/experience/control', { action, ...extra });
    assert.equal(result.status, 200, JSON.stringify(result.body)); return result.body;
  }
  await call('Page.enable'); await call('Network.enable'); await call('Runtime.enable');
  await call('Page.reload');
  await waitFor(async () => (await harness.api('/api/state')).body, state => state.readiness?.ready, 'real renderer readiness', 45000);
  await imagesDecoded();
  for (const [width, height] of [[1920, 1080], [1600, 900]]) {
    await size(width, height);
    await capture(`idle-${width}`, metric => { assert(metric.launchVisible); assertLogo(metric, 'launch-brand'); assert(!metric.experience.visible); });
  }
  await harness.select('adults');
  await waitFor(async () => (await harness.api('/api/state')).body, state => state.readiness?.ready, 'real adults voice package readiness', 45000);
  await experience('participants', { participants: ['1A', '1B'] });
  await experience('start');
  await waitFor(snapshot, state => state.experience?.active, 'authoritative tutorial active');
  await waitFor(metrics, metric => metric.experience.visible && !metric.launchVisible, 'tutorial renderer');
  await size(1920, 1080);
  await capture('tutorial-1920', metric => {
    const logo = assertLogo(metric, 'experience-brand'); assert(!metric.experience.final); assert(!metric.experience.overflow);
    assert(logo.rect.bottom <= metric.experience.title.y + 1, 'tutorial logo does not cover title');
  });
  await experience('skip');
  await harness.command({ action: 'start' });
  await harness.command({ action: 'seek', time: 70 });
  await waitFor(metrics, metric => !metric.launchVisible && !metric.experience.visible && metric.video.frames > 0, 'main film has no branding');
  await capture('playing-1920', metric => assert(metric.logos.every(logo => !logo.visible), 'opening/finale logos absent during film'));

  // Preserve the actual farewell cue, GLB and original subtitle; no cue/voice substitutes.
  await harness.command({ action: 'epilogue' });
  await harness.command({ action: 'seek', time: 57.5 });
  await size(3840, 2160);
  await waitFor(snapshot, state => state.experience?.finaleActive, 'authoritative finale active', 15000);
  await waitFor(metrics, metric => metric.experience.final && metric.experience.visible && metric.avatar.shown && metric.subtitles.shown && metric.subtitles.text.includes('Mulțumesc'), 'original farewell GLB and subtitle', 15000);
  for (const [width, height] of [[3840, 2160], [1600, 900]]) {
    await size(width, height);
    await capture(`finale-${width}`, metric => {
      const logo = assertLogo(metric, 'experience-brand');
      assert(metric.experience.visible && metric.experience.final); assert.equal(metric.experience.zIndex, '35'); assert(!metric.experience.overflow);
      assert(metric.avatar.shown && metric.avatar.canvas.every(value => value > 0), 'original GLB remains rendered');
      assert(metric.subtitles.shown && metric.subtitles.text.includes('Mulțumesc'), 'original farewell subtitle remains visible');
      assert(logo.rect.bottom <= metric.experience.title.y + 1, 'finale logo does not cover title');
      assert(logo.rect.bottom <= metric.subtitles.rect.y + 1, 'logo stays above original subtitles');
    });
  }
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const reducedMotion = await evaluate(`({logo:getComputedStyle(document.querySelector('.experience-brand .exodus-brand')).animationName,seats:[...document.querySelectorAll('.experience-seat b')].map(e=>({animation:getComputedStyle(e).animationName,transition:getComputedStyle(e).transitionDuration}))})`);
  assert.equal(reducedMotion.logo, 'none');
  assert(reducedMotion.seats.length > 0 && reducedMotion.seats.every(seat => seat.animation === 'none' && seat.transition === '0s'), 'reduced motion disables seat movement');
  records.push({ name: 'finale-reduced-motion', ...reducedMotion });
  await call('Emulation.setEmulatedMedia', { features: [] });
  await harness.command({ action: 'restart' });
  await waitFor(snapshot, state => state.state.state === 'idle' && !state.experience?.finaleActive, 'restart clears authoritative finale');
  await waitFor(metrics, metric => metric.launchVisible && !metric.experience.visible, 'restart clears visible finale');
  await capture('restart-1600', metric => { assertLogo(metric, 'launch-brand'); assert(!metric.experience.visible); });

  await harness.select('legacy-v3'); await experience('skip');
  await waitFor(async () => (await harness.api('/api/state')).body, state => state.readiness?.ready, 'legacy renderer readiness', 45000);
  const smoke = spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'npm run smoke:renderer'], {
    cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NAVA_CDP_PORT: String(port), NAVA_SERVER_PORT: new URL(harness.base).port, NAVA_TEST_PIN: '9384' },
  });
  let smokeOutput = '';
  for (const stream of [smoke.stdout, smoke.stderr]) stream.on('data', value => { smokeOutput += String(value); });
  const smokeExit = await new Promise((resolve, reject) => { smoke.once('error', reject); smoke.once('exit', resolve); });
  await writeFile(path.join(out, 'smoke-renderer.log'), smokeOutput);
  assert.equal(smokeExit, 0, 'mandatory smoke:renderer on isolated ports: ' + smokeOutput.slice(-1500));
  records.push({ name: 'smoke-renderer', command: 'npm run smoke:renderer', exitCode: smokeExit, isolatedServer: true, log: path.join(out, 'smoke-renderer.log') });
  console.log('smoke:renderer on isolated ports: PASS');

  // Independent panorama geometry fixture: same source HTML, CSS and createSpan.
  // It does not start another show or claim physical multi-monitor verification.
  const fixtureHtml = (await readFile(path.join(rendererDir, 'index.html'), 'utf8')).replace('src="renderer.js"', 'src="logo-wall-fixture.js"');
  await writeFile(path.join(rendererDir, 'logo-wall-fixture.html'), fixtureHtml);
  const ids = ['port-outer', 'port-inner', 'center', 'starboard-inner', 'starboard-outer'];
  const screens = ids.map((id, index) => ({ ...screen, id, displayIndex: index, showAvatar: id === 'center', showSubtitles: id === 'center', playAudio: false }));
  const viewports = ids.map((screenId, index) => ({ screenId, x: index * 1920, y: 0, width: 1920, height: 1080, scaleFactor: 1 }));
  const wall = { mode: 'panorama', fit: 'cover', focusX: .5, focusY: .5, calibration: false, panels: viewports.map(viewport => ({ screenId: viewport.screenId, x: viewport.x, y: viewport.y, width: viewport.width, height: viewport.height })) };
  await esbuild.build({
    stdin: { contents: `import {createSpan} from ${JSON.stringify(path.join(ROOT, 'src/renderer/span.ts'))};
const video=document.querySelector('#video');video.src=${JSON.stringify(videoUrl)};video.load();
const span=createSpan({stage:document.querySelector('#stage'),video,viewports:${JSON.stringify(viewports)},screens:${JSON.stringify(screens)},fit:'cover',centerScreenId:'center',overlays:[...document.querySelectorAll('#stage > .layer')],wall:${JSON.stringify(wall)}});
span.start();document.querySelector('#launch-controls').hidden=false;
window.logoWallReview={setCalibration:()=>span.setWall({...${JSON.stringify(wall)},calibration:true})};`, resolveDir: ROOT },
    outfile: path.join(rendererDir, 'logo-wall-fixture.js'), bundle: true, format: 'iife', platform: 'browser', target: 'chrome130', logLevel: 'warning',
  });
  await size(3840, 432);
  await call('Page.navigate', { url: pathToFileURL(path.join(rendererDir, 'logo-wall-fixture.html')).href });
  await waitFor(() => evaluate('!!window.logoWallReview'), Boolean, 'panorama fixture');
  await waitFor(() => evaluate('document.readyState === "complete" && document.querySelector("#video").readyState >= 2'), Boolean, 'real panorama frame decoded');
  await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  await settle();
  const panorama = await evaluate(`(()=>{const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};return{panels:document.querySelectorAll('.wall-panel').length,focus:rect(document.querySelector('#span-focus')),center:rect(document.querySelector('.wall-panel[data-screen="center"]')),logo:rect(document.querySelector('#launch-controls .exodus-brand')),insideFocus:!!document.querySelector('#span-content #launch-controls .exodus-brand'),overflow:document.documentElement.scrollWidth>innerWidth+1}})()`);
  assert.equal(panorama.panels, 5); assert(panorama.insideFocus); assert(!panorama.overflow);
  assert(Math.abs(panorama.focus.x - panorama.center.x) < 1 && Math.abs(panorama.focus.width - panorama.center.width) < 1, 'focus matches central panel');
  assert(panorama.logo.x >= panorama.center.x - 1 && panorama.logo.right <= panorama.center.right + 1 && panorama.logo.y >= panorama.center.y - 1 && panorama.logo.bottom <= panorama.center.bottom + 1, 'logo fits central panorama panel');
  await screenshot('panorama-3840'); records.push({ name: 'panorama-3840', fixture: true, ...panorama });
  await evaluate('window.logoWallReview.setCalibration()');
  await waitFor(() => evaluate('getComputedStyle(document.querySelector("#launch-controls .exodus-brand")).visibility'), value => value === 'hidden', 'calibration hides opening logo');
  await screenshot('panorama-calibration-3840'); records.push({ name: 'panorama-calibration-3840', fixture: true, brandingHidden: true });
  assert.deepEqual(errors, [], 'uncaught renderer exceptions');
  assert.deepEqual(harness.logs, [], 'isolated server errors');
  await writeFile(path.join(out, 'results.json'), JSON.stringify({
    passed: true, checkedAt: new Date().toISOString(), realElectron: true, realConfiguredFilmAndGlb: true,
    isolatedServer: true, records, errors, loadingFailures,
    limitations: ['Panorama and calibration are isolated renderer geometry checks; physical TV output is not verified.', 'This focused visual review does not repeat narration timing or game scenario suites.'],
  }, null, 2));
  console.log('EXODUS7 renderer branding review passed.');
} catch (error) {
  let metric = null;
  try { if (evaluate) metric = await evaluate('({url:location.href,viewport:[innerWidth,innerHeight],text:document.body.innerText})'); } catch {}
  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, 'failure.json'), JSON.stringify({ checkedAt: new Date().toISOString(), error: String(error.stack ?? error), records, errors, loadingFailures, childErrors, metric }, null, 2));
  throw error;
} finally {
  ws?.close();
  if (child && child.exitCode === null) {
    child.stdin.write('close');
    await new Promise(resolve => { const timer = setTimeout(() => { child.kill(); resolve(); }, 5000); child.once('exit', () => { clearTimeout(timer); resolve(); }); });
  }
  await harness?.close();
  const resolvedTemp = path.resolve(temp), resolvedParent = path.resolve(os.tmpdir()) + path.sep;
  assert(resolvedTemp.startsWith(resolvedParent) && path.basename(resolvedTemp).startsWith('nava-exodus-logo-'), 'temporary cleanup path');
  await rm(resolvedTemp, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 });
}
