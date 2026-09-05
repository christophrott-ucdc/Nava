#!/usr/bin/env node
/** Actual Electron/Chromium renderer, real film, GLB and generated ElevenLabs audio.
 * Isolated loopback server and SQLite; no generated media substitutes or packageReady spoofing.
 * Uses the renderer's documented development boot URLs; native wall-window layout is separate QA.
 */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
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
const require = createRequire(import.meta.url), temp = await mkdtemp(path.join(os.tmpdir(), 'nava-renderer-experience-'));
const out = path.join(ROOT, 'runs/debug/tutorial-final'); await mkdir(out, { recursive: true });
const rendererDir = path.join(temp, 'dist/renderer'); await cp(path.join(ROOT, 'src/renderer'), rendererDir, { recursive: true });
await cp(path.join(ROOT, 'src/web/shared'), path.join(rendererDir, 'shared'), { recursive: true });
await cp(path.join(ROOT, 'node_modules/@met4citizen/talkinghead/modules/playback-worklet.js'), path.join(rendererDir, 'playback-worklet.js'));
await esbuild.build({ entryPoints: [path.join(ROOT, 'src/renderer/index.ts')], outfile: path.join(rendererDir, 'renderer.js'), bundle: true, platform: 'browser', format: 'iife', target: 'chrome130', define: { 'process.env.NODE_ENV': '"production"', 'import.meta.url': '__navaModuleUrl' }, banner: { js: 'var __navaModuleUrl = document.baseURI;' }, alias: { three: 'three' }, logLevel: 'warning' });
const screen = { id: 'center', displayIndex: 0, showAvatar: true, showSubtitles: true, showEntities: true, playAudio: true, kiosk: false };
const h = await createHarness({ screens: [screen], tutorial:true });
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
  await call('Page.enable');await call('Network.enable');await call('Runtime.enable');
  await call('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{const Original=window.Audio;window.__qaAudio=[];window.Audio=function(...args){const a=new Original(...args);const log={events:[],audio:a};window.__qaAudio.push(log);for(const name of ['playing','pause','ended','error','loadedmetadata'])a.addEventListener(name,()=>log.events.push({name,time:a.currentTime,src:a.src,at:Date.now()}));return a;};window.Audio.prototype=Original.prototype;})()`});
  await call('Page.reload');
  async function exp(action,extra={}){const r=await h.api('/api/experience/control',{action,...extra});assert.equal(r.status,200,JSON.stringify(r.body));return r.body;}
  async function snapshot(){return (await h.api('/api/mission')).body;}
  async function act(zone,value){const t=h.tablets[0],s=t.snapshot,event={type:'missionAction',runId:s.runId,cueInstanceId:s.cueInstanceId,eventId:randomUUID(),zone,value};t.send(event);const ack=await t.next(m=>m.type==='missionAck'&&m.eventId===event.eventId,'tutorial ACK');assert.equal(ack.ok,true,JSON.stringify(ack));await waitFor(()=>t.snapshot,n=>n.revision>s.revision,'tutorial revision');}
  async function audioEnded(id){console.log('Waiting narrator',id);try{return await waitFor(()=>frames,a=>a.some(m=>m.type==='experienceAudio'&&m.status==='ended'&&m.instance===id),'natural narrator audio end',50000);}catch(error){await writeFile(path.join(out,'renderer-failure.json'),JSON.stringify({metric:await expMetric(),errors,loadingFailures,acks:frames.filter(m=>m.type==='experienceAudio')},null,2));throw error;}}
  async function expMetric(){return evaluate(`(()=>{const e=document.querySelector('.experience-tv'),r=e.getBoundingClientRect();return {title:e.querySelector('h1').textContent,text:e.innerText,hidden:e.hidden,viewport:[innerWidth,innerHeight],rect:[r.x,r.y,r.width,r.height],overflow:e.scrollHeight>e.clientHeight+1,audio:window.__qaAudio.map(x=>({time:x.audio.currentTime,duration:x.audio.duration,paused:x.audio.paused,src:x.audio.src,events:x.events}))}})()`);}
  await waitFor(async () => (await h.api('/api/state')).body,s=>s.readiness?.ready,'renderer ready',30000);
  if(process.argv.includes('--music-only')){
    const {runMusicQA}=await import('./music-renderer-checks.mjs');await runMusicQA({h,call,evaluate,metric,errors,port});
  }else if(process.argv.includes('--final-only')){
    await h.select('adults');await exp('participants',{participants:['1A','1B']});await exp('skip');await waitFor(async()=>(await h.api('/api/state')).body,s=>s.readiness?.ready,'adults ready',45000);await h.command({action:'start'});await h.command({action:'epilogue'});await h.command({action:'seek',time:57.5});await size(3840,2160);
    await waitFor(()=>h.tablets[0].snapshot,s=>s.experience.finaleActive,'finale tablet');await act('A','finale:question');await act('B','finale:observe');
    await new Promise(r=>setTimeout(r,3000));await waitFor(metric,m=>m.avatar.shown&&m.subtitle.includes('Mulțumesc'),'original final captain and subtitle');await shot('adults-finale-original-subtitle-3840');const before=await expMetric();assert.deepEqual(before.viewport,[3840,2160]);assert(!before.overflow);assert.equal(await evaluate(`getComputedStyle(document.querySelector('.experience-final')).zIndex`),'35');
    let snap=await waitFor(snapshot,s=>s.state.state==='ended'&&s.experience.narration?.id==='finale','ended-only finale narration',25000);const id=snap.experience.narration.instance;await audioEnded(id);await new Promise(r=>setTimeout(r,1500));const after=await expMetric();const events=after.audio.flatMap(a=>a.events).filter(e=>e.src.endsWith('/finale.mp3'));assert.equal(events.filter(e=>e.name==='ended').length,1,'finale natural end once');assert.equal(events.filter(e=>e.name==='playing').length,1,'repeated snapshot no replay');await shot('adults-finale-ended-3840');assert.deepEqual(errors,[]);await writeFile(path.join(out,'renderer-finale-audio.json'),JSON.stringify({checkedAt:new Date().toISOString(),realNarration:true,startedOnlyAfterEnded:true,before,after,events,errors},null,2));console.log('Ended finale narration passed, natural playback exactly once.');
  }else{
  await h.select(PROFILES[0]);await waitFor(async()=>(await h.api('/api/state')).body,s=>s.readiness?.ready,'profile audio ready',45000);
  await exp('participants',{participants:['1A','1B']});await size(3840,2160);await exp('start');
  let s=await snapshot();await audioEnded(s.experience.narration.instance);
  await waitFor(snapshot,s=>s.experience.narration.id==='touch','touch narration',10000);s=await snapshot();await audioEnded(s.experience.narration.instance);
  await shot('tutorial-touch-tv-3840');records.push({step:'touch',metric:await expMetric()});
  await act('A','tutorial:touch');await act('B','tutorial:touch');
  await waitFor(snapshot,s=>s.experience.step==='practice','practice step',10000);s=await snapshot();
  await new Promise(r=>setTimeout(r,900));await exp('pause');await new Promise(r=>setTimeout(r,350));const pauseA=await expMetric();await new Promise(r=>setTimeout(r,900));const pauseB=await expMetric();const narratorA=pauseA.audio.find(a=>a.src.includes('/experience/'));const narratorB=pauseB.audio.find(a=>a.src.includes('/experience/'));assert(narratorA&&narratorB);assert(Math.abs(narratorB.time-narratorA.time)<.1,'narrator pauses');await exp('resume');await audioEnded(s.experience.narration.instance);
  await shot('tutorial-practice-tv-3840');records.push({step:'practice',metric:await expMetric(),pauseStable:true});
  for(const z of ['A','B']){await act(z,'tutorial:pick:star');await act(z,'tutorial:confirm');}
  await waitFor(snapshot,s=>s.experience.step==='cooperate','cooperate step',10000);s=await snapshot();await audioEnded(s.experience.narration.instance);await size(1600,900);await shot('tutorial-cooperate-tv-windowed');
  for(const z of ['A','B'])await act(z,'tutorial:link');await waitFor(snapshot,s=>s.experience.step==='ready','ready step',10000);s=await snapshot();await audioEnded(s.experience.narration.instance);await shot('tutorial-ready-tv-windowed');await new Promise(r=>setTimeout(r,450));await exp('launch');s=await snapshot();await audioEnded(s.experience.narration.instance);await waitFor(snapshot,s=>s.state.state==='preshow','original preshow starts',10000);records.push({tutorialComplete:true,state:(await snapshot()).state,audio:await expMetric()});
  for(const profile of PROFILES){
    if(profile!==PROFILES[0]){await h.command({action:'restart'});await h.select(profile);await exp('participants',{participants:['1A','1B']});await exp('skip');await waitFor(async()=>(await h.api('/api/state')).body,s=>s.readiness?.ready,'profile ready',45000);await h.command({action:'start'});}
    await h.command({action:'epilogue'});await h.command({action:'seek',time:61});await waitFor(snapshot,s=>s.experience.finaleActive,'finale active');await waitFor(()=>h.tablets[0].snapshot,s=>s.experience.finaleActive,'tablet finale');
    const value={'age-5-10':'light','age-10-15':'source','age-15-18':'voice',adults:'question'}[profile];await act('A',`finale:${value}`);await act('B','finale:observe');
    await size(3840,2160);await new Promise(r=>setTimeout(r,350));await shot(`${profile}-finale-tv-3840`);let m=await expMetric();assert(!m.hidden&&!m.overflow);assert(/1 contribuți(e confirmată|i confirmate)/.test(m.text));assert(m.text.includes('A ales să privească'));records.push({profile,finale:m});
    await size(1600,900);await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await shot(`${profile}-finale-tv-windowed-reduced`);assert.equal(await evaluate(`getComputedStyle(document.querySelector('.experience-seat b')).animationName`),'none');
  }
  const finalMetric=await expMetric();const narratorEvents=finalMetric.audio.flatMap(a=>a.events).filter(e=>e.src.includes('/experience/'));for(const file of ['intro','touch','age-5-10-practice','cooperate','ready','handoff'])assert.equal(narratorEvents.filter(e=>e.name==='ended'&&e.src.endsWith('/'+file+'.mp3')).length,1,'actual natural audio end once: '+file);const ack=frames.filter(m=>m.type==='experienceAudio');assert(!ack.some(m=>m.status==='error'),'narrator playback errors');const ended=ack.filter(m=>m.status==='ended');assert.equal(new Set(ended.map(m=>m.instance)).size,ended.length,'audio end once per instance');assert.deepEqual(errors,[]);
  await writeFile(path.join(out,'renderer-review.json'),JSON.stringify({checkedAt:new Date().toISOString(),realElectron:true,realNarration:true,records,narratorAcks:ack,errors,loadingFailures},null,2));console.log('Tutorial renderer review passed: natural narrator audio, pause/resume, tutorial to preshow, four finales at 4K/windowed.');await h.command({action:'restart'});await h.select('legacy-v3');await exp('skip');await waitFor(async()=>(await h.api('/api/state')).body,s=>s.readiness?.ready,'legacy renderer ready',30000);const smoke=spawn(process.env.ComSpec??'cmd.exe',['/d','/s','/c','npm run smoke:renderer'],{cwd:ROOT,windowsHide:true,stdio:'inherit',env:{...process.env,NAVA_CDP_PORT:String(port),NAVA_SERVER_PORT:new URL(h.base).port,NAVA_TEST_PIN:'9384'}});const smokeExit=await new Promise(resolve=>smoke.once('exit',resolve));assert.equal(smokeExit,0,'mandatory smoke renderer');
  }
}finally{ws?.close();child.stdin.write('close');await new Promise(resolve=>{const timer=setTimeout(()=>{child.kill();resolve();},5000);child.once('exit',()=>{clearTimeout(timer);resolve();});});await h.close();await rm(temp,{recursive:true,force:true});}
