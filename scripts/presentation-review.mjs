#!/usr/bin/env node
/** Children flow rehearsal with one real browser tablet, operator UI and real Electron renderer.
 * Separate temporary server/SQLite; no changes to the room session, readiness or voices.
 * Default runs in real time; --quick seeks between activities for focused layout review.
 * This is a single-display software rehearsal, not certification of the physical five-TV wall.
 */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import {pathToFileURL} from 'node:url';
import WebSocket from 'ws';
import {ROOT,createHarness,waitFor} from './smoke-scenarios.mjs';

const quick=process.argv.includes('--quick'),require=createRequire(import.meta.url);
const out=path.join(ROOT,'runs/presentation-2026-09-10',quick?'focused':'realtime');await mkdir(out,{recursive:true});
const screen={id:'center',displayIndex:0,showAvatar:true,showSubtitles:true,showEntities:true,playAudio:true,kiosk:false};
const h=await createHarness({connectTablets:false,screens:[screen],tutorial:true});
const config=JSON.parse(await readFile(path.join(ROOT,'config.json'),'utf8'));
config.screens=[screen];config.dev={windowed:true,openDevTools:false};config.security={screenToken:'',publicState:true};
const film=pathToFileURL(path.resolve(ROOT,config.video.panelsDir,'center.mp4')).href;
const boot={config,screen,wsUrl:h.base.replace('http:','ws:')+'/ws',serverHttpUrl:h.base,screenToken:'',videoUrl:film,panelVideoUrls:{center:film},avatarUrl:pathToFileURL(path.resolve(ROOT,config.avatar.glb)).href,voiceBaseUrl:pathToFileURL(path.join(ROOT,'assets/voice/')+path.sep).href,showUrl:pathToFileURL(path.resolve(ROOT,config.show)).href,isDev:false,appVersion:'presentation-rehearsal'};
const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const main=path.join(h.temp,'presentation-browser.cjs');
await writeFile(main,`const {app,BrowserWindow,ipcMain}=require('electron');
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');app.commandLine.appendSwitch('force-device-scale-factor','1');
const windows=[];ipcMain.handle('nava:getBoot',()=>(${JSON.stringify(boot)}));ipcMain.on('nava:log',()=>{});
app.whenReady().then(async()=>{for(const [name,url,preload] of ${JSON.stringify([['renderer',pathToFileURL(path.join(ROOT,'dist/renderer/index.html')).href,path.join(ROOT,'dist/preload/preload.js')],['tablet',h.base+'/tablet/?post=2'],['operator',h.base+'/login/']])}){const w=new BrowserWindow({width:1920,height:1080,useContentSize:true,show:false,webPreferences:{offscreen:true,backgroundThrottling:false,contextIsolation:true,sandbox:true,autoplayPolicy:'no-user-gesture-required',...(preload?{preload}:{})}});windows.push(w);await w.loadURL(url);}});process.stdin.on('data',()=>app.quit());`);
const child=spawn(require('electron'),[`--remote-debugging-port=${port}`,main],{stdio:['pipe','pipe','pipe'],windowsHide:true});
let stderr='';child.stderr.on('data',b=>stderr+=String(b));child.stdout.on('data',b=>process.stdout.write(b));
const clients=[],records=[],errors=[],startedAt=new Date().toISOString();
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function connect(fragment){
 const targets=await waitFor(async()=>{try{return await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());}catch{return[];}},a=>a.some(t=>t.url.includes(fragment)),fragment,30000);
 const socket=new WebSocket(targets.find(t=>t.url.includes(fragment)).webSocketDebuggerUrl);await new Promise((r,j)=>{socket.once('open',r);socket.once('error',j);});
 const pending=new Map();let seq=0;
 socket.on('message',raw=>{const m=JSON.parse(String(raw));if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown')errors.push({fragment,...m.params.exceptionDetails});});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timeout'));},20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const c={socket,call,evaluate};clients.push(c);await call('Runtime.enable');await call('Page.enable');return c;
}
const observation=`(()=>{const WS=window.WebSocket;window.__mission=null;window.__events=[];window.WebSocket=class extends WS{constructor(...args){super(...args);this.addEventListener('message',event=>{try{const m=JSON.parse(event.data);if(m.type==='mission')window.__mission=m.snapshot;}catch{}});}send(data){try{const m=JSON.parse(data);if(['experienceAudio','missionAction','missionAck'].includes(m.type))window.__events.push({...m,at:Date.now()});}catch{}return super.send(data);}};})()`;
async function capture(c,name){await delay(300);const metrics=await c.evaluate(`(()=>({viewport:[innerWidth,innerHeight],overflow:document.documentElement.scrollWidth>innerWidth+2,bodyOverflow:document.body.scrollHeight>innerHeight+2,zones:[...document.querySelectorAll('.mission-zone')].filter(e=>e.getBoundingClientRect().width>0).map(e=>({zone:e.dataset.zone,x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,bottom:e.getBoundingClientRect().bottom,overflow:e.scrollHeight>e.clientHeight+2})),subtitle:document.querySelector('#subtitles')?.textContent||document.querySelector('.mission-subtitle')?.textContent||'',video:(()=>{const v=document.querySelector('#video');return v?{time:v.currentTime,paused:v.paused,ready:v.readyState,quality:(()=>{const q=v.getVideoPlaybackQuality();return {frames:q.totalVideoFrames,dropped:q.droppedVideoFrames};})()}:null;})(),dialog:document.querySelector('dialog[open]')?.getBoundingClientRect().toJSON()}))()`);const shot=await c.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(out,name+'.png'),Buffer.from(shot.data,'base64'));records.push({name,...metrics});assert(!metrics.overflow,name+' horizontal overflow');if(name.startsWith('tablet')){assert(!metrics.bodyOverflow,name+' vertical page overflow');assert(!metrics.zones.some(z=>z.overflow||z.bottom>1082),name+' zone clipping');const a=metrics.zones.find(z=>z.zone==='A'),b=metrics.zones.find(z=>z.zone==='B');if(a&&b)assert(a.x<b.x,'A must stay left of B');}console.log('Captured',name);}
async function click(c,selector){await waitFor(()=>c.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});return !!e&&!e.disabled&&e.getBoundingClientRect().width>0;})()`),Boolean,'enabled '+selector,15000);const point=await c.evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await c.call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await c.call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});await delay(300);}
async function api(url,body){const r=await h.api(url,body);assert.equal(r.status,200,JSON.stringify(r.body));return r.body;}
let r,t,k;
try{
 r=await connect('/dist/renderer/');t=await connect('/tablet/');k=await connect('/login/');
 for(const c of [r,t]){await c.call('Page.addScriptToEvaluateOnNewDocument',{source:observation+`(()=>{window.__audioEvents=[];window.__confettiCount=0;const Audio=window.Audio;window.Audio=function(...args){const a=new Audio(...args);for(const type of ['playing','ended','error'])a.addEventListener(type,()=>window.__audioEvents.push({type,src:a.src,muted:a.muted,time:a.currentTime,at:Date.now()}));return a;};window.Audio.prototype=Audio.prototype;const animate=Element.prototype.animate;Element.prototype.animate=function(...args){if(this.tagName==='I'&&this.style.zIndex==='999')window.__confettiCount++;return animate.apply(this,args);};})()`});await c.call('Page.reload');}
 await capture(k,'login-1920');
 await k.evaluate(`fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin:'9384'})}).then(r=>r.json())`);await k.call('Page.navigate',{url:h.base+'/control/'});
 await waitFor(()=>api('/api/state'),s=>s.videoReady&&s.readiness?.screensMissing.length===0,'real renderer loaded',45000);
 await capture(r,'renderer-waiting-1920');await h.select('age-5-10');
 await waitFor(()=>t.evaluate('window.__mission'),s=>s?.scenarioId==='age-5-10'&&s.experience?.crew?.open,'child registration',20000);
 await capture(t,'tablet-character-selection');await capture(k,'operator-before-1920');
 await click(t,'.crew-select[data-zone="A"] [data-value="crew:draft:nova"]');await click(t,'.crew-select[data-zone="A"] [data-value="crew:confirm"]');
 await waitFor(()=>api('/api/mission'),s=>s.experience?.participants?.length===1,'one confirmed participant');await capture(t,'tablet-one-participant');
 await waitFor(()=>api('/api/state'),s=>s.readiness?.ready,'real solo installation ready',45000);
 await click(k,'#present-boarding');await capture(k,'operator-tutorial-1920');
 await k.call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await capture(k,'operator-tutorial-1440');
 await k.call('Emulation.clearDeviceMetricsOverride');await click(k,'.experience-next[data-action="start"]');
 const snap=()=>api('/api/mission');
 await waitFor(snap,s=>s.experience?.narration?.id==='touch','touch explanation',50000);await capture(t,'tablet-tutorial-touch');await capture(r,'renderer-tutorial-touch');await click(t,'.mission-zone[data-zone="A"] [data-value="tutorial:touch"]');
 await waitFor(snap,s=>s.experience?.step==='practice','practice',50000);await capture(t,'tablet-tutorial-practice');
 if(quick){await h.command({action:'tabletSfx',enabled:false});await waitFor(()=>t.evaluate('window.__mission.state.tabletSfx'),v=>v===false,'tablet sounds disabled');const before=await t.evaluate('window.__audioEvents.length');await click(t,'.mission-zone[data-zone="A"] [data-value="tutorial:pick:circle"]');await delay(500);assert.equal(await t.evaluate('window.__audioEvents.length'),before,'muted tablet must not play confirmation');await h.command({action:'tabletSfx',enabled:true});await waitFor(()=>t.evaluate('window.__mission.state.tabletSfx'),v=>v===true,'tablet sounds enabled');}
 await click(t,'.mission-zone[data-zone="A"] [data-value="tutorial:pick:star"]');await click(t,'.mission-zone[data-zone="A"] [data-value="tutorial:confirm"]');
 await waitFor(snap,s=>s.experience?.step==='cooperate','cooperate',50000);await capture(t,'tablet-tutorial-solo-link');await click(t,'.mission-zone[data-zone="A"] [data-value="tutorial:link"]');
 await waitFor(snap,s=>s.experience?.step==='ready','ready step',50000);
 const early=await snap();assert(!early.experience.canContinue,'ready voice has not finished');
 await delay(1800);assert(await k.evaluate("document.querySelector('.experience-next').disabled"),'operator cannot launch over narration');
 await waitFor(snap,s=>s.experience?.canContinue,'natural ready voice completion',50000);await capture(k,'operator-ready-to-launch');await click(k,'.experience-next[data-action="launch"]');
 await waitFor(snap,s=>s.state.state==='preshow','handoff then preshow',50000);await delay(1800);assert(await k.evaluate("!document.querySelector('.experience-control').open"),'handoff closes tutorial');await capture(k,'operator-show-1920');await capture(r,'renderer-preshow');
 const playStart=Date.now();if(quick)await h.command({action:'start'});
 const stageTimes=[100,208,329];
 for(let stage=1;stage<=3;stage++){
  if(quick)await h.command({action:'seek',time:stageTimes[stage-1]});
  await waitFor(()=>t.evaluate('window.__mission'),s=>s?.stage===stage&&s.view?.zones?.A?.play,'activity '+stage,240000);
  await capture(t,`tablet-stage-${stage}-before`);await capture(r,`renderer-stage-${stage}`);
  const view=()=>t.evaluate('window.__mission.view.zones.A.play');
  if(stage===1){const v=await view();await click(t,`.play-panel[data-zone="A"] [data-play="play:match:${v.shape}"]`);}
  if(stage===2){let v=await view();while(v.rotation!==v.socketRotation){await click(t,'.play-panel[data-zone="A"] button[data-play="play:rotate"]');v=await view();}await click(t,'.play-panel[data-zone="A"] button[data-play="play:fit"]');}
  if(stage===3){for(let joint=0;joint<2;joint++){let v=await view();while(v.wireTurns[joint]!==v.wireTargets[joint]){await click(t,`.play-panel[data-zone="A"] button[data-play="play:wire:${joint}"]`);v=await view();}}}
  await waitFor(view,v=>v.solved,'activity solved');await delay(1000);await capture(t,`tablet-stage-${stage}-solved`);
  if(quick&&stage>=2){await h.command({action:'seek',time:stage===2?216.5:338});await waitFor(()=>t.evaluate('document.querySelector("#subtitle").getBoundingClientRect().height'),height=>height>0,'real live tablet subtitle',6000);await capture(t,`tablet-stage-${stage}-solved-subtitle`);}
  if(quick&&stage===3){const before=await t.evaluate('({confetti:window.__confettiCount,audio:window.__audioEvents.filter(e=>e.type==="playing"&&e.src.endsWith("confirm.mp3")).length})');for(let i=0;i<4;i++)await click(t,'.play-panel[data-zone="A"] button[data-play="play:wire:0"]');await delay(900);const after=await t.evaluate('({confetti:window.__confettiCount,audio:window.__audioEvents.filter(e=>e.type==="playing"&&e.src.endsWith("confirm.mp3")).length})');assert.deepEqual(after,before,'reopening/closing solved circuit must not replay confetti or success sound');assert(before.confetti>=12,'actual confetti was triggered');assert(before.audio>0,'actual unmuted audio was played');records.push({effectsOnce:true,before,after});}
 }
 if(quick){await h.command({action:'epilogue'});await h.command({action:'seek',time:61});}
 else {let last=-1;await waitFor(async()=>{const s=await snap(),minute=Math.floor(s.state.phaseTime/60);if(minute!==last){last=minute;console.log('Real-time flight',s.state.state,Math.round(s.state.phaseTime),'seconds');}return s;},s=>s.experience?.finaleActive,'natural film to finale',600000);}
 await waitFor(()=>t.evaluate('window.__mission'),s=>s?.experience?.finaleActive,'final tablet',20000);await capture(t,'tablet-final-choose');
 await click(t,'.mission-zone[data-zone="A"] [data-value="draft:light"]');await click(t,'.mission-zone[data-zone="A"] [data-value="finale:light"]');
 const certificates=await waitFor(()=>api('/api/certificates'),s=>s.runs?.some(run=>run.files?.some(f=>f.post===2)),'real journal uploaded',30000);
 const journal=certificates.runs.flatMap(run=>run.files).find(file=>file.post===2),journalResponse=await fetch(new URL(journal.url,h.base),{headers:{Authorization:`Bearer ${h.token}`}});assert(journalResponse.ok,'journal download');await writeFile(path.join(out,'journal-post-2.png'),Buffer.from(await journalResponse.arrayBuffer()));
 await capture(t,'tablet-final-journal-sent');await capture(r,'renderer-final-symbol');
 await waitFor(snap,s=>s.state.state==='ended','natural ending',30000);await delay(1800);await capture(k,'operator-ended');
 await r.call('Emulation.setDeviceMetricsOverride',{width:3840,height:2160,deviceScaleFactor:1,mobile:false});await capture(r,'renderer-final-3840');
 await r.call('Emulation.setDeviceMetricsOverride',{width:1600,height:900,deviceScaleFactor:1,mobile:false});await r.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await capture(r,'renderer-final-windowed-reduced');
 const finale=await waitFor(snap,s=>s.experience?.narration?.id==='finale','finale narration scheduled',10000);
 await waitFor(()=>r.evaluate('window.__events'),events=>events.some(e=>e.type==='experienceAudio'&&e.status==='ended'&&e.instance===finale.experience.narration.instance),'natural finale narration',50000);
 const events=await r.evaluate('window.__events'),ended=events.filter(e=>e.type==='experienceAudio'&&e.status==='ended');assert.equal(new Set(ended.map(e=>e.instance)).size,ended.length,'narration ended once per instance');assert(!events.some(e=>e.status==='error'),'narrator errors');assert.deepEqual(errors,[]);
 const final=await snap();await writeFile(path.join(out,'review.json'),JSON.stringify({ok:true,startedAt,finishedAt:new Date().toISOString(),realtime:!quick,elapsedPlaySeconds:(Date.now()-playStart)/1000,participants:final.experience.participants,records,narratorEvents:events,errors},null,2));
 console.log('Children presentation passed:',quick?'focused checks':'complete real-time flight','one participant, three games, tutorial, journal, real film/audio/GLB.');
 if(quick){for(const route of ['debug','analytics','admin']){await k.call('Page.navigate',{url:h.base+'/'+route+'/'});await delay(2200);await capture(k,route+'-1920');await k.call('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});await capture(k,route+'-1280');await k.call('Emulation.clearDeviceMetricsOverride');}await writeFile(path.join(out,'additional-surfaces.json'),JSON.stringify(records,null,2));}
 // Required smoke runs separately on this same isolated renderer after the full flow.
 await h.command({action:'restart'});await h.select('legacy-v3');
 await waitFor(()=>api('/api/state'),s=>s.readiness?.ready,'legacy ready',45000);
 const smoke=spawn(process.env.ComSpec??'cmd.exe',['/d','/s','/c','npm run smoke:renderer'],{cwd:ROOT,stdio:'inherit',windowsHide:true,env:{...process.env,NAVA_CDP_PORT:String(port),NAVA_SERVER_PORT:new URL(h.base).port,NAVA_TEST_PIN:'9384'}});assert.equal(await new Promise(resolve=>smoke.once('exit',resolve)),0,'mandatory renderer smoke');
}catch(error){await writeFile(path.join(out,'failure.json'),JSON.stringify({error:String(error.stack),records,errors,stderr,state:(await h.api('/api/mission')).body,tablet:t?await t.evaluate('window.__mission'):null},null,2));throw error;}
finally{for(const c of clients)c.socket.close();child.stdin.write('close');await new Promise(resolve=>{const timer=setTimeout(()=>{child.kill();resolve();},5000);child.once('exit',()=>{clearTimeout(timer);resolve();});});await h.close();}
