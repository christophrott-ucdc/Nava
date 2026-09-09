/** Inspect the real Electron renderer on the local test port; no synthetic frames. */
import fs from 'node:fs/promises';
import WebSocket from 'ws';
import assert from 'node:assert/strict';
const dir='runs/film-reintegration';await fs.mkdir(dir,{recursive:true});
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
 if(!process.argv.includes('--steady')){
  await evaluate(`window.nava.sendCommand({action:'restart'})`);await pause(300);
  await evaluate(`window.nava.sendCommand({action:'start'})`);await pause(300);
 }
 for(const time of process.argv.includes('--steady')?[null,null,null,null,null]:[80,200,300,360,430,527,630]){
  if(time!==null)await evaluate(`window.nava.sendCommand({action:'seek',time:${time}})`);await pause(time===null?2000:2200);
  const started=Date.now();let videos;
  do {
    videos=await evaluate(`Array.from(document.querySelectorAll('video')).map(v=>({src:v.currentSrc.split('/').pop(),width:v.videoWidth,height:v.videoHeight,time:v.currentTime,ready:v.readyState,seeking:v.seeking,paused:v.paused,rate:v.playbackRate,frames:v.getVideoPlaybackQuality().totalVideoFrames}))`);
    const times=videos.map(v=>v.time);
    if(videos.every(v=>v.ready>=2&&!v.seeking&&!v.paused)&&Math.max(...times)-Math.min(...times)<.12)break;
    await pause(200);
  }while(Date.now()-started<8000);
  samples.push({requested:time,additionalSettleMs:Date.now()-started,videos});
  const shot=await call('Page.captureScreenshot',{format:'png',fromSurface:true});await fs.writeFile(`${dir}/renderer-${time}.png`,Buffer.from(shot.data,'base64'));
 }
 await fs.writeFile(`${dir}/panel-playback${process.argv.includes('--steady')?'-steady':''}.json`,JSON.stringify(samples,null,2));console.log(JSON.stringify(samples,null,2));
 for(const sample of samples){assert.equal(sample.videos.length,5);assert(sample.videos.every(v=>v.ready>=2&&!v.paused));const times=sample.videos.map(v=>v.time);assert(Math.max(...times)-Math.min(...times)<.12,`Panel drift at ${sample.requested}`);}
}finally{ws.close();}
