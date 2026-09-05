import type {ScreenConfig,VideoWallConfig} from '../../shared/types';
import { createOpticalWorkshop } from './optical';
import {samsungWallPreset,validateVideoWall,wallBounds,wallSourceRect,type WallRuntimeInfo} from '../../shared/video-wall';

const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const input=(id:string)=>$<HTMLInputElement>(id);
const canvas=$<HTMLCanvasElement>('wall-canvas'),ctx=canvas.getContext('2d')!;
const names=['Babord exterior','Babord interior','Centru · Căpitan','Tribord interior','Tribord exterior'];
let wall=samsungWallPreset(),indices=[0,1,2,3,4],frame:HTMLImageElement|null=null,frameRequest=0;
let centralId='center';
let activeRuntime:WallRuntimeInfo|null=null;
const detected=document.createElement('ul');detected.id='detected-displays';$('runtime-issues').after(detected);
function showRuntime(runtime:WallRuntimeInfo,calibrating:boolean):void {
  activeRuntime=runtime;
  $('runtime-summary').textContent=`${runtime.displays.length} ${runtime.displays.length===1?'ieșire detectată':'ieșiri detectate'} · ${runtime.verifiedScreenIds.length} suprafețe fizice validate de player.${calibrating?' CALIBRARE ACTIVĂ: dezactivează grila și reimportă profilul înainte de public.':''}`;
  $('runtime-issues').replaceChildren(...runtime.issues.map(issue=>{const li=document.createElement('li');li.textContent=issue;return li}));
  detected.replaceChildren(...runtime.displays.map(d=>{const li=document.createElement('li');li.textContent=`Index Nava ${d.index} · ID sistem ${d.id} · ${d.bounds.width} × ${d.bounds.height} DIP · poziție ${d.bounds.x}, ${d.bounds.y} · scalare ${Math.round(d.scaleFactor*100)}%`;return li}));
}
function valid():boolean {
  const r=validateVideoWall(wall),uniqueIndices=new Set(indices).size===indices.length&&indices.every(n=>Number.isInteger(n)&&n>=0&&n<32);
  const ok=r.ok&&uniqueIndices;
  $('validation').textContent=ok?'Geometrie validă · suprafețe distincte, aceeași scară fizică.':!r.ok?r.reason:'Alege câte o ieșire Windows distinctă, între 0 și 31.';
  $('validation').classList.toggle('invalid',!ok);$<HTMLButtonElement>('export').disabled=!ok;return ok;
}
function draw():void {
  if(!valid())return;
  const b=wallBounds(wall),scale=Math.min(2000/b.width,1000/b.height),width=Math.max(1,Math.ceil(b.width*scale));
  canvas.width=width;canvas.height=Math.max(1,Math.ceil(b.height*scale));
  ctx.fillStyle='#e7e9ef';ctx.fillRect(0,0,canvas.width,canvas.height);
  const fw=frame?.naturalWidth??1920,fh=frame?.naturalHeight??1080;
  const grid=input('grid').checked;
  for(const p of wall.panels){
    const x=(p.x-b.x)*scale,y=(p.y-b.y)*scale,w=p.width*scale,h=p.height*scale;
    ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();
    ctx.fillStyle='#111e33';ctx.fillRect(x,y,w,h);
    if(grid){
      ctx.fillStyle='#f3f6ff';ctx.fillRect(x,y,w,h);const step=b.height/10*scale;
      ctx.strokeStyle='#8fa5bf';ctx.lineWidth=.6;
      for(let gx=0;gx<=width;gx+=step){ctx.beginPath();ctx.moveTo(gx,0);ctx.lineTo(gx,canvas.height);ctx.stroke();}
      for(let gy=0;gy<=canvas.height;gy+=step){ctx.beginPath();ctx.moveTo(0,gy);ctx.lineTo(width,gy);ctx.stroke();}
      ctx.strokeStyle='#df655c';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,canvas.height/2);ctx.lineTo(width,canvas.height/2);ctx.stroke();
      ctx.fillStyle='#1f2440';ctx.font='600 16px Segoe UI';ctx.textAlign='center';ctx.fillText(p.screenId,x+w/2,y+h*.35);
    } else if(wall.mode==='cinema'){
      const halo=ctx.createRadialGradient(width/2,canvas.height*.5,0,width/2,canvas.height*.5,width*.6);halo.addColorStop(0,'#435077');halo.addColorStop(1,'#091125');ctx.fillStyle=halo;ctx.fillRect(x,y,w,h);
      for(let i=0;i<220;i++){const fract=(n:number)=>n-Math.floor(n),sx=fract(Math.sin(i*127.1+311.7)*43758.54)*width,sy=fract(Math.sin(i*127.1+623.4)*43758.54)*canvas.height;ctx.fillStyle='#deeaff';ctx.globalAlpha=.25+(i%5)/10;ctx.fillRect(sx,sy,1,1);}ctx.globalAlpha=1;
      if(frame&&p.screenId===centralId){const k=Math.min(w/fw,h/fh);ctx.drawImage(frame,x+(w-fw*k)/2,y+(h-fh*k)/2,fw*k,fh*k);}
    } else if(frame){
      const r=wallSourceRect(wall,p.screenId,fw,fh,w,h);if(r)ctx.drawImage(frame,r.sx,r.sy,r.sw,r.sh,x+r.dx,y+r.dy,r.dw,r.dh);
    }
    ctx.restore();ctx.strokeStyle='#ffffffb3';ctx.lineWidth=1;ctx.strokeRect(x+.5,y+.5,w-1,h-1);
  }
  const visibleArea=wall.panels.reduce((sum,p)=>{const r=wallSourceRect(wall,p.screenId,fw,fh,100,100);return sum+(r?r.sw*r.sh:0)},0)/(fw*fh);
  $('crop-note').textContent=grid?'CALIBRARE: grila înlocuiește filmul și blochează pornirea automată. Dezactiveaz-o și reimportă profilul înainte de public. Aliniază linia coral și caroiajul.':wall.mode==='cinema'?'Filmul este păstrat integral în centru. Lateralele construiesc un singur cer, sincronizat cu povestea.':wall.fit==='cover'?`Pe acest perete se vede aproximativ ${Math.round(visibleArea*100)}% din cadrul original. O sursă panoramică dedicată păstrează mai mult din compoziție; acest decupaj nu deformează filmul.`:'Sursa rămâne întreagă, cu spații libere acolo unde imaginea nu ajunge. Pentru un film 16:9, imaginea se concentrează în centru.';
  $('ratio').textContent=`${(b.width/b.height).toFixed(2)}:1 · ${(b.width/1000).toFixed(2)} m`;
  $('mode-title').textContent=grid?'Grilă de continuitate':wall.mode==='cinema'?'Cinema imersiv':'Panoramă continuă';
  for(const mode of ['cinema','panorama'])$(mode).setAttribute('aria-pressed',String(wall.mode===mode));
  $('panorama-options').hidden=wall.mode==='cinema';
}
function geometry():void {
  $('geometry-body').replaceChildren();$('panel-labels').replaceChildren();
  wall.panels.forEach((p,i)=>{
    const row=document.createElement('tr'),title=document.createElement('td');title.textContent=names[i]??p.screenId;row.append(title);
    const label=document.createElement('span');label.textContent=`${i+1} · ${names[i]??p.screenId}`;label.style.flex=String(p.width);$('panel-labels').append(label);
    for(const key of ['displayIndex','x','y','width','height'] as const){
      const td=document.createElement('td'),field=document.createElement('input');field.type='number';field.step='1';field.value=String(key==='displayIndex'?indices[i]:p[key]);field.setAttribute('aria-label',`${title.textContent} · ${key}`);
      if(key==='displayIndex'){field.min='0';field.max='31'}else if(key==='width'||key==='height')field.min='1';
      field.addEventListener('input',()=>{const n=field.value===''?NaN:Number(field.value);if(key==='displayIndex')indices[i]=n;else p[key]=n;draw()});td.append(field);row.append(td);
    }
    $('geometry-body').append(row);
  });
  input('focus-x').value=String(wall.focusX);input('focus-y').value=String(wall.focusY);$<HTMLSelectElement>('fit').value=wall.fit;input('grid').checked=!!wall.calibration;draw();
}
async function loadFrame():Promise<void>{
  const version=++frameRequest,time=Number(input('frame-time').value);
  if(!Number.isFinite(time)||time<0){$('load-status').textContent='Alege un timp pozitiv pentru cadrul din film.';return;}
  $<HTMLButtonElement>('load-frame').disabled=true;$('load-status').textContent='Extragem un cadru din filmul local…';
  try{
    const response=await fetch(`/api/frame?t=${time}&w=1280`);
    if(!response.ok)throw new Error('Cadrul nu a putut fi încărcat. Verifică filmul și FFmpeg în Debug.');
    const url=URL.createObjectURL(await response.blob()),image=new Image();
    try{image.src=url;await image.decode();if(version===frameRequest){frame=image;draw();$('load-status').textContent='';}}finally{URL.revokeObjectURL(url)}
  }catch(error){if(version===frameRequest)$('load-status').textContent=String(error instanceof Error?error.message:error)}
  finally{if(version===frameRequest)$<HTMLButtonElement>('load-frame').disabled=false}
}
function exportProfile():void {
  if(!valid())return;
  const screens:ScreenConfig[]=wall.panels.map((p,i)=>({id:p.screenId,displayIndex:indices[i],roleLabel:names[i]??p.screenId,showAvatar:p.screenId===centralId,showSubtitles:p.screenId===centralId,showEntities:p.screenId===centralId,playAudio:p.screenId===centralId,kiosk:true,yawOffsetDeg:0}));
  const profile={displayMode:'span',videoWall:wall,screens};
  const url=URL.createObjectURL(new Blob([JSON.stringify(profile,null,2)+'\n'],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='nava-wall-profile.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
for(const mode of ['cinema','panorama'] as const)$(mode).addEventListener('click',()=>{wall.mode=mode;draw()});
for(const [id,key] of [['focus-x','focusX'],['focus-y','focusY']] as const)input(id).addEventListener('input',()=>{wall[key]=Number(input(id).value);draw()});
$('fit').addEventListener('change',()=>{wall.fit=$<HTMLSelectElement>('fit').value as VideoWallConfig['fit'];draw()});
$('grid').addEventListener('change',()=>{wall.calibration=input('grid').checked;draw()});
$('load-frame').addEventListener('click',()=>void loadFrame());
$('export').addEventListener('click',exportProfile);
$('reset').addEventListener('click',()=>{wall=samsungWallPreset();centralId='center';indices=[0,1,2,3,4];input('gap').value='0';geometry()});
$('apply-gap').addEventListener('click',()=>{const gap=Number(input('gap').value);if(!Number.isFinite(gap)||gap<0||gap>2000)return;let x=0;for(const p of wall.panels){p.x=x;x+=p.width+gap;}geometry()});
async function init():Promise<void>{
  try{
    const response=await fetch('/api/wall');
    if(response.status===401||response.status===403){location.href='/login/?next=%2Fwall%2F';return;}
    if(!response.ok)throw new Error('Atelierul nu se poate conecta la player. Reîncarcă pagina.');
    const data=await response.json() as {videoWall:VideoWallConfig|null;screens:Array<{id:string;displayIndex:number;showAvatar:boolean}>;runtime:WallRuntimeInfo};
    if(data.videoWall&&validateVideoWall(data.videoWall).ok){wall=data.videoWall;indices=wall.panels.map(p=>data.screens.find(s=>s.id===p.screenId)?.displayIndex??0);centralId=data.screens.find(s=>s.showAvatar)?.id??'center';}
    showRuntime(data.runtime,!!data.videoWall?.calibration);
    geometry();await loadFrame();
  }catch(error){$('load-status').textContent=String(error instanceof Error?error.message:error);$<HTMLButtonElement>('export').disabled=true;}
}
geometry();void init();
createOpticalWorkshop();
let refreshing=false;
window.setInterval(async()=>{
  if(refreshing||document.hidden)return;refreshing=true;
  try{const r=await fetch('/api/wall');if(!r.ok)throw new Error('disconnected');const d=await r.json();showRuntime(d.runtime,!!d.videoWall?.calibration);}
  catch{showRuntime({preview:true,displays:[],verifiedScreenIds:[],issues:['Conexiunea cu playerul s-a întrerupt; verificarea hardware trebuie refăcută.']},false)}
  finally{refreshing=false}
},5000);
