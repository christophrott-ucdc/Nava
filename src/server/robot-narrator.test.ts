import test from 'node:test';
import assert from 'node:assert/strict';
import {RobotNarrator} from './robot-narrator';
import type {RobotNarration} from '../shared/integrations';
import type {ShowState} from '../shared/types';

test('silent robot simulator deduplicates speech and stops on end, seek and session changes',async()=>{
  const r=new RobotNarrator();r.configure('simulator');
  const asset={cueId:'ai-1',contentHash:'hash',language:'ro'};await r.prepare('hash',[asset]);
  const e:RobotNarration={...asset,asset,instanceId:'instance-1',runId:'run-1',timelineEpoch:1,speaker:'AVATAR_AI',phase:'play',at:10,text:'Test',durationMs:2000};
  const state={state:'playing',runId:'run-1',timelineEpoch:1,phaseTime:10} as ShowState;
  r.speak(e);r.speak(e);assert.equal(r.status.events,1);
  r.tick({...state,state:'paused',phaseTime:11});assert.equal(r.status.state,'paused');
  r.tick({...state,phaseTime:11});assert.equal(r.status.state,'speaking');
  r.tick({...state,phaseTime:12});assert.equal(r.status.current,null);
  r.speak({...e,instanceId:'instance-2'});r.tick({...state,timelineEpoch:2});assert.equal(r.status.current,null);
  r.speak({...e,instanceId:'instance-3'});r.tick({...state,runId:'run-2'});assert.equal(r.status.current,null);
  r.speak({...e,instanceId:'unknown',contentHash:'different'});assert.equal(r.status.state,'error');assert.equal(r.status.events,3);
  r.configure('screen');r.speak({...e,instanceId:'disabled'});assert.equal(r.status.current,null);
});
