#!/usr/bin/env node
/** Real server/WS/SQLite logic smoke. Synthetic screen ACKs are NOT audio playback proof. */
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import WebSocket from 'ws';
import {createHarness,waitFor,ROOT,PROFILES} from './smoke-scenarios.mjs';

const report={startedAt:new Date().toISOString(),mode:'real server + WebSocket + SQLite; synthetic clock-source audio ACK; no claim of audible playback',checks:[],profiles:[]};
const h=await createHarness({tutorial:true,screens:[{id:'center',displayIndex:0,showAvatar:true,showSubtitles:true,playAudio:true}]});
let screen;
const snap=()=>h.tablets[0].snapshot;
async function control(action,extra={},status=200){const r=await h.api('/api/experience/control',{action,...extra});assert.equal(r.status,status,JSON.stringify(r.body));if(status===200)await waitFor(snap,s=>s.revision>=r.body.snapshot.revision,'control broadcast');return r;}
async function event(value,zone='A',status='accepted',overrides={}){
  const s=snap(),e={type:'missionAction',runId:s.runId,cueInstanceId:s.cueInstanceId,eventId:randomUUID(),zone,value,...overrides};
  h.tablets[0].send(e);const ack=await h.tablets[0].next(m=>m.type==='missionAck'&&m.eventId===e.eventId,'experience ACK');assert.equal(ack.status,status,JSON.stringify(ack));
  if(status==='accepted')await waitFor(snap,n=>n.revision>s.revision,'event broadcast');return e;
}
async function connectScreen(){
  screen=new WebSocket(h.base.replace('http:','ws:')+'/ws');
  await new Promise((resolve,reject)=>{screen.once('error',reject);screen.once('open',()=>{screen.send(JSON.stringify({type:'hello',client:'screen',id:'center',isClockSource:true}));resolve();});});
}
async function finishNarration(id){
  const s=await waitFor(snap,s=>s.experience.narration?.id===id,`narration ${id}`,25000);
  const n=s.experience.narration;
  screen.send(JSON.stringify({type:'experienceAudio',instance:n.instance,status:'ended'}));
  await waitFor(()=>Date.now(),now=>now>=n.startedAt+voices.clips[id].durationSec*1000+650,`natural duration ${id}`,25000);
}
let voices;
try{
  voices=(await h.api('/api/experience/voices')).body;assert.equal(Object.keys(voices.clips).length,12);
  for(const clip of Object.values(voices.clips)){
    const response=await fetch(`${h.base}/assets/experience/voice/ro/${clip.file}`);
    assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/^audio\/mpeg/);
    assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),clip.sha256);
  }
  assert.equal((await fetch(`${h.base}/assets/experience/voice/ro/missing.mp3`)).status,404);
  assert.equal((await fetch(`${h.base}/api/experience/control`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'skip'})})).status,401);
  report.checks.push('All 12 production MP3 HTTP responses match SHA256; unknown file404; anonymous control401');
  await connectScreen();
  await h.select('age-5-10');
  await control('participants',{participants:[]},409);
  await control('participants',{participants:['1A','1B']});await control('start');
  const initial=snap();assert.equal(initial.experience.status,'tutorial');
  assert.equal((await h.api('/api/cmd',{action:'seek',time:100})).status,409);
  await event('tutorial:touch','B','expired',{cueInstanceId:'stale'});
  const accepted=await event('tutorial:touch');
  await event('tutorial:touch','A','duplicate',accepted);
  await event('tutorial:touch','B','stale-run',{runId:'old-run'});
  await control('pause');await event('tutorial:touch','B','invalid');await control('resume');
  await finishNarration('intro');
  await waitFor(snap,s=>s.experience.narration?.id==='touch','intro to touch',3000);
  const oldInstance=snap().experience.narration.instance;
  await control('repeat');assert.notEqual(snap().experience.narration.instance,oldInstance);
  await event('tutorial:touch','B');await control('next',{},409);
  await finishNarration('touch');
  await waitFor(snap,s=>s.experience.step==='practice','practice',3000);
  await event('tutorial:touch','A','expired',{cueInstanceId:accepted.cueInstanceId});
  await event('tutorial:pick:circle');await event('tutorial:confirm','A','invalid');
  await event('tutorial:pick:star');await event('tutorial:confirm');
  await event('tutorial:pick:star','B');await event('tutorial:confirm','B');
  await finishNarration('age-5-10-practice');
  await waitFor(snap,s=>s.experience.step==='cooperate','cooperate',3000);
  await event('tutorial:link');assert.equal(snap().experience.canContinue,false);
  await event('tutorial:link','B');await finishNarration('cooperate');
  await waitFor(snap,s=>s.experience.step==='ready','ready',3000);
  await finishNarration('ready');
  assert.deepEqual(snap().experience.linked,['1A','1B']);
  report.checks.push('full children tutorial: both zones, wrong/correct practice, independent links, natural narration waits, repeat, pause and UUID/run/epoch guards');
  const runId=snap().runId;screen.close();await h.restartServer();
  assert.equal((await h.api('/api/recovery')).body.pending,true);assert.equal(snap().runId,runId);assert.deepEqual(snap().experience.linked,['1A','1B']);
  assert.equal((await h.api('/api/recovery/resume',{})).status,409,'missing reference screen blocks recovery');
  await connectScreen();
  const recovered=snap();
  const show=(await h.api('/api/show')).body;
  screen.send(JSON.stringify({type:'packageReady',contentHash:show.scenario.contentHash,ok:true}));
  screen.send(JSON.stringify({type:'report',state:'idle',phaseTime:0,rate:1,videoReady:true,runId:recovered.runId,serverEpoch:recovered.serverEpoch,timelineEpoch:Number(recovered.cueInstanceId.split(':')[1])}));
  await new Promise(r=>setTimeout(r,100));
  const resumed=await h.api('/api/recovery/resume',{});assert.equal(resumed.status,200,JSON.stringify(resumed.body));
  await waitFor(snap,s=>!s.suspended,'recovery resume');
  await event('tutorial:touch','A','duplicate',accepted);
  report.checks.push('cold SQLite recovery retains tutorial contributions and event deduplication');
  await control('skip');assert.equal(snap().experience.status,'skipped');
  for(const profile of PROFILES){
    await h.command({action:'restart'});await h.select(profile);await control('participants',{participants:['1A','1B']});await control('skip');
    // No renderer readiness claim: keep the synthetic screen disconnected for direct phase testing.
    screen?.close();await new Promise(r=>setTimeout(r,100));
    await h.command({action:'epilogue'});await h.command({action:'seek',time:61});
    await waitFor(snap,s=>s.experience.finaleActive,'finale window');
    const choice={ 'age-5-10':'light','age-10-15':'source','age-15-18':'voice',adults:'question' }[profile];
    await event(`finale:${choice}`);await event('finale:observe','A','invalid');await event('finale:observe','B');
    assert.equal(snap().experience.finale['1A'],choice);assert.equal(snap().experience.finale['1B'],'observe');assert.equal(snap().experience.finale['2A'],undefined);
    report.profiles.push({profile,finale:snap().experience.finale});
  }
  report.checks.push('all four profile finale choices locked after first acceptance; observation and absent response remain distinct');
  report.passed=true;
}catch(e){report.passed=false;report.error=e.stack;throw e;}
finally{
  screen?.close();await h.close();report.finishedAt=new Date().toISOString();
  const dir=path.join(ROOT,'runs/debug/tutorial-final');await mkdir(dir,{recursive:true});await writeFile(path.join(dir,'logic.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}
