import WebSocket from 'ws';
import fs from 'node:fs/promises';
export const sleep = ms => new Promise(r=>setTimeout(r,ms));
export async function connect(target) {
 const ws=new WebSocket(target.webSocketDebuggerUrl); await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j)});
 let id=0; const pending=new Map(); ws.on('message',raw=>{const m=JSON.parse(String(raw));if(pending.has(m.id)){const [r,j]=pending.get(m.id);pending.delete(m.id);m.error?j(Error(m.error.message)):r(m.result)}});
 const call=(method,params={})=>new Promise((r,j)=>{pending.set(++id,[r,j]);ws.send(JSON.stringify({id,method,params}))});
 await call('Page.enable');await call('Runtime.enable');
 return {call,close:()=>ws.close(),eval:async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value},size:(width,height)=>call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false}),shot:async file=>{const r=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(file,Buffer.from(r.data,'base64'))}};
}
export async function page(url){const ts=await fetch('http://127.0.0.1:19192/json/list').then(r=>r.json());const p=await connect(ts.find(t=>t.type==='page'));await p.call('Page.navigate',{url});return p}
export async function renderer(){const ts=await fetch('http://127.0.0.1:19191/json/list').then(r=>r.json());return connect(ts.find(t=>t.url.includes('/dist/renderer/index.html')))}
