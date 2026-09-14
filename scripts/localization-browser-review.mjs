/** Isolated real Chromium review of auxiliary UI and the standalone, offline diploma. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import WebSocket from 'ws';
import {ROOT,createHarness,waitFor} from './smoke-scenarios.mjs';
const require=createRequire(import.meta.url),temp=await mkdtemp(path.join(os.tmpdir(),'nava-locale-ui-')),out=path.join(ROOT,'runs/debug/localization-2026-09-13/pages');await mkdir(out,{recursive:true});
const h=await createHarness({connectTablets:false,tutorial:true});await h.select('age-5-10');
const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const main=path.join(temp,'main.cjs');await writeFile(main,`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(temp,'profile'))});let w;app.whenReady().then(async()=>{w=new BrowserWindow({width:1920,height:1080,useContentSize:true,show:false,webPreferences:{offscreen:true,backgroundThrottling:false,contextIsolation:true,sandbox:true}});await w.loadURL(${JSON.stringify(h.base+'/login/')});});process.stdin.on('data',()=>app.quit());`);
const child=spawn(require('electron'),[`--remote-debugging-port=${port}`,main],{stdio:['pipe','ignore','pipe'],windowsHide:true});child.stderr.on('data',()=>{});
let ws;const reviews=[],errors=[];
try{
 const targets=await waitFor(async()=>{try{return await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());}catch{return[];}},x=>x.some(t=>t.url.includes('/login/')),'browser',20000);
 ws=new WebSocket(targets.find(t=>t.url.includes('/login/')).webSocketDebuggerUrl);await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});let seq=0;const pending=new Map();
 ws.on('message',b=>{const m=JSON.parse(String(b));if(m.id){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>reject(Error('CDP timeout '+method)),15000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 await call('Runtime.enable');await call('Network.enable');
 for(const lang of ['en','fr']){
  await h.select('age-5-10');
  await h.command({action:'setLang',lang});
  await call('Network.clearBrowserCookies');
  for(const route of ['login','control','admin','debug','analytics','logs','wall','clips','diploma']){
   if(route==='control')await call('Network.setCookie',{name:'nava_session',value:h.token,url:h.base,httpOnly:true,sameSite:'Strict'});
   let url=h.base+'/'+route+'/';
   if(route==='diploma'){const u=pathToFileURL(path.join(ROOT,'dist/public-diploma/index.html'));u.hash=Buffer.from(JSON.stringify([1,1,'2026-09-13',[['1A','nova'],['1B','nia']],1,lang])).toString('base64url');url=u.href;}
   for(const [width,height] of route==='debug'||route==='analytics'||route==='logs'?[[1920,1080],[1100,760]]:[[1920,1080]]){
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await call('Page.navigate',{url});
    await waitFor(()=>evaluate('document.readyState'),s=>s==='complete','page loaded');
    await waitFor(()=>evaluate('document.documentElement.lang'),s=>s===lang,'localized '+route,15000);
    if(route==='control'){
     await waitFor(()=>evaluate(`!!document.getElementById('present-language')&&!document.getElementById('present-language').disabled`),Boolean,'operator role ready');
     for(const selection of ['ro',lang]){
      await evaluate(`(()=>{const e=document.getElementById('present-language');if(!e||e.disabled)throw Error('Pre-show language selector unavailable');e.value=${JSON.stringify(selection)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await waitFor(()=>evaluate(`document.documentElement.lang===${JSON.stringify(selection)}&&!document.getElementById('present-language').disabled`),Boolean,'operator language switch');
     }
     assert.deepEqual(await evaluate(`[...document.querySelectorAll('#present-language option')].map(o=>o.value)`),['ro','en','fr']);
     assert.deepEqual(await evaluate(`[...document.querySelectorAll('#present-language option')].map(o=>o.textContent)`),['Română','English','Français']);
     // An implicit option value must remain unchanged when its label is translated.
     assert.equal(await evaluate(`new Promise(resolve=>{const s=document.createElement('select');s.id='qa-option';s.innerHTML='<option>Consolă</option>';document.body.append(s);setTimeout(()=>{const value=s.value;s.remove();resolve(value);},30);})`),'Consolă');
    }
    if(route==='diploma')await waitFor(()=>evaluate('!document.querySelector("#download").disabled'),Boolean,'offline diploma ready');
    await new Promise(r=>setTimeout(r,600));
    const state=await evaluate(`({title:document.title,lang:document.documentElement.lang,text:document.body.innerText,horizontalOverflow:document.documentElement.scrollWidth>innerWidth+2})`);
    const name=`${lang}-${route}-${width}`;await writeFile(path.join(out,name+'.txt'),state.text);const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(out,name+'.png'),Buffer.from(shot.data,'base64'));
    reviews.push({name,...state});assert(!state.horizontalOverflow,name+' horizontal overflow');
    if(route==='diploma'){const png=await evaluate('document.querySelector("#diploma").toDataURL("image/png").split(",")[1]');await writeFile(path.join(out,`${lang}-diploma-artwork.png`),Buffer.from(png,'base64'));}
   }
  }
  await h.select('legacy-v3');
  await call('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});await call('Page.navigate',{url:h.base+'/tablet/?post=1'});
  for(const [zone,character] of [['A','nova'],['B','nia']]){
   await waitFor(()=>evaluate(`!!document.querySelector('.mission-zone[data-zone="${zone}"] button[data-value="crew:draft:${character}"]:not(:disabled)')`),Boolean,'legacy crew');
   await evaluate(`document.querySelector('.mission-zone[data-zone="${zone}"] button[data-value="crew:draft:${character}"]').click()`);
   await waitFor(()=>evaluate(`!!document.querySelector('.mission-zone[data-zone="${zone}"] button[data-value="crew:confirm"]:not(:disabled)')`),Boolean,'legacy confirm');
   await evaluate(`document.querySelector('.mission-zone[data-zone="${zone}"] button[data-value="crew:confirm"]').click()`);
   await waitFor(async()=>(await h.api('/api/mission')).body.experience.participants,p=>p.includes('1'+zone),'legacy registered');
  }
  assert.equal((await h.api('/api/experience/control',{action:'skip'})).status,200);await h.command({action:'start'});await h.command({action:'seek',time:20});await h.holdFrame();
  const legacy=(await h.api('/api/show')).body;
  for(const cue of legacy.cues.filter(c=>c.kind==='tablet')){
   await h.command({action:'fireCue',cueId:cue.id});await new Promise(r=>setTimeout(r,500));
   const state=await evaluate(`({lang:document.documentElement.lang,text:document.body.innerText,view:document.querySelector('#interaction').dataset.view,horizontalOverflow:document.documentElement.scrollWidth>innerWidth+2,verticalOverflow:document.documentElement.scrollHeight>innerHeight+2})`);
   const name=lang+'-legacy-'+cue.id;await writeFile(path.join(out,name+'.txt'),state.text);const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(out,name+'.png'),Buffer.from(shot.data,'base64'));
   reviews.push({name,...state});if(cue.interaction.type==='paired-choice')assert.equal(state.view,cue.interaction.type);assert(!state.horizontalOverflow&&!state.verticalOverflow,name+' overflow');assert(!/[ășțĂȘȚ]/.test(state.text),name+' untranslated: '+state.text.split('\n').filter(s=>/[ășțĂȘȚ]/.test(s)).join(' | '));
  }
  await h.command({action:'restart'});
 }
 assert.deepEqual(errors,[]);await writeFile(path.join(out,'review.json'),JSON.stringify({at:new Date().toISOString(),reviews,errors},null,2));console.log(`PASS: ${reviews.length} localized auxiliary/legacy views, including offline diplomas.`);
}finally{ws?.close();child.stdin.write('quit');await new Promise(r=>{const timer=setTimeout(()=>{child.kill();r();},5000);child.once('exit',()=>{clearTimeout(timer);r();});});await h.close();await rm(temp,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
