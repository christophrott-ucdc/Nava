import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {loadScenario} from './scenario-catalog';
import {editScenarioDraft,readScenarioDraft} from './scenario-editor';
import {publicDurationSec,scenarioPhaseEnd} from '../shared/film-timing';
import type {ShowFile} from '../shared/types';

test('EN and FR packages preserve Romanian cue schedules, branches, film and Romanian text',async()=>{
 const root=process.cwd(),legacy=JSON.parse(await readFile(path.join(root,'assets/show/show.json'),'utf8')) as ShowFile;
 const changed=structuredClone(legacy),first=changed.cues.find(c=>c.kind==='voice');assert(first?.kind==='voice');first.text.ro+=' Schimbat.';
 await assert.rejects(()=>loadScenario(root,'legacy-v3',changed,'en'),/Romanian dialogue differs/);
 for(const id of ['legacy-v3','age-5-10','age-10-15','age-15-18','adults'] as const){
  const ro=await loadScenario(root,id,legacy),schedule=(show:ShowFile)=>show.cues.map(c=>({id:c.id,kind:c.kind,phase:c.phase,at:c.at}));
  for(const lang of ['en','fr'] as const){
   const pack=await loadScenario(root,id,legacy,lang);assert.deepEqual(pack.issues,[],`${id}/${lang}`);
   assert.deepEqual(schedule(pack.show),schedule(ro.show));assert.deepEqual(pack.branches,ro.branches);assert.deepEqual(pack.show.scenes,ro.show.scenes);
   assert.equal(pack.show.videoDurationSec,ro.show.videoDurationSec);assert.notEqual(pack.hash,ro.hash);
   for(const cue of pack.show.cues)if(cue.kind==='voice'){
    assert(cue.text[lang]?.trim(),cue.id);const original=ro.show.cues.find(c=>c.id===cue.id);assert(original?.kind==='voice');assert.equal(cue.text.ro,original.text.ro);
    for(const variant of Object.values(cue.variants??{}))assert(variant[lang]);
   }
  }
 }
});

test('all production packages have aligned offline voices, unambiguous branch schedules and unchanged film scenes',async()=>{
  const root=process.cwd(),legacy=JSON.parse(await readFile(path.join(root,'assets/show/show.json'),'utf8')) as ShowFile;
  for(const id of ['age-5-10','age-10-15','age-15-18','adults'] as const){
    const pack=await loadScenario(root,id,legacy);
    assert.deepEqual(pack.issues,[],id);const expected=legacy.scenes.map(scene=>id==='age-5-10'?{...scene,
      end:scene.phase==='play'?scene.end:scenarioPhaseEnd(id,scene.phase,legacy),
      label:({intro:'Primirea · Legenda stelei',tech:'Lumea Cristalului · Atelierul Mann',reentry:'Steaua Omenirii · Acasă'} as Record<string,string>)[scene.id]??scene.label}:scene);
    assert.deepEqual(pack.show.scenes,expected);
    assert.equal(publicDurationSec(pack.show),id==='age-5-10'?873.05:863.05);
    assert.equal(pack.show.videoDurationSec,legacy.videoDurationSec);
    assert.equal(pack.show.launchLeadInSec,10);
    for(const entries of Object.values(pack.branches))assert.equal(new Set(entries.map(e=>e.condition)).size,entries.length);
    assert(pack.show.cues.filter(c=>c.kind==='voice').every(c=>c.kind==='voice'&&c.fallback==='silent'));
  }
});

test('scenario editor preserves other cues, backs up exact input and rejects stale revisions and path traversal',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'nava-editor-'));
  try{
    const dir=path.join(root,'assets/scenarios/adults');await mkdir(dir,{recursive:true});
    const draft={cues:[{id:'a',phase:'play',at:0,text:{ro:'Un text.'}},{id:'b',phase:'play',at:10,text:{ro:'Păstrat.'}}]};
    const raw=JSON.stringify(draft);await writeFile(path.join(dir,'dialogue.ro.draft.json'),raw);
    const first=await readScenarioDraft(root,'adults');
    const result=await editScenarioDraft(root,'adults',{expectedHash:first.hash,cueId:'a',text:'Text schimbat.',at:1});
    assert.equal(result.draft.cues[0].text.ro,'Text schimbat.');assert.deepEqual(result.draft.cues[1],draft.cues[1]);
    assert.equal(await readFile(path.join(dir,'backups',result.backup),'utf8'),raw);
    await assert.rejects(()=>editScenarioDraft(root,'adults',{expectedHash:first.hash,cueId:'a',text:'Stale'}));
    await assert.rejects(()=>readScenarioDraft(root,'../outside' as 'adults'));
    await assert.rejects(()=>editScenarioDraft(root,'adults',{expectedHash:result.hash,cueId:'a',at:466}));
  }finally{await rm(root,{recursive:true,force:true});}
});
