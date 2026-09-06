import type {ClientMessage} from '../shared/protocol';
import {validateCommand} from './state';
import type {PerfSample} from '../shared/types';
export function isPerfSample(x: unknown): x is Omit<PerfSample, "screenId"> & { screenId?: string } {
  if (!x || typeof x !== "object") return false;
  const s = x as Record<string, unknown>;
  const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  const numOrNull = (v: unknown) => v === null || num(v);
  return (
    num(s.videoDropped) &&
    num(s.videoTotal) &&
    numOrNull(s.videoFps) &&
    numOrNull(s.avatarFps) &&
    numOrNull(s.lipsyncLatencyMs) &&
    numOrNull(s.driftSec) &&
    numOrNull(s.roomLevel) &&
    numOrNull(s.heapMb) &&
    (s.audioOutput === null || typeof s.audioOutput === "string")
  );
}


const string=(value:unknown,max=200):value is string=>typeof value==='string'&&value.length<=max;
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const post=(value:unknown)=>Number.isInteger(value)&&Number(value)>=1&&Number(value)<=5;
const states=['idle','preshow','playing','paused','epilogue','ended'];
/** All WS input crosses this validator before the hub accesses a discriminated union. */
export function parseClientMessage(raw:string):ClientMessage|null{
  let v:Record<string,unknown>;
  try{const value:unknown=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))return null;v=value as Record<string,unknown>;}catch{return null;}
  let valid=false;
  switch(v.type){
    case 'hello':valid=['screen','control','tablet'].includes(String(v.client))&&string(v.id,128)&&v.id.length>0&&(v.name===undefined||string(v.name,128))&&(v.post===undefined||post(v.post))&&(v.token===undefined||string(v.token,512))&&(v.isClockSource===undefined||typeof v.isClockSource==='boolean')&&(v.protocolVersion===undefined||Number.isInteger(v.protocolVersion));break;
    case 'cmd':valid=!!validateCommand(v.cmd);break;
    case 'report':valid=states.includes(String(v.state))&&finite(v.phaseTime)&&finite(v.rate)&&v.rate>=0&&v.rate<=8&&typeof v.videoReady==='boolean'&&(v.sceneId===undefined||v.sceneId===null||string(v.sceneId))&&(v.runId===undefined||string(v.runId))&&(v.serverEpoch===undefined||string(v.serverEpoch))&&(v.timelineEpoch===undefined||Number.isInteger(v.timelineEpoch));break;
    case 'packageReady':valid=string(v.contentHash,128)&&typeof v.ok==='boolean';break;
    case 'experienceAudio':valid=string(v.instance)&&['ended','error'].includes(String(v.status));break;
    case 'missionAction':valid=string(v.runId)&&string(v.cueInstanceId)&&string(v.eventId,100)&&string(v.value)&&['A','B'].includes(String(v.zone));break;
    case 'perf':valid=isPerfSample(v.sample);break;
    case 'photoCaptured':valid=string(v.dataUrl,12_000_000)&&(v.cueId===null||string(v.cueId))&&(v.runId===undefined||string(v.runId))&&(v.photoRequestId===undefined||string(v.photoRequestId));break;
    case 'tablet':{
      const e=v.event as Record<string,unknown>|null;if(!string(v.tabletId,128)||!e||typeof e!=='object'||Array.isArray(e))break;
      valid=e.kind==='ping'||e.kind==='set-post'&&finite(e.post)||e.kind==='choice'&&string(e.cueId)&&string(e.value)&&['A','B'].includes(String(e.zone));break;
    }
  }
  return valid?v as unknown as ClientMessage:null;
}
