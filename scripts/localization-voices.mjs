#!/usr/bin/env node
/** Produces only explicitly reviewed translations. Never writes Romanian sources/audio. */
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {build} from 'esbuild';
import {LipsyncEn} from '@met4citizen/talkinghead/modules/lipsync-en.mjs';
import {LipsyncFr} from '@met4citizen/talkinghead/modules/lipsync-fr.mjs';
const root=path.resolve(import.meta.dirname,'..'),run=promisify(execFile),hash=x=>createHash('sha256').update(x).digest('hex');
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const save=async(p,x)=>{await fs.writeFile(p+'.tmp',JSON.stringify(x,null,2)+'\n');await fs.rename(p+'.tmp',p);};
const args=process.argv.slice(2),lang=args[0],check=args.includes('--check'),fit=args.includes('--fit');
if(!['en','fr'].includes(lang)||args.slice(1).some(x=>!['--check','--fit'].includes(x))||check&&fit)throw Error('Usage: node scripts/localization-voices.mjs en|fr [--check|--fit]');
try{process.loadEnvFile(path.join(root,'.env'));}catch(e){if(e.code!=='ENOENT')throw e;}
const safe=x=>String(x).replaceAll(process.env.ELEVENLABS_API_KEY||'NO_SECRET','[redacted]').replace(/sk_[\w]+/g,'[redacted]').slice(0,500);
const loadModule=async file=>{const r=await build({entryPoints:[path.join(root,file)],bundle:true,write:false,platform:'node',format:'esm',target:'node22',logLevel:'silent'});return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].contents).toString('base64'));};
const {alignmentToWords}=await loadModule('src/server/tts-providers.ts');
const {scenarioPhaseEnd}=await loadModule('src/shared/film-timing.ts');
const lipsync=lang==='en'?new LipsyncEn():new LipsyncFr();
function visemes(words,starts,durations){
 const track={visemes:[],vtimes:[],vdurations:[]};
 words.forEach((word,i)=>{const seq=lipsync.wordsToVisemes(word),total=seq.durations.reduce((a,b)=>a+b,0);if(!total)return;let cursor=starts[i];seq.visemes.forEach((v,j)=>{const end=j===seq.visemes.length-1?starts[i]+durations[i]:cursor+durations[i]*seq.durations[j]/total;track.visemes.push(v);track.vtimes.push(Math.round(cursor));track.vdurations.push(Math.max(1,Math.round(end)-Math.round(cursor)));cursor=end;});const end=starts[i]+durations[i];if(starts[i+1]-end>180){track.visemes.push('sil');track.vtimes.push(Math.round(end));track.vdurations.push(Math.round(starts[i+1]-end));}});return track;
}
const reviewed={};for(const f of (await fs.readdir(path.join(root,'assets/localization'))).filter(f=>/^speech-reviewed.*\.json$/.test(f)))Object.assign(reviewed,await read(path.join(root,'assets/localization',f)));
const legacy=await read(path.join(root,'assets/show/show.json')),casting=(await read(path.join(root,'assets/show/voice-script-v3.json'))).tts.voices;
const narrator=await read(path.join(root,'assets/experience/voice/ro/manifest.json'));
const reports=[];
for(const [profile,translations] of Object.entries(reviewed)){
 const tutorial=profile==='tutorial',original=path.join(root,tutorial?'assets/experience/voice/ro/manifest.json':profile==='legacy-v3'?'assets/show/show.json':`assets/scenarios/${profile}/dialogue.ro.draft.json`);
 const raw=await fs.readFile(original,'utf8'),source=JSON.parse(raw);
 const cues=tutorial?Object.entries(source.clips).map(([id,c])=>({id,text:{ro:c.text},phase:'tutorial',at:0})):source.cues.filter(c=>c.text?.ro).flatMap(c=>[c,...Object.entries(c.variants??{}).map(([v,text])=>({...c,id:c.id+'.'+v,text,variants:undefined}))]);
 if(Object.keys(translations).length!==cues.length||cues.some(c=>!translations[c.id]?.[lang]))throw Error(`Editorial review incomplete: ${profile}/${lang}`);
 const base=path.dirname(original),out=path.join(root,tutorial?`assets/experience/voice/${lang}`:profile==='legacy-v3'?`assets/voice/${lang}`:`assets/scenarios/${profile}/voice/${lang}`);
 await fs.mkdir(out,{recursive:true});
 const translated=Object.fromEntries(cues.map(c=>[c.id,translations[c.id][lang]]));
 const sidecar=path.join(tutorial?path.resolve(base,'../..'):base,`dialogue.${lang}.json`);
 const expectedSidecar={version:1,lang,sourceSha256:hash(raw),cues:translated};
 if(check){const actual=await read(sidecar);if(actual.version!==1||actual.lang!==lang||actual.sourceSha256!==expectedSidecar.sourceSha256||JSON.stringify(actual.cues)!==JSON.stringify(translated))throw Error(`Stale dialogue sidecar: ${profile}/${lang}`);}
 else await save(sidecar,expectedSidecar);
 let manifest;try{manifest=await read(path.join(out,'manifest.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
 manifest??=tutorial?{lang,voiceId:narrator.voiceId,voiceName:narrator.voiceName,clips:{}}:{lang,scenarioId:profile,clips:{}};
 if(check&&(manifest.lang!==lang||Object.keys(manifest.clips).length!==cues.length))throw Error(`Manifest language/count mismatch: ${profile}/${lang}`);
 for(const cue of cues){
  const text=translated[cue.id],voiceId=tutorial?narrator.voiceId:casting[cue.speaker]?.voiceId;if(!voiceId)throw Error(`Casting missing: ${cue.speaker}`);
  const request={text,model_id:'eleven_v3',language_code:lang,voice_settings:{stability:.5,similarity_boost:.8,speed:1.05},seed:parseInt(hash(`${profile}:${lang}:${cue.id}`).slice(0,8),16)};
  const generationKey=hash(JSON.stringify({voiceId,request})),file=cue.id+'.mp3',receiptFile=path.join(out,cue.id+'.receipt.json'),pendingFile=path.join(out,cue.id+'.pending.json');
  let receipt;try{receipt=await read(receiptFile);if(receipt.generationKey!==generationKey||hash(await fs.readFile(path.join(out,file)))!==receipt.sha256)receipt=null;}catch{receipt=null;}
  if(!receipt){
   if(check)throw Error(`Missing/stale ${profile}/${lang}/${cue.id}`);
   if(!process.env.ELEVENLABS_API_KEY)throw Error('ELEVENLABS_API_KEY missing');
   try{await fs.access(pendingFile);throw Error(`Unresolved provider request: ${pendingFile}`);}catch(e){if(e.code!=='ENOENT')throw e;}
   await save(pendingFile,{generationKey,voiceId,requestedAt:new Date().toISOString()});
   const response=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_192`,{method:'POST',headers:{'xi-api-key':process.env.ELEVENLABS_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(120000)});
   if(!response.ok)throw Error(safe(`HTTP ${response.status}: ${await response.text()}`));
   const payload=await response.json(),bytes=Buffer.from(payload.audio_base64??'','base64');if(bytes.length<1024)throw Error('Empty provider audio');
   const timing=alignmentToWords(payload.normalized_alignment||payload.alignment,true);if(!timing.words.length)throw Error('Missing provider alignment');
   receipt={cueId:cue.id,lang,speaker:cue.speaker,text,file,mime:'audio/mpeg',...timing,...visemes(timing.words,timing.wtimes,timing.wdurations),provider:'elevenlabs',modelId:'eleven_v3',voiceId,generationKey,sha256:hash(bytes),generatedAt:new Date().toISOString(),requestId:response.headers.get('request-id'),historyItemId:response.headers.get('history-item-id'),characterCost:response.headers.get('character-cost'),postprocessTempo:1,voiceSettings:request.voice_settings};
   await fs.writeFile(path.join(out,file),bytes);await save(receiptFile,receipt);await fs.unlink(pendingFile);
  }
  const probe=JSON.parse((await run('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_name,sample_rate','-of','json',path.join(out,file)],{windowsHide:true})).stdout);
  receipt.durationMs=Math.ceil(Number(probe.format.duration)*1000);if(!(receipt.durationMs>0)||probe.streams[0]?.codec_name!=='mp3')throw Error('Invalid audio');
  const at=cue.at;
  const budget=tutorial?45:Math.min(...cues.filter(c=>c.phase===cue.phase&&c.at>at).map(c=>c.at),scenarioPhaseEnd(profile,cue.phase,legacy))-at;
  if(fit&&receipt.durationMs>budget*1000&&receipt.postprocessTempo===1){
   const tempo=receipt.durationMs/(budget*1000-100);
   if(tempo<=1.15){
    const archive=path.join(root,'runs/debug/localization-2026-09-13/original-audio',profile,lang);await fs.mkdir(archive,{recursive:true});
    const originalAudio=path.join(archive,file);await fs.copyFile(path.join(out,file),originalAudio);await save(path.join(archive,cue.id+'.receipt.json'),receipt);
    const fitted=path.join(out,cue.id+'.fit.mp3');await run('ffmpeg',['-v','error','-y','-i',originalAudio,'-af',`atempo=${tempo}`,'-ar','44100','-b:a','192k',fitted],{windowsHide:true});
    const duration=Number(JSON.parse((await run('ffprobe',['-v','error','-show_entries','format=duration','-of','json',fitted],{windowsHide:true})).stdout).format.duration)*1000;
    if(duration<=budget*1000){await fs.rename(fitted,path.join(out,file));receipt.sourceSha256=receipt.sha256;receipt.sha256=hash(await fs.readFile(path.join(out,file)));receipt.postprocessTempo=tempo;receipt.durationMs=Math.ceil(duration);receipt.wtimes=receipt.wtimes.map(t=>t/tempo);receipt.wdurations=receipt.wdurations.map(t=>t/tempo);Object.assign(receipt,visemes(receipt.words,receipt.wtimes,receipt.wdurations));await save(receiptFile,receipt);}
    else await fs.unlink(fitted);
   }
  }
  await run('ffmpeg',['-v','error','-xerror','-i',path.join(out,file),'-f','null','-'],{windowsHide:true});
  if(receipt.durationMs>budget*1000)reports.push({profile,lang,id:cue.id,durationMs:receipt.durationMs,budgetMs:Math.round(budget*1000),excessMs:Math.round(receipt.durationMs-budget*1000)});
  const nextClip=tutorial?{file,text,durationSec:receipt.durationMs/1000,sha256:receipt.sha256}:receipt;
  const changed=JSON.stringify(manifest.clips[cue.id])!==JSON.stringify(nextClip);manifest.clips[cue.id]=nextClip;
  if(check&&changed)throw Error(`Manifest metadata mismatch: ${profile}/${lang}/${cue.id}`);
  if(!check){await save(receiptFile,receipt);if(changed){manifest.generatedAt=new Date().toISOString();await save(path.join(out,'manifest.json'),manifest);}}
  console.log(`${profile}/${lang}/${cue.id}: ${receipt.durationMs} ms / ${Math.round(budget*1000)} ms`);
 }
}
const report=path.join(root,`runs/debug/localization-2026-09-13/voice-timing-${lang}.json`);await save(report,reports);
console.log(JSON.stringify({language:lang,overlaps:reports.length,report}));if(reports.length)process.exitCode=1;
