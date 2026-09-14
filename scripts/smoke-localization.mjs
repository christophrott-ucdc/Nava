import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHarness,PROFILES,ROOT,waitFor} from './smoke-scenarios.mjs';
const h=await createHarness({tutorial:true}),results=[];
try{
 for(const profile of PROFILES){
  await h.select(profile);await h.lockCrew(1);
  const before=(await h.api('/api/mission')).body;
  for(const lang of ['en','fr','ro']){
   await h.command({action:'setLang',lang});
   const s=await waitFor(()=>h.tablets[0].snapshot,s=>s?.state.lang===lang,'tablet language');
   assert.equal(s.runId,before.runId);assert.deepEqual(s.experience.participants,['1A']);assert.equal(s.experience.crew.characters['1A'],'nova');
   const manifest=(await h.api('/api/experience/voices')).body;assert.equal(manifest.lang,lang);assert(Object.keys(manifest.clips).length>=12);
   assert.equal((await h.api('/api/cmd',{action:'preflight'})).status,200);
   results.push({profile,lang,crewPreserved:true,preflight:true});
  }
  await h.command({action:'setLang',lang:'fr'});assert.equal((await h.api('/api/experience/control',{action:'skip'})).status,200);
  await h.command({action:'start'});
  const refused=await h.api('/api/cmd',{action:'setLang',lang:'en'});assert.equal(refused.status,409);assert.equal((await h.api('/api/state')).body.lang,'fr');
  await h.command({action:'pause'});await h.restartServer();
  const recovered=(await h.api('/api/state')).body;assert.equal(recovered.lang,'fr');assert(recovered.suspended,'restored session is safely suspended');
  assert.equal((await h.api('/api/experience/voices')).body.lang,'fr');
  await h.command({action:'restart'});
 }
 const out=path.join(ROOT,'runs/debug/localization-2026-09-13');await mkdir(out,{recursive:true});await writeFile(path.join(out,'server-parity.json'),JSON.stringify({at:new Date().toISOString(),results,recovery:'French preserved in all four profiles',midShowLanguageChanges:'rejected',screen:'synthetic protocol ACKs; real renderer tested separately'},null,2));
 await h.select('legacy-v3');await h.command({action:'setLang',lang:'fr'});await h.command({action:'reloadShow'});
 const reloaded=(await h.api('/api/show')).body;
 assert(reloaded.cues.filter(c=>c.kind==='voice').every(c=>c.text.fr),'reload retains French dialogue');
 console.log('PASS: all profile languages, crew preserved, preflight, mid-show guard, French SQLite recovery, localized legacy reload.');
}finally{await h.close();}
