import type WebSocket from 'ws';

/** Bound each peer's pending queue. Reconnect restores a snapshot instead of replaying stale commands. */
export const MAX_WS_PENDING_BYTES=4*1024*1024;
export function sendWsJson(ws:Pick<WebSocket,'readyState'|'bufferedAmount'|'send'|'terminate'>,json:string,onFailure:(reason:string)=>void):boolean {
  if(ws.readyState!==1)return false;
  if(ws.bufferedAmount+Buffer.byteLength(json,'utf8')>MAX_WS_PENDING_BYTES){
    onFailure('Client lent: limita mesajelor în așteptare a fost atinsă; reconectare necesară.');
    ws.terminate();return false;
  }
  try{
    ws.send(json,error=>{if(error&&ws.readyState===1)onFailure(String(error));});return true;
  }catch(error){onFailure(String(error));return false;}
}
