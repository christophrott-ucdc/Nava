/** Full normal-speed rehearsal on an already running isolated Electron QA fixture. */
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const f=JSON.parse(await readFile(process.argv[2],'utf8'));
const api=async(url,body)=>{const r=await fetch(f.base+url,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+f.token},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
assert.equal((await api('/api/cmd',{action:'restart'})).status,200);
assert.equal((await api('/api/scenarios/select',{id:'adults'})).status,200);
for(let i=0;i<60;i++){const state=(await api('/api/state')).body;if(state.readiness?.ready)break;await new Promise(r=>setTimeout(r,1000));}
const start=await api('/api/diagnostics/start',{mode:'rehearsal'});assert.equal(start.status,202,JSON.stringify(start.body));
assert.equal((await api('/api/cmd',{action:'seek',time:90})).status,409,'ordinary commands cannot interfere with rehearsal');
console.log('Full rehearsal started:',start.body.id);
let final;const deadline=Date.now()+670000;let lastMinute=-1;
while(Date.now()<deadline){
  const report=(await api('/api/diagnostics/latest')).body;assert.equal(report.id,start.body.id);
  if(report.status!=='running'){final=report;break;}
  const minute=Math.floor(report.elapsedSec/60);if(minute!==lastMinute){console.log(`Rehearsal ${report.elapsedSec.toFixed(1)} s; ${report.sampleCount} samples`);lastMinute=minute;}
  await new Promise(r=>setTimeout(r,2000));
}
assert(final,'rehearsal must terminate');
await writeFile('runs/debug/scenarios-new/rehearsal-real.json',JSON.stringify(final,null,2));
assert.equal(final.status,'passed',JSON.stringify(final));
const missions=(await api('/api/missions')).body.runs;
assert(!missions.some(r=>r.mode==='diagnostic'),'technical runs excluded from public history');
console.log('Full normal-speed rehearsal PASS',JSON.stringify(final));
