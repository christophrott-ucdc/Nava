/** Real Chromium, production renderer/preload and real panoramic exports; synthetic OS counts.
 * Never changes the running installation or its database. Run after npm run build.
 */
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';import os from 'node:os';import {build} from 'esbuild';
const root=path.resolve(import.meta.dirname,'..'),temp=await mkdtemp(path.join(os.tmpdir(),'nava-adaptive-qa-'));
const out=path.join(root,process.env.NAVA_QA_OUT??'runs/debug/adaptive-displays-2026-09-13');await mkdir(out,{recursive:true});
const main=path.join(temp,'main.cjs'),require=createRequire(import.meta.url);
const soakSeconds=Number(process.env.NAVA_QA_SOAK_SECONDS??0);if(!Number.isInteger(soakSeconds)||soakSeconds<0||soakSeconds>1800)throw Error('Soak must be 0–1800 seconds');
const source=`
import {app,BrowserWindow,ipcMain,screen} from 'electron';
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {seedTestIdentity} from './scripts/identity-fixture.mjs';
import {startServer} from './src/server/index';
import {DisplayInventoryManager} from './src/main/display-inventory';
import {adaptivePanelDirectory,panelSources} from './src/main/panel-sources';
const root=${JSON.stringify(root)},temp=${JSON.stringify(temp)},out=${JSON.stringify(out)};
app.on('window-all-closed',()=>{});app.setPath('userData',path.join(temp,'userdata'));app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,predicate,label,timeout=45000){const end=Date.now()+timeout;let v;do{v=await fn();if(predicate(v))return v;await delay(150);}while(Date.now()<end);throw Error(label+': '+JSON.stringify(v));}
app.whenReady().then(async()=>{let w,server,manager,boot;const records=[],errors=[];try{
 const original=JSON.parse(await fs.readFile(path.join(root,'config.json'),'utf8'));
 const sets=Object.fromEntries(Object.entries(original.video.panelsByCount).map(([n,p])=>[n,path.resolve(root,p)]));
 let count=5,config;
 // Explicit synthetic OS topology; native Windows monitor placement is not claimed by this test.
 screen.getAllDisplays=()=>Array.from({length:count},(_,i)=>({id:100+i,bounds:{x:i*3840,y:0,width:3840,height:2160},size:{width:3840,height:2160},scaleFactor:1,rotation:0,displayFrequency:60,label:'QA TV',internal:false}));
 ipcMain.handle('nava:getBoot',()=>boot);
 ipcMain.on('nava:log',(_,level,msg)=>{if(level==='error')errors.push(msg);});
 ipcMain.on('nava:sendCommand',(_,cmd)=>server.dispatchCommand(cmd));
 ipcMain.handle('nava:startTvDemo',()=>server.startTvDemo());
 manager=new DisplayInventoryManager({config:{enabled:true,countMode:'adaptive',layout:'samsung-5',installationId:'qa',allowEstimatedGeometry:true,panelGapMm:500},appRoot:temp,resourcesRoot:root,log:()=>{},onTopologyChanged:reason=>server?.onDisplayTopologyChanged(reason),onReady:async()=>{await server?.applyDetectedTopology();},validateCandidate:c=>adaptivePanelDirectory(sets,c.screens.map(s=>s.id)),apply:async c=>{
   config.screens=c.screens;config.videoWall=c.videoWall;config.displayMode=c.displayMode;
   config.video.panelsDir=adaptivePanelDirectory(sets,c.screens.map(s=>s.id));config.autoRun.requireScreens=c.screens.map(s=>s.id);
   if(w){boot={...boot,config,screen:config.screens.find(s=>s.playAudio),panelVideoUrls:panelSources(config.video.panelsDir,config.screens.map(s=>s.id),'panorama'),viewports:[...config.screens].sort((a,b)=>a.displayIndex-b.displayIndex).map((s,i)=>({screenId:s.id,x:i*3840,y:0,width:3840,height:2160,scaleFactor:1}))};w.setContentSize(count*640,360);await w.loadFile(path.join(root,'dist/renderer/index.html'));}
   return async()=>{};
 }});
 await manager.initialize();
 for(const n of ${process.env.NAVA_QA_PLANETS==='1'||process.env.NAVA_QA_STALL==='1'||process.env.NAVA_QA_WINDOWS==='1'?'[5]':'[2,3,4,5]'}){
   count=n;config=structuredClone(original);
   config.server={port:0,bindHost:'127.0.0.1'};config.security={operatorPin:'9384',screenToken:'adaptive-qa-screen',sessionTtlMin:30,usersFile:path.join(temp,'users-'+n+'.json'),publicState:true};
   config.autoRun={...config.autoRun,enabled:false,requireScreens:[],requireTablets:0};config.lights={driver:'none'};
   const applied=await manager.apply();assert.equal(applied.candidate.screens.length,n);
   const primary=config.screens.find(s=>s.playAudio);
   // Windowed geometry probe instantiates one real TV renderer with the five
   // source films. It does not impersonate the other four physical outputs.
   const serverConfig=${process.env.NAVA_QA_WINDOWS==='1'}?{...config,displayMode:'windows',screens:[primary],autoRun:{...config.autoRun,requireScreens:[primary.id]}}:config;
   await seedTestIdentity(config.security.usersFile);
   server=await startServer({config:serverConfig,appRoot:root,webDir:path.join(root,'dist/web'),showPath:path.resolve(root,config.show),cacheDir:path.join(temp,'cache-'+n),runsDir:path.join(temp,'run-'+n),log:(level,msg)=>{if(level==='error')errors.push(msg);},displayAutomation:{inventory:()=>manager.inventory(),detect:()=>manager.detect(),apply:()=>manager.apply()},wallRuntime:()=>({preview:false,displays:[],issues:[],verifiedScreenIds:config.screens.map(s=>s.id)})});
   const base='http://127.0.0.1:'+server.port;
   boot={config,screen:primary,wsUrl:base.replace('http:','ws:')+'/ws',serverHttpUrl:base,videoUrl:pathToFileURL(path.resolve(root,config.video.path)).href,panelVideoUrls:panelSources(config.video.panelsDir,config.screens.map(s=>s.id),'panorama'),avatarUrl:pathToFileURL(path.resolve(root,config.avatar.glb)).href,voiceBaseUrl:pathToFileURL(path.join(root,'assets/voice')+path.sep).href,showUrl:pathToFileURL(path.resolve(root,config.show)).href,isDev:false,appVersion:'qa',screenToken:config.security.screenToken,displayMode:'span',viewports:[...config.screens].sort((a,b)=>a.displayIndex-b.displayIndex).map((s,i)=>({screenId:s.id,x:i*3840,y:0,width:3840,height:2160,scaleFactor:1}))};
   if(${process.env.NAVA_QA_WINDOWS==='1'})boot.displayMode='windows';
   w=new BrowserWindow({width:${process.env.NAVA_QA_WINDOWS==='1'?'640':'n*640'},height:360,useContentSize:true,show:false,webPreferences:{preload:path.join(root,'dist/preload/preload.js'),offscreen:true,backgroundThrottling:false,contextIsolation:true,sandbox:true}});
   w.webContents.on('render-process-gone',(_,d)=>errors.push('Renderer crashed: '+d.reason));
   await w.loadFile(path.join(root,'dist/renderer/index.html'));
   const state=()=>fetch(base+'/api/state').then(r=>r.json());
   await until(state,s=>s.videoReady&&s.readiness.screensMissing.length===0,'media and outputs ready');
   assert.equal((await server.startTvDemo()).ok,true,'children TV demo starts');
   await until(state,s=>s.state==='playing','playing',25000);
   server.dispatchCommand({action:'seek',time:215});await delay(5000);
   const metric=()=>w.webContents.executeJavaScript(\`(()=>({videos:[...document.querySelectorAll('video')].map(v=>({src:v.currentSrc,time:v.currentTime,ready:v.readyState,error:v.error?.message,frames:v.getVideoPlaybackQuality().totalVideoFrames})),canvases:document.querySelectorAll('canvas').length,presented:[...document.querySelectorAll('.span-canvas')].map(c=>({frame:c.dataset.frame,time:c.dataset.mediaTime})),subtitle:document.querySelector('#subtitles')?.textContent,scroll:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],size:[innerWidth,innerHeight]}))()\`);
   let m=await until(metric,m=>m.videos.length===n&&m.videos.every(v=>v.ready>=2&&v.frames>0&&!v.error),'actual panel decoders');
   const before=m.videos.map(v=>v.time);await delay(2000);m=await metric();assert(m.videos.every((v,i)=>v.time>before[i]),'each panel advances');
   assert.equal(new Set(m.videos.map(v=>v.src)).size,n,'distinct sources');
   assert.equal(m.presented.length,${process.env.NAVA_QA_WINDOWS==='1'?'1':'n'});assert(m.presented.every(p=>p.frame&&p.time));assert.equal(new Set(m.presented.map(p=>p.frame)).size,1,'atomic presented frame across all panels');
   await fs.writeFile(path.join(out,n+'-tv-playing.png'),(await w.webContents.capturePage()).toPNG());
   if(${process.env.NAVA_QA_PLANETS==='1'}){
     const stops=[];
     for(const at of [96,202,302,532,640]){
       server.dispatchCommand({action:'seek',time:at-2});
       const heldState=await until(state,s=>s.planetHold&&s.state==='paused','planet hold '+at,12000);
       const began=Date.now();assert.equal(heldState.phaseTime,at);await delay(1200);
       const heldFrame=await metric();assert(heldFrame.videos.every(v=>Math.abs(v.time-at)<.15),'all five videos hold the close-up');
       await fs.writeFile(path.join(out,'planet-'+at+'.png'),(await w.webContents.capturePage()).toPNG());
       await delay(6000);assert.equal((await state()).state,'paused');
       await until(state,s=>s.state==='playing'&&!s.planetHold,'automatic planet resume',6000);
       const elapsed=Date.now()-began;assert(elapsed>=9500&&elapsed<11500,'ten real seconds');
       await delay(1300);const resumed=await metric();assert(resumed.videos.every(v=>v.time>at+.3),'every video resumes');
       stops.push({at,elapsed,held:heldFrame,resumed});console.log('PASS planet '+at+' held for '+elapsed+' ms');
     }
     await fs.writeFile(path.join(out,'planet-stops.json'),JSON.stringify(stops,null,2));
   }
   if(n===5&&${soakSeconds}>0){
     const samples=[];server.dispatchCommand({action:'seek',time:0});await delay(2000);
     let previous=await metric();const start=Date.now();
     while(Date.now()-start<${soakSeconds}*1000){
       await delay(Math.min(25000,${soakSeconds}*1000-(Date.now()-start)));
       const current=await metric(),elapsed=(Date.now()-start)/1000;
       assert(current.videos.every((v,i)=>v.frames>previous.videos[i].frames&&!v.error),'all decoders advance during soak');
       assert.equal(new Set(current.presented.map(p=>p.frame)).size,1,'atomic frames during soak');
       samples.push({elapsed,video:current.videos,presented:current.presented,processes:app.getAppMetrics().map(p=>({type:p.type,cpu:p.cpu.percentCPUUsage,memory:p.memory}))});previous=current;
       console.log('SOAK '+Math.round(elapsed)+'s: five real decoders advancing, atomic presentation');
       await fs.writeFile(path.join(out,'soak-progress.json'),JSON.stringify({seconds:${soakSeconds},samples},null,2));
     }
     await fs.writeFile(path.join(out,'5-tv-soak-end.png'),(await w.webContents.capturePage()).toPNG());
   }
   if(n===5&&${process.env.NAVA_QA_STALL==='1'}){
     const errorStart=errors.length;
     // Fault injection shadows decoder readiness in this disposable renderer only.
     // The production watchdog and WS/server recovery path remain unmodified.
     await w.webContents.executeJavaScript(\`window.qaStalledVideo=document.querySelector('video[data-panel-source]');if(!window.qaStalledVideo)throw Error('No side decoder');window.qaStalledVideo.pause();Object.defineProperty(window.qaStalledVideo,'readyState',{value:1,configurable:true});\`);
     const suspended=await until(state,s=>s.suspended,'real wall watchdog suspension',15000);
     await delay(600);const heldState=await state();assert.equal(heldState.phaseTime,suspended.phaseTime,'suspended timeline stays fixed');
     await fs.writeFile(path.join(out,'5-tv-stalled.png'),(await w.webContents.capturePage()).toPNG());
     const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',pin:'9384'})});
     const token=/nava_session=([0-9a-f]+)/.exec(login.headers.get('set-cookie')??'')?.[1];assert(token);
     const resume=()=>fetch(base+'/api/recovery/resume',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:'{}'});
     assert.equal((await resume()).status,409,'cannot resume a still-stalled decoder');
     await w.webContents.executeJavaScript('delete window.qaStalledVideo.readyState;delete window.qaStalledVideo');
     try{await until(state,s=>s.videoReady&&s.suspended,'coherent paused wall recovered',15000);}catch(error){await fs.writeFile(path.join(out,'wall-recovery-metrics.json'),JSON.stringify(await metric(),null,2));throw error;}
     const resumed=await resume();assert.equal(resumed.status,200,await resumed.text());
     await until(state,s=>!s.suspended&&s.state==='playing','operator resume');await delay(1500);
     const afterResume=await metric();assert(afterResume.videos.every(v=>v.time>suspended.phaseTime),'every decoder advances after explicit recovery');
     await fs.writeFile(path.join(out,'5-tv-recovered.png'),(await w.webContents.capturePage()).toPNG());
     const expected=errors.slice(errorStart);assert.equal(expected.length,2,JSON.stringify(expected));assert(expected.some(e=>e==='Wall playback suspended'));assert(expected.some(e=>e.includes('Peretele video')));
     errors.splice(errorStart);
     await fs.writeFile(path.join(out,'wall-stall-recovery.json'),JSON.stringify({simulatedDecoderFault:true,realWatchdogAndTransport:true,heldTime:suspended.phaseTime,expectedErrors:expected,resumed:true},null,2));
     console.log('PASS real wall watchdog: injected side stall, stable suspended time, recovery guard, explicit resume');
   }
   server.dispatchCommand({action:'pause'});await until(state,s=>s.state==='paused','pause');await delay(1500);
   const paused=await metric();await delay(500);const held=await metric();assert(held.videos.every((v,i)=>Math.abs(v.time-paused.videos[i].time)<.04),'common pause');
   assert(Math.max(...held.videos.map(v=>v.time))-Math.min(...held.videos.map(v=>v.time))<.04,'paused frame alignment');
   server.dispatchCommand({action:'seek',time:390});await delay(2000);
   const sought=await metric();assert(sought.videos.every(v=>Math.abs(v.time-390)<.04),'all decoders seek');
   await fs.writeFile(path.join(out,n+'-tv-paused-seek.png'),(await w.webContents.capturePage()).toPNG());
   server.onDisplayTopologyChanged('QA unplug during show');assert.equal(await server.applyDetectedTopology(),false,'no hot remap of active mission');
   records.push({count:n,primary:primary.id,directory:config.video.panelsDir,playing:m,paused:held,seek:sought});
   if(n===5&&!${process.env.NAVA_QA_WINDOWS==='1'}){
     server.dispatchCommand({action:'restart'});await until(state,s=>s.state==='idle'&&!s.suspended,'back to preparation');
     count=2;screen.emit('display-removed',{},{});
     await until(()=>manager.snapshot(),s=>s.state==='applied'&&s.candidate.screens.length===2,'automatic live 5 to 2');
     await until(state,s=>s.videoReady&&s.readiness.screensMissing.length===0&&s.readiness.screensConnected.length===2,'updated server requirements');
     assert.equal((await server.startTvDemo()).ok,true,'demo after automatic resize');
     await until(state,s=>s.state==='playing','resized demo playing');
     await fs.writeFile(path.join(out,'live-5-to-2.png'),(await w.webContents.capturePage()).toPNG());
     records[records.length-1].liveHotplugRecovered=true;
     console.log('PASS live 5→2: automatic topology, window reload, readiness and fresh TV demo');
   }
   w.destroy();w=undefined;await server.stop();server=undefined;
   console.log(${process.env.NAVA_QA_WINDOWS==='1'}?'PASS windowed geometry: one real viewport, five source decoders, children demo, advance, pause, seek':'PASS '+n+' TVs: real movies, children demo, advance, pause, seek, suspended hotplug guard');
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(out,'adaptive-renderer-review.json'),JSON.stringify({runId:path.basename(temp),syntheticOsCounts:true,realMedia:true,records,errors},null,2));
}catch(e){console.error(e);await fs.writeFile(path.join(out,'adaptive-renderer-failure.json'),JSON.stringify({error:String(e),records,errors},null,2));app.exitCode=1;process.exitCode=1;}
finally{manager?.stop();w?.destroy();await server?.stop();app.exit(process.exitCode??0);}});
`;
try{
 await build({stdin:{contents:source,resolveDir:root,loader:'ts'},outfile:main,bundle:true,platform:'node',format:'cjs',external:['electron'],logLevel:'warning'});
 const child=spawn(require('electron'),[main],{stdio:'pipe',windowsHide:true});child.stdout.pipe(process.stdout);child.stderr.pipe(process.stderr);
 const code=await new Promise(r=>child.once('exit',r));if(code!==0)throw Error('Adaptive display QA failed: '+code);
 const report=JSON.parse(await readFile(path.join(out,'adaptive-renderer-review.json'),'utf8'));if(report.runId!==path.basename(temp)||report.records.length!==((process.env.NAVA_QA_PLANETS==='1'||process.env.NAVA_QA_STALL==='1'||process.env.NAVA_QA_WINDOWS==='1')?1:4))throw Error('Incomplete QA report');
}finally{await rm(temp,{recursive:true,force:true,maxRetries:10,retryDelay:300});}
