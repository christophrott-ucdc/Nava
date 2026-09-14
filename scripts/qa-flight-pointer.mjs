import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import WebSocket from 'ws';
import {ROOT,createHarness,WINDOWS,waitFor} from './smoke-scenarios.mjs';
const require=createRequire(import.meta.url),out=path.join(ROOT,'runs/debug/reliability-2026-09-13/participant');
await mkdir(out,{recursive:true});
const temp=await mkdtemp(path.join(os.tmpdir(),'nava-saturn-pointer-'));
const h=await createHarness({connectTablets:false});let child,ws;
const evidence={kind:'real-chromium-cdp-pointer-synthetic-film-clock',checks:[]};
try{
 await h.select('age-5-10');
 const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const main=path.join(temp,'main.cjs');await writeFile(main,`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(temp,'userData'))});let w;app.whenReady().then(()=>{w=new BrowserWindow({width:1920,height:1080,useContentSize:true,show:false,webPreferences:{offscreen:true,backgroundThrottling:false,contextIsolation:true,sandbox:true}});w.loadURL(${JSON.stringify(h.base+'/tablet/?post=1')});});process.stdin.on('data',()=>app.quit());`);
 child=spawn(require('electron'),[`--remote-debugging-port=${port}`,main],{stdio:['pipe','ignore','ignore'],windowsHide:true});
 const targets=await waitFor(async()=>{try{return await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());}catch{return[]}},a=>a.some(t=>t.url.includes('/tablet/')),'browser',20000);
 ws=new WebSocket(targets.find(t=>t.url.includes('/tablet/')).webSocketDebuggerUrl);await new Promise(r=>ws.once('open',r));let id=0;const pending=new Map();
 ws.on('message',raw=>{const m=JSON.parse(String(raw)),p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}});
 function call(method,params={}){return new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error(method+' timeout'))},12000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));});}
 async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
 await call('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
 async function mouse(selector){const hit=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,h=document.elementFromPoint(x,y);return {x,y,width:r.width,height:r.height,target:e.outerHTML,hit:h?.outerHTML};})()`);evidence.checks.push({selector,before:hit});await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:hit.x,y:hit.y});await new Promise(r=>setTimeout(r,200));evidence.checks.push({selector,afterHover:await evaluate('(()=>{const e=document.querySelector('+JSON.stringify(selector)+'),r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,transform:getComputedStyle(e).transform};})()')});await call('Input.dispatchMouseEvent',{type:'mousePressed',x:hit.x,y:hit.y,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:hit.x,y:hit.y,button:'left',clickCount:1});}
 await waitFor(()=>evaluate(`!!document.querySelector('button[data-value="crew:draft:nova"]:not(:disabled)')`),Boolean,'character');
 await mouse('button[data-value="crew:draft:nova"]');
 await waitFor(()=>evaluate(`!!document.querySelector('button[data-value="crew:confirm"]:not(:disabled)')`),Boolean,'confirm');await mouse('button[data-value="crew:confirm"]');
 await waitFor(()=>evaluate(`document.body.innerText.includes('Bun venit, Nova!')`),Boolean,'confirmed');
 assert.equal((await h.api('/api/experience/control',{action:'skip'})).status,200);await h.command({action:'start'});await h.command({action:'seek',time:WINDOWS['age-5-10'][0]});await h.holdFrame();
 await waitFor(()=>evaluate(`document.querySelector('.flight-toggle')?.getBoundingClientRect().width>0`),Boolean,'map toggle');
 await mouse('.flight-toggle');await waitFor(()=>evaluate(`document.querySelector('.flight-toggle').getAttribute('aria-expanded')`),s=>s==='true','map expanded');
 const read=()=>evaluate(`({pressed:[...document.querySelectorAll('.flight-destination')].find(e=>e.textContent==='Saturn').getAttribute('aria-pressed'),fact:document.querySelector('.flight-info').textContent})`);
 for(const mode of ['no-preference','reduce']){
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:mode}]});
  await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:1900,y:10});
  evidence.checks.push({mode});await mouse('.flight-destination:nth-of-type(6)');
  const before=evidence.checks.at(-2).before,after=evidence.checks.at(-1).afterHover;
  assert(Math.abs(before.x-(after.x+after.width/2))<1,'hover preserves waypoint center x');
  assert(Math.abs(before.y-(after.y+after.height/2))<1,'hover preserves waypoint center y');
  for(let n=0;n<5;n++){await new Promise(r=>setTimeout(r,300));const result=await read();evidence.checks.push({mode,tick:n,result});assert.equal(result.pressed,'true');assert.match(result.fact,/9,5 UA/);}
  const image=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(out,`saturn-pointer-${mode}.png`),Buffer.from(image.data,'base64'));
  await mouse('.flight-destination:nth-of-type(6)');assert.equal((await read()).pressed,'false','second click deselects');
 }
 await writeFile(path.join(out,'saturn-pointer-fixed.json'),JSON.stringify(evidence,null,2));console.log('PASS Saturn pointer: normal + reduced motion, stable hit boxes, ten telemetry ticks and deselection');
}finally{ws?.close();if(child){child.stdin.write('close');await new Promise(r=>{const t=setTimeout(()=>{child.kill();r()},5000);child.once('exit',()=>{clearTimeout(t);r()})});}await h.close();await rm(temp,{recursive:true,force:true,maxRetries:10,retryDelay:300});}


