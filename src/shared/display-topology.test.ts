import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDisplayTopology, validateAutoDisplays, validatePersistentWallProfile, type InventoryDisplay, type PersistentWallProfile } from './display-topology';

const displays=(count:number):InventoryDisplay[]=>Array.from({length:count},(_,i)=>({runtimeId:i+10,index:i,hardwareKey:`serial:SAM:tv-${i}`,identityConfidence:'serial',label:'Samsung',boundsDip:{x:i*3840,y:0,width:3840,height:2160},pixelSize:{width:3840,height:2160},scaleFactor:1,rotation:0,refreshHz:60,internal:false,virtual:false,physicalSizeMm:{width:2170,height:1220},physicalSizeSource:'edid'}));
const profile=(inventory:InventoryDisplay[]):PersistentWallProfile=>{
  const c=buildDisplayTopology(inventory,{enabled:true});
  return {schemaVersion:1,installationId:'room',revision:1,savedAt:new Date().toISOString(),assignments:c.assignments,expectedAudienceCount:inventory.length,videoWall:c.videoWall,screens:c.screens,geometryStatus:'estimated'};
};

test('automatic topologies cover 1–16 outputs with a single avatar/audio and unique panels',()=>{
  for(let n=1;n<=16;n++){
    const c=buildDisplayTopology(displays(n),{enabled:true});
    assert.equal(c.canApply,true,`${n}: ${c.issues.join(',')}`);
    assert.equal(c.screens.length,n);assert.equal(c.videoWall.panels.length,n);
    assert.equal(c.screens.filter(s=>s.showAvatar).length,1);assert.equal(c.screens.filter(s=>s.playAudio).length,1);
    assert.equal(new Set(c.screens.map(s=>s.displayIndex)).size,n);
  }
  assert.equal(buildDisplayTopology([],{enabled:true}).canApply,false);
  assert.equal(buildDisplayTopology(displays(17),{enabled:true}).canApply,false);
});
test('Samsung 98–98–115–98–98 keeps physical center, distinct dimensions and no optical claim',()=>{
  const list=displays(5);list[2].physicalSizeMm={width:2546,height:1432};
  const c=buildDisplayTopology(list,{enabled:true,layout:'samsung-5'});
  assert.equal(c.canApply,true);assert.equal(c.screens.find(s=>s.showAvatar)?.displayIndex,2);
  assert.ok(c.videoWall.panels[2].width>c.videoWall.panels[0].width);assert.equal(c.geometryStatus,'estimated');
  assert.equal(buildDisplayTopology(list,{enabled:true,layout:'samsung-5',allowEstimatedGeometry:false}).canApply,false);
});
test('operator role persists by hardware key across runtime ID and port changes',()=>{
  const list=displays(6),c=buildDisplayTopology(list,{enabled:true,operatorDisplayIds:[15]});
  const saved:PersistentWallProfile={...profile(list.slice(0,5)),assignments:c.assignments};
  const moved=list.map(d=>({...d,runtimeId:d.runtimeId+100}));
  const next=buildDisplayTopology(moved,{enabled:true},saved);
  assert.equal(next.canApply,true);assert.equal(next.screens.length,5);assert.equal(next.assignments.find(a=>a.hardwareKey===list[5].hardwareKey)?.role,'operator');
});
test('known installation does not shrink on unplug or absorb a new display',()=>{
  const list=displays(5),saved=profile(list);
  const missing=buildDisplayTopology(list.slice(0,4),{enabled:true},saved);
  assert.equal(missing.canApply,false);assert.equal(missing.expectedAudienceCount,5);
  const added=buildDisplayTopology(displays(6),{enabled:true},saved);
  assert.equal(added.canApply,true);assert.equal(added.screens.length,5);assert.ok(added.warnings.some(w=>w.includes('nou')));
});
test('mixed DPI uses separate windows; overlapping desktop and rotation are blocked',()=>{
  const list=displays(2);list[1].scaleFactor=1.5;
  assert.equal(buildDisplayTopology(list,{enabled:true}).displayMode,'windows');
  list[1].boundsDip.x=0;assert.equal(buildDisplayTopology(list,{enabled:true}).canApply,false);
  list[1].boundsDip.x=3840;list[1].rotation=90;assert.equal(buildDisplayTopology(list,{enabled:true}).canApply,false);
});
test('ambiguous hardware, unavailable selection, internal and virtual displays are handled explicitly',()=>{
  const list=displays(3);list[0].internal=true;list[1].virtual=true;
  assert.equal(buildDisplayTopology(list,{enabled:true}).screens.length,1);
  assert.equal(buildDisplayTopology(list,{enabled:true,audienceDisplayIds:[10]}).canApply,false);
  const dup=displays(2);dup[1].hardwareKey=dup[0].hardwareKey;assert.equal(buildDisplayTopology(dup,{enabled:true}).canApply,false);
  assert.equal(buildDisplayTopology(displays(3),{enabled:true,centerDisplayId:99}).canApply,false);
});
test('saved panel identity survives OS ordering changes and keeps measured geometry provenance',()=>{
  const list=displays(3),saved=profile(list);saved.geometryStatus='measured';saved.measurementSource='Survey room 2026-09-05';
  const centerKey=saved.assignments.find(a=>a.screenId==='center')!.hardwareKey;
  const moved=list.map((d,i)=>({...d,index:2-i,boundsDip:{...d.boundsDip,x:(2-i)*3840}}));
  const c=buildDisplayTopology(moved,{enabled:true,allowEstimatedGeometry:false},saved);
  assert.equal(c.canApply,true);assert.equal(c.assignments.find(a=>a.hardwareKey===centerKey)?.screenId,'center');assert.deepEqual(c.videoWall,saved.videoWall);
});
test('persisted profiles validate complete output IDs, revisions, source and bounded config',()=>{
  const saved=profile(displays(3));assert.equal(validatePersistentWallProfile(saved,'room').revision,1);
  assert.throws(()=>validatePersistentWallProfile({...saved,expectedAudienceCount:4},'room'));
  assert.throws(()=>validatePersistentWallProfile({...saved,geometryStatus:'measured'},'room'));
  assert.throws(()=>validatePersistentWallProfile({...saved,schemaVersion:7},'room'));
  assert.throws(()=>validateAutoDisplays({enabled:true,installationId:'../outside'}));
  assert.throws(()=>validateAutoDisplays({enabled:true,operatorDisplayIds:[1],audienceDisplayIds:[1]}));
  assert.throws(()=>validateAutoDisplays({enabled:true,expectedAudienceCount:0}));
  assert.equal(validateAutoDisplays({enabled:true,expectedAudienceCount:16}).expectedAudienceCount,16);
});
