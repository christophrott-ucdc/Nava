import test from 'node:test';import assert from 'node:assert/strict';
import type WebSocket from 'ws';import {createRequire} from 'node:module';
const WebSocketRuntime=createRequire(import.meta.url)('ws') as typeof WebSocket;
const {WebSocketServer}=createRequire(import.meta.url)('ws') as typeof import('ws');
import {sendWsJson,MAX_WS_PENDING_BYTES} from './ws-send';

test('outbound limit includes UTF-8 bytes and terminates rather than queueing stale commands',()=>{
  let sent=0,terminated=0;const errors:string[]=[];
  const socket={readyState:1,bufferedAmount:MAX_WS_PENDING_BYTES-2,send:()=>{sent++;},terminate:()=>{terminated++;}};
  assert.equal(sendWsJson(socket as unknown as WebSocket,'ăă',e=>errors.push(e)),false);
  assert.equal(sent,0);assert.equal(terminated,1);assert.equal(errors.length,1);
  socket.readyState=3;assert.equal(sendWsJson(socket as unknown as WebSocket,'hello',()=>{}),false);assert.equal(terminated,1);
});

test('real slow socket has bounded queue while another client remains usable',async()=>{
  const server=new WebSocketServer({port:0,host:'127.0.0.1'});
  await new Promise<void>(r=>server.once('listening',r));
  const address=server.address();assert(address&&typeof address!=='string');
  const peers:WebSocket[]=[];server.on('connection',ws=>{peers.push(ws);ws.on('error',()=>{});});
  const slow=new WebSocketRuntime(`ws://127.0.0.1:${address.port}`),healthy=new WebSocketRuntime(`ws://127.0.0.1:${address.port}`);
  try{
    await Promise.all([slow,healthy].map(ws=>new Promise<void>((r,j)=>{ws.once('open',r);ws.once('error',j);})));assert.equal(peers.length,2);
    const raw=(slow as unknown as {_socket:{pause():void;resume():void}})._socket;raw.pause();
    let peak=0,rejected=false;const failures:string[]=[];
    for(let i=0;i<6000;i++){
      const sent=sendWsJson(peers[0],JSON.stringify({payload:'x'.repeat(8192)}),e=>failures.push(e));peak=Math.max(peak,peers[0].bufferedAmount);
      if(!sent){rejected=true;break;}
    }
    assert(rejected,'a stalled reader cannot grow the server queue indefinitely');assert(peak<=MAX_WS_PENDING_BYTES);assert.equal(failures.length,1);
    const received=new Promise<string>(resolve=>healthy.once('message',data=>resolve(String(data))));
    assert(sendWsJson(peers[1],JSON.stringify({alive:true}),()=>assert.fail('healthy send failed')));
    assert.deepEqual(JSON.parse(await received),{alive:true});raw.resume();
  }finally{slow.terminate();healthy.terminate();for(const peer of peers)peer.terminate();await new Promise<void>(r=>server.close(()=>r()));}
});
