#!/usr/bin/env node
/** Real Chromium educational UI against real Hono/WS and actual authored voice packs.
 * Five isolated browser sessions represent the five physical tablets. No fake snapshots.
 * Native visible BrowserWindows are intentional: offscreen Chromium can omit composited WebGL pixels.
 * Classic UI regression only; the current direct-play UI has scripts/play-review.mjs.
 * Captures are stored under runs/debug/romanian-games. Film/TV playback and later tutorial steps are separate reviews.
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
const require = createRequire(import.meta.url);
const temp = await mkdtemp(path.join(os.tmpdir(), 'nava-education-review-'));
const out = path.join(ROOT, 'runs/debug/romanian-games'); await mkdir(out, { recursive: true });
await cp(path.join(ROOT, 'src/web/tablet'), path.join(temp, 'web/tablet'), { recursive: true });
await cp(path.join(ROOT, 'src/web/shared'), path.join(temp, 'web/shared'), { recursive: true });
await esbuild.build({ entryPoints: [path.join(ROOT, 'src/web/tablet/index.ts')], outfile: path.join(temp, 'web/tablet/app.js'), bundle: true, platform: 'browser', format: 'iife', logLevel: 'warning' });
const h = await createHarness({ webDir: path.join(temp, 'web'), connectTablets: false, tutorial: true });
const probe = net.createServer(); await new Promise(r => probe.listen(0, '127.0.0.1', r)); const port = probe.address().port; await new Promise(r => probe.close(r));
const main = path.join(temp, 'browser.cjs');
await writeFile(main, `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(temp)});const windows=[];app.whenReady().then(async()=>{for(let post=1;post<=5;post++){const w=new BrowserWindow({width:1920,height:1080,useContentSize:true,show:true,x:0,y:0,webPreferences:{partition:'qa-post-'+post,offscreen:false,backgroundThrottling:false,contextIsolation:true,sandbox:true}});windows.push(w);await w.loadURL(${JSON.stringify(h.base)}+'/tablet/?interaction=classic&post='+post);}console.log('BROWSERS_READY');});process.stdin.on('data',()=>app.quit());`);
const child = spawn(require('electron'), [`--remote-debugging-port=${port}`, "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", main], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
let stderr = ''; child.stderr.on('data', data => { stderr += String(data); });
const pages = [];
async function cdp(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  let serial = 0, snapshot = null, lastAck = null; const pending = new Map(), errors = [];
  ws.on('message', raw => {
    const m = JSON.parse(String(raw));
    if (m.id) { const p = pending.get(m.id); if (!p) return; pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
    if (m.method === 'Network.webSocketFrameReceived') { try { const frame = JSON.parse(m.params.response.payloadData); if (frame.type === 'mission') snapshot = frame.snapshot; if(frame.type === 'missionAck') lastAck = frame; } catch {} }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text);
    if(m.method==='Runtime.consoleAPICalled' && m.params.type==='error')errors.push(m.params.args.map(a=>a.value||a.description||'').join(' '));
  });
  function call(method, params = {}) { return new Promise((resolve, reject) => { const id = ++serial; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP ${method} timeout`)); }, 12000); pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params })); }); }
  const page = { ws, errors, call, get snapshot() { return snapshot; }, get lastAck() { return lastAck; }, async evaluate(expression) { const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; } };
  await call('Network.enable'); await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await call('Page.reload');
  return page;
}
async function press(page, value, zone, expectedFailure) {
  const previous = page.snapshot.revision, previousAck = page.lastAck?.eventId;
  const target = await page.evaluate(`(()=>{const b=[...document.querySelectorAll('.mission-zone[data-zone="${zone}"] button')].find(b=>b.dataset.value===${JSON.stringify(value)});if(!b||b.disabled)return null;const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  assert(target, `enabled button ${zone}/${value}`);
  if(zone==='A') {
    // Native CDP input must pass through the shared canvas to the semantic HTML action.
    await page.call('Input.dispatchMouseEvent',{type:'mousePressed',...target,button:'left',clickCount:1});
    await page.call('Input.dispatchMouseEvent',{type:'mouseReleased',...target,button:'left',clickCount:1});
  } else await page.evaluate(`[...document.querySelectorAll('.mission-zone[data-zone="B"] button')].find(b=>b.dataset.value===${JSON.stringify(value)}).click()`);
  if(expectedFailure) {
    const ack = await waitFor(() => page.lastAck, a => a && a.eventId !== previousAck, 'recoverable UI mistake');
    assert.equal(ack.ok, false, value + ' must not silently succeed');
    if(typeof expectedFailure === 'string') assert.equal(ack.status, expectedFailure);
    assert.equal(page.snapshot.revision, previous, 'wrong answer leaves progress unchanged');
    const feedback = await waitFor(() => page.evaluate(`document.querySelector('#notice')?.textContent`), t => t && !t.includes('Trimitem'), 'specific retry feedback');
    const hints={'fit':'rotește piesa','dead-end':'se oprește','loop':'te aduce înapoi'};
    assert(ack.reason,'rejection includes specific reason');
    assert(feedback.includes(hints[value] || 'Compară contururile'),'mistake gives the specific Romanian next step');
  } else await waitFor(() => page.snapshot, s => s.revision > previous, `confirmed ${zone}/${value}`);
  await waitFor(() => page.evaluate(`!document.querySelector('.mission-zone[data-zone="${zone}"] .mission-delivery')?.textContent.includes('Trimitem')`), Boolean, 'ACK rendered');
}
const reviews = [], themeReviews = [], resilience = [];
async function resilienceCheck(page) {
  const before=await page.evaluate(`(()=>({text:[...document.querySelectorAll('.education-figure')].map(e=>e.textContent),mode:document.querySelector('.education-canvas').dataset.mode}))()`);
  const result=await page.evaluate(`new Promise(resolve=>{const canvas=document.querySelector('.education-canvas'),gl=canvas.getContext('webgl2'),ext=gl?.getExtension('WEBGL_lose_context');if(!ext){resolve({available:false});return;}ext.loseContext();setTimeout(()=>{const lost=canvas.dataset.mode;ext.restoreContext();setTimeout(()=>resolve({available:true,lost,restored:canvas.dataset.mode}),800)},250)})`);
  assert.equal(result.available,true,'Chromium must expose real loss extension');assert.equal(result.lost,'2d');assert.equal(result.restored,'3d');
  const after=await page.evaluate(`[...document.querySelectorAll('.education-figure')].map(e=>e.textContent)`);assert.deepEqual(after,before.text,'context loss preserves all scientific facts');
  const rev=page.snapshot.revision;
  await page.evaluate(`document.querySelector('.mission-zone[data-zone="A"] .education-diagram').focus()`);
  await page.call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
  await page.call('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
  const angles=await page.evaluate(`[...document.querySelectorAll('.education-figure')].map(e=>Number(e.dataset.angle||0))`);
  assert(angles[0]>0);assert.equal(angles[1],0,'A rotation leaves B independent');assert.equal(page.snapshot.revision,rev,'exploration never sends mission action');
  await new Promise(r=>setTimeout(r,500));
  const quietStart=await page.evaluate(`Number(document.querySelector('.education-canvas').dataset.frames)`);
  await new Promise(r=>setTimeout(r,650));
  const quietEnd=await page.evaluate(`Number(document.querySelector('.education-canvas').dataset.frames)`);
  assert.equal(quietEnd,quietStart,'reduced motion does not continuously draw unchanged scene');
  assert.equal((await h.api('/api/mission/accessibility',{post:1,settings:{textScale:1.3,reducedMotion:false}})).status,200);
  await page.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await new Promise(r=>setTimeout(r,550));
  const osStart=await page.evaluate(`Number(document.querySelector('.education-canvas').dataset.frames)`);
  await new Promise(r=>setTimeout(r,650));
  const osEnd=await page.evaluate(`Number(document.querySelector('.education-canvas').dataset.frames)`);
  assert.equal(osEnd,osStart,'OS reduced-motion preference stops idle draw independently');
  assert.equal((await h.api('/api/mission/accessibility',{post:1,settings:{textScale:1.3,reducedMotion:true}})).status,200);
  await page.call('Emulation.setEmulatedMedia',{features:[]});
  assert.equal((await h.api('/api/mission/accessibility',{post:1,settings:{textScale:1.3,reducedMotion:false,reducedStimuli:false}})).status,200);
  await page.evaluate(`document.querySelector('.mission-zone[data-zone="A"] .education-diagram').focus()`);
  for(let i=0;i<2;i++)await page.call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
  await new Promise(r=>setTimeout(r,150));
  const tilted=await page.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(out,'normal-motion-inspection.png'),Buffer.from(tilted.data,'base64'));
  assert.equal((await h.api('/api/mission/accessibility',{post:1,settings:{textScale:1.3,reducedMotion:true}})).status,200);
  await page.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Home',code:'Home',windowsVirtualKeyCode:36});
  resilience.push({...result,independentAngles:angles,quietStart,quietEnd,osStart,osEnd,normalMotionInspection:true});
}

async function forcedFallback(page, profile) {
  const before=await page.evaluate(`[...document.querySelectorAll('.education-figure')].map(e=>e.textContent)`);
  await page.call('Page.navigate',{url:h.base+'/tablet/?post=1&interaction=classic&graphics=2d'});
  await waitFor(()=>page.evaluate(`document.querySelectorAll('.education-figure[data-mode="2d"]').length`),n=>n===2,'manual SVG fallback');
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('.education-figure')].map(e=>e.textContent)`),before,'fallback preserves facts');
  if(profile!=='adults' && profile!=='age-15-18') assert.equal(await page.evaluate(`getComputedStyle(document.querySelector('.education-flat')).visibility`),'visible');
  const shot=await page.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(out,`${profile}-fallback.png`),Buffer.from(shot.data,'base64'));
  await page.call('Page.navigate',{url:h.base+'/tablet/?post=1&interaction=classic'});
  await waitFor(()=>page.evaluate(`document.querySelector('.education-canvas')?.dataset.mode`),m=>m==='3d','WebGL returns after explicit choice');
  resilience.push({profile,forced2d:true,sameFacts:true});
}
async function themes(page, profile) {
  // CSS/theme rendering audit over an actual live WS scene, not a synthetic mission snapshot.
  for(const theme of ['prologue','launch','light','nature','tech','void','home','white']) {
    const result=await page.evaluate(`(()=>{document.documentElement.dataset.theme=${JSON.stringify(theme)};document.body.dataset.theme=${JSON.stringify(theme)};return {theme:document.documentElement.dataset.theme,figures:[...document.querySelectorAll('.education-figure')].map(e=>({kind:e.dataset.kind,color:getComputedStyle(e).color,background:getComputedStyle(e).backgroundColor})),canvasPointerEvents:getComputedStyle(document.querySelector('.education-canvas')).pointerEvents};})()`);
    assert.equal(result.canvasPointerEvents,'none','canvas must not intercept independent A/B controls');
    themeReviews.push({profile,...result});
    if(profile==='age-5-10'){const shot=await page.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(out,`theme-${theme}.png`),Buffer.from(shot.data,'base64'));}
  }
}

async function review(profile, stage, suffix, capture = false) {
  for (let n = 0; n < pages.length; n++) {
    const page = pages[n];
    await page.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    if(stage > 0) for(const zone of ['A','B']) {
      const view=page.snapshot.view.zones[zone];
      assert(view.goal && view.goal.trim().length>15,'activity has a concrete purpose');
      const visibleText=await page.evaluate(`document.querySelector('.mission-zone[data-zone="${zone}"]').innerText`);
      assert(visibleText.includes(view.goal),profile+'/'+stage+'/'+zone+' participant sees the mission purpose');
      assert(!/Diagrama arată doar starea primită|observare aleasă|gest neînregistrat|Două contribuții independente/.test(visibleText),'primary Romanian must not leak QA instrumentation');
      for(const row of view.comparison || []) { assert(visibleText.includes(row.label)&&visibleText.includes(row.before),'actual sensor case and result visible'); if(row.after) assert(visibleText.includes(row.after),'actual revised result visible'); }
      if(profile==='adults' && suffix==='confirmed') for(const doc of view.documents || []) {
        assert(visibleText.includes(doc.title),'committed report is readable');
        for(const sample of doc.samples) assert(visibleText.includes(sample.value),'actual observed values are readable, not only generic cards');
      }
    }
    const occlusions=await page.evaluate(`(()=>{const conflicts=[];for(const panel of document.querySelectorAll('.mission-zone')){const help=panel.querySelector('.mission-help summary');if(!help)continue;const a=help.getBoundingClientRect();for(const button of panel.querySelectorAll('.mission-option')){const b=button.getBoundingClientRect();if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)conflicts.push({zone:panel.dataset.zone,button:button.textContent});}}return conflicts;})()`);
    if(occlusions.length){const shot=await page.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(out,`FAIL-occlusion-${profile}-${stage}-post${n+1}-${suffix}.png`),Buffer.from(shot.data,'base64'));}
    assert.deepEqual(occlusions,[],profile+'/'+stage+'/'+suffix+' help target must not cover an answer');
    const geometry = await page.evaluate(`(()=>({viewport:[innerWidth,innerHeight],visibility:document.visibilityState,frames:document.querySelector('.education-canvas')?.dataset.frames,overflows:[...document.querySelectorAll('#interaction,.mission-zone,.mission-pair')].filter(e=>e.scrollHeight>e.clientHeight+2||e.scrollWidth>e.clientWidth+2).map(e=>({class:e.className,height:e.clientHeight,scroll:e.scrollHeight})),zones:[...document.querySelectorAll('.mission-zone')].map(e=>({zone:e.dataset.zone||e.className,x:e.getBoundingClientRect().x,width:e.getBoundingClientRect().width})),canvasCount:document.querySelectorAll('.education-canvas').length,figures:[...document.querySelectorAll('.education-figure')].map(e=>({kind:e.dataset.kind,text:e.textContent,zone:e.closest('.mission-zone')?.dataset.zone,rect:e.getBoundingClientRect().toJSON(),labelBounds:[...e.querySelectorAll('.education-object-label')].map(l=>({text:l.textContent,bottom:l.getBoundingClientRect().bottom,top:l.getBoundingClientRect().top})),diagram:e.querySelector('.education-diagram')?.getBoundingClientRect().toJSON(),caption:e.querySelector('.education-caption')?.getBoundingClientRect().toJSON()})),minTarget:Math.min(...[...document.querySelectorAll('.mission-option,.education-explanation summary,.mission-help summary,.mission-document-limit summary,.experience-contribution summary')].filter(e=>e.getBoundingClientRect().height>0).map(e=>e.getBoundingClientRect().height)),bodyOverflow:document.documentElement.scrollHeight>innerHeight+2}))()`);
    const documentSurface=stage>0 && Object.values(page.snapshot.view.zones).every(v=>v.documents?.length || v.comparison?.length);
    if(n===0 && !documentSurface){const pixels=await page.evaluate(`new Promise(resolve=>{requestAnimationFrame(()=>{const c=document.querySelector('.education-canvas'),g=c?.getContext('webgl2');if(!g)return resolve({none:true});const a=new Uint8Array(c.width*c.height*4);g.readPixels(0,0,c.width,c.height,g.RGBA,g.UNSIGNED_BYTE,a);let painted=0,colored=0;for(let i=3;i<a.length;i+=4)if(a[i]>0){painted++;if(a[i-3]+a[i-2]+a[i-1]>50)colored++;}resolve({painted,colored,width:c.width,height:c.height,hidden:c.hidden,rect:c.getBoundingClientRect().toJSON()});})})`);geometry.gpu=pixels; assert(pixels.painted>0,'nontransparent GPU model pixels'); assert(pixels.colored>0,'lit colored GPU pixels');}
    reviews.push({ profile, stage, post: n + 1, suffix, ...geometry });
    const explanations=await page.evaluate(`(()=>{const ds=[...document.querySelectorAll('.education-explanation,.mission-help,.mission-document-limit,.experience-contribution')];ds.forEach(e=>e.open=true);const rs=ds.map(e=>({text:e.textContent,rect:e.getBoundingClientRect().toJSON()}));ds.forEach(e=>e.open=false);return rs;})()`);
    for(const e of explanations)assert(e.rect.bottom<=1080 && e.rect.top>=0,'expanded scientific explanation stays visible');
    if(geometry.overflows.length || geometry.bodyOverflow){await writeFile(path.join(out,`FAIL-${profile}-${stage}-post${n+1}-${suffix}.json`),JSON.stringify(geometry,null,2));const shot=await page.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(out,`FAIL-${profile}-${stage}-post${n+1}-${suffix}.png`),Buffer.from(shot.data,'base64'));}
    assert.deepEqual(geometry.viewport, [1920, 1080]);
    assert.equal(geometry.visibility,'visible','real visible renderer lifecycle');
    assert(Number(geometry.frames)>0,'actual rendered GPU frames');
    assert.deepEqual(geometry.overflows, [], `${profile}/${stage}/${n + 1}/${suffix} overflow`);
    assert.equal(geometry.bodyOverflow, false);
    if (geometry.zones.length === 2) assert(geometry.zones[0].x < 960 && geometry.zones[1].x >= 960, 'A left / B right');
    if (geometry.minTarget !== null) assert(geometry.minTarget >= 64, 'touch targets >=64px');
    assert.equal(geometry.canvasCount, 1, 'one shared education renderer per tablet');
    assert.equal(geometry.figures.length, 2, 'two independent educational figures');
    assert.deepEqual(geometry.figures.map(f=>f.zone), ['A','B']);
    for(const f of geometry.figures) { const expected=suffix.startsWith('finale')?'constellation':profile==='age-5-10'?'pieces':profile==='age-10-15'?'signals':profile==='age-15-18'?'mandate':stage===3?'archive':'resources'; if(stage>0||suffix.startsWith('finale'))assert.equal(f.kind,expected,'age/stage specific diagram'); assert(f.text.trim().length>20,'accessible explanation exists in DOM'); for(const label of f.labelBounds)assert(label.bottom<=Math.min(f.diagram.bottom,f.caption.top)+2,`${profile}/${stage}/${n+1}/${suffix} label overlaps caption: ${label.text}`); if(!documentSurface) assert(f.rect.width > 100 && f.rect.height > 50, 'visible figure'); }
    if (capture || n===0 || (n===4 && stage===2 && suffix==='initial')) { await page.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))'); const image = await page.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await writeFile(path.join(out, `${profile}-stage${stage}-post${n + 1}-${suffix}.png`), Buffer.from(image.data, 'base64')); }
  }
}
try {
  const targets = await waitFor(async () => { try { return await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json()); } catch { return []; } }, a => a.filter(t => t.url.includes('/tablet/')).length === 5, 'five Chromium tablets', 20000);
  for (let post = 1; post <= 5; post++) pages.push(await cdp(targets.find(t => t.url.includes(`post=${post}`))));
  await Promise.all(pages.map((p, n) => waitFor(() => p.snapshot, s => s?.post === n + 1, 'browser tablet assignment')));
  for (const profile of PROFILES.filter(p => !process.env.NAVA_QA_PROFILE || p === process.env.NAVA_QA_PROFILE)) {
    await h.select(profile);
    assert.equal((await h.api('/api/experience/control', {action:'start'})).status,200);
    await Promise.all(pages.map(p=>waitFor(()=>p.snapshot,s=>s?.scenarioId===profile && s.experience?.status==='tutorial','tutorial live')));
    await review(profile,0,'tutorial-initial');
    for(const page of pages) for(const zone of ['A','B']) await press(page,'tutorial:touch',zone);
    await review(profile,0,'tutorial-confirmed');
    assert.equal((await h.api('/api/experience/control', {action:'skip'})).status,200);
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
      await review(profile, stage, 'initial', true);
      if(stage===1) await themes(pages[0],profile);
      if(stage===1 && profile==='age-5-10') await resilienceCheck(pages[0]);
      if(profile==='age-10-15' && stage===2) {
        for(const page of pages){await press(page,'measure:0','A');for(const n of [1,3,2])await press(page,`piece:${n}`,'A');await press(page,'send','A');await press(page,'construct','A');for(const n of [2,1])await press(page,`piece:${n}`,'A');}
        await review(profile,stage,'mid-builder',true);
        for(const page of pages){await press(page,'piece:3','A');await press(page,'send','A');}
      }
      for (const page of pages) for (const zone of ['A', 'B']) {
        if(profile==='age-10-15' && stage===2 && zone==='A')continue;
        if (zone === 'B') await page.evaluate(`document.querySelector('.mission-zone[data-zone="A"] h2')?.focus()`);
        if (profile === 'age-5-10') { if (stage === 1) { const v=page.snapshot.view.zones[zone], target=`shape:${v.items[0].label}`; await press(page,v.options.find(o=>o.value.startsWith('shape:')&&o.value!==target).value,zone,true); await press(page,target,zone); } else if (stage === 2) {
          await press(page, 'select', zone); assert(page.snapshot.view.zones[zone].visual.objects.some(o=>o.keyMarker && o.quarterTurns>0),'piece begins visibly misaligned'); if(zone==='A' && page.snapshot.post===1){const shot=await page.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(out,'child-rotation-before.png'),Buffer.from(shot.data,'base64'));} await press(page, 'fit', zone, 'invalid');
          for(let turn=0; turn<3-(page.snapshot.post%3);turn++) { await press(page,'rotate',zone); assert.equal(await page.evaluate(`document.querySelector('#notice').textContent`),'','successful correction clears obsolete hint'); }
          assert(page.snapshot.view.zones[zone].visual.objects.filter(o=>o.keyMarker).every(o=>o.quarterTurns===0),'piece and socket markers align after turns');
          if(zone==='A' && page.snapshot.post===1){const shot=await page.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(out,'child-rotation-aligned.png'),Buffer.from(shot.data,'base64'));}
          await press(page, 'fit', zone);
        } else { await press(page, 'dead-end', zone, true); await press(page, 'loop', zone, true); await press(page, 'link', zone); } }
        else if (profile === 'age-10-15') { if (stage === 1) await press(page, 'far', zone); else if (stage === 2) { await press(page, 'measure:0', zone); for (const n of zone === 'A' ? [1, 3, 2] : [3, 1, 2]) await press(page, `piece:${n}`, zone); await press(page, 'send', zone); } else { await press(page, 'far', zone); await press(page, 'reconsider', zone); await press(page, 'relay', zone); await press(page, 'attach:repeated', zone); } }
        else if (profile === 'age-15-18') {
          if(stage === 2) { await press(page,'agree',zone); assert(page.snapshot.view.zones[zone].options.some(o=>o.value==='conflict'&&!o.disabled),'second sensor case remains available'); await press(page,'conflict',zone); }
          else await press(page,stage===1 ? zone==='A'?'execute':'conflict' : zone==='A'?'propose':'keep',zone);
        }
        else await press(page, stage === 1 ? zone === 'A' ? 'wide' : 'fine' : stage === 2 ? zone === 'A' ? 'protect' : 'passive' : zone === 'A' ? 'observation' : 'probe', zone);
        if (zone === 'B') assert.equal(await page.evaluate(`document.activeElement.closest('.mission-zone')?.dataset.zone`), 'A', 'B updates preserve independent A keyboard focus');
      }
      await review(profile, stage, 'confirmed');
      if(stage===3) await forcedFallback(pages[0],profile);
    }
    await h.command({ action: 'epilogue' });
    await Promise.all(pages.map(p => waitFor(() => p.snapshot, s => s?.state.state === 'epilogue', 'epilogue')));
    await h.command({action:'seek',time:61});
    await Promise.all(pages.map(p=>waitFor(()=>p.evaluate(`!!document.querySelector('.mission-zone button[data-value^="finale:"]')`),Boolean,'finale live')));
    await review(profile, 0, 'finale-initial');
    for(const page of pages) for(const zone of ['A','B']) {
      const value=await page.evaluate(`document.querySelector('.mission-zone[data-zone="${zone}"] button[data-value^="finale:"]').dataset.value`);
      await press(page,value,zone);
    }
    await review(profile, 0, 'finale-confirmed');
    const certificates = await waitFor(async () => (await h.api('/api/certificates')).body, b => b.runs?.some(r => r.files.length === 5), 'five actual rendered certificates');
    assert(certificates.runs.length > 0);
    await h.command({ action: 'restart' });
  }
  for (const p of pages) assert.deepEqual(p.errors, [], 'browser runtime exceptions');
  await writeFile(path.join(out, `education-review${process.env.NAVA_QA_PROFILE ? '-' + process.env.NAVA_QA_PROFILE : ''}.json`), JSON.stringify({ checkedAt: new Date().toISOString(), kind: 'real-browser-http-ws', subtitleStress: 'longest unconditional real cue manually dispatched during each interaction', independentFocus: 'B updates preserve A focus', scope: 'Live Hono/WS snapshots and controls; tutorial touch step, all mission stages and finale; themes explicitly applied to live DOM for CSS audit; GPU timing and physical touch routing require hardware', themeReviews, resilience, reviews }, null, 2));
  const captures=(await readdir(out)).filter(name=>name.endsWith('.png')&&!name.startsWith('FAIL-')).sort();
  await writeFile(path.join(out,'index.html'),'<!doctype html><html lang="ro"><meta charset="utf-8"><title>Revizia jocurilor în limba română</title><style>body{margin:32px;background:#edf3f7;color:#152c40;font:16px system-ui}h1{font-size:28px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(460px,1fr));gap:24px}figure{margin:0;background:white;border-radius:16px;padding:12px}img{width:100%;border-radius:10px}figcaption{padding:10px;overflow-wrap:anywhere}a{color:inherit}</style><h1>Revizia jocurilor în limba română</h1><p>Capturi din interfețe reale, conectate prin HTTP și WebSocket. 1920 × 1080, zonele A și B, text mărit. Verificarea fizică a instalației rămâne separată.</p><main>'+captures.map(name=>'<figure><a href="'+name+'"><img loading="lazy" src="'+name+'" alt="'+name+'"></a><figcaption>'+name+'</figcaption></figure>').join('')+'</main></html>');
  console.log(`Educational browser review passed: ${reviews.length} tablet states. Captures: ${out}`);
} finally {
  for (const p of pages) p.ws.close(); child.stdin.write('close');
  await new Promise(resolve => { const timer = setTimeout(() => { child.kill(); resolve(); }, 5000); child.once('exit', () => { clearTimeout(timer); resolve(); }); });
  await h.close(); await rm(temp, { recursive: true, force: true, maxRetries:30, retryDelay:100 });
}
