import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {ROOT,waitFor} from './smoke-scenarios.mjs';
export async function runMusicQA({h,call,evaluate,metric,errors,port}){
 const out=path.join(ROOT,'runs/debug/music');await mkdir(out,{recursive:true});
 await call('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{window.__musicMixes=[];const connect=AudioNode.prototype.connect;AudioNode.prototype.connect=function(destination,...args){const result=connect.call(this,destination,...args);if(destination instanceof AudioDestinationNode){let m=window.__musicMixes.find(m=>m.ctx===this.context);if(!m){m={ctx:this.context,dest:this.context.createMediaStreamDestination(),connections:0};window.__musicMixes.push(m);}connect.call(this,m.dest);m.connections++;}return result;};window.__recordMusic=()=>{const m=[...window.__musicMixes].sort((a,b)=>b.connections-a.connections)[0];if(!m)throw Error('No real audio bus');const chunks=[];const recorder=new MediaRecorder(m.dest.stream,{mimeType:'audio/webm;codecs=opus'});recorder.ondataavailable=e=>chunks.push(e.data);window.__finishMusic=()=>new Promise(resolve=>{recorder.onstop=()=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(chunks,{type:'audio/webm'}));};recorder.stop();});recorder.start();};})()`});
 await call('Page.reload');
 const status=()=>evaluate(`JSON.parse(document.documentElement?.dataset.musicStatus||'{}')`);
 await waitFor(status,s=>s.loaded?.length===10,'10 actual music buffers decoded',45000);
 await h.select('legacy-v3');await h.api('/api/experience/control',{action:'skip'});
 await waitFor(async()=>(await h.api('/api/state')).body,s=>s.readiness?.ready,'real renderer ready',30000);
 const proof={checkedAt:new Date().toISOString(),realElectron:true,realMedia:true,checks:[],voices:[],errors};
 await h.command({action:'preshow'});await waitFor(status,s=>s.active?.includes('music-M01'),'M01');proof.checks.push('M01 preshow');
 await h.command({action:'start'});await waitFor(status,s=>s.active?.includes('music-M02'),'M02 countdown');
 await h.command({action:'seek',time:-.2});await waitFor(status,s=>s.active?.includes('music-M03')&&!s.active.includes('music-M02'),'M02 to M03');
 proof.checks.push('M02 countdown transitions to M03 with no overlap');
 const voices=JSON.parse(await readFile(path.join(ROOT,'assets/voice/ro/manifest.json'),'utf8'));
 for(const [id,time,music] of [['v3-cap-0109',9,'M03'],['v3-ai-0206',66,'M04'],['v3-ai-0352',172,'M05'],['v3-ai-0512',252,'M06'],['v3-cap-0829',449,'M08']]){
   await h.command({action:'seek',time:time-.7});await evaluate('window.__recordMusic()');
   const duck=await waitFor(status,s=>s.active?.includes('music-'+music)&&Math.abs(s.duckGain-10**(-9/20))<.003,'-9dB under '+id,10000);
   const playback=await metric();assert(playback.video.frames>0);assert(playback.subtitle.trim());
   await new Promise(r=>setTimeout(r,Math.min(14000,voices.clips[id].durationMs+1000)));
   const bytes=await evaluate('window.__finishMusic()');await writeFile(path.join(out,`${id}-real-mix.webm`),Buffer.from(bytes,'base64'));
   proof.voices.push({id,music,duck,playback,recording:`${id}-real-mix.webm`});console.log('Music + real voice',id,'PASS');
 }
 await h.command({action:'seek',time:220});await h.command({action:'pause'});await waitFor(status,s=>s.active?.length===0,'paused music');await h.command({action:'play'});await waitFor(status,s=>s.active?.includes('music-M05'),'music resume');
 await h.command({action:'ambient',enabled:false});await waitFor(status,s=>s.active?.length===0,'ambient mute');await h.command({action:'ambient',enabled:true});await waitFor(status,s=>s.active?.includes('music-M05'),'ambient restore');
 await h.command({action:'seek',time:231.8});await waitFor(status,s=>s.silenceGain===0&&s.active.length===0,'music and procedural silence');
 const silent=await status();await h.command({action:'seek',time:233});assert.equal((await waitFor(status,s=>s.silenceGain===0,'seek into silence')).active.length,0);proof.checks.push({silence:silent,note:'Voices at233 and241 intentionally remain; silence is music+procedural bus only.'});
 await h.command({action:'seek',time:247});await waitFor(status,s=>s.silenceGain===1&&s.active.includes('music-M06'),'resume after silence');
 await h.command({action:'seek',time:357});await waitFor(status,s=>s.active.includes('music-M07'),'wormhole');
 await h.command({action:'epilogue'});await waitFor(status,s=>s.active.includes('music-M09'),'epilogue loop');
 await h.command({action:'seek',time:67.5});await waitFor(status,s=>s.active.includes('music-M10'),'thanks flourish');
 await waitFor(status,s=>s.active.length===0,'all music stops at ended',12000);proof.checks.push('M07, M09, thanks M10 and phase-end cutoff');
 assert.deepEqual(errors,[]);proof.passed=true;await writeFile(path.join(out,'renderer.json'),JSON.stringify(proof,null,2));
 await h.command({action:'restart'});
 const smoke=spawn(process.env.ComSpec??'cmd.exe',['/d','/s','/c','npm run smoke:renderer'],{cwd:ROOT,windowsHide:true,stdio:'inherit',env:{...process.env,NAVA_CDP_PORT:String(port),NAVA_SERVER_PORT:new URL(h.base).port,NAVA_TEST_PIN:'9384'}});
 assert.equal(await new Promise(resolve=>smoke.once('exit',resolve)),0);console.log('Music renderer QA PASS');
}
