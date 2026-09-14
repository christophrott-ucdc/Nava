#!/usr/bin/env node
/** Staged, resumable Eleven v3 production. No live manifests or retired audio are touched. */
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {build} from 'esbuild';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
try{process.loadEnvFile(path.join(root,'.env'));}catch{}
const hash=x=>createHash('sha256').update(x).digest('hex');
const safe=x=>String(x).replaceAll(process.env.ELEVENLABS_API_KEY||'NO_SECRET','[redacted]').replace(/sk_[\w]+/g,'[redacted]').slice(0,500);
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const atomic=async(p,v)=>{await fs.writeFile(p+'.tmp',v);await fs.rename(p+'.tmp',p);};
const json=(p,v)=>atomic(p,JSON.stringify(v,null,2)+'\n');
const run=promisify(execFile),base=path.join(root,'runs/steaua-production/staged');
async function moduleFrom(file){const r=await build({entryPoints:[path.join(root,file)],bundle:true,write:false,platform:'node',format:'esm',target:'node22',logLevel:'silent'});return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].contents).toString('base64'));}
async function main(){
 if(!process.env.ELEVENLABS_API_KEY)throw Error('Missing ELEVENLABS_API_KEY');
 const source=await read(path.join(root,'assets/scenarios/age-5-10/steaua-authoring.json'));
 const casting=(await read(path.join(root,'assets/show/voice-script-v3.json'))).tts.voices;
 const previousNarrator=await read(path.join(root,'assets/experience/voice/ro/manifest.json'));
 const [{alignmentToWords},{distributeWordVisemes}]=await Promise.all([moduleFrom('src/server/tts-providers.ts'),moduleFrom('src/renderer/avatar/lipsync-ro.ts')]);
 const jobs=source.dialogue.cues.map(c=>({group:'scenario',id:c.id,speaker:c.speaker,text:c.text.ro,tags:c.tts.audioTags,ref:c.authorRef}));
 for(const [id,clip] of Object.entries(previousNarrator.clips))jobs.push({group:'narrator',id,speaker:'NARATORUL',text:source.narrator[id]?.text??clip.text,tags:['warmly'],ref:source.narrator[id]?.ref});
 for(const [id,c] of Object.entries(source.vr))jobs.push({group:'vr',id:id.toLowerCase(),speaker:'AVATAR_AI',text:c.text,tags:['gently'],ref:id});
 await fs.mkdir(base,{recursive:true});
 let cursor=0,blocked=false;
 const results=[],failures=[];
 async function job(c){
  const dir=path.join(base,c.group);await fs.mkdir(dir,{recursive:true});
  const file=`${c.id}.mp3`,receiptPath=path.join(dir,c.id+'.receipt.json'),pending=path.join(dir,c.id+'.pending.json');
  const voiceId=c.speaker==='NARATORUL'?previousNarrator.voiceId:process.env['ELEVENLABS_VOICE_'+c.speaker]||casting[c.speaker].voiceId;
  const settings={stability:0.5,similarity_boost:0.8,speed:1};
  const request={text:c.tags.map(t=>`[${t}]`).join(' ')+' '+c.text,model_id:'eleven_v3',language_code:'ro',voice_settings:settings,seed:parseInt(hash('steaua:'+c.id).slice(0,8),16)};
  const generationKey=hash(JSON.stringify({voiceId,request,format:'mp3_44100_192',edition:source.sourceSha256}));
  let clip,audio;
  try{clip=await read(receiptPath);audio=await fs.readFile(path.join(dir,file));}catch{}
  if(clip?.generationKey!==generationKey||!audio?.length||hash(audio)!==clip.sha256){
   try{await fs.access(pending);throw Error(c.id+': unresolved paid request; reconcile provider history before retry.');}catch(e){if(e.code!=='ENOENT')throw e;}
   await json(pending,{generationKey,voiceId,requestedAt:new Date().toISOString()});
   console.log(`[v3] ${c.group}/${c.id} generating`);
   const response=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_192`,{method:'POST',headers:{'xi-api-key':process.env.ELEVENLABS_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(120000)});
   if(!response.ok){const reason=safe(`HTTP ${response.status}: ${await response.text()}`);await json(pending,{generationKey,voiceId,failure:reason});throw Error(reason);}
   const payload=await response.json();audio=Buffer.from(payload.audio_base64||'','base64');
   if(audio.length<1024)throw Error('Empty provider audio');
   const timing=alignmentToWords(payload.normalized_alignment||payload.alignment,true);
   if(!timing.words.length)throw Error('Provider alignment missing');
   clip={cueId:c.id,lang:'ro',speaker:c.speaker,text:c.text,file,mime:'audio/mpeg',...timing,...distributeWordVisemes(timing.words,timing.wtimes,timing.wdurations),provider:'elevenlabs',modelId:'eleven_v3',voiceId,voiceSettings:settings,generationKey,sha256:hash(audio),generatedAt:new Date().toISOString(),requestId:response.headers.get('request-id'),historyItemId:response.headers.get('history-item-id'),characterCost:response.headers.get('character-cost'),postprocessTempo:1,authorRef:c.ref};
   await atomic(path.join(dir,file),audio);await json(receiptPath,clip);await fs.unlink(pending);
  }
  const {stdout}=await run('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_name,sample_rate,channels','-of','json',path.join(dir,file)],{windowsHide:true});
  const probe=JSON.parse(stdout);clip.durationMs=Math.ceil(Number(probe.format.duration)*1000);clip.durationSec=clip.durationMs/1000;
  if(!(clip.durationMs>0)||probe.streams[0]?.codec_name!=='mp3')throw Error('Invalid generated media '+c.id);
  Object.assign(clip,{codec:'mp3',sampleRate:Number(probe.streams[0].sample_rate),channels:Number(probe.streams[0].channels)});
  await json(receiptPath,clip);results.push({group:c.group,id:c.id,durationSec:clip.durationSec,ref:c.ref});
  console.log(`[v3] ${c.group}/${c.id} ready ${clip.durationSec.toFixed(2)}s (${results.length}/${jobs.length})`);
 }
 await Promise.all([0,1].map(async()=>{while(cursor<jobs.length&&!blocked){const c=jobs[cursor++];try{await job(c);}catch(e){blocked=true;failures.push({group:c.group,id:c.id,reason:safe(e.message)});console.error(`[v3] ${c.id}: ${safe(e.message)}`);}}}));
 for(const group of ['scenario','narrator','vr']){
  const manifest={lang:'ro',generatedAt:new Date().toISOString(),edition:'Steaua Omenirii',sourceSha256:source.sourceSha256,clips:{}};
  if(group==='narrator')Object.assign(manifest,{schemaVersion:1,voiceId:previousNarrator.voiceId,voiceName:previousNarrator.voiceName});
  for(const c of jobs.filter(j=>j.group===group))try{const clip=await read(path.join(base,group,c.id+'.receipt.json'));manifest.clips[c.id]=group==='narrator'?{file:clip.file,text:clip.text,durationSec:clip.durationSec,sha256:clip.sha256}:clip;}catch{}
  await json(path.join(base,group,'manifest.json'),manifest);
 }
 await json(path.join(base,'production-report.json'),{expected:jobs.length,ready:results.length,failures,results,liveAssetsChanged:false});
 console.log(JSON.stringify({expected:jobs.length,ready:results.length,failures}));
 if(failures.length||results.length!==jobs.length)process.exitCode=1;
}
main().catch(e=>{console.error(safe(e.message));process.exitCode=1;});
