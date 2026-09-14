import test from 'node:test';
import assert from 'node:assert/strict';
import {SyncClient} from './sync';
import type {Player} from './player';

test('a follower reports current-epoch wall incidents and periodic readiness without claiming clock authority',async t=>{
  const original=globalThis.WebSocket;
  class Socket extends EventTarget {
    static OPEN=1;static latest:Socket;readyState=1;sent:Array<Record<string,unknown>>=[];
    constructor(){super();Socket.latest=this;}
    send(message:string){this.sent.push(JSON.parse(message));}
    close(){this.readyState=3;}
    receive(value:unknown){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(value)}));}
  }
  globalThis.WebSocket=Socket as unknown as typeof WebSocket;
  let ready=false;
  const player={getState:()=>({state:'paused',phaseTime:22,rate:1,videoReady:ready,sceneId:'light'}),resetSyncRate:()=>{}} as unknown as Player;
  const client=new SyncClient({wsUrl:'ws://fixture.invalid/ws',screenId:'port-inner',isClockSource:false,clockHz:4,seekThresholdSec:.12,rateNudge:.05,player,log:()=>{}});
  t.after(()=>{client.dispose();globalThis.WebSocket=original;});
  client.connect();const socket=Socket.latest;socket.dispatchEvent(new Event('open'));
  assert.equal(socket.sent.find(packet=>packet.type==='hello')?.isClockSource,false);
  assert.equal(socket.sent.find(packet=>packet.type==='report')?.videoReady,false,'follower publishes initial readiness');
  socket.receive({type:'mission',snapshot:{runId:'run-one',serverEpoch:'epoch-one',state:{timelineEpoch:7},suspended:false}});
  client.reportWallHealth({status:'stalled',detail:'Decoder stalled',filmTime:22,stalledForMs:3000});
  const incident=socket.sent.find(packet=>packet.type==='wallPlayback');
  assert.equal(incident?.status,'stalled');assert.equal(incident?.runId,'run-one');assert.equal(incident?.serverEpoch,'epoch-one');assert.equal(incident?.timelineEpoch,7);
  ready=true;await new Promise(resolve=>setTimeout(resolve,300));
  const reports=socket.sent.filter(packet=>packet.type==='report');assert(reports.length>=2,'follower keeps publishing at configured 4 Hz');
  assert.equal(reports.at(-1)?.videoReady,true);assert.equal(reports.at(-1)?.timelineEpoch,7);
});
