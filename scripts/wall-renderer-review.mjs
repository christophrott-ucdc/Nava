import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {build} from 'esbuild';import {renderer,sleep} from './glass-cdp.mjs';
const dir='runs/debug/final-wall',r=await renderer();
const info=await r.eval(`window.nava.getBoot().then(b=>({wall:b.config.videoWall,mode:b.displayMode,screen:b.screen.id,viewports:b.viewports}))`);
assert.equal(info.mode,'span');assert.equal(info.viewports.length,5);const mode=info.wall.calibration?'calibration':info.wall.mode;
const cfg=JSON.parse(await fs.readFile('config.json','utf8'));
const login=await fetch('http://127.0.0.1:4321/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin:cfg.security?.operatorPin??'4078'})});assert.equal(login.status,200);const token=(await login.json()).token;
const command=async cmd=>{const response=await fetch('http://127.0.0.1:4321/api/cmd',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({cmd})});assert.equal(response.status,200);};
await r.size(7680,980);await command({action:'restart'});await command({action:'start'});await sleep(300);await command({action:'seek',time:105});await command({action:'pause'});await sleep(700);
const math=await build({entryPoints:['src/shared/video-wall.ts'],bundle:true,write:false,format:'iife',globalName:'WallMath',platform:'browser'});await r.eval(math.outputFiles[0].text);
const layout=await r.eval(`(()=>{const rect=e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height}};return{videos:document.querySelectorAll('video').length,panels:[...document.querySelectorAll('.wall-panel')].map(e=>({id:e.dataset.screen,...rect(e)})),focus:rect(document.querySelector('#span-focus')),avatar:rect(document.querySelector('#avatar')),subtitles:rect(document.querySelector('#subtitles')),overflow:document.documentElement.scrollWidth>innerWidth}})()`);
assert.equal(layout.videos,1);assert.equal(layout.panels.length,5);assert.equal(layout.overflow,false);
const center=layout.panels.find(p=>p.id==='center');assert.ok(Math.abs(layout.focus.x-center.x)<1);assert.ok(Math.abs(layout.focus.width-center.width)<1);assert.ok(layout.avatar.x>=center.x-1&&layout.avatar.x+layout.avatar.width<=center.x+center.width+1);
let pixelCheck=null;
if(mode==='panorama'){
 pixelCheck=await r.eval(`window.nava.getBoot().then(b=>{const v=document.querySelector('video');return [...document.querySelectorAll('.wall-panel')].map(box=>{const a=box.querySelector('canvas'),w=a.width,h=a.height,out=document.createElement('canvas');out.width=w;out.height=h;const c=out.getContext('2d');c.fillStyle='#000';c.fillRect(0,0,w,h);const crop=WallMath.wallSourceRect(b.config.videoWall,box.dataset.screen,v.videoWidth,v.videoHeight,w,h);if(crop)c.drawImage(v,crop.sx,crop.sy,crop.sw,crop.sh,crop.dx,crop.dy,crop.dw,crop.dh);const ac=a.getContext('2d');let maxError=0;for(let j=1;j<5;j++)for(let i=1;i<8;i++){const x=Math.floor(w*i/8),y=Math.floor(h*j/5),p=ac.getImageData(x,y,1,1).data,q=c.getImageData(x,y,1,1).data;for(let k=0;k<3;k++)maxError=Math.max(maxError,Math.abs(p[k]-q[k]));}return{id:box.dataset.screen,maxError,crop}})})`);
 for(const p of pixelCheck)assert.ok(p.maxError<=3,JSON.stringify(p));
}
await r.size(3840,490);await sleep(300);await r.shot(`${dir}/renderer-${mode}-wall.png`);
if(mode==='cinema'){
 await command({action:'preshow'});await sleep(7000);await r.shot(`${dir}/renderer-cinema-captain-wall.png`);
}
for(const [w,h] of [[1920,245],[7680,980]]){await r.size(w,h);await sleep(300);assert.equal(await r.eval('document.documentElement.scrollWidth>innerWidth'),false);await r.shot(`${dir}/renderer-${mode}-${w}.png`)}
await fs.writeFile(`${dir}/renderer-${mode}-results.json`,JSON.stringify({mode,layout,pixelCheck},null,2));
await command({action:'restart'});r.close();console.log(`renderer ${mode} visual / geometry review PASS`);
