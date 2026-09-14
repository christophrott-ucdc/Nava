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
const lang=process.env.NAVA_QA_LANG??'ro';assert(['ro','en','fr'].includes(lang));
const out = path.join(ROOT, process.env.NAVA_QA_OUT??'runs/debug/scenarios-new'); await mkdir(out, { recursive: true });
await cp(path.join(ROOT, 'src/web/tablet'), path.join(temp, 'web/tablet'), { recursive: true });
await cp(path.join(ROOT, 'src/web/shared'), path.join(temp, 'web/shared'), { recursive: true });
await esbuild.build({ entryPoints: [path.join(ROOT, 'src/web/tablet/index.ts')], outfile: path.join(temp, 'web/tablet/app.js'), bundle: true, platform: 'browser', format: 'iife', logLevel: 'warning' });
const h = await createHarness({ webDir: path.join(temp, 'web'), connectTablets: false });
const probe = net.createServer(); await new Promise(r => probe.listen(0, '127.0.0.1', r)); const port = probe.address().port; await new Promise(r => probe.close(r));
const main = path.join(temp, 'browser.cjs');
await writeFile(main, `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(temp,'userData'))});const windows=[];app.whenReady().then(async()=>{for(let post=1;post<=5;post++){const w=new BrowserWindow({width:1920,height:1080,useContentSize:true,show:false,webPreferences:{partition:'qa-post-'+post,offscreen:true,backgroundThrottling:false,contextIsolation:true,sandbox:true}});windows.push(w);await w.loadURL(${JSON.stringify(h.base)}+'/tablet/?post='+post);}console.log('BROWSERS_READY');});process.stdin.on('data',()=>app.quit());`);
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
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description??m.params.exceptionDetails.text);
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
    const display=await page.evaluate(`({lang:document.documentElement.lang,text:document.body.innerText})`);
    assert.equal(display.lang,lang,'language propagated to tablet');
    await writeFile(path.join(out,`${profile}-stage${stage}-post${n+1}-${suffix}.txt`),display.text);
    if(lang!=='ro')assert(!/[ășțĂȘȚ]/.test(display.text),`Romanian text remains on ${profile}/${stage}/${n+1}: ${display.text.split('\n').filter(s=>/[ășțĂȘȚ]/.test(s)).join(' | ')}`);
    const geometry = await page.evaluate(`(()=>({viewport:[innerWidth,innerHeight],overflows:[...document.querySelectorAll('#interaction,.mission-zone,.mission-pair')].filter(e=>e.scrollHeight>e.clientHeight+2||e.scrollWidth>e.clientWidth+2).map(e=>({class:e.className,height:e.clientHeight,scroll:e.scrollHeight})),zones:[...document.querySelectorAll('.mission-zone')].map(e=>({zone:e.dataset.zone||e.className,x:e.getBoundingClientRect().x,width:e.getBoundingClientRect().width})),minTarget:Math.min(...[...document.querySelectorAll('.mission-option')].map(e=>e.getBoundingClientRect().height)),bodyOverflow:document.documentElement.scrollHeight>innerHeight+2}))()`);
    reviews.push({ profile, stage, post: n + 1, suffix, ...geometry });
    assert.deepEqual(geometry.viewport, [1920, 1080]);
    assert.deepEqual(geometry.overflows, [], `${profile}/${stage}/${n + 1}/${suffix} overflow`);
    const readoutOverflows=await page.evaluate(`[...document.querySelectorAll('.older-toy')].filter(e=>e.querySelector('.older-readout').getBoundingClientRect().bottom>e.getBoundingClientRect().bottom+2).length`);
    assert.equal(readoutOverflows,0,`${profile}/${stage}/${n+1}/${suffix}: instrument explanation overlaps the report`);
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
    await h.command({action:'setLang',lang});
    for(const page of pages)for(const zone of ['A','B']){
      await waitFor(()=>page.snapshot,s=>s?.scenarioId===profile&&s?.experience?.crew?.open,'crew open');
      await waitFor(()=>page.evaluate(`document.body.dataset.mission===${JSON.stringify(profile)}&&!!document.querySelector('.crew-select')`),Boolean,'crew UI for selected profile');
      const character=['nova','nia','luca','mira','leo','iris','arin','tara','radu','zori'][pages.indexOf(page)*2+(zone==='B'?1:0)];
      await page.evaluate(`document.querySelector('.mission-zone[data-zone="${zone}"] button[data-value="crew:draft:${character}"]').click()`);
      await waitFor(()=>page.evaluate(`!!document.querySelector('.mission-zone[data-zone="${zone}"] button[data-value="crew:confirm"]:not(:disabled)')`),Boolean,'crew confirmation enabled');
      await press(page,'crew:confirm',zone);
    }
    const skipped=await h.api('/api/experience/control',{action:'skip'});assert.equal(skipped.status,200,JSON.stringify(skipped.body));
    const show = (await h.api('/api/show')).body;
    const subtitleCue = show.cues.filter(c => c.kind === 'voice' && !c.manual).sort((a, b) => (b.text?.ro?.length || 0) - (a.text?.ro?.length || 0))[0];
    for (let post = 1; post <= 5; post++) assert.equal((await h.api('/api/mission/accessibility', { post, settings: { textScale: 1.3, reducedMotion: true, contrastMode: post === 5 } })).status, 200);
    await h.command({ action: 'start' });
    for (let stage = 1; stage <= 3; stage++) {
      await h.command({ action: 'seek', time: WINDOWS[profile][stage - 1] });await h.holdFrame();
      await Promise.all(pages.map(p => waitFor(() => p.snapshot, s => s?.scenarioId === profile && s.stage === stage, 'live stage')));
      // Real manual cue dispatch exercises the subtitle component during the active controls.
      await h.command({ action: 'fireCue', cueId: subtitleCue.id });
      await Promise.all(pages.map(p => waitFor(() => p.evaluate(`!document.querySelector('#subtitle').classList.contains('hidden')`), Boolean, 'live subtitle')));
      await review(profile, stage, 'initial');
      for (const page of pages) for (const zone of ['A', 'B']) {
        if (zone === 'B') await page.evaluate(`document.querySelector('.mission-zone[data-zone="A"] h2')?.focus()`);
        const v=()=>page.snapshot.view.zones[zone].play;
        const use=async(value,commit=true)=>{
          const seq=v().seq;
          await waitFor(()=>page.evaluate(`(()=>{const p=document.querySelector('.mission-zone[data-zone="${zone}"]');const e=[...p.querySelectorAll('[data-play],[data-value],[data-play-action]')].find(e=>e.dataset.play===${JSON.stringify(value)}||e.dataset.value===${JSON.stringify(value)}||e.dataset.playAction===${JSON.stringify(value)});if(!e||e.disabled||e.getAttribute('aria-disabled')==='true'||e.dataset.unavailable==='true')return false;e.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:0}));return true;})()`),Boolean,'enabled play control '+value);
          if(commit)await waitFor(()=>v(),n=>n.seq>seq,'play ACK '+value);
        };
        if(profile==='age-5-10'){
          if(stage===1)await use('play:match:'+v().shape);
          if(stage===2){for(let n=0;n<4&&v().rotation!==v().socketRotation;n++)await use('play:rotate');await use('play:fit');}
          if(stage===3)for(let i=0;i<2;i++)for(let n=0;n<4&&v().wireTurns[i]!==v().wireTargets[i];n++)await use('play:wire:'+i);
        }else if(profile==='age-10-15'){
          if(stage<=2){const seq=v().seq;await page.evaluate(`(()=>{const e=document.querySelector('.mission-zone[data-zone="${zone}"] input[data-play="play:tune"]');e.value=${v().targetAngle};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await waitFor(()=>v(),n=>n.seq>seq,'antenna ACK');}
          if(stage===1)await use('play:hypothesis:relay');
          if(stage===2){await use('play:signal');await use('draft:reorder',false);await use('play:signal');}
          if(stage===3){await use('draft:record:0',false);await use('play:conclude:relay');}
        }else if(profile==='age-15-18'){
          if(stage!==2)await use('play:rule:'+(zone==='A'?'execute':'conflict'));
          await use('play:pilot:agree');await use('play:pilot:conflict');
        }else{
          if(stage===1){await page.evaluate(`document.querySelector('.mission-zone[data-zone="${zone}"] .older-scan-modes button').click()`);await use('scan');}
          if(stage===2)await use('play:shield:'+(zone==='A'?'protect':'passive'));
          if(stage===3)await use('archive');
        }
        assert(v().solved,profile+'/'+stage+'/'+zone+' solved through live UI');
        if (zone === 'B') assert.equal(await page.evaluate(`document.activeElement.closest('.mission-zone')?.dataset.zone`), 'A', 'B updates preserve independent A keyboard focus');
      }
      await review(profile, stage, 'confirmed');
    }
    await h.command({ action: 'epilogue' });
    await Promise.all(pages.map(p => waitFor(() => p.snapshot, s => s?.state.state === 'epilogue', 'epilogue')));
    await h.command({action:'seek',time:61});await h.holdFrame();
    for(const page of pages){
      await waitFor(()=>page.snapshot,s=>s?.experience?.finaleActive,'final choices');
      const choice={'age-5-10':'light','age-10-15':'source','age-15-18':'voice',adults:'question'}[profile];
      await page.evaluate(`document.querySelector('.mission-zone[data-zone="A"] button[data-value="draft:${choice}"]').click()`);
      await press(page,'finale:'+choice,'A');await press(page,'finale:observe','B');
    }
    await review(profile, 0, 'summary');
    const certificates = await waitFor(async () => (await h.api('/api/certificates')).body, b => b.runs?.some(r => r.files.length === 5), 'five actual rendered certificates');
    assert(certificates.runs.length > 0);
    await h.command({ action: 'restart' });
  }
  for (const p of pages) assert.deepEqual(p.errors, [], 'browser runtime exceptions');
  await writeFile(path.join(out, `browser-review${process.env.NAVA_QA_PROFILE ? '-' + process.env.NAVA_QA_PROFILE : ''}.json`), JSON.stringify({ checkedAt: new Date().toISOString(), kind: 'real-browser-http-ws', subtitleStress: 'longest unconditional real cue manually dispatched during each interaction', independentFocus: 'B updates preserve A focus', reviews }, null, 2));
  console.log(`Browser review passed: ${reviews.length} tablet states. Captures: ${out}`);
} catch(error){console.error(error);console.error('Browser diagnostics',JSON.stringify(await Promise.all(pages.map(async p=>({errors:p.errors,crew:await p.evaluate(`document.body.innerText.slice(0,1500)`)})))));throw error;} finally {
  for (const p of pages) p.ws.close(); child.stdin.write('close');
  await new Promise(resolve => { const timer = setTimeout(() => { child.kill(); resolve(); }, 5000); child.once('exit', () => { clearTimeout(timer); resolve(); }); });
  await h.close(); await rm(temp, { recursive: true, force: true, maxRetries:10,retryDelay:300 });
}
