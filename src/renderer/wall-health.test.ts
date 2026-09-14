import test from 'node:test';
import assert from 'node:assert/strict';
import {WallHealth} from './wall-health';
test('wall stalls escalate once; only a prepared held group reports recovered',()=>{
 const health=new WallHealth();
 const sample={playing:true,target:15,shown:10,ready:false,jumped:false};
 assert.equal(health.update({...sample,now:1000}),null);
 assert.equal(health.update({...sample,now:3999}),null);
 assert.equal(health.update({...sample,now:4000})?.status,'stalled');
 assert.equal(health.update({...sample,now:6000}),null);
 assert.equal(health.update({...sample,now:7000,ready:true,shown:15}),null,'a moving group cannot auto-recover');
 assert.equal(health.update({...sample,now:8000,playing:false,ready:false,shown:15}),null);
 assert.equal(health.update({...sample,now:9000,playing:false,ready:true,shown:15})?.status,'recovered');
 assert.equal(health.stalled(),false);
});
test('an explicit seek starts a new grace period, normal progressing frames stay healthy',()=>{
 const health=new WallHealth();
 for(let now=0;now<4000;now+=100)assert.equal(health.update({now,playing:true,target:now/1000,shown:now/1000,ready:true,jumped:false}),null);
 health.update({now:4000,playing:true,target:100,shown:4,ready:false,jumped:true});
 assert.equal(health.update({now:6500,playing:true,target:102.5,shown:4,ready:false,jumped:false}),null);
 assert.equal(health.update({now:6600,playing:true,target:102.6,shown:102.6,ready:true,jumped:false}),null);
});
