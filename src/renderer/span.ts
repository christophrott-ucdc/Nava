/** One decoder and physically coordinated panel crops. All overlays live in a panel-sized container. */
import type { ScreenConfig, SpanViewport, VideoWallConfig } from "../shared/types";
import { wallBounds, wallSourceRect, type WallSourceRect } from "../shared/video-wall";
import type { Logger } from "./log";
import { yawSourceRect, type Fit } from "./perspective";
import {createOpticalProjector} from './optical-projector';

export interface SpanOptions {
  stage: HTMLElement; video: HTMLVideoElement; viewports: SpanViewport[]; screens: ScreenConfig[]; fit: Fit;
  centerScreenId: string; overlays: HTMLElement[]; log?: Logger; wall?: VideoWallConfig;
  /** Same show clock as the film/timeline, never a separate wall clock. */
  getTime?: () => number;
}
export interface SpanController {
  start(): void; stop(): void; refresh(): void; setWall(wall: VideoWallConfig): void;
  focusViewport(): SpanViewport | null; viewportCount(): number;
}
export function pickFocusViewport(viewports: readonly SpanViewport[], screens: readonly ScreenConfig[], centerScreenId: string): SpanViewport | null {
  if (!viewports.length) return null;
  const byId = new Map(screens.map(s => [s.id,s]));
  return viewports.find(v => byId.get(v.screenId)?.showAvatar) ?? viewports.find(v => byId.get(v.screenId)?.showSubtitles) ?? viewports.find(v => v.screenId === centerScreenId) ?? viewports[0];
}
export function viewportCss(v: SpanViewport): { left: string; top: string; width: string; height: string } {
  return {left:`${v.x}px`,top:`${v.y}px`,width:`${v.width}px`,height:`${v.height}px`};
}
export function canvasBacking(v: SpanViewport,dpr:number,maxSide=4096):{width:number;height:number} {
  const k=Math.min(Math.max(1,dpr||1),maxSide/Math.max(1,v.width,v.height));
  return {width:Math.max(1,Math.round(v.width*k)),height:Math.max(1,Math.round(v.height*k))};
}
/** Uniform viewports rescale from boot window coordinates when a development window changes size. */
export function scaleViewports(viewports:readonly SpanViewport[],width:number,height:number):SpanViewport[] {
  const right=Math.max(1,...viewports.map(v=>v.x+v.width));
  const bottom=Math.max(1,...viewports.map(v=>v.y+v.height));
  return viewports.map(v=>({...v,x:v.x*width/right,y:v.y*height/bottom,width:v.width*width/right,height:v.height*height/bottom}));
}
export function rendererClockSource(master:boolean,span:boolean,screenId:string,screens:readonly ScreenConfig[]):boolean {
  return master && (span || (screens[0]?.id ?? screenId)===screenId);
}
/** Deterministic global star positions: adjacent panels see pieces of one coordinate field. */
export function wallStar(index:number):{x:number;y:number;size:number;phase:number} {
  const rand=(n:number)=>{const v=Math.sin((index+1)*127.1+n*311.7)*43758.5453;return v-Math.floor(v);};
  return {x:rand(1),y:rand(2),size:.5+rand(3)*1.5,phase:rand(4)*Math.PI*2};
}
export function panelFilmRect(wall:VideoWallConfig|undefined,screenId:string,centralId:string,vw:number,vh:number,W:number,H:number,yaw=0,fit:Fit='cover'):WallSourceRect|null {
  if(wall?.mode==='cinema')return screenId===centralId?yawSourceRect(0,W,H,vw,vh,'contain'):null;
  return wall?wallSourceRect(wall,screenId,vw,vh,W,H):yawSourceRect(yaw,W,H,vw,vh,fit);
}

