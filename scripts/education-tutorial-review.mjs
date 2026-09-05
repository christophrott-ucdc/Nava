#!/usr/bin/env node
/** Real Electron tablet + server/WS. Synthetic screen narration ACKs drive protocol only;
 * all production narration durations elapse naturally. This is not audible playback QA. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,cp,mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import * as esbuild from 'esbuild';
import path from 'node:path';
import WebSocket from 'ws';
import {createHarness,waitFor,ROOT,PROFILES} from './smoke-scenarios.mjs';
const require=createRequire(import.meta.url), out=path.join(ROOT,'runs/debug/romanian-games/tutorial');
await mkdir(out,{recursive:true});
const sourceTemp=await mkdtemp(path.join(os.tmpdir(),'nava-tutorial-review-'));
await cp(path.join(ROOT,'src/web/tablet'),path.join(sourceTemp,'web/tablet'),{recursive:true});
await cp(path.join(ROOT,'src/web/shared'),path.join(sourceTemp,'web/shared'),{recursive:true});
await esbuild.build({entryPoints:[path.join(ROOT,'src/web/tablet/index.ts')],outfile:path.join(sourceTemp,'web/tablet/app.js'),bundle:true,platform:'browser',format:'iife',logLevel:'warning'});
const h=await createHarness({webDir:path.join(sourceTemp,'web'),connectTablets:false,tutorial:true,screens:[{id:'center',displayIndex:0,showAvatar:true,showSubtitles:true,playAudio:true}]});
const report={mode:'Real Electron DOM clicks + authoritative WS; synthetic screen audio-ended ACKs, natural narration duration; no audible playback or physical hardware claim',results:[]};
let child,screen,sequence=0;const requests=new Map();
const snap=async()=>(await h.api('/api/mission')).body;
const rpc=(type,data={})=>new Promise((resolve,reject)=>{const id=++sequence;const timeout=setTimeout(()=>{requests.delete(id);reject(Error('Browser RPC timeout: '+type));},20000);requests.set(id,{resolve,reject,timeout});child.send({id,type,...data});});
const control=async(action,extra={})=>{const r=await h.api('/api/experience/control',{action,...extra});assert.equal(r.status,200,JSON.stringify(r.body));return r;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
  const main=path.join(h.temp,'education-tutorial.cjs');
  await writeFile(main,`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(sourceTemp)});const fs=require('fs');app.commandLine.appendSwitch('force-device-scale-factor','1');let w;const out=${JSON.stringify(out)};
  app.whenReady().then(async()=>{w=new BrowserWindow({width:1920,height:1080,useContentSize:true,show:true,x:0,y:0,webPreferences:{offscreen:false,backgroundThrottling:false}});w.webContents.on('console-message',(_e,_l,message)=>console.error(message));await w.loadURL(${JSON.stringify(h.base+'/tablet/?post=1')});process.send({ready:true});});
  process.on('message',async m=>{try{let value;if(m.type==='js')value=await w.webContents.executeJavaScript(m.code);else if(m.type==='capture'){
    value=await w.webContents.executeJavaScript('(()=>({viewport:[innerWidth,innerHeight],text:document.body.innerText,overflow:document.documentElement.scrollWidth>innerWidth+2||document.documentElement.scrollHeight>innerHeight+2,zones:[...document.querySelectorAll(".mission-zone")].map(e=>({zone:e.dataset.zone,x:e.getBoundingClientRect().x,overflow:e.scrollHeight>e.clientHeight+2})),buttons:[...document.querySelectorAll(".mission-zone button,.education-explanation summary")].filter(e=>e.getBoundingClientRect().height>0).map(e=>({text:e.textContent,height:e.getBoundingClientRect().height})),figures:[...document.querySelectorAll(".education-figure")].map(e=>({mode:e.dataset.mode,rect:e.querySelector(".education-diagram").getBoundingClientRect().toJSON()}))}))()');
    fs.writeFileSync(out+'/'+m.name+'.png',(await w.webContents.capturePage()).toPNG());
    for(const f of value.figures){const r=f.rect;const img=await w.webContents.capturePage({x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)});const b=img.toBitmap();let colored=0;for(let i=0;i<b.length;i+=4){if(Math.max(b[i],b[i+1],b[i+2])-Math.min(b[i],b[i+1],b[i+2])>55)colored++;}f.coloredPixels=colored;}
  }else if(m.type==='quit'){app.quit();return;}process.send({id:m.id,value});}catch(e){process.send({id:m.id,error:e.stack});}});`);
  child=spawn(require('electron'),['--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding',main],{stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});
  child.stderr.on('data',b=>{process.stderr.write(b);});
  await new Promise((resolve,reject)=>{child.once('error',reject);child.on('message',m=>{if(m.ready)resolve();const p=requests.get(m.id);if(p){clearTimeout(p.timeout);requests.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve(m.value);}});});
  const js=code=>rpc('js',{code});
  const capture=async(name)=>{await sleep(300);const value=await rpc('capture',{name});report.results.push({name,...value});assert.deepEqual(value.viewport,[1920,1080]);assert(!/gest neînregistrat|observare aleasă|Două contribuții independente/.test(value.text),name+' natural Romanian participant copy');assert(!value.overflow,name+' root overflow');assert(value.zones.every(z=>!z.overflow),name+' zone overflow');assert(value.zones[0].x<value.zones[1].x);assert(value.buttons.every(b=>b.height>=63.5),name+' touch target '+JSON.stringify(value.buttons.filter(b=>b.height<63.5)));assert(value.figures.length===2&&value.figures.every(f=>f.mode==='3d'&&f.coloredPixels>50),name+' visible 3D '+JSON.stringify(value.figures));console.log(name+' passed');};
  const click=async(zone,value)=>{await waitFor(()=>js(`!!document.querySelector('.mission-zone[data-zone="${zone}"] button[data-value="${value}"]:not(:disabled)')`),Boolean,'button '+value);await js(`document.querySelector('.mission-zone[data-zone="${zone}"] button[data-value="${value}"]').click()`);await sleep(160);};
  screen=new WebSocket(h.base.replace('http:','ws:')+'/ws');await new Promise((resolve,reject)=>{screen.once('error',reject);screen.once('open',()=>{screen.send(JSON.stringify({type:'hello',client:'screen',id:'center',isClockSource:true}));resolve();});});
  const voices=(await h.api('/api/experience/voices')).body;
  async function finish(id){const s=await waitFor(snap,s=>s.experience.narration?.id===id,'narration '+id,30000),n=s.experience.narration;screen.send(JSON.stringify({type:'experienceAudio',instance:n.instance,status:'ended'}));await waitFor(()=>Date.now(),nnow=>nnow>=n.startedAt+voices.clips[id].durationSec*1000+650,'natural duration '+id,30000);}
  for(const profile of PROFILES){
    await h.command({action:'restart'});await h.select(profile);await control('participants',{participants:['1A','1B']});
    const access=await h.api('/api/mission/accessibility',{post:1,settings:{textScale:1.3,reducedMotion:true}});assert.equal(access.status,200);
    await control('start');await waitFor(()=>js('document.querySelector(".experience-zone")?.dataset.kind||document.body.innerText.slice(0,800)'),k=>k==='tutorial-touch','touch DOM');
    await capture(profile+'-touch');await click('A','tutorial:touch');await click('B','tutorial:touch');
    await waitFor(snap,s=>s.experience.touched.includes('1A')&&s.experience.touched.includes('1B'),'touch ACK');
    await finish('intro');await finish('touch');await waitFor(snap,s=>s.experience.step==='practice','practice');await capture(profile+'-practice');
    if(profile==='age-5-10'||profile==='age-10-15'){
      await click('A','tutorial:pick:'+(profile==='age-5-10'?'circle':'life'));await click('A','tutorial:confirm');
      assert(!(await snap()).experience.practiced.includes('1A'));
      assert.equal(await js('document.querySelectorAll(".mission-zone[data-zone=A] .education-object-label[data-state=confirmed]").length'),0);
      await capture(profile+'-wrong-unconfirmed');
    }
    const pick={'age-5-10':'star','age-10-15':'regular','age-15-18':'both',adults:'observe'}[profile];
    for(const zone of ['A','B']){await click(zone,'tutorial:pick:'+pick);assert(!(await snap()).experience.practiced.includes('1'+zone));await click(zone,'tutorial:confirm');await waitFor(snap,s=>s.experience.practiced.includes('1'+zone),'practice ACK');}
    await capture(profile+'-practice-confirmed');await finish(profile+'-practice');await waitFor(snap,s=>s.experience.step==='cooperate','cooperate');await capture(profile+'-cooperate');
    await control('pause');await capture(profile+'-paused');assert(await js('[...document.querySelectorAll(".experience-zone button")].every(b=>b.disabled)'));await control('resume');
    await click('A','tutorial:link');await waitFor(snap,s=>s.experience.linked.includes('1A'),'link A');assert(!(await snap()).experience.linked.includes('1B'));await click('B','tutorial:link');await finish('cooperate');await waitFor(snap,s=>s.experience.step==='ready','ready');await capture(profile+'-ready');await finish('ready');await control('skip');
  }
  report.passed=true;
}catch(e){report.passed=false;report.error=e.stack;throw e;}
finally{for(const p of requests.values())clearTimeout(p.timeout);screen?.close();child?.kill();await h.close();await rm(sourceTemp,{recursive:true,force:true,maxRetries:30,retryDelay:100});await writeFile(path.join(out,'review.json'),JSON.stringify(report,null,2)+'\n');}
