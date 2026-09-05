import type { VideoWallConfig, WallPanel, ScreenConfig } from './types';
import {validateOpticalCalibration,type OpticalMarkerMap} from './optical-calibration';

export interface WallRect { x:number; y:number; width:number; height:number }
export interface WallSourceRect { sx:number; sy:number; sw:number; sh:number; dx:number; dy:number; dw:number; dh:number }
export interface WallRuntimeInfo {
  preview:boolean;
  displays:Array<{index:number;id:number;bounds:WallRect;scaleFactor:number}>;
  issues:string[];
  verifiedScreenIds:string[];
}

/** Expand one authenticated span connection only with native display/window evidence. */
export function connectedWallScreens(connectedIds:readonly string[],primaryId:string,verifiedIds:readonly string[]):string[] {
  return [...new Set([...connectedIds,...(connectedIds.includes(primaryId)?verifiedIds:[])])];
}

export function wallBounds(wall:VideoWallConfig):WallRect {
  const x=Math.min(...wall.panels.map(p=>p.x)),y=Math.min(...wall.panels.map(p=>p.y));
  return {x,y,width:Math.max(...wall.panels.map(p=>p.x+p.width))-x,height:Math.max(...wall.panels.map(p=>p.y+p.height))-y};
}

/** One source placement for the entire wall; never fit the film independently per panel. */
export function wallVideoPlacement(wall:VideoWallConfig,videoW:number,videoH:number):WallRect {
  const b=wallBounds(wall);
  const scale=(wall.fit==='cover'?Math.max:Math.min)(b.width/videoW,b.height/videoH);
  const width=videoW*scale,height=videoH*scale;
  return {x:b.x+(b.width-width)*wall.focusX,y:b.y+(b.height-height)*wall.focusY,width,height};
}

/** Intersection maps physical mm into source and destination pixels, preserving real-world scale. */
export function wallSourceRect(wall:VideoWallConfig,screenId:string,videoW:number,videoH:number,outW:number,outH:number):WallSourceRect|null {
  const p=wall.panels.find(p=>p.screenId===screenId);
  if(!p||![videoW,videoH,outW,outH].every(n=>Number.isFinite(n)&&n>0))return null;
  const v=wallVideoPlacement(wall,videoW,videoH);
  const x=Math.max(p.x,v.x),y=Math.max(p.y,v.y),right=Math.min(p.x+p.width,v.x+v.width),bottom=Math.min(p.y+p.height,v.y+v.height);
  if(right<=x||bottom<=y)return null;
  return {sx:(x-v.x)/v.width*videoW,sy:(y-v.y)/v.height*videoH,sw:(right-x)/v.width*videoW,sh:(bottom-y)/v.height*videoH,dx:(x-p.x)/p.width*outW,dy:(y-p.y)/p.height*outH,dw:(right-x)/p.width*outW,dh:(bottom-y)/p.height*outH};
}

export type WallValidation={ok:true;value:VideoWallConfig}|{ok:false;reason:string};
export function validateVideoWall(raw:unknown,screenIds?:readonly string[]):WallValidation {
  if(!raw||typeof raw!=='object')return {ok:false,reason:'Configurația panoramei lipsește.'};
  const o=raw as Record<string,unknown>;
  if((o.mode!=='panorama'&&o.mode!=='cinema')||(o.fit!=='cover'&&o.fit!=='contain'))return {ok:false,reason:'Alege modul cinema/panorama și încadrarea cover/contain.'};
  if(![o.focusX,o.focusY].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1))return {ok:false,reason:'Poziția cadrului trebuie să fie între 0 și 1.'};
  if(!Array.isArray(o.panels)||o.panels.length<1||o.panels.length>16)return {ok:false,reason:'Sunt necesare între 1 și 16 ecrane.'};
  const panels:WallPanel[]=[];
  for(const item of o.panels){
    if(!item||typeof item!=='object')return {ok:false,reason:'Ecran invalid.'};
    const p=item as Record<string,unknown>;
    if(typeof p.screenId!=='string'||!p.screenId||p.screenId.length>64||panels.some(x=>x.screenId===p.screenId))return {ok:false,reason:'Fiecare ecran trebuie să aibă un ID unic.'};
    if(!['x','y','width','height'].every(k=>typeof p[k]==='number'&&Number.isFinite(p[k])&&Math.abs(p[k] as number)<=100000)||(p.width as number)<=0||(p.height as number)<=0)return {ok:false,reason:`Dimensiuni sau poziție invalide pentru ${p.screenId}.`};
    panels.push({screenId:p.screenId,x:p.x as number,y:p.y as number,width:p.width as number,height:p.height as number});
  }
  if(screenIds&&(panels.length!==screenIds.length||panels.some(p=>!screenIds.includes(p.screenId))))return {ok:false,reason:'ID-urile panoramei trebuie să coincidă cu screens[].'};
  for(let i=0;i<panels.length;i++)for(let j=i+1;j<panels.length;j++){
    const a=panels[i],b=panels[j];
    if(Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)>0.001&&Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)>0.001)return {ok:false,reason:`Suprafețele ${a.screenId} și ${b.screenId} se suprapun.`};
  }
  if(o.calibration!==undefined&&typeof o.calibration!=='boolean')return {ok:false,reason:'calibration trebuie să fie boolean.'};
  let optical:VideoWallConfig['optical'];
  if(o.optical!==undefined){
    const checked=validateOpticalCalibration(o.optical,(o.optical as {mapping:OpticalMarkerMap})?.mapping);
    if(!checked.ok)return {ok:false,reason:checked.errors.join(' ')};
    if(checked.calibration.displays.some(d=>!panels.some(p=>p.screenId===d.displayId))||checked.calibration.displays.length!==panels.length)return {ok:false,reason:'Calibrarea optică nu corespunde ieșirilor.'};
    optical=checked.calibration;
  }
  return {ok:true,value:{mode:o.mode as VideoWallConfig['mode'],fit:o.fit as VideoWallConfig['fit'],focusX:o.focusX as number,focusY:o.focusY as number,panels,calibration:o.calibration===true,...(optical?{optical}:{})}};
}

