import {activeCrew} from './active-crew.fixture';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {MissionStore} from './mission-store';
import {MissionSession} from './mission-session';
import type {ShowState} from '../shared/types';

test('SQLite persists an accepted action before ACK, deduplicates and rejects old runs',()=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'nava-store-')),file=path.join(dir,'runs.sqlite');
  let store=new MissionStore(file);
  try{
    const session=new MissionSession(store);session.reset('adults','hash');activeCrew(session);
    const state={state:'playing',phaseTime:110,rate:1,lang:'ro'} as ShowState;
    const view=session.snapshot(state,1);
    const value=view.view!.zones.A.options.find(o=>!o.disabled)!.value;
    const event={type:'missionAction' as const,runId:session.record.runId,cueInstanceId:session.instance(state),eventId:'test-event-0001',zone:'A' as const,value};
    assert.equal(session.accept(event,1,state).status,'accepted');
    const before=structuredClone(session.record.progress);
    assert.equal(session.accept(event,1,state).status,'duplicate');assert.deepEqual(session.record.progress,before);
    assert.equal(session.accept({...event,value:'different'},1,state).status,'invalid');
    session.checkpoint(state);const id=session.record.runId;store.close();store=new MissionStore(file);
    assert.deepEqual(store.recoverable()?.progress,before);assert.equal(store.get(id)?.checkpoint?.phaseTime,110);
    const restored=new MissionSession(store);restored.record=store.get(id)!;
    assert.equal(restored.accept(event,1,state).status,'duplicate');
    restored.seek();assert.equal(restored.accept({...event,eventId:'test-event-0002'},1,state).status,'expired');
    restored.reset();assert.equal(restored.accept(event,1,state).status,'stale-run');
    assert.equal(store.get(id)?.status,'interrupted');
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test('SQLite transaction rolls back state when duplicate ledger insert fails',()=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'nava-store-')),store=new MissionStore(path.join(dir,'db.sqlite'));
  try{
    const session=new MissionSession(store);store.save(session.record);
    store.accept(session.record,'once','payload',{ok:true});
    const mutated={...session.record,revision:99};
    assert.throws(()=>store.accept(mutated,'once','payload',{ok:true}));
    assert.equal(store.get(session.record.runId)?.revision,0);
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test('shared probe builder opens after a measurement or the observation window, and comfort survives a new group',()=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'nava-gate-')),store=new MissionStore(path.join(dir,'db.sqlite'));
  try{
    const s=new MissionSession(store);s.reset('age-10-15','hash');activeCrew(s);
    const state={state:'playing',phaseTime:194,rate:1,lang:'ro'} as ShowState;
    const event=(value:string,n:number)=>({type:'missionAction' as const,runId:s.record.runId,cueInstanceId:s.instance(state),eventId:`gate-event-${n}`,zone:'A' as const,value});
    assert.equal(s.accept(event('construct',1),1,state).status,'expired');
    assert.equal(s.accept(event('observe',2),1,state).status,'accepted');
    assert.equal(s.accept(event('piece:1',3),1,state).status,'expired');
    assert.equal(s.accept(event('piece:1',4),1,{...state,phaseTime:199}).status,'accepted');
    s.setAccessibility(1,{textScale:1.3,reducedMotion:true});s.reset('adults','hash2');
    assert.equal(s.record.accessibility['1'].textScale,1.3);assert.equal(s.record.accessibility['1'].reducedMotion,true);
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});


test('recovery includes prepared crew and never resurrects an older active run after completion',()=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'nava-recovery-')),file=path.join(dir,'db.sqlite');
  let store=new MissionStore(file);
  try{
    const s=new MissionSession(store);s.reset('age-5-10','hash');activeCrew(s);
    s.checkpoint({state:'idle',phaseTime:0,rate:0,lang:'ro'} as ShowState);
    const id=s.record.runId;
    store.close();store=new MissionStore(file);
    assert.equal(store.recoverable()?.runId,id);
    assert(store.recoverable()?.checkpointSavedAt);
    const old={...store.get(id)!,status:'active' as const};store.save(old);
    store.save({...old,runId:'new-completed-run',status:'completed'});
    assert.equal(store.recoverable(),null);
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test('a failed checkpoint does not replace the last committed state or suppress retry',()=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'nava-checkpoint-')),store=new MissionStore(path.join(dir,'db.sqlite'));
  try{
    const s=new MissionSession(store);
    const state={state:'playing',phaseTime:10,rate:1,lang:'ro'} as ShowState;
    s.checkpoint(state);const committed=structuredClone(s.record);
    const save=store.save.bind(store);store.save=()=>{throw Error('disk unavailable');};
    assert.throws(()=>s.checkpoint({...state,phaseTime:10.25}));
    assert.deepEqual(s.record,committed);
    store.save=save;s.checkpoint({...state,phaseTime:10.25});
    assert.equal(store.get(s.record.runId)?.checkpoint?.phaseTime,10.25);
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
