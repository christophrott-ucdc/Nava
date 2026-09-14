/** Isolated browser QA for the Admin Center. No production accounts are changed. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import WebSocket from 'ws';
import {randomBytes,createHmac} from 'node:crypto';
import {ROOT,createHarness,waitFor} from './smoke-scenarios.mjs';
const out=path.join(ROOT,'runs/debug/identity-2026-09-14/browser');await mkdir(out,{recursive:true});
const h=await createHarness({connectTablets:false}),results=[],errors=[];let child,ws;
const password=randomBytes(24).toString('hex');
async function stage(name,fn){await fn();results.push({name,ok:true});console.log('PASS '+name);}
try{
 const require=createRequire(import.meta.url),probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const main=path.join(h.temp,'operator-browser.cjs');await writeFile(main,`const{app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(out,'browser-profile-'+Date.now()))});app.whenReady().then(()=>{const w=new BrowserWindow({width:1920,height:1080,useContentSize:true,show:false,webPreferences:{offscreen:true,backgroundThrottling:false,sandbox:true}});w.loadURL(${JSON.stringify(h.base+'/login/?next=%2Fadmin%2F')});});process.stdin.on('data',()=>app.quit());`);
 child=spawn(require('electron'),['--remote-debugging-port='+port,main],{stdio:['pipe','ignore','pipe'],windowsHide:true});child.stderr.on('data',()=>{});
 const targets=await waitFor(async()=>{try{return await fetch('http://127.0.0.1:'+port+'/json/list').then(r=>r.json());}catch{return[];}},x=>x.some(t=>t.url.includes('/login/')),'Chromium',20000);ws=new WebSocket(targets.find(t=>t.url.includes('/login/')).webSocketDebuggerUrl);await new Promise(r=>ws.once('open',r));let seq=0;const pending=new Map();ws.on('message',b=>{const m=JSON.parse(String(b));if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>reject(Error(method+' timeout')),15000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};await call('Runtime.enable');await call('Network.enable');await call('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
 const shot=async name=>{await writeFile(path.join(out,name+'.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));await writeFile(path.join(out,name+'.txt'),await evaluate('document.body.innerText'));};

 await stage('PIN admin onboarding creates Christoph from Security UI',async()=>{
  await waitFor(()=>evaluate('!!document.querySelector("#pin")'),Boolean,'login UI');
  await evaluate(`(()=>{document.querySelector('#username').value='admin';for(const n of '9384')document.querySelector('[data-k="'+n+'"]').click();document.querySelector('#form button[type="submit"]').click();})()`);
  await waitFor(()=>evaluate('location.pathname'),s=>s==='/admin/','admin login');
  await waitFor(()=>evaluate('document.querySelector("#center-show")?.textContent'),s=>s&&s!=='Se conectează…','dashboard metrics');
  await shot('01-dashboard');
  await evaluate('location.hash="#/security"');
  await waitFor(()=>evaluate('document.querySelector("#security-name")?.textContent'),s=>s==='admin','security loaded');
  await evaluate(`(()=>{const f=document.querySelector('#christoph-form');f.elements.password.value=${JSON.stringify(password)};f.elements.confirm.value=${JSON.stringify(password)};f.requestSubmit();})()`);
  await waitFor(()=>evaluate('document.querySelector(".center-notice")?.textContent'),s=>s?.includes('Contul Christoph a fost creat'),'Christoph created');
  await evaluate('document.querySelector("#logout").click()');
  await waitFor(()=>evaluate('location.pathname'),s=>s.includes('/login'),'logout');
 });
 await stage('Password login through UI',async()=>{
  await waitFor(()=>evaluate('!!document.querySelector("#login-account")'),Boolean,'account tab');
  await evaluate('document.querySelector("#login-account").click()');await shot('02-account-login');
  await evaluate(`(()=>{const f=document.querySelector('#account-form');f.elements.username.value='Christoph';f.elements.password.value=${JSON.stringify(password)};f.requestSubmit();})()`);
  await waitFor(()=>evaluate('location.pathname'),s=>s==='/admin/','password login');
  await waitFor(()=>evaluate('document.querySelector("#identity")?.textContent'),s=>s?.includes('Christoph'),'identity');
 });
 for(const view of ['dashboard','resurse','health','wiki','links','identity','security','utilizatori','sesiuni','audit','instalatie','control','logs','analytics'])await stage('Desktop '+view,async()=>{
  await evaluate('location.hash='+JSON.stringify('#/'+view));
  await waitFor(()=>evaluate('document.querySelector("#view-'+view+'")?.hidden'),s=>s===false,'view '+view);
  if(view==='wiki'){await waitFor(()=>evaluate('document.querySelectorAll("#wiki-pages button").length'),s=>s>0,'wiki');await evaluate('document.querySelector("#wiki-pages button").click()');await waitFor(()=>evaluate('document.querySelector("#wiki-meta")?.textContent'),Boolean,'article');}
  if(['control','logs','analytics'].includes(view))await waitFor(()=>evaluate('document.querySelector("#view-'+view+' iframe")?.contentDocument?.readyState'),s=>s==='complete','embedded '+view);
  await new Promise(r=>setTimeout(r,400));assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+2'),false,view+' overflow');await shot('03-'+view);
 });
 await stage('Smaller window, security and resource layout',async()=>{
 await call('Emulation.setDeviceMetricsOverride',{width:1100,height:760,deviceScaleFactor:1,mobile:false});
 for(const view of ['dashboard','resurse','identity','security','wiki']){await evaluate('location.hash='+JSON.stringify('#/'+view));await new Promise(r=>setTimeout(r,300));assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+2'),false,view+' small overflow');await shot('04-small-'+view);}
 });
 await stage('All wiki articles ship and concurrent monitoring remains healthy',async()=>{
 const pages=(await h.api('/api/admin/wiki')).body.pages;for(const page of pages)assert.equal((await h.api('/api/admin/wiki/'+page.id)).status,200,page.id);
 for(let round=0;round<3;round++)await Promise.all(Array.from({length:12},async()=>assert.equal((await h.api('/api/admin/metrics')).status,200)));
 });

 await stage('Authenticator enrollment and recovery-code login through UI',async()=>{
 await evaluate('location.hash="#/security"');await waitFor(()=>evaluate('document.querySelector("#security-name")?.textContent'),s=>s==='Christoph','security');
 await evaluate(`(()=>{const f=document.querySelector('#mfa-start-form');f.elements.password.value=${JSON.stringify(password)};f.requestSubmit();})()`);
 await waitFor(()=>evaluate('!!document.querySelector("#mfa-vault img")'),Boolean,'MFA QR');
 const secret=await evaluate('document.querySelector("#mfa-vault code").textContent');
 let bits=0,value=0,bytes=[];for(const c of secret){value=(value<<5)|'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c);bits+=5;if(bits>=8){bytes.push((value>>>(bits-8))&255);bits-=8;}}
 const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const hash=createHmac('sha1',Buffer.from(bytes)).update(counter).digest();const code=String((hash.readUInt32BE(hash.at(-1)&15)&0x7fffffff)%1000000).padStart(6,'0');
 await evaluate(`(()=>{const f=document.querySelector('#mfa-confirm-form');f.elements.code.value=${JSON.stringify(code)};f.requestSubmit();})()`);
 await waitFor(()=>evaluate('document.querySelector("#security-state")?.textContent'),s=>s?.includes('MFA activ'),'MFA enabled');
 const recovery=(await evaluate('document.querySelector("#mfa-vault pre").textContent')).split('\n')[0];
 await evaluate('document.querySelector("#logout").click()');await waitFor(()=>evaluate('!!document.querySelector("#account-form")'),Boolean,'login');
 await evaluate('document.querySelector("#login-account").click()');
 await evaluate(`(()=>{const f=document.querySelector('#account-form');f.elements.username.value='Christoph';f.elements.password.value=${JSON.stringify(password)};f.requestSubmit();})()`);
 await waitFor(()=>evaluate('document.querySelector("#account-msg")?.textContent'),s=>s?.includes('Authenticator'),'factor required');
 await evaluate(`(()=>{const f=document.querySelector('#account-form');f.elements.code.value=${JSON.stringify(recovery)};f.requestSubmit();})()`);
 await waitFor(()=>evaluate('location.pathname'),s=>s==='/admin/','MFA login');
 await evaluate('location.hash="#/security"');await waitFor(()=>evaluate('document.querySelector("#security-state")?.textContent'),s=>s?.includes('7 coduri'),'consumed recovery');await shot('05-mfa-enabled');
 });

 await stage('Create staff through UI, five-failure lockout, directory unlock and forced password change',async()=>{
  await evaluate('location.hash="#/utilizatori"');await waitFor(()=>evaluate('document.querySelector("#cta")?.hidden'),s=>s===false,'create user');await evaluate('document.querySelector("#cta").click()');
  let temporary='Temporary staff credential 2026';
  await evaluate(`(()=>{document.querySelector('#f-name').value='FieldOperator';document.querySelector('#f-role').value='operator';document.querySelector('#f-kind').value='password';document.querySelector('#f-kind').dispatchEvent(new Event('change'));document.querySelector('#f-pin').value=${JSON.stringify(temporary)};document.querySelector('#form-user').requestSubmit();})()`);
  await waitFor(()=>evaluate('document.querySelector("#users")?.textContent'),s=>s?.includes('FieldOperator'),'staff created');
  await evaluate(`(()=>{const row=[...document.querySelectorAll('#users tr')].find(r=>r.textContent.includes('FieldOperator'));row.querySelector('summary').click();[...row.querySelectorAll('button')].find(b=>b.textContent.includes('Resetează parola')).click();})()`);
  temporary='Reset by administrator 2026';await evaluate(`(()=>{document.querySelector('#p-kind').value='password';document.querySelector('#p-kind').dispatchEvent(new Event('change'));document.querySelector('#p-pin').value=${JSON.stringify(temporary)};document.querySelector('#form-pin').requestSubmit();})()`);await waitFor(()=>evaluate('document.querySelector("#dlg-pin")?.open'),v=>v===false,'credential reset');
  const login=body=>fetch(h.base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','User-Agent':'Android future-client QA'},body:JSON.stringify(body)});
  for(let i=0;i<5;i++)assert.equal((await login({username:'FieldOperator',password:'incorrect'})).status,i===4?423:401);
  await evaluate('location.hash="#/identity"');await waitFor(()=>evaluate('document.querySelector("#identity-users")?.textContent'),s=>s?.includes('Blocat'),'locked row');await shot('06-locked-account');
  await evaluate(`[...document.querySelectorAll('#identity-users tr')].find(r=>r.textContent.includes('FieldOperator')).querySelector('button').click()`);await waitFor(()=>evaluate('document.querySelector("#directory-message")?.textContent'),s=>s?.includes('deblocat'),'unlocked');
  const needsChange=await login({username:'FieldOperator',password:temporary});assert.equal(needsChange.status,401);assert((await needsChange.json()).changeRequired);
  const complete=await login({username:'FieldOperator',password:temporary,newCredential:'Permanent staff credential 2026'});assert.equal(complete.status,200);const staffToken=/nava_session=([a-f0-9]+)/.exec(complete.headers.get('set-cookie'))[1];
  assert.equal((await fetch(h.base+'/api/admin/identity',{headers:{Authorization:'Bearer '+staffToken}})).status,403);
  await evaluate('document.querySelector("#refresh").click()');await new Promise(r=>setTimeout(r,5500));await shot('07-directory-devices');
 });
 assert.deepEqual(errors,[],'No uncaught browser exceptions');assert.deepEqual(h.logs,[],'No server error logs');
}catch(e){results.push({failure:String(e),stack:e.stack});console.error(e);process.exitCode=1;}
finally{ws?.close();if(child){child.stdin.write('quit');await new Promise(r=>{const t=setTimeout(()=>{child.kill();r();},5000);child.once('exit',()=>{clearTimeout(t);r();});});}await writeFile(path.join(out,'results.json'),JSON.stringify({at:new Date().toISOString(),isolated:true,results,browserErrors:errors,serverErrors:h.logs},null,2));await h.close();}
