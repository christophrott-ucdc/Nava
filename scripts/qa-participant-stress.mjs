#!/usr/bin/env node
/** Participant QA: isolated SQLite/server, synthetic TV clock; never the live installation. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile,readFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import {ROOT,PROFILES,WINDOWS,createHarness,waitFor,client} from './smoke-scenarios.mjs';
const out=path.join(ROOT,'runs/debug/reliability-2026-09-13/participant');
await mkdir(out,{recursive:true});
const manual=process.argv.includes('--serve');
const h=await createHarness({tutorial:true,connectTablets:!manual});
const results=[];let acks=0;
async function send(t,patch={}){
 const s=t.snapshot,event={type:'missionAction',runId:s.runId,cueInstanceId:s.cueInstanceId,eventId:randomUUID(),zone:'A',value:'invalid-action',...patch};
 t.send(event);const ack=await t.next(m=>m.type==='missionAck'&&m.eventId===event.eventId,'stress ACK');acks++;return {event,ack};
}
try{
 if(manual){
  await h.select('age-5-10');console.log('PARTICIPANT_MANUAL_URL='+h.base+'/tablet/?post=1');
  await writeFile(path.join(out,'manual-server.json'),JSON.stringify({base:h.base,commandFile:path.join(out,'manual-command.json')}));
  let stop=false;process.on('SIGINT',()=>{stop=true});process.on('SIGTERM',()=>{stop=true});
  while(!stop){
   let command;try{command=JSON.parse(await readFile(path.join(out,'manual-command.json'),'utf8'));await unlink(path.join(out,'manual-command.json'));}catch{}
   if(command){try{
    if(command.action==='close'){stop=true;continue;}
    if(command.action==='skip'){assert.equal((await h.api('/api/experience/control',{action:'skip'})).status,200);await h.command({action:'start'});await h.command({action:'seek',time:WINDOWS['age-5-10'][0]});await h.holdFrame();}
    else if(command.action==='state')console.log(JSON.stringify((await h.api('/api/state')).body));
    else {await h.command(command);if(command.action==='seek')await h.holdFrame();}
    console.log('MANUAL_COMMAND_OK',command.action);
   }catch(e){console.error('MANUAL_COMMAND_FAILED',String(e));}}
   await new Promise(r=>setTimeout(r,200));
  }
 }else{
  for(let cycle=0;cycle<8;cycle++){
   const profile=PROFILES[cycle%4],seats=[1,2,3,10][cycle%4],lang=['ro','en','fr'][cycle%3];
   await h.select(profile);await h.command({action:'setLang',lang});await h.lockCrew(seats);
   assert.equal((await h.api('/api/experience/control',{action:'skip'})).status,200);
   await h.command({action:'start'});await h.command({action:'seek',time:WINDOWS[profile][0]});await h.holdFrame();
   const t=h.tablets[0];await waitFor(()=>t.snapshot,s=>s?.stage===1&&s.scenarioId===profile,'active stage');
   const value={'age-5-10':'shape:'+t.snapshot.view.zones.A.items?.[0]?.label,'age-10-15':'far','age-15-18':'execute',adults:'wide'}[profile];
   const accepted=await send(t,{value});assert.equal(accepted.ack.status,'accepted');
   const before=(await h.api('/api/runs/'+t.snapshot.runId+'/summary')).body.progress;
   for(let n=0;n<40;n++){const retry=await send(t,accepted.event);assert.equal(retry.ack.status,'duplicate');}
   // A genuine burst: enqueue all retries before consuming any acknowledgment.
   for(let n=0;n<100;n++)t.send(accepted.event);
   for(let n=0;n<100;n++){const retry=await t.next(m=>m.type==='missionAck'&&m.eventId===accepted.event.eventId,'burst duplicate ACK');acks++;assert.equal(retry.status,'duplicate');}
   for(let n=0;n<20;n++){
    assert.equal((await send(t,{runId:randomUUID()})).ack.status,'stale-run');
    assert.equal((await send(t,{cueInstanceId:'obsolete-cue'})).ack.status,'expired');
    assert.equal((await send(t,{value:'unavailable-action'})).ack.status,'invalid');
   }
   assert.equal((await send(t,{...accepted.event,value:'different-payload'})).ack.status,'invalid');
   if(seats===1)assert.equal((await send(t,{zone:'B',value})).ack.status,'inactive-seat');
   assert.deepEqual((await h.api('/api/runs/'+t.snapshot.runId+'/summary')).body.progress,before,'retries and invalid input cannot change progress');
   const reconnected=client(h.base.replace('http:','ws:')+'/ws','scenario-qa-1',1);await reconnected.opened;
   await waitFor(()=>reconnected.snapshot,s=>s?.scenarioId===profile&&s.stage===1,'reconnect snapshot');
   assert.equal((await send(reconnected,accepted.event)).ack.status,'duplicate');
   reconnected.ws.close();
   // Re-establish the original logical tablet after same-ID reconnect.
   t.ws.close();h.tablets[0]=client(h.base.replace('http:','ws:')+'/ws','scenario-qa-1',1);await h.tablets[0].opened;
   await waitFor(()=>h.tablets[0].snapshot,Boolean,'original tablet restored');
   assert.equal((await h.api('/api/state')).status,200);
   results.push({cycle,profile,seats,lang,runId:t.snapshot.runId,actions:acks});
   await h.command({action:'restart'});
  }
  assert.deepEqual(h.logs,[],'no server error logs');
  await writeFile(path.join(out,'stress-results.json'),JSON.stringify({checkedAt:new Date().toISOString(),kind:'real-server-sqlite-ws-synthetic-video-clock',cycles:results.length,acknowledgedActions:acks,serverErrors:h.logs,results},null,2));
  console.log(`PASS participant stress: ${results.length} sessions, ${acks} acknowledged actions, zero server errors`);
 }
}finally{await h.close();}
