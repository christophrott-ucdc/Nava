/** Inspect the real Electron renderer on the local test port; no synthetic frames. */
import fs from 'node:fs/promises';
import WebSocket from 'ws';
import assert from 'node:assert/strict';
const dir='runs/frame-sync';await fs.mkdir(dir,{recursive:true});
const targets=await fetch('http://127.0.0.1:19191/json/list').then(r=>r.json());
const target=targets.find(t=>t.type==='page'&&t.url.includes('renderer/index.html'));
if(!target)throw Error('Start Electron with --remote-debugging-port=19191');
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});
let id=0;const pending=new Map();ws.on('message',b=>{const m=JSON.parse(String(b));if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(Error(m.error.message)):p?.resolve(m.result);}});
const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
const evaluate=async expression=>(await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true})).result?.value;
const pause=ms=>new Promise(r=>setTimeout(r,ms));

const samples=[];
try{
 await evaluate("window.nava.sendCommand({action:'restart'})");await pause(500);
 await evaluate("window.nava.sendCommand({action:'start'})");await pause(500);
 for(const time of [80,300,527,630,10]){
  await evaluate("window.nava.sendCommand({action:'seek',time:"+time+"})");
  let snapshot;const start=Date.now();
  do{
   await pause(100);
   snapshot=await evaluate(`({panels:[...document.querySelectorAll('.span-canvas')].map(c=>({frame:Number(c.dataset.frame),time:Number(c.dataset.mediaTime)})),videos:[...document.querySelectorAll('video')].map(v=>({time:v.currentTime,seeking:v.seeking,paused:v.paused}))})`);
  }while((snapshot.panels.some(p=>!Number.isFinite(p.time)||p.time<time||p.time>time+10)||snapshot.videos.some(v=>v.paused||v.seeking))&&Date.now()-start<10000);
  const settledMs=Date.now()-start;
  const probe=[];
  for(let i=0;i<40;i++){await pause(50);probe.push(await evaluate(`[...document.querySelectorAll('.span-canvas')].map(c=>({frame:Number(c.dataset.frame),time:Number(c.dataset.mediaTime)}))`));}
  samples.push({requested:time,settledMs,snapshot,probe});
  const shot=await call('Page.captureScreenshot',{format:'png',fromSurface:true});await fs.writeFile(dir+'/renderer-'+time+'.png',Buffer.from(shot.data,'base64'));
 }
 // Pause/resume and a deliberately stalled decoder must never split the wall.
 await evaluate("window.nava.sendCommand({action:'pause'})");await pause(1500);
 const pausedA=await evaluate("[...document.querySelectorAll('.span-canvas')].map(c=>Number(c.dataset.frame))");await pause(300);
 const pausedB=await evaluate("[...document.querySelectorAll('.span-canvas')].map(c=>Number(c.dataset.frame))");
 assert.deepEqual(pausedA,pausedB,'paused wall changes frame');assert(pausedB.every(k=>k===pausedB[0]));
 await evaluate("window.nava.sendCommand({action:'seek',time:40.25})");await pause(1500);
 const pausedSeek=await evaluate("[...document.querySelectorAll('.span-canvas')].map(c=>Number(c.dataset.mediaTime))");
 assert(pausedSeek.every(t=>Math.abs(t-40.25)<.05),'seek while paused did not present the requested image');
 await evaluate("window.nava.sendCommand({action:'play'})");await pause(1500);
 await evaluate("(()=>{const v=document.querySelector('video[data-panel-source]');window.__restorePanel=()=>{delete v.play;};v.pause();v.play=()=>Promise.resolve();})()");
 const stalled=[];for(let i=0;i<15;i++){await pause(100);stalled.push(await evaluate("[...document.querySelectorAll('.span-canvas')].map(c=>Number(c.dataset.frame))"));}
 assert(stalled.every(p=>p.every(k=>k===p[0])),'stalled decoder splits the wall');
 await evaluate("window.__restorePanel();delete window.__restorePanel");await pause(5000);
 const recoveredA=await evaluate("[...document.querySelectorAll('.span-canvas')].map(c=>Number(c.dataset.frame))");await pause(1000);
 const recoveredB=await evaluate("[...document.querySelectorAll('.span-canvas')].map(c=>Number(c.dataset.frame))");
 assert(recoveredB[0]>recoveredA[0]+30,'wall did not recover');
 await fs.writeFile(dir+'/recovery.json',JSON.stringify({pausedA,pausedB,pausedSeek,stalled,recoveredA,recoveredB},null,2));
 // A tall window must preserve 16:9 panels and physical scaling.
 await call('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});await pause(200);
 const geometry=await evaluate(`[...document.querySelectorAll('.wall-panel')].map(p=>({id:p.dataset.screen,width:p.getBoundingClientRect().width,height:p.getBoundingClientRect().height}))`);
 const shot=await call('Page.captureScreenshot',{format:'png',fromSurface:true});await fs.writeFile(dir+'/renderer-tall.png',Buffer.from(shot.data,'base64'));
 await call('Emulation.clearDeviceMetricsOverride');
 await fs.writeFile(dir+'/presentation.json',JSON.stringify({samples,geometry},null,2));
 for(const s of samples){assert(s.settledMs<10000,'seek did not settle '+s.requested);assert(s.probe.every(p=>p.length===5&&p.every(f=>f.frame===p[0].frame)),'mixed PTS');assert(s.probe.at(-1)[0].time-s.probe[0][0].time>1,'frozen panorama');}
 assert(geometry.every(p=>Math.abs(p.width/p.height-16/9)<.003),'preview distorts panels');
 console.log('PASS: identical presented frame across five panels, forward/backward seek, live progression, aspect ratio',samples.map(s=>({time:s.requested,settledMs:s.settledMs,advance:s.probe.at(-1)[0].time-s.probe[0][0].time})));
 await evaluate("window.nava.sendCommand({action:'restart'})");
}finally{await evaluate("window.__restorePanel?.();delete window.__restorePanel").catch(()=>{});ws.close();}
