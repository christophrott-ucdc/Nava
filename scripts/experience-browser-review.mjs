import {createHarness,ROOT} from './smoke-scenarios.mjs';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const out=path.join(ROOT,'runs/debug/tutorial-final');await mkdir(out,{recursive:true});
const h=await createHarness({connectTablets:false,tutorial:true});
await h.select('age-5-10');
await h.api('/api/experience/control',{action:'participants',participants:['1A','1B']});
await h.api('/api/experience/control',{action:'start'});
const main=path.join(h.temp,'browser-review.cjs');
await writeFile(main,`const {app,BrowserWindow}=require('electron');const fs=require('fs');app.commandLine.appendSwitch('force-device-scale-factor','1');
const base=${JSON.stringify(h.base)},out=${JSON.stringify(out)};const windows=[];const results=[];
async function capture(w,name){const metrics=await w.webContents.executeJavaScript('(()=>({viewport:[innerWidth,innerHeight],overflow:document.documentElement.scrollWidth>innerWidth+2,zones:[...document.querySelectorAll(".mission-zone")].map(e=>({zone:e.dataset.zone,x:e.getBoundingClientRect().x,overflow:e.scrollHeight>e.clientHeight+2})),dialog:document.querySelector("dialog[open]")?.getBoundingClientRect().toJSON()}))()');fs.writeFileSync(out+'/'+name+'.png',(await w.webContents.capturePage()).toPNG());results.push({name,...metrics});if(metrics.overflow||metrics.zones.some(z=>z.overflow))throw Error(name+' overflow');}
app.whenReady().then(async()=>{try{console.log('browser-ready');
const t=new BrowserWindow({width:1920,height:1080,useContentSize:true,show:false,webPreferences:{offscreen:true,backgroundThrottling:false}});windows.push(t);await t.loadURL(base+'/tablet/?post=1');await new Promise(r=>setTimeout(r,1800));
await capture(t,'tablet-real-touch');
await t.webContents.executeJavaScript(${JSON.stringify(`document.querySelector('.mission-zone[data-zone="A"] button[data-value="tutorial:touch"]').click()`)});await new Promise(r=>setTimeout(r,600));await capture(t,'tablet-real-touch-confirmed');
const c=new BrowserWindow({width:1920,height:1080,useContentSize:true,show:false,webPreferences:{offscreen:true,backgroundThrottling:false}});windows.push(c);await c.loadURL(base+'/login/');await c.webContents.executeJavaScript('fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pin:"9384"})}).then(r=>r.json())');await c.loadURL(base+'/control/');await new Promise(r=>setTimeout(r,1500));await c.webContents.executeJavaScript('[...document.querySelectorAll("button")].find(b=>b.textContent==="Tutorial și echipaj").click()');await new Promise(r=>setTimeout(r,900));await capture(c,'operator-tutorial-1920');
await c.webContents.executeJavaScript(${JSON.stringify(`document.querySelector('.experience-control button[data-action="pause"]').click()`)});await new Promise(r=>setTimeout(r,800));await capture(t,'tablet-real-pause');
c.setContentSize(1440,900);await new Promise(r=>setTimeout(r,400));await capture(c,'operator-tutorial-1440');
await c.webContents.executeJavaScript(${JSON.stringify(`(async()=>{const post=async(url,body)=>{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error(await r.text());};await post('/api/experience/control',{action:'skip'});await post('/api/cmd',{action:'start'});await post('/api/cmd',{action:'epilogue'});await post('/api/cmd',{action:'seek',time:61});})()`)});await new Promise(r=>setTimeout(r,600));
await t.webContents.executeJavaScript(${JSON.stringify(`(()=>{if(!document.querySelector('.mission-finale-actions .mission-observe').disabled)throw Error('Journal enabled before final choices');document.querySelector('.mission-zone[data-zone="A"] button[data-value="finale:light"]').click();})()`)});await new Promise(r=>setTimeout(r,500));
await t.webContents.executeJavaScript(${JSON.stringify(`document.querySelector('.mission-zone[data-zone="B"] button[data-value="finale:observe"]').click()`)});await new Promise(r=>setTimeout(r,1000));await capture(t,'tablet-real-finale');
await t.webContents.executeJavaScript(${JSON.stringify(`(()=>{if(!document.querySelector('.mission-upload-status').textContent.includes('Jurnal trimis'))throw Error('Final journal not uploaded');})()`)});
fs.writeFileSync(out+'/browser.json',JSON.stringify({ok:true,results},null,2));app.quit();
}catch(e){fs.writeFileSync(out+'/browser-error.txt',String(e.stack));app.exit(1);}});`);
const child=spawn(require('electron'),[main],{stdio:['pipe','pipe','pipe'],windowsHide:true});
child.stdout.on('data',b=>process.stdout.write(b));child.stderr.on('data',b=>process.stderr.write(b));const timer=setTimeout(()=>child.kill(),90000);
try{const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});assert.equal(code,0);const proof=JSON.parse(await readFile(path.join(out,'browser.json'),'utf8'));assert(proof.ok);console.log(JSON.stringify(proof));}
finally{clearTimeout(timer);if(child.exitCode===null)child.kill();await h.close();}
