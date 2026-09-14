import test from 'node:test';
import assert from 'node:assert/strict';
import {LaunchBarrier} from './launch-barrier';

test('launch requires the current ACK, commits once and cancels a disconnected scheduled screen',async()=>{
  let connected=['center','left'],identity='run-1',starts=0,commits=0,prepared='';
  const cancelled:string[]=[];
  const b=new LaunchBarrier({identity:()=>identity,validate:()=>null,required:()=>['center','left'],connected:()=>connected,preview:()=>false,
    prepare:id=>{prepared=id;},commit:()=>{commits++;},cancel:id=>{cancelled.push(id);},start:()=>{starts++;return {ok:true};}});
  const wait=async(f:()=>boolean)=>{const end=Date.now()+3000;while(!f()){assert(Date.now()<end,'barrier timeout');await new Promise(r=>setTimeout(r,20));}};
  const first=b.start();await b.start();b.acknowledge('stale',['center','left']);assert.equal(b.status.confirmed.length,0);
  b.acknowledge(prepared,['center','center','unknown']);assert.deepEqual(b.status.confirmed,['center']);
  b.acknowledge(prepared,['left']);await wait(()=>b.status.state==='scheduled');
  connected=['center'];b.disconnected(['left']);await first;assert.equal(starts,0);assert.equal(b.status.state,'error');assert.equal(cancelled.length,1);
  assert.equal(b.canRetryAutomatically(),false);assert.equal(b.canRetryAutomatically(Date.now()+5001),true);
  connected=['center','left'];const second=b.start();b.acknowledge(prepared,['center','left']);await second;
  assert.equal(starts,1);assert.equal(commits,2);assert.equal(b.status.state,'ready');b.disconnected(['left']);assert.equal(b.status.state,'ready');
  const third=b.start();identity='run-2';await third;assert.equal(starts,1);assert.equal(b.status.state,'error');
});
