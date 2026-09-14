import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {panelSources,adaptivePanelDirectory} from './panel-sources';
import {audiencePanelIds} from '../shared/display-topology';

test('adaptive exports are atomic, count-specific and never a wider-wall subset',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nava-adaptive-'));
 try{
  const sets:Record<string,string>={};
  for(const n of [1,2,3,4,5]){
   const target=path.join(dir,`panels-${n}`);fs.mkdirSync(target);sets[n]=target;
   for(const id of audiencePanelIds(n)!)fs.writeFileSync(path.join(target,id+'.mp4'),'fixture');
   assert.equal(adaptivePanelDirectory(sets,audiencePanelIds(n)!),target);
  }
  assert.throws(()=>adaptivePanelDirectory({'5':sets[5]},audiencePanelIds(4)!));
  assert.throws(()=>adaptivePanelDirectory(sets,['center','center']));
  fs.writeFileSync(path.join(sets[2],'port-inner.mp4'),'');
  assert.throws(()=>adaptivePanelDirectory(sets,audiencePanelIds(2)!));
  assert.throws(()=>adaptivePanelDirectory(sets,['../center']));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('panel selection is complete or legacy, including cinema and unsafe names',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nava-panels-'));
 try{
  assert.equal(panelSources(undefined,['center']),undefined);
  fs.writeFileSync(path.join(dir,'center.mp4'),'fixture');
  assert(panelSources(dir,['center'])?.center.startsWith('file:'));
  const issues:string[]=[];
  assert.equal(panelSources(dir,['center','left'],undefined,issues),undefined);
  assert.equal(issues.length,1);assert(issues[0].includes('left.mp4'));
  assert.equal(panelSources(dir,['center'],'cinema'),undefined);
  assert.equal(panelSources(dir,['../center']),undefined);
  fs.writeFileSync(path.join(dir,'left.mp4'),'');assert.equal(panelSources(dir,['center','left']),undefined);
  fs.unlinkSync(path.join(dir,'left.mp4'));fs.mkdirSync(path.join(dir,'left.mp4'));assert.equal(panelSources(dir,['center','left']),undefined);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
