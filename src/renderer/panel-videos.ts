import {videoCorrection,type DriftSettings} from '../shared/film-timing';
import {PanelFrames} from './panel-frames';

/** One transport barrier for all decoders and one PTS barrier for presentation.
 * Seeking freezes the whole wall; individual panels never publish a new epoch. */
export function createPanelVideos(urls:Record<string,string>,primaryId:string,primary:HTMLVideoElement,
  target:()=>{time:number;rate:number;playing:boolean},settings:DriftSettings={},onError:(id:string)=>void=()=>{}) {
  const videos=new Map<string,HTMLVideoElement>([[primaryId,primary]]);
  for(const [id,url] of Object.entries(urls))if(id!==primaryId){
    const v=document.createElement('video');v.muted=true;v.playsInline=true;v.preload='auto';v.src=url;
    v.hidden=true;v.dataset.panelSource=id;document.body.appendChild(v);v.load();videos.set(id,v);
  }
  const frames=new PanelFrames<VideoFrame>([...videos.keys()]);
  const prepared=new Set<string>(),failed=new Set<string>(),pending=new Set<string>();
  const callbacks=new Map<string,number>(),listeners:Array<()=>void>=[];
  let raf=0,stopped=false,lastResync=-Infinity,seekLead=.3;
  let barrier:{time:number;started:number;measured:boolean}|null=null;
  let previous:{time:number;at:number;playing:boolean;rate:number}|null=null;
  const listen=(v:HTMLVideoElement,name:string,fn:()=>void)=>{v.addEventListener(name,fn);listeners.push(()=>v.removeEventListener(name,fn));};
  for(const [id,v] of videos){
    if(v.readyState>=3)prepared.add(id);
    listen(v,'canplay',()=>{prepared.add(id);failed.delete(id);});
    listen(v,'error',()=>{failed.add(id);onError(id);});
    const captureFrame=()=>{
      if(stopped)return;
      if(!v.seeking&&v.readyState>=2){
        // Preserve the decoder's native PTS. Do not overwrite it with currentTime
        // or a callback timestamp: callback delivery can itself arrive late.
        try{const frame=new VideoFrame(v);frames.push(id,frame.timestamp/1e6,frame);}
        catch{failed.add(id);onError(id);}
      }
    };
    const capture=()=>{captureFrame();if(!stopped)callbacks.set(id,v.requestVideoFrameCallback(capture));};
    // A paused seek can finish without another presentation callback. Snapshot
    // the actual decoded frame at seeked as well, retaining its native PTS.
    listen(v,'seeked',captureFrame);listen(v,'loadeddata',captureFrame);
    captureFrame();
    callbacks.set(id,v.requestVideoFrameCallback(capture));
  }
  const clamp=(time:number)=>Math.min(Math.max(0,time),...Array.from(videos.values(),v=>Number.isFinite(v.duration)?Math.max(0,v.duration-1/60):Infinity));
  const beginSeek=(time:number,now:number)=>{
    // Snap all five requests to the same encoded frame. No latency estimate per TV.
    const point=Math.floor(clamp(time)*60)/60;
    frames.reset();barrier={time:point,started:now,measured:false};lastResync=now;
    for(const v of videos.values()){v.pause();v.playbackRate=1;v.currentTime=point;}
  };
  const playAll=()=>{
    for(const [id,v] of videos)if(v.paused&&!pending.has(id)&&!v.ended){
      pending.add(id);void v.play().catch(error=>{if(error?.name!=='AbortError'){failed.add(id);onError(id);}}).finally(()=>pending.delete(id));
    }
  };
  const tick=()=>{
    if(stopped)return;
    const state=target(),now=performance.now();
    const predicted=previous?previous.time+(previous.playing?(now-previous.at)/1000*previous.rate:0):state.time;
    const jumped=!!previous&&Math.abs(state.time-predicted)>.2;
    const paused=!!previous&&previous.playing&&!state.playing;
    previous={...state,at:now};
    const loaded=[...videos.values()].every(v=>v.readyState>=1);
    const desired=clamp(state.time+(state.playing ? .05 : 0));
    if(loaded&&(jumped||paused))beginSeek(state.time+(state.playing?seekLead:0),now);
    if(barrier){
      const ready=[...videos.values()].every(v=>!v.seeking&&v.readyState>=2);
      if(ready){
        if(!barrier.measured){seekLead=Math.max(.15,Math.min(2,(now-barrier.started)/1000+.12));barrier.measured=true;}
        if(!state.playing)barrier=null;
        else if(desired>=barrier.time){
          if(desired-barrier.time>.12&&now-lastResync>150)beginSeek(state.time+seekLead,now);
          else {barrier=null;playAll();}
        }
      }
    }else if(loaded){
      const shown=frames.time();
      // Media clocks can advance while presentation stalls or frame callbacks drop.
      // Recover the whole group in that case too; do not trust currentTime alone.
      const stale=state.playing&&state.time>0&&Math.abs(state.time-(shown??0))>.3;
      const hard=stale||[...videos.values()].some(v=>Math.abs(v.currentTime-desired)>Math.max(.12,settings.seekThresholdSec??.12));
      if(hard&&now-lastResync>1500)beginSeek(state.time+(state.playing?seekLead:0),now);
      else {
        for(const v of videos.values()){
          const correction=videoCorrection(v.currentTime,desired,state.rate||1,settings);
          // Until the group can seek, recover with a bounded speed correction.
          const rate=correction.seek?(state.rate||1)*(1+Math.sign(desired-v.currentTime)*(settings.rateNudge??.05)):correction.rate;
          if(v.playbackRate!==rate)v.playbackRate=rate;
          if(!state.playing&&!v.paused)v.pause();
        }
        if(state.playing)playAll();
      }
    }
    raf=requestAnimationFrame(tick);
  };
  raf=requestAnimationFrame(tick);
  return {videos,frames,ready:()=>prepared.size===videos.size&&failed.size===0,
    dispose(){stopped=true;cancelAnimationFrame(raf);for(const [id,v] of videos){v.cancelVideoFrameCallback(callbacks.get(id)??0);if(v!==primary){v.pause();v.removeAttribute('src');v.load();v.remove();}}for(const remove of listeners)remove();frames.dispose();videos.clear();}};
}
