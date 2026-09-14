/** Bundled and launched only by qa-crash-recovery.mjs. */
import {app,BrowserWindow,ipcMain} from 'electron';
import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
import {startServer} from '../src/server/index';
import {WindowManager} from '../src/main/windows';
const root=process.env.NAVA_QA_ROOT,temp=process.env.NAVA_QA_TEMP,out=process.env.NAVA_QA_OUT,mode=process.env.NAVA_QA_MODE;
const killPlaying=process.env.NAVA_QA_KILL_PLAYING==='1';
if(!temp||!root||!out||!['interrupt','recover'].includes(mode))throw Error('QA context required');
app.setPath('userData',path.join(temp,'userData'));app.on('window-all-closed',()=>{});
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
// Keep the actual WindowManager windows hidden; no production code is modified.
BrowserWindow.prototype.show=function(){};BrowserWindow.prototype.focus=function(){};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,predicate,label,timeout=45000){let last;const end=Date.now()+timeout;do{last=await fn();if(predicate(last))return last;await delay(100);}while(Date.now()<end);throw Error(label+': '+JSON.stringify(last));}
let server,wm;const logs=[],unexpected=[],processErrors=[];
process.on('uncaughtException',e=>{processErrors.push(String(e));console.error(e);});process.on('unhandledRejection',e=>{processErrors.push(String(e));console.error(e);});
app.whenReady().then(async()=>{try{
 const config=JSON.parse(await fs.readFile(path.join(root,'config.json'),'utf8'));
 delete config.autoDisplays;delete config.videoWall;delete config.video.panelsDir;delete config.video.panelsByCount;
 const sc={id:'center',displayIndex:0,showAvatar:true,showSubtitles:true,showEntities:true,playAudio:true,kiosk:false};
 config.screens=[sc];config.displayMode='windows';config.server={port:0,bindHost:'127.0.0.1'};config.lights={driver:'none'};
 config.autoRun={...config.autoRun,enabled:false,requireScreens:['center'],requireTablets:0};config.security={operatorPin:'9384',screenToken:'crash-qa-screen',sessionTtlMin:30,usersFile:path.join(temp,'data/users.json'),publicState:true};
 server=await startServer({config,appRoot:root,dataRoot:temp,webDir:path.join(root,'dist/web'),showPath:path.resolve(root,config.show),cacheDir:path.join(temp,'cache'),runsDir:path.join(temp,'runs'),log:(level,msg,data)=>{logs.push({level,msg,data});if(level==='error')unexpected.push(msg);}});
 const base='http://127.0.0.1:'+server.port,state=()=>fetch(base+'/api/state').then(r=>r.json());
 const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin:'9384'})});assert.equal(login.status,200);
 const token=/nava_session=([0-9a-f]+)/.exec(login.headers.get('set-cookie')??'')?.[1];assert(token);
 async function api(url,body){const r=await fetch(base+url,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
 let loopCount=0;
 wm=new WindowManager({rendererHtml:path.join(root,'dist/renderer/index.html'),preloadJs:path.join(root,'dist/preload/preload.js'),windowed:true,openDevTools:false,displayMode:'windows',log:(level,msg,data)=>logs.push({level,msg,data}),onCrashLoop:()=>loopCount++});
 ipcMain.handle('nava:getBoot',()=>({config,screen:sc,wsUrl:base.replace('http:','ws:')+'/ws',serverHttpUrl:base,videoUrl:pathToFileURL(path.resolve(root,config.video.path)).href,avatarUrl:pathToFileURL(path.resolve(root,config.avatar.glb)).href,voiceBaseUrl:pathToFileURL(path.join(root,'assets/voice')+path.sep).href,showUrl:pathToFileURL(path.resolve(root,config.show)).href,isDev:false,appVersion:'qa',screenToken:config.security.screenToken,displayMode:'windows'}));
 ipcMain.on('nava:log',(_,level,msg)=>{if(level==='error')unexpected.push(msg);});ipcMain.on('nava:sendCommand',(_,cmd)=>server.dispatchCommand(cmd));ipcMain.handle('nava:startTvDemo',()=>server.startTvDemo());
 wm.open(config.screens);
 const ready=()=>until(state,s=>s.videoReady&&s.screensConnected===1&&s.readiness.assetsOk===true,'renderer and voices ready');await ready();
 const metric=()=>wm.windowFor('center').webContents.executeJavaScript("(()=>{const v=document.querySelector('video');return {time:v.currentTime,paused:v.paused,ready:v.readyState,frames:v.getVideoPlaybackQuality().totalVideoFrames}})()");
 if(mode==='interrupt'){
  assert((await server.startTvDemo()).ok);await until(state,s=>s.state==='playing','demo playing');
  server.dispatchCommand({action:'seek',time:211});await delay(1700);
  const before=await state(),wc=wm.windowFor('center').webContents.id;
  wm.windowFor('center').webContents.forcefullyCrashRenderer();
  await until(()=>wm.windowFor('center')?.webContents.id,id=>id&&id!==wc,'replacement renderer');await ready();
  const recovered=await state();assert.equal(recovered.runId,before.runId);assert(Math.abs(recovered.phaseTime-before.phaseTime)<5,'renderer crash retains timeline');
  if(recovered.suspended){const r=await api('/api/recovery/resume',{runId:recovered.runId});assert.equal(r.status,200,JSON.stringify(r));}
  if(!killPlaying){server.dispatchCommand({action:'pause'});await until(state,s=>s.state==='paused','pause before hard kill');}else{server.dispatchCommand({action:'play'});await until(state,s=>s.state==='playing','playing before hard kill');}
  server.dispatchCommand({action:'seek',time:321.25});await delay(1200);
  const checkpoint=await state();assert(killPlaying?checkpoint.phaseTime>=321.25&&checkpoint.phaseTime<325:Math.abs(checkpoint.phaseTime-321.25)<.1);
  await fs.writeFile(path.join(out,'before-kill.json'),JSON.stringify({runMarker:path.basename(temp),state:checkpoint,metric:await metric(),rendererRecreated:true},null,2));
  console.log('READY_FOR_HARD_KILL');await new Promise(()=>{});
 }else{
  const previous=JSON.parse(await fs.readFile(path.join(out,'before-kill.json'),'utf8'));
  const recovered=await state();assert.equal(recovered.runId,previous.state.runId);assert(recovered.suspended,'crashed process resumes only with operator');
  assert(Math.abs(recovered.phaseTime-previous.state.phaseTime)<(killPlaying?.5:.1),'durable checkpoint precise');
  const resume=await api('/api/recovery/resume',{runId:recovered.runId});assert.equal(resume.status,200,JSON.stringify(resume));
  assert(!(await state()).suspended);server.dispatchCommand({action:'play'});await delay(1600);assert((await metric()).time>321.25);
  await fs.writeFile(path.join(out,'recovered.png'),(await wm.windowFor('center').webContents.capturePage()).toPNG());
  // Simulate the native unresponsive event; the watchdog really crashes the renderer after its grace period.
  let id=wm.windowFor('center').webContents.id;const hungAt=Date.now();wm.windowFor('center').webContents.emit('unresponsive');
  await until(()=>wm.windowFor('center')?.webContents.id,next=>next&&next!==id,'hang watchdog replacement',25000);assert(Date.now()-hungAt>=9500);await ready();
  for(let i=0;i<2;i++){
   id=wm.windowFor('center').webContents.id;wm.windowFor('center').webContents.forcefullyCrashRenderer();
   if(i===0){await until(()=>wm.windowFor('center')?.webContents.id,next=>next&&next!==id,'second crash replacement');await ready();}
   else await until(()=>loopCount,n=>n===1,'bounded crash loop');
  }
  await delay(1000);assert.equal(loopCount,1);assert.deepEqual(processErrors,[]);assert.deepEqual(unexpected,[]);
  await fs.writeFile(path.join(out,'recovery.json'),JSON.stringify({runMarker:path.basename(temp),recovered,preciseCheckpoint:true,killWhilePlaying:killPlaying,checkpointLagSec:previous.state.phaseTime-recovered.phaseTime,playbackAfterRecovery:true,watchdogGraceMs:Date.now()-hungAt,crashLoopStopped:true,unexpected,logs,processErrors},null,2));
 }
}catch(e){console.error(e);await fs.writeFile(path.join(out,'failure-'+mode+'.json'),JSON.stringify({error:String(e),logs,unexpected,processErrors},null,2));process.exitCode=1;}
finally{wm?.setQuitting();wm?.closeAll();await server?.stop();app.exit(process.exitCode??0);}});
