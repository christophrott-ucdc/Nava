import {test} from 'node:test';
import assert from 'node:assert/strict';
import {countdownProgress} from './countdown';
test('countdown follows configured show length rather than a ten-second assumption',()=>{
 for(const duration of [3,10,20,60]){
  assert.equal(countdownProgress(-duration,duration),0);
  assert.equal(countdownProgress(-duration/2,duration),50);
  assert.equal(countdownProgress(0,duration),100);
  assert.equal(countdownProgress(-duration*2,duration),0);
 }
 assert.equal(countdownProgress(-2,0),100);
});
