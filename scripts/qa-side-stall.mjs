#!/usr/bin/env node
/** Real isolated server/SQLite/WebSockets; synthetic screen reports, no GPU/media decode. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import WebSocket from 'ws';
import {ROOT,createHarness,waitFor} from './smoke-scenarios.mjs';
const out=path.join(ROOT,'runs/debug/qa-2026-09-14/side-stall');await mkdir(out,{recursive:true});
const h=await createHarness({screens:[{id:'port-inner',displayIndex:0,playAudio:false,showAvatar:false},{id:'center',displayIndex:1,playAudio:true,showAvatar:true}]});
const sockets=[],checks=[];let timer,pollWork=Promise.resolve();
const state=async()=>(await h.api('/api/state')).body;
async function screen(id){
 const ws=new WebSocket(h.base.replace('http:','ws:')+'/ws');sockets.push(ws);
 ws.on('message',raw=>{const m=JSON.parse(String(raw));if(m.type==='welcome')ws.send(JSON.stringify({type:'packageReady',contentHash:m.contentHash??m.show?.scenario?.contentHash,ok:true}));if(m.type==='launchPrepare')ws.send(JSON.stringify({type:'launchReady',id:m.id,screens:[id]}));});
 await new Promise((resolve,reject)=>{ws.once('error',reject);ws.once('open',()=>{ws.send(JSON.stringify({type:'hello',client:'screen',id,isClockSource:id==='center'}));resolve();});});return ws;
}
function report(ws,s,videoReady=true,patch={}){ws.send(JSON.stringify({type:'report',state:s.state,phaseTime:s.phaseTime,videoTime:Math.max(0,s.phaseTime),rate:1,videoReady,runId:s.runId,serverEpoch:s.serverEpoch,timelineEpoch:s.timelineEpoch,...patch}));}
function playback(ws,s,status,patch={}){ws.send(JSON.stringify({type:'wallPlayback',status,detail:'QA side decoder fixture',filmTime:Math.max(0,s.phaseTime),stalledForMs:status==='stalled'?6000:0,runId:s.runId,serverEpoch:s.serverEpoch,timelineEpoch:s.timelineEpoch,...patch}));}
async function stillBlocked(label){const r=await h.api('/api/recovery/resume',{});assert.equal(r.status,409,label+': '+JSON.stringify(r.body));assert.match(r.body.reason,/port-inner/);checks.push({label,status:r.status,reason:r.body.reason});}
try{
 const center=await screen('center'),side=await screen('port-inner');
 await h.select('age-5-10');let current=await state();report(center,current);report(side,current);
 let busy=false;timer=setInterval(()=>{if(busy)return;busy=true;pollWork=(async()=>{try{const s=await state();if(center.readyState===WebSocket.OPEN)report(center,s);}finally{busy=false;}})();},250);
 await h.command({action:'start'});await h.command({action:'seek',time:117});
 current=await state();report(center,current);report(side,current);
 for(const patch of [{runId:'obsolete-run'},{serverEpoch:'obsolete-server'},{timelineEpoch:current.timelineEpoch-1}]){
  playback(side,current,'stalled',patch);await new Promise(r=>setTimeout(r,120));assert.equal((await state()).suspended,false,'stale wall status ignored');checks.push({label:'stale stall ignored',patch});
 }
 current=await state();playback(side,current,'stalled');
 const suspended=await waitFor(state,s=>s.suspended===true,'side stall suspends show');
 await new Promise(r=>setTimeout(r,400));const stopped=await state();assert(Math.abs(stopped.phaseTime-suspended.phaseTime)<.05,'suspended timeline stays fixed');checks.push({label:'side stall freezes timeline',time:suspended.phaseTime,after:stopped.phaseTime});
 await stillBlocked('stall requires recovery');
 playback(center,stopped,'recovered');await new Promise(r=>setTimeout(r,100));await stillBlocked('other screen cannot recover side');
 playback(side,stopped,'recovered',{timelineEpoch:stopped.timelineEpoch-1});report(side,stopped,true,{serverEpoch:'obsolete-server'});await new Promise(r=>setTimeout(r,100));await stillBlocked('stale recovery and stale ready report ignored');
 playback(side,stopped,'recovered');await new Promise(r=>setTimeout(r,100));assert.equal((await state()).suspended,true,'recovered does not autoplay');
 const resumed=await h.api('/api/recovery/resume',{});assert.equal(resumed.status,200,JSON.stringify(resumed.body));await waitFor(state,s=>!s.suspended,'explicit operator resume');checks.push({label:'side recovered permits explicit resume',status:resumed.status});
 current=await state();playback(side,current,'stalled');await waitFor(state,s=>s.suspended,'second stall');current=await state();await stillBlocked('second stall blocks again');report(side,current,true);
 await new Promise(r=>setTimeout(r,120));assert.equal((await state()).suspended,true,'ready report does not autoplay');const resumedByReport=await h.api('/api/recovery/resume',{});assert.equal(resumedByReport.status,200,JSON.stringify(resumedByReport.body));checks.push({label:'same side current ready report permits explicit resume',status:resumedByReport.status});
 assert(h.logs.every(s=>s==='Wall playback suspended'),'only expected injected stall errors: '+JSON.stringify(h.logs));
 await writeFile(path.join(out,'results.json'),JSON.stringify({checkedAt:new Date().toISOString(),kind:'real-server-ws-sqlite-synthetic-decoder-status-no-gpu',checks,expectedInjectedStalls:h.logs.length},null,2));console.log(`PASS side stall: ${checks.length} checks, stale isolation, fixed timeline and explicit recovery`);
}finally{clearInterval(timer);await pollWork;for(const ws of sockets)ws.close();await h.close();}
