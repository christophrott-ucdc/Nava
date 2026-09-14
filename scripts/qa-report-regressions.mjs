import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {ROOT,createHarness,waitFor} from './smoke-scenarios.mjs';
const out=path.join(ROOT,'runs/debug/claude-remediation-2026-09-14');await mkdir(out,{recursive:true});
const results=[];
const original=JSON.parse(await readFile(path.join(ROOT,'assets/show/show.json'),'utf8'));
for(const language of ['en','fr']){
 const edited=structuredClone(original);edited.cues.find(c=>c.kind==='voice').text.ro+=' QA source mismatch.';
 const h=await createHarness({connectTablets:false,language,showText:JSON.stringify(edited)});
 try{
  assert.equal((await h.api('/api/health')).status,200);
  const start=await h.api('/api/cmd',{action:'start'});assert.equal(start.body.ok,false);assert.match(start.body.reason,/Pachetul/);
  const tech=(await h.api('/api/technical')).body;assert.equal(tech.state,'attention');
  const unsafeFallback=await h.api('/api/cmd',{action:'setLang',lang:'ro'});assert.equal(unsafeFallback.body.ok,false,'old RO voice cannot accompany an edited script');
  const repair=await h.api('/api/scenarios/select',{id:'age-5-10'});assert.equal(repair.body.ok,true,JSON.stringify(repair));
  results.push({test:`${language} invalid dialogue keeps console available; stale RO audio blocked; valid package can be selected`,pass:true});
 }finally{await h.close();}
}
{
 const h=await createHarness({connectTablets:false,showText:'{broken'});
 try{
  assert.equal((await h.api('/api/health')).status,200);
  const start=await h.api('/api/cmd',{action:'start'});assert.equal(start.body.ok,false);
  const preflight=await h.api('/api/cmd',{action:'preflight'});assert.equal(preflight.body.ok,false);
  results.push({test:'Corrupt show leaves console available and blocks empty performance',pass:true});
 }finally{await h.close();}
}
{
 const h=await createHarness();
 try{
  await h.select('age-5-10');await h.prepareFixture();
  const launch=await h.api('/api/cmd',{action:'start'});assert.equal(launch.body.pending,true);assert(launch.body.message);
  await waitFor(async()=>(await h.api('/api/state')).body,s=>s.state==='playing','start');
  await h.command({action:'seek',phase:'play',time:120});
  h.reportWall({status:'stalled',detail:'QA forced stalled decoder',filmTime:120,stalledForMs:3100});
  const paused=await waitFor(async()=>(await h.api('/api/state')).body,s=>s.suspended,'wall suspension');
  assert.match((await h.api('/api/technical')).body.message,/suspendată/);
  await new Promise(r=>setTimeout(r,350));const still=(await h.api('/api/state')).body;assert.equal(still.phaseTime,paused.phaseTime);
  h.reportWall({status:'recovered',detail:'QA decoder prepared',filmTime:120,stalledForMs:0});
  await waitFor(async()=>(await h.api('/api/technical')).body,t=>t.message.includes('pregătită din nou'),'recovery notice');
  assert.equal((await h.api('/api/state')).body.suspended,true);
  await h.prepareFixture();const resume=await h.api('/api/recovery/resume',{});assert.equal(resume.body.ok,true,JSON.stringify(resume));
  results.push({test:'START pending + wall stall freezes timeline until explicit recovery',pass:true});
 }finally{await h.close();}
}
{
 const h=await createHarness({ignoreLaunches:1});
 try{
  await h.lockCrew();await h.prepareFixture();await h.command({action:'preshow'});
  const end=Math.max(...original.scenes.filter(s=>s.phase==='preshow').map(s=>s.end));
  await h.command({action:'seek',phase:'preshow',time:end-.1});
  const failed=await waitFor(async()=>(await h.api('/api/technical')).body,t=>t.launch.state==='error','first launch timed out',22000);
  assert.match(failed.launch.message,/TV-uri nepregătite/);
  await waitFor(async()=>(await h.api('/api/state')).body,s=>s.state==='playing','automatic bounded retry',10000);
  results.push({test:'Missing initial launch ACK times out, then auto-start retries and succeeds without operator START',pass:true});
 }finally{await h.close();}
}
{
 const h=await createHarness({connectTablets:false});
 try{
  const pending=h.startTvDemo();
  await waitFor(async()=>(await h.api('/api/mission')).body,m=>m.experience?.tvOnly===true,'demo preparation');
  await h.command({action:'restart'});assert.equal((await pending).ok,false);
  assert.equal((await h.api('/api/state')).body.state,'idle');
  results.push({test:'Operator can cancel DEMO TV during voice preparation without a delayed start',pass:true});
 }finally{await h.close();}
}
await writeFile(path.join(out,'server-regressions.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
