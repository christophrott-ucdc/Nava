import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {panelSources} from './panel-sources';
test('panel selection is complete or legacy, including cinema and unsafe names',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nava-panels-'));
 try{
  assert.equal(panelSources(undefined,['center']),undefined);
  fs.writeFileSync(path.join(dir,'center.mp4'),'fixture');
  assert(panelSources(dir,['center'])?.center.startsWith('file:'));
  assert.equal(panelSources(dir,['center','left']),undefined);
  assert.equal(panelSources(dir,['center'],'cinema'),undefined);
  assert.equal(panelSources(dir,['../center']),undefined);
  fs.mkdirSync(path.join(dir,'left.mp4'));assert.equal(panelSources(dir,['center','left']),undefined);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
