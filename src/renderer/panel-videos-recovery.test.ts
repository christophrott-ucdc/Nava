import test from 'node:test';
import assert from 'node:assert/strict';
import {createPanelVideos} from './panel-videos';

test('paused decoder recovery recaptures native frames when readyState returns without seeked or rvfc',t=>{
  let now=0,next:FrameRequestCallback=()=>{};
  t.mock.method(performance,'now',()=>now);
  const names=['document','VideoFrame','requestAnimationFrame','cancelAnimationFrame'] as const;
  const originals=names.map(name=>Object.getOwnPropertyDescriptor(globalThis,name));
  class Video extends EventTarget {
    readyState=3;seeking=false;paused=true;ended=false;duration=100;playbackRate=1;error=null;
    dataset:Record<string,string>={};nativePts=10_000_000;private time=10;
    get currentTime(){return this.time;}
    set currentTime(value:number){this.time=value;this.nativePts=Math.round(value*1e6);this.dispatchEvent(new Event('seeked'));}
    pause(){this.paused=true;}play(){this.paused=false;return Promise.resolve();}
    load(){}remove(){}removeAttribute(){}requestVideoFrameCallback(){return 1;}cancelVideoFrameCallback(){}
  }
  const side=new Video(),primary=new Video();
  const replacements={document:{body:{appendChild(){}},createElement:()=>side},VideoFrame:class {timestamp:number;constructor(video:Video){this.timestamp=video.nativePts;}close(){}},requestAnimationFrame:(callback:FrameRequestCallback)=>{next=callback;return 1;},cancelAnimationFrame:()=>{}};
  for(const name of names)Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:replacements[name]});
  const state={time:10,rate:1,playing:true},events:string[]=[];
  const group=createPanelVideos({center:'center',side:'side'},'center',primary as unknown as HTMLVideoElement,()=>state,{},()=>{},event=>{events.push(event.status);if(event.status==='stalled')state.playing=false;});
  t.after(()=>{group.dispose();names.forEach((name,i)=>{const descriptor=originals[i];if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name);});});
  const step=(ms:number)=>{now=ms;if(state.playing)state.time=10+ms/1000;next(ms);};
  group.frames.select(10);step(0);side.readyState=1;
  for(const ms of [1000,2000,3000,4000])step(ms);
  assert.deepEqual(events,['stalled']);assert.equal(group.ready(),false);
  step(4250);assert.equal(group.frames.time(),10,'last coherent image remains while held seek misses side capture');
  side.readyState=3; // No seeked event and no requestVideoFrameCallback fires here.
  step(4500);const recoveredFrame=group.frames.select(state.time);
  assert.equal(recoveredFrame?.time,14);assert.equal(recoveredFrame?.frames.get('side')?.timestamp,14_000_000,'uses native decoder PTS');
  step(4750);assert.deepEqual(events,['stalled','recovered']);assert.equal(group.ready(),true);
});
