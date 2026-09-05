#!/usr/bin/env node
/** Isolated HTTP/WS integration: one decoder connection, native display evidence, calibration gating. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import WebSocket from 'ws';
const root=path.resolve(import.meta.dirname,'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'nava-wall-'));
const outfile=path.join(temp,'server.mjs');
await build({entryPoints:[path.join(root,'src/server/index.ts')],outfile,bundle:true,platform:'node',format:'esm',target:'node22',logLevel:'warning',banner:{js:"import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"}});
const {startServer}=await import(pathToFileURL(outfile).href);
const config=JSON.parse(fs.readFileSync(path.join(root,'config.samsung-wall.example.json'),'utf8'));
config.server={port:0,bindHost:'127.0.0.1'};config.security={...config.security,screenToken:'wall-test-screen-token'};config.videoWall.calibration=true;
let evidence=[];
const server=await startServer({config,appRoot:temp,webDir:path.join(root,'dist/web'),showPath:path.join(root,'assets/show/show.json'),cacheDir:path.join(temp,'cache'),runsDir:path.join(temp,'runs'),log:()=>{},wallRuntime:()=>({preview:evidence.length===0,displays:[],issues:[],verifiedScreenIds:evidence})});
const base=`http://127.0.0.1:${server.port}`,sockets=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const state=()=>fetch(base+'/api/state').then(r=>r.json());
async function screen(id,token='wall-test-screen-token'){
 const ws=new WebSocket(`ws://127.0.0.1:${server.port}/ws`);sockets.push(ws);await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j)});
 ws.send(JSON.stringify({type:'hello',client:'screen',id,token,isClockSource:true}));await sleep(120);return ws;
}
try{
 assert.equal((await fetch(base+'/api/wall')).status,401);
 const auth=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin:config.security.operatorPin})});assert.equal(auth.status,200);
 const headers={Authorization:`Bearer ${(await auth.json()).token}`,'Content-Type':'application/json'};
 const wallText=await fetch(base+'/api/wall',{headers}).then(r=>r.text());assert.equal(wallText.includes(config.security.screenToken),false);assert.equal(wallText.includes('operatorPin'),false);
 await screen('center','incorrect-token');assert.equal((await fetch(base+'/api/health').then(r=>r.json())).screens,0);
 const ws=await screen('center');let health=await fetch(base+'/api/health').then(r=>r.json());assert.equal(health.clockSource,'center');assert.equal(health.screens,1);
 // Real camera data URLs commonly exceed64KB. Only authenticated photo messages get the larger budget.
 const photo='data:image/jpeg;base64,'+Buffer.alloc(90*1024,1).toString('base64');
 const nextPhoto=action=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('photo '+action+' was lost')),6000);const onMessage=raw=>{const m=JSON.parse(String(raw));if(m.type==='photo'&&m.action===action){clearTimeout(timer);ws.off('message',onMessage);resolve(m)}};ws.on('message',onMessage)});
 let shows=0;ws.on('message',raw=>{const m=JSON.parse(String(raw));if(m.type==='photo'&&m.action==='show')shows++;});
 const capture=nextPhoto('capture');
 await fetch(base+'/api/cmd',{method:'POST',headers,body:JSON.stringify({cmd:{action:'photo'}})});
 const request=await capture;
 ws.send(JSON.stringify({type:'photoCaptured',runId:'old-run',photoRequestId:request.photoRequestId,cueId:null,dataUrl:photo}));await sleep(100);assert.equal(shows,0,'stale run capture rejected');
 const received=nextPhoto('show'),message={type:'photoCaptured',runId:request.runId,photoRequestId:request.photoRequestId,cueId:null,dataUrl:photo};
 ws.send(JSON.stringify(message));assert.equal((await received).dataUrl,photo);
 ws.send(JSON.stringify(message));await sleep(100);assert.equal(shows,1,'photo retry cannot create a second effect');
 evidence=config.screens.map(s=>s.id);await sleep(1100);let s=await state();assert.deepEqual(new Set(s.readiness.screensConnected),new Set(evidence));assert.equal(s.readiness.screensMissing.length,0);
 ws.send(JSON.stringify({type:'report',state:'idle',phaseTime:0,videoTime:0,rate:1,videoReady:true}));await sleep(120);assert.equal((await state()).videoReady,true);
 await fetch(base+'/api/cmd',{method:'POST',headers,body:JSON.stringify({cmd:{action:'preflight'}})});
 const debug=await fetch(base+'/api/debug/summary',{headers}).then(r=>r.json());assert.equal(debug.preflight.ok,false);assert.ok(debug.preflight.reasons.some(r=>r.includes('Calibrarea TV')));
 evidence=[];await sleep(1100);s=await state();assert.equal(s.readiness.screensConnected.length,1);assert.equal(s.readiness.screensMissing.length,4);
 ws.close();await sleep(150);assert.equal((await fetch(base+'/api/health').then(r=>r.json())).screens,0);
 const invalid=await screen('port-outer');assert.equal((await fetch(base+'/api/health').then(r=>r.json())).clockSource,null);invalid.close();
 const oversized=new WebSocket(`ws://127.0.0.1:${server.port}/ws`);sockets.push(oversized);await new Promise(r=>oversized.once('open',r));const closed=new Promise(r=>oversized.once('close',r));oversized.send(JSON.stringify({type:'photoCaptured',dataUrl:photo}));assert.equal(await closed,1009);
 console.log('wall integration PASS: auth/redaction, center clock, five outputs with evidence, hot-unplug/disconnect, calibration block, authenticated photos over64KB, anonymous payload cap');
}finally{for(const ws of sockets)ws.terminate();await server.stop();fs.rmSync(temp,{recursive:true,force:true});}
