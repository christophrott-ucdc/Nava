import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {freshExperience,validParticipants,tutorialSatisfied,narrate,narrationFinished,acceptExperience,stepVoice} from './experience';
import {EXPERIENCE_PRACTICE,FINALE_CHOICES,type NarratorManifest} from '../shared/experience';
import {MissionSession} from './mission-session';
import {MissionStore} from './mission-store';
import type {ScenarioId} from '../shared/scenario-engine';
import type {ShowState} from '../shared/types';

const profiles:ScenarioId[]=['age-5-10','age-10-15','age-15-18','adults'];
const active=()=>({...freshExperience(),status:'tutorial' as const,participants:['1A','1B']});
test('participant masks reject empty, duplicated and impossible zones',()=>{
  assert(validParticipants(['1A','5B']));
  for(const invalid of [[],['1A','1A'],['6A'],['1C'],['A'],null,{}])assert(!validParticipants(invalid));
});
for(const profile of profiles)test(`${profile}: choices require explicit confirmation and retain independent A/B contributions`,()=>{
  let e={...active(),step:'practice' as const};
  const before=structuredClone(e);
  assert.equal(acceptExperience(e,profile,'1A','tutorial:confirm',false),null);
  assert.equal(acceptExperience(e,profile,'1A','tutorial:pick:unknown',false),null);
  const p=EXPERIENCE_PRACTICE[profile];
  for(const option of p.options){
    const picked=acceptExperience(e,profile,'1A',`tutorial:pick:${option.value}`,false)!;
    assert.equal(picked.practice['1A'],option.value);assert.equal(picked.practiced.length,0);
    const result=acceptExperience(picked,profile,'1A','tutorial:confirm',false);
    if(p.correct!=='any'&&option.value!==p.correct)assert.equal(result,null);
    else {assert.deepEqual(result?.practiced,['1A']);assert(!tutorialSatisfied(result!));assert.equal(acceptExperience(result!,profile,'1A',`tutorial:pick:${option.value}`,false),null);}
  }
  assert.deepEqual(e,before,'pure reducer must preserve caller state');
  assert.equal(stepVoice(e,profile),`${profile}-practice`);
});
test('cooperation waits for both active zones; observation is voluntary and reversible',()=>{
  let e={...active(),step:'cooperate' as const};
  e=acceptExperience(e,'age-5-10','1A','tutorial:link',false)! as typeof e;
  assert(!tutorialSatisfied(e));
  const observed=acceptExperience(e,'age-5-10','1B','tutorial:observe',false)!;
  assert(tutorialSatisfied(observed));assert.deepEqual(observed.linked,['1A']);
  const rejoined=acceptExperience(observed,'age-5-10','1B','tutorial:touch',false)!;
  assert(!tutorialSatisfied(rejoined));assert.deepEqual(rejoined.observed,[]);
  assert(tutorialSatisfied(acceptExperience(rejoined,'age-5-10','1B','tutorial:link',false)!));
});
test('pause, handoff, inactive participants and pending status block tutorial input',()=>{
  const e=active();
  assert.equal(acceptExperience(e,'adults','2A','tutorial:touch',false),null);
  assert.equal(acceptExperience({...e,pausedAt:100},'adults','1A','tutorial:touch',false),null);
  assert.equal(acceptExperience({...e,launchRequested:true},'adults','1A','tutorial:touch',false),null);
  assert.equal(acceptExperience(freshExperience(),'adults','1A','tutorial:touch',false),null);
});
test('narration uses natural duration plus safety margin and repeat has a new identity',()=>{
  const e=active();const voices={voiceId:'fixture',voiceName:'fixture',clips:{touch:{file:'touch.mp3',durationSec:2,text:'test',sha256:'fixture'}}} satisfies NarratorManifest;
  narrate(e,'touch',1000);const first=e.narration!.instance;
  assert(!narrationFinished(e,voices,3349));
  assert(narrationFinished(e,voices,3350)); // Renderer ACK is separately checked by the real server smoke.
  assert(!narrationFinished({...e,pausedAt:1000},voices,999999));
  assert(!narrationFinished(e,null,999999));
  narrate(e,'touch',5000);assert.notEqual(e.narration!.instance,first);assert(!narrationFinished(e,voices,5001));
});
test('finale choices are one-time, profile-specific and distinct from observation or silence',()=>{
  for(const profile of profiles){
    const e={...active(),status:'complete' as const};
    const value=`finale:${FINALE_CHOICES[profile].options[0].value}`;
    assert.equal(acceptExperience(e,profile,'1A',value,false),null);
    assert.equal(acceptExperience(e,profile,'1A','finale:unknown',true),null);
    const chosen=acceptExperience(e,profile,'1A',value,true)!;
    assert.equal(acceptExperience(chosen,profile,'1A','finale:observe',true),null);
    const observed=acceptExperience(chosen,profile,'1B','finale:observe',true)!;
    assert.equal(observed.finale['1B'],'observe');assert.equal(observed.finale['2A'],undefined);
    assert.equal(acceptExperience({...e,pausedAt:1},profile,'1A',value,true),null);
  }
});
test('SQLite commits tutorial ACK with state, deduplicates and rejects stale run and epoch',()=>{
  const store=new MissionStore(':memory:');
  try{
    const s=new MissionSession(store);s.record.scenarioId='age-5-10';s.record.experience=active();s.record.status='active';
    const state={state:'idle',phaseTime:0,rate:1} as ShowState;
    const event={type:'missionAction' as const,eventId:randomUUID(),runId:s.record.runId,cueInstanceId:s.instance(state),zone:'A' as const,value:'tutorial:touch'};
    assert.equal(s.accept(event,1,state).status,'accepted');
    assert.deepEqual(store.get(s.record.runId)?.experience?.touched,['1A']);
    const revision=s.record.revision;
    assert.equal(s.accept(event,1,state).status,'duplicate');assert.equal(s.record.revision,revision);
    assert.equal(s.accept({...event,value:'tutorial:observe'},1,state).status,'invalid');
    s.record.experience!.epoch++;
    assert.equal(s.accept({...event,eventId:randomUUID()},1,state).status,'expired');
    assert.equal(s.accept({...event,eventId:randomUUID(),runId:'old'},1,state).status,'stale-run');
    const restored=new MissionSession(store);assert.equal(restored.recovery?.runId,s.record.runId);assert.deepEqual(restored.recovery?.experience?.touched,['1A']);
  }finally{store.close();}
});