export function createSpan(opts:SpanOptions):SpanController {
  const log=opts.log??(()=>undefined), video=opts.video;
  const screens=new Map(opts.screens.map(s=>[s.id,s]));
  let wall=opts.wall, running=false, raf=0, dirty=true;
  let videoHandle=0,videoRevision=0,lastVideoRevision=-1,lastAmbientTime=NaN,lastAmbientDraw=-Infinity;
  const hasFrameCallback=typeof video.requestVideoFrameCallback==='function';
  let ambientAccent='#7cc4ff';
  let viewports=opts.viewports.map(v=>({...v}));
  let focus=pickFocusViewport(viewports,opts.screens,opts.centerScreenId);
  let focusBox:HTMLDivElement|null=null;
  let focusContent:HTMLDivElement|null=null;
  const panels:Array<{source:SpanViewport;vp:SpanViewport;box:HTMLDivElement;canvas:HTMLCanvasElement;ctx:CanvasRenderingContext2D|null;white:HTMLElement;vignette:HTMLElement;identify:HTMLElement}>=[];
  const parents:Array<{el:HTMLElement;parent:Node|null;next:Node|null}>=[];
  let observer:MutationObserver|null=null;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const centralId=opts.screens.find(s=>s.showAvatar)?.id??opts.centerScreenId;
  const projectors=new Map<string,NonNullable<ReturnType<typeof createOpticalProjector>>>();

  const fit=()=>{
    dirty=true;
    viewports=scaleViewports(opts.viewports,opts.stage.clientWidth,opts.stage.clientHeight);
    focus=pickFocusViewport(viewports,opts.screens,opts.centerScreenId);
    panels.forEach((p,i)=>{
      p.vp=viewports[i];Object.assign(p.box.style,viewportCss(p.vp));
      const b=canvasBacking(p.vp,window.devicePixelRatio||1);
      if(p.canvas.width!==b.width||p.canvas.height!==b.height){p.canvas.width=b.width;p.canvas.height=b.height;}
    });
    if(focusBox&&focus){
      Object.assign(focusBox.style,viewportCss(focus));
      const logicalWidth=Math.max(1920,focus.width);
      if(focusContent)Object.assign(focusContent.style,{width:`${logicalWidth}px`,height:`${focus.height/focus.width*logicalWidth}px`,transform:`scale(${focus.width/logicalWidth})`});
    }
  };
  const copyLayerState=()=>{
    dirty=true;
    ambientAccent=getComputedStyle(document.documentElement).getPropertyValue('--theme-accent').trim()||'#7cc4ff';
    const white=document.getElementById('white-fade'),vignette=document.getElementById('vignette'),identify=document.getElementById('identify');
    for(const p of panels){
      p.white.classList.toggle('on',!!white?.classList.contains('on'));p.white.classList.toggle('fast',!!white?.classList.contains('fast'));
      p.identify.hidden=identify?.hidden??true;p.identify.classList.toggle('on',!!identify?.classList.contains('on'));
      if(vignette)p.vignette.style.opacity=getComputedStyle(vignette).opacity;
    }
  };
  const build=()=>{
    for(const source of opts.viewports){
      const box=document.createElement('div');box.className='wall-panel';box.dataset.screen=source.screenId;
      const canvas=document.createElement('canvas');canvas.className='span-canvas';box.appendChild(canvas);
      const vignette=document.createElement('div');vignette.className='wall-vignette';box.appendChild(vignette);
      const white=document.createElement('div');white.className='wall-white';box.appendChild(white);
      const identify=document.createElement('div');identify.className='wall-identify';identify.hidden=true;identify.textContent=source.screenId;box.appendChild(identify);
      opts.stage.insertBefore(box,video.nextSibling);
      panels.push({source,vp:source,box,canvas,ctx:canvas.getContext('2d',{alpha:false}),white,vignette,identify});
      if(wall?.optical){const projector=createOpticalProjector(wall,source.screenId);if(projector)projectors.set(source.screenId,projector);}
    }
    if(focus){
      focusBox=document.createElement('div');focusBox.id='span-focus';opts.stage.appendChild(focusBox);
      focusContent=document.createElement('div');focusContent.id='span-content';focusBox.appendChild(focusContent);
      for(const el of opts.overlays){parents.push({el,parent:el.parentNode,next:el.nextSibling});focusContent.appendChild(el);}
    }
    observer=new MutationObserver(copyLayerState);
    for(const id of ['white-fade','identify','vignette']){const el=document.getElementById(id);if(el)observer.observe(el,{attributes:true,attributeFilter:['class','hidden','style']});}
    observer.observe(document.body,{attributes:true,attributeFilter:['data-theme']});
    fit();copyLayerState();
  };
  const ambient=(ctx:CanvasRenderingContext2D,W:number,H:number,screenId:string,t:number)=>{
    const panel=wall?.panels.find(p=>p.screenId===screenId);if(!wall||!panel)return;
    const bounds=wallBounds(wall);
    const accent=ambientAccent;
    ctx.save();ctx.scale(W/panel.width,H/panel.height);ctx.translate(-panel.x,-panel.y);
    const sky=ctx.createLinearGradient(0,bounds.y,0,bounds.y+bounds.height);sky.addColorStop(0,'#060c1b');sky.addColorStop(.55,'#15253c');sky.addColorStop(1,'#080e1c');ctx.fillStyle=sky;ctx.fillRect(panel.x,panel.y,panel.width,panel.height);
    const cx=bounds.x+bounds.width*(.5+.015*Math.sin(t*.025)),cy=bounds.y+bounds.height*.52;
    const halo=ctx.createRadialGradient(cx,cy,0,cx,cy,bounds.width*.55);halo.addColorStop(0,accent);halo.addColorStop(1,'#101c3000');ctx.globalAlpha=.12;ctx.fillStyle=halo;ctx.fillRect(panel.x,panel.y,panel.width,panel.height);ctx.globalAlpha=1;
    for(let i=0;i<220;i++){
      const star=wallStar(i),x=bounds.x+star.x*bounds.width,y=bounds.y+star.y*bounds.height;
      if(x<panel.x-5||x>panel.x+panel.width+5)continue;
      const px=bounds.height/1000;ctx.globalAlpha=.3+.35*(.5+.5*Math.sin(t*.3+star.phase));ctx.fillStyle='#f1f5ff';ctx.beginPath();ctx.arc(x,y,star.size*px,0,Math.PI*2);ctx.fill();
    }
    ctx.globalAlpha=.15;ctx.strokeStyle=accent;ctx.lineWidth=bounds.height/1400;
    for(let j=0;j<3;j++){ctx.beginPath();for(let i=0;i<=100;i++){const x=bounds.x+bounds.width*i/100,y=bounds.y+bounds.height*(.72+.03*j+.035*Math.sin(i*.045+t*.05+j));if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();}
    ctx.restore();
  };
  const calibration=(ctx:CanvasRenderingContext2D,W:number,H:number,id:string)=>{
    const panel=wall?.panels.find(p=>p.screenId===id);if(!wall||!panel)return;
    ctx.save();ctx.fillStyle='#f3f6ff';ctx.fillRect(0,0,W,H);ctx.scale(W/panel.width,H/panel.height);ctx.translate(-panel.x,-panel.y);
    const b=wallBounds(wall),step=b.height/10;ctx.strokeStyle='#8498b0';ctx.lineWidth=panel.width/W;
    for(let x=Math.floor(panel.x/step)*step;x<=panel.x+panel.width;x+=step){ctx.beginPath();ctx.moveTo(x,panel.y);ctx.lineTo(x,panel.y+panel.height);ctx.stroke();}
    for(let y=Math.floor(panel.y/step)*step;y<=panel.y+panel.height;y+=step){ctx.beginPath();ctx.moveTo(panel.x,y);ctx.lineTo(panel.x+panel.width,y);ctx.stroke();}
    ctx.strokeStyle='#ec766b';ctx.lineWidth=3*panel.width/W;ctx.beginPath();ctx.moveTo(panel.x,b.y+b.height/2);ctx.lineTo(panel.x+panel.width,b.y+b.height/2);ctx.stroke();
    ctx.restore();ctx.save();ctx.strokeStyle='#4c78a4';ctx.lineWidth=8;ctx.strokeRect(4,4,W-8,H-8);ctx.fillStyle='#1f2440';ctx.textAlign='center';ctx.font=`600 ${Math.max(18,H*.065)}px Segoe UI`;ctx.fillText(id,W/2,H*.44);ctx.font=`${Math.max(12,H*.023)}px Segoe UI`;ctx.fillText(`${Math.round(panel.width)} × ${Math.round(panel.height)} · x ${Math.round(panel.x)} · y ${Math.round(panel.y)}`,W/2,H*.58);ctx.restore();
  };
  const draw=()=>{
    const vw=video.videoWidth,vh=video.videoHeight,ready=vw>0&&vh>0&&video.readyState>=2;
    const time=reduced.matches?0:(opts.getTime?.()??video.currentTime);
    const revision=hasFrameCallback?videoRevision:(video.getVideoPlaybackQuality?.().totalVideoFrames??video.currentTime);
    const frameChanged=revision!==lastVideoRevision;
    const now=performance.now();
    const ambientDue=wall?.mode==='cinema'&&!wall.calibration&&!reduced.matches&&time!==lastAmbientTime&&now-lastAmbientDraw>=1000/30-.5;
    if(!dirty&&(!frameChanged||wall?.calibration)&&!ambientDue)return;
    const redrawAll=dirty;dirty=false;lastVideoRevision=revision;
    if(ambientDue||redrawAll){lastAmbientTime=time;lastAmbientDraw=now;}
    for(const p of panels){
      const ctx=p.ctx;if(!ctx)continue;const W=p.canvas.width,H=p.canvas.height;
      if(wall?.mode==='cinema'&&p.vp.screenId!==centralId&&!redrawAll&&!ambientDue)continue;
      ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);
      if(wall?.calibration){calibration(ctx,W,H,p.vp.screenId);continue;}
      const cinema=wall?.mode==='cinema';
      if(cinema)ambient(ctx,W,H,p.vp.screenId,time);
      if(ready&&(!cinema||p.vp.screenId===centralId)){
        const projector=projectors.get(p.vp.screenId);
        if(projector&&!cinema){try{projector.draw(video,W,H);ctx.drawImage(projector.canvas,0,0);continue;}catch(error){log('error','Optical projection failed: '+String(error));}}
        const r=panelFilmRect(wall,p.vp.screenId,centralId,vw,vh,W,H,screens.get(p.vp.screenId)?.yawOffsetDeg??0,opts.fit);
        if(r)try{ctx.drawImage(video,r.sx,r.sy,r.sw,r.sh,r.dx,r.dy,r.dw,r.dh);}catch{/* next decoded frame */}
      }
    }
    if(focusBox)focusBox.classList.toggle('wall-calibrating',!!wall?.calibration);
    for(const p of panels){p.white.style.display=wall?.calibration?'none':'';p.vignette.style.display=wall?.calibration?'none':'';}
  };
  const loop=()=>{if(!running)return;draw();raf=requestAnimationFrame(loop);};
  const releaseProjectors=()=>{for(const projector of projectors.values())projector.dispose();projectors.clear();};
  const frameLoop=()=>{if(!running)return;videoRevision++;draw();videoHandle=video.requestVideoFrameCallback(frameLoop);};
  const invalidate=()=>{dirty=true;draw();};
  return {
    start(){if(running)return;if(!panels.length)build();running=true;reduced.addEventListener('change',invalidate);video.classList.add('span-hidden');video.style.transform='';video.addEventListener('seeked',invalidate);video.addEventListener('loadeddata',invalidate);draw();raf=requestAnimationFrame(loop);if(hasFrameCallback)videoHandle=video.requestVideoFrameCallback(frameLoop);log('info',`video wall: ${panels.length} viewport(s), focus=${focus?.screenId}, mode=${wall?.mode??'legacy'}, rvfc=${hasFrameCallback}`);},
    stop(){running=false;releaseProjectors();cancelAnimationFrame(raf);if(videoHandle)video.cancelVideoFrameCallback?.(videoHandle);videoHandle=0;observer?.disconnect();reduced.removeEventListener('change',invalidate);video.removeEventListener('seeked',invalidate);video.removeEventListener('loadeddata',invalidate);video.classList.remove('span-hidden');for(const p of panels)p.box.remove();panels.length=0;for(const o of [...parents].reverse())o.parent?.insertBefore(o.el,o.next?.parentNode===o.parent?o.next:null);parents.length=0;focusBox?.remove();focusBox=null;},
    refresh(){fit();draw();},setWall(next){releaseProjectors();wall=next;for(const p of panels){const projector=createOpticalProjector(next,p.vp.screenId);if(projector)projectors.set(p.vp.screenId,projector);}invalidate();},focusViewport:()=>focus,viewportCount:()=>opts.viewports.length,
  };
}
