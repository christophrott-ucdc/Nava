import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {loadScenario} from './scenario-catalog';
import {editScenarioDraft,readScenarioDraft} from './scenario-editor';
import type {ShowFile} from '../shared/types';

test('all production packages have aligned offline voices, unambiguous branch schedules and unchanged film scenes',async()=>{
  const root=process.cwd(),legacy=JSON.parse(await readFile(path.join(root,'assets/show/show.json'),'utf8')) as ShowFile;
  for(const id of ['age-5-10','age-10-15','age-15-18','adults'] as const){
    const pack=await loadScenario(root,id,legacy);
    assert.deepEqual(pack.issues,[],id);assert.deepEqual(pack.show.scenes,legacy.scenes);assert.equal(pack.show.videoDurationSec,465);
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
