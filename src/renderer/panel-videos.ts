import {videoCorrection,type DriftSettings} from '../shared/film-timing';

/** Muted decoders follow the server-derived target, never another panel's time. */
export function createPanelVideos(urls:Record<string,string>,primaryId:string,primary:HTMLVideoElement,
  target:()=>{time:number;rate:number;playing:boolean},settings:DriftSettings={},onError:(id:string)=>void=()=>{}) {
  const videos=new Map<string,HTMLVideoElement>([[primaryId,primary]]);
  const pending=new Set<string>();let raf=0,stopped=false;
  const seekLatency=new Map<string,number>(),seekStarted=new Map<string,number>();
  const settledAt=new Map<string,number>();
  const prepared=new Set<string>(),failed=new Set<string>();
  for(const [id,url] of Object.entries(urls))if(id!==primaryId){
    const v=document.createElement('video');v.muted=true;v.playsInline=true;v.preload='auto';v.src=url;v.load();
    v.hidden=true;v.dataset.panelSource=id;document.body.appendChild(v);
    v.addEventListener('error',()=>onError(id));videos.set(id,v);
  }
  for(const [id,v] of videos)v.addEventListener('seeked',()=>{const now=performance.now(),start=seekStarted.get(id);settledAt.set(id,now);if(start!==undefined){const measured=Math.min(3,(now-start)/1000);seekLatency.set(id,((seekLatency.get(id)??measured)+measured)/2);seekStarted.delete(id);}});
  for(const [id,v] of videos){if(v.readyState>=3)prepared.add(id);v.addEventListener('canplay',()=>{prepared.add(id);failed.delete(id);});v.addEventListener('error',()=>failed.add(id));}
  const tick=()=>{
    if(stopped)return;
    const state=target();
    for(const [id,v] of videos){
      if(v.readyState<1)continue;
      const time=Math.min(Math.max(0,state.time),Number.isFinite(v.duration)?Math.max(0,v.duration-.001):Infinity);
      const correction=videoCorrection(v.currentTime,time,state.rate||1,settings);
      // Give the decoded GOP time to resume presentation; otherwise repeated hard
      // seeks can starve playback on a slow decoder indefinitely.
      const settling=state.playing&&performance.now()-(settledAt.get(id)??-Infinity)<1000;
      if(!v.seeking&&((correction.seek&&!settling)||(!state.playing&&Math.abs(v.currentTime-time)>.016))){
        // Random access decodes from a keyframe. Aim at the server time at which
        // the frame will be ready, using this decoder's measured seek latency.
        seekStarted.set(id,performance.now());
        v.currentTime=Math.min(Number.isFinite(v.duration)?v.duration-.001:Infinity,time+(state.playing?(seekLatency.get(id)??0)*state.rate:0));
      }
      const rate=settling&&correction.seek?state.rate*(1+Math.sign(time-v.currentTime)*(settings.rateNudge??.05)):correction.rate;
      if(v.playbackRate!==rate)v.playbackRate=rate;
      if(state.playing&&v.paused&&!pending.has(id)){pending.add(id);void v.play().catch(()=>onError(id)).finally(()=>pending.delete(id));}
      else if(!state.playing&&!v.paused)v.pause();
    }
    raf=requestAnimationFrame(tick);
  };
  raf=requestAnimationFrame(tick);
  return {videos,ready:()=>prepared.size===videos.size&&failed.size===0,dispose(){stopped=true;cancelAnimationFrame(raf);for(const v of videos.values())if(v!==primary){v.pause();v.removeAttribute('src');v.load();v.remove();}videos.clear();}};
}
