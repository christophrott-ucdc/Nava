/** GPU compositor check on the real paused film in an isolated renderer QA fixture. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import * as esbuild from 'esbuild';
import WebSocket from 'ws';
const fixture=JSON.parse(await readFile(process.argv[2],'utf8'));
const api=async cmd=>fetch(fixture.base+'/api/cmd',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+fixture.token},body:JSON.stringify(cmd)});
await api({action:'pause'});
const targets=await fetch(`http://127.0.0.1:${fixture.cdpPort}/json/list`).then(r=>r.json());
const ws=new WebSocket(targets.find(t=>t.url.includes('renderer/index.html')).webSocketDebuggerUrl);
await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});let serial=0;const pending=new Map();
ws.on('message',raw=>{const m=JSON.parse(String(raw));if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}}});
const call=(method,params)=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
const run=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
try{
  const bundle=await esbuild.build({entryPoints:['src/renderer/optical-projector.ts'],bundle:true,format:'iife',globalName:'NavaOpticalQA',write:false,platform:'browser'});
  await run(bundle.outputFiles[0].text);
  const result=await run(`(()=>{
    const video=document.querySelector('#video');video.pause();
    const corners=[[.1,.1],[.9,.1],[.9,.9],[.1,.9]];
    const display={displayId:'center',normalizedCorners:corners,uvToCamera:[.8,0,.1,0,.8,.1,0,0,1]};
    const wall={mode:'panorama',fit:'contain',focusX:.5,focusY:.5,optical:{imageSize:{width:1280,height:720},displays:[display]}};
    const p=NavaOpticalQA.createOpticalProjector(wall,'center');p.draw(video,640,360);
    const reference=document.createElement('canvas');reference.width=640;reference.height=360;const rc=reference.getContext('2d');
    const fit=Math.min(640/video.videoWidth,360/video.videoHeight),w=video.videoWidth*fit,h=video.videoHeight*fit;rc.fillStyle='#000';rc.fillRect(0,0,640,360);rc.drawImage(video,(640-w)/2,(360-h)/2,w,h);
    const actual=document.createElement('canvas');actual.width=640;actual.height=360;const ac=actual.getContext('2d');ac.drawImage(p.canvas,0,0);
    const a=ac.getImageData(0,0,640,360).data,b=rc.getImageData(0,0,640,360).data;let error=0,energy=0;
    for(let i=0;i<a.length;i+=4)for(let k=0;k<3;k++){error+=Math.abs(a[i+k]-b[i+k]);energy+=b[i+k];}
    const result={meanAbsoluteError:error/(640*360*3),meanFilmLuminance:energy/(640*360*3),frame:video.currentTime,videoSize:[video.videoWidth,video.videoHeight],dataUrl:actual.toDataURL('image/png'),panelErrors:[]};p.dispose();
    wall.optical.displays=Array.from({length:5},(_,i)=>({displayId:'panel'+i,normalizedCorners:[[.1+i*.16,.1],[.1+(i+1)*.16,.1],[.1+(i+1)*.16,.9],[.1+i*.16,.9]],uvToCamera:[.16,0,.1+i*.16,0,.8,.1,0,0,1]}));
    for(let i=0;i<5;i++){const projector=NavaOpticalQA.createOpticalProjector(wall,'panel'+i);projector.draw(video,128,360);ac.clearRect(0,0,640,360);ac.drawImage(projector.canvas,0,0);const slice=ac.getImageData(0,0,128,360).data,expected=rc.getImageData(i*128,0,128,360).data;let e=0;for(let n=0;n<slice.length;n+=4)for(let c=0;c<3;c++)e+=Math.abs(slice[n+c]-expected[n+c]);result.panelErrors.push(e/(128*360*3));projector.dispose();}
    return result;
  })()`);
  assert(result.meanFilmLuminance>1,'real film must contain visible content');assert(result.meanAbsoluteError<5,JSON.stringify({...result,dataUrl:undefined}));
  assert(result.panelErrors.every(e=>e<5),'five optical panel crops must reconstruct one source');
  await writeFile('runs/debug/scenarios-new/optical-projection-real-film.png',Buffer.from(result.dataUrl.split(',')[1],'base64'));
  delete result.dataUrl;await writeFile('runs/debug/scenarios-new/optical-projection-review.json',JSON.stringify(result,null,2));console.log('Optical GPU projection PASS',result);
}finally{ws.close();await api({action:'restart'});}