export function validateWallScreens(raw:unknown,wall:VideoWallConfig):{ok:true;screens:ScreenConfig[]}|{ok:false;reason:string} {
  if(!Array.isArray(raw)||raw.length!==wall.panels.length)return {ok:false,reason:'Profilul trebuie să definească toate ieșirile video.'};
  const screens:ScreenConfig[]=[];
  for(const item of raw){
    if(!item||typeof item!=='object')return {ok:false,reason:'Ieșire video invalidă.'};
    const s=item as Record<string,unknown>;
    if(typeof s.id!=='string'||!wall.panels.some(p=>p.screenId===s.id)||screens.some(p=>p.id===s.id))return {ok:false,reason:'ID-urile screens și videoWall.panels trebuie să coincidă exact.'};
    if(typeof s.displayIndex!=='number'||!Number.isInteger(s.displayIndex)||s.displayIndex<0||s.displayIndex>31||screens.some(p=>p.displayIndex===s.displayIndex))return {ok:false,reason:'Fiecare TV necesită un index Nava distinct, între 0 și 31.'};
    if(!['showAvatar','showSubtitles','showEntities','playAudio','kiosk'].every(k=>typeof s[k]==='boolean'))return {ok:false,reason:'Profilul trebuie să declare explicit avatarul, subtitrările, entitățile, sunetul și modul kiosk pentru fiecare ecran.'};
    screens.push({id:s.id,displayIndex:s.displayIndex,roleLabel:typeof s.roleLabel==='string'?s.roleLabel:s.id,showAvatar:s.showAvatar as boolean,showSubtitles:s.showSubtitles as boolean,showEntities:s.showEntities as boolean,playAudio:s.playAudio as boolean,kiosk:s.kiosk as boolean,yawOffsetDeg:0});
  }
  const center=screens.filter(s=>s.showAvatar),audio=screens.filter(s=>s.playAudio);
  if(center.length!==1||audio.length!==1||center[0].id!==audio[0].id||screens.some(s=>s.showSubtitles&&s.id!==center[0].id))return {ok:false,reason:'Avatarul, sunetul și subtitrările apar pe un singur ecran central.'};
  return {ok:true,screens};
}

/** Nominal active 16:9 dimensions, not cabinet dimensions. Measure panel edges/gaps in the room. */
export function samsungWallPreset():VideoWallConfig {
  const names=['port-outer','port-inner','center','starboard-inner','starboard-outer'];
  const sizes=[98,98,115,98,98].map(d=>({width:d*25.4*16/Math.hypot(16,9),height:d*25.4*9/Math.hypot(16,9)}));
  let x=0;const panels=sizes.map((s,i)=>{const p={screenId:names[i],x:Math.round(x),y:Math.round((sizes[2].height-s.height)/2),width:Math.round(s.width),height:Math.round(s.height)};x=p.x+p.width;return p});
  return {mode:'cinema',fit:'cover',focusX:.5,focusY:.5,calibration:false,panels};
}
