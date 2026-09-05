#!/usr/bin/env node
/** Explicit offline production; no SDK, no runtime API calls, no automatic paid retries. */
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'assets/music'),run=promisify(execFile);
const hash=x=>createHash('sha256').update(x).digest('hex');
const json=async(p,x)=>{await fs.writeFile(p+'.tmp',JSON.stringify(x,null,2)+'\n');await fs.rename(p+'.tmp',p);};
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const ff=async args=>run('ffmpeg',['-hide_banner','-nostdin',...args],{windowsHide:true,maxBuffer:8e6});
const args=new Set(process.argv.slice(2)),check=args.has('--check');
if([...args].some(a=>!['--check','--only=M08'].includes(a)))throw Error('Use --check or --only=M08');
try{process.loadEnvFile(path.join(root,'.env'));}catch(e){if(e.code!=='ENOENT')throw e;}
const safe=x=>String(x).replaceAll(process.env.ELEVENLABS_API_KEY||'NO_KEY','[redacted]').replace(/sk_[\w]+/g,'[redacted]').slice(0,800);
const brief=await fs.readFile(path.join(root,'docs/PROMPT-CODEX-MUZICA.md'),'utf8');
const specs=[
 ['M01','prolog','intro','preshow',0,60,50,true,-26],
 ['M02','numaratoare','launch','play',-10,12,10,false,-20],
 ['M03','decolare','launch','play',0,70,60,false,-20],
 ['M04','lumina','light','play',60,84,84,false,-26],
 ['M05','natura','nature','play',144,88,88,false,-26],
 ['M06','tehnologie','tech','play',246,110,110,false,-26],
 ['M07','wormhole','wormhole','play',356,46,46,false,-20],
 ['M08','revelatia','revelation','play',402,63,63,false,-20],
 ['M09','epilog','reentry','epilogue',0,80,75,true,-26],
 ['M10','certificat','reentry','epilogue',0,8,8,false,-20]
].map(([id,name,sceneId,phase,startSec,durationSec,windowSec,loop,lufs])=>{
 const marker=brief.indexOf(`**${id} ·`),start=brief.indexOf('\n> ',marker),end=brief.indexOf('\n',start+1);
 if(marker<0||start<0)throw Error('Prompt missing '+id);
 return {id,file:`${id}-${name}.mp3`,sceneId,phase,startSec,durationSec,windowSec,loop,lufs,prompt:brief.slice(start+3,end).trim(),fadeInSec:.5,fadeOutSec:id==='M02'?0:.5,gainDb:0,promptRef:`docs/PROMPT-CODEX-MUZICA.md#${id}`,trigger:id==='M10'?'thanks':undefined};
});
await fs.mkdir(path.join(out,'masters'),{recursive:true});await fs.mkdir(path.join(out,'qa'),{recursive:true});
// The API exposes lossless PCM rather than a WAV enum. Preserve response bytes separately;
// a WAV container is added without changing a single PCM sample when needed.
function wav(pcm,channels){const h=Buffer.alloc(44);h.write('RIFF');h.writeUInt32LE(pcm.length+36,4);h.write('WAVEfmt ',8);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(channels,22);h.writeUInt32LE(48000,24);h.writeUInt32LE(48000*channels*2,28);h.writeUInt16LE(channels*2,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(pcm.length,40);return Buffer.concat([h,pcm]);}
async function compose(s){
 const receiptPath=path.join(out,s.file.replace('.mp3','.receipt.json')),master=path.join(out,'masters',s.file.replace('.mp3','.wav'));
 let receipt;try{receipt=await read(receiptPath);}catch{}
 if(receipt&&hash(await fs.readFile(master))===receipt.masterSha256)return receipt;
 if(check)throw Error('Missing production master '+s.id);
 const reference=['M01','M05','M09','M10'].includes(s.id)?await read(path.join(out,'M08-revelatia.receipt.json')):null;
 if(reference&&!reference.songId)throw Error('M08 missing reusable song-id; do not generate unrelated replacement');
 const direction=s.prompt+' Instrumental only; no words, no sung syllables, no drums or trailer percussion. Sparse continuous energy between 300 and 3000 Hz, spacious lows below 200 Hz and airy overtones above 4 kHz.';
 const request=reference?{model_id:'music_v2',store_for_inpainting:true,composition_plan:{chunks:[{text:'[Instrumental]',duration_ms:s.durationSec*1000,positive_styles:[direction,'contemplative space score','spacious orchestration','wide dynamic range','minimalist','cinematic acoustic instruments','gentle and restrained'],negative_styles:['lyrics','speech','drums'],conditioning_ref:{song_id:reference.songId,range:{start_ms:0,end_ms:30000}},condition_strength:s.id==='M09'?'high':'medium',context_adherence:'high'}]}}:{model_id:'music_v2',prompt:direction,music_length_ms:s.durationSec*1000,force_instrumental:true,store_for_inpainting:true};
 const pending=path.join(out,s.id+'.pending.json'),key=hash(JSON.stringify(request));
 const apiPath=path.join(out,'masters',s.file.replace('.mp3','.api-pcm'));
 let recovered=null,recoveryInfo=null;try{const p=await read(pending);if(p.requestKey!==key)throw Error('Pending request mismatch');const bytes=await fs.readFile(apiPath);if(!p.apiSha256||hash(bytes)!==p.apiSha256)throw Error('Incomplete provider response; manual reconciliation required');recovered=bytes;recoveryInfo=p;}catch(e){if(e.code!=='ENOENT')throw e;}
 if(!recovered)try{await fs.access(pending);throw Error(`${s.id}: pending provider request; reconcile before retry`);}catch(e){if(e.code!=='ENOENT')throw e;}
 if(!process.env.ELEVENLABS_API_KEY)throw Error('ELEVENLABS_API_KEY missing');
 let response;
 if(!recovered){await json(pending,{id:s.id,requestKey:key,requestedAt:new Date().toISOString()});console.log(s.id+': requesting '+s.durationSec+'s lossless music_v2'+(reference?' with M08 reference':''));
 response=await fetch('https://api.elevenlabs.io/v1/music?output_format=pcm_48000',{method:'POST',headers:{'Content-Type':'application/json','xi-api-key':process.env.ELEVENLABS_API_KEY},body:JSON.stringify(request),signal:AbortSignal.timeout(600000)});
 if(!response.ok){const reason=safe(await response.text());await json(pending,{id:s.id,requestKey:key,status:response.status,reason});throw Error(`Music ${s.id} HTTP${response.status}: ${reason}`);}}
 const bytes=recovered??Buffer.from(await response.arrayBuffer());if(bytes.length<10000)throw Error('Empty audio response');
 if(!recovered){await fs.writeFile(apiPath+'.tmp',bytes);await fs.rename(apiPath+'.tmp',apiPath);await json(pending,{id:s.id,requestKey:key,apiSha256:hash(bytes),requestId:response.headers.get('request-id'),songId:response.headers.get('song-id')});}
 const alreadyWav=bytes.subarray(0,4).toString()==='RIFF';
 const channels=2; // Music PCM is stereo; duration may differ from the prompt, notably short cues.
 const masterBytes=alreadyWav?bytes:wav(bytes,channels);await fs.writeFile(master,masterBytes);
 receipt={id:s.id,provider:'elevenlabs',modelId:'music_v2',generatedAt:new Date().toISOString(),requestId:response?.headers.get('request-id')??recoveryInfo?.requestId??null,songId:response?.headers.get('song-id')??recoveryInfo?.songId??null,recoveredResponse:!!recovered,request,requestKey:key,prompt:s.prompt,reference:reference?{id:'M08',songId:reference.songId,rangeMs:[0,30000],masterSha256:reference.masterSha256}:null,apiFormat:'pcm_48000',apiSha256:hash(bytes),masterSha256:hash(masterBytes),containerOnly:!alreadyWav,channels,masterDurationSec:(bytes.length-(alreadyWav?44:0))/(48000*4),needsReview:true,reviewReason:'Human musical audition, motif recognition and room intelligibility pending.'};
 await json(receiptPath,receipt);await fs.unlink(pending);console.log(s.id+': master saved');return receipt;
}
async function loudness(file,target){const r=await ff(['-i',file,'-af',`loudnorm=I=${target}:TP=-3:LRA=50:print_format=json`,'-f','null','-']);const m=r.stderr.match(/\{\s*"input_i"[\s\S]*?\}/);if(!m)throw Error('No loudness report');return JSON.parse(m[0]);}
async function processTrack(s,r){
 const file=path.join(out,s.file),master=path.join(out,'masters',s.file.replace('.mp3','.wav')),receiptPath=path.join(out,s.file.replace('.mp3','.receipt.json'));
 if(r.sha256&&r.processingVersion===2){try{if(hash(await fs.readFile(file))===r.sha256){console.log(s.id+': reuse verified');return r;}}catch{}}
 if(check)throw Error('Missing processed '+s.id);
 const prepared=path.join(out,'qa',s.id+'-prepared.wav');
 // Loop derivatives overlap the tail with the head at unity-sum; masters remain untouched.
 const dur=s.durationSec,fade=.5;
 const filters=s.loop?`[0:a]atrim=0:${dur},asetpts=PTS-STARTPTS,asplit=3[a][b][c];[a]atrim=0:1,asetpts=PTS-STARTPTS[head];[b]atrim=${dur-1}:${dur},asetpts=PTS-STARTPTS[tail];[c]atrim=1:${dur-1},asetpts=PTS-STARTPTS[mid];[tail][head]acrossfade=d=1:c1=tri:c2=tri[seam];[seam][mid]concat=n=2:v=0:a=1,afade=t=in:d=${fade},afade=t=out:st=${dur-1-fade}:d=${fade}[out]`:null;
 if(filters)await ff(['-y','-i',master,'-filter_complex',filters,'-map','[out]','-ar','48000','-c:a','pcm_s24le',prepared]);
 else {const offset=s.id==='M02'?Math.max(0,(r.masterDurationSec??dur)-dur):0;await ff(['-y','-i',master,'-af',`atrim=${offset}:${offset+dur},asetpts=PTS-STARTPTS,afade=t=in:d=${s.fadeInSec}${s.fadeOutSec?`,afade=t=out:st=${dur-s.fadeOutSec}:d=${s.fadeOutSec}`:''}`,'-ar','48000','-c:a','pcm_s24le',prepared]);r.derivativeOffsetSec=offset;}
 const measured=await loudness(prepared,s.lufs);
 const norm=`loudnorm=I=${s.lufs}:TP=-3.2:LRA=50:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`;
 await ff(['-y','-i',prepared,'-af',norm,'-ar','48000','-c:a','libmp3lame','-b:a','192k',file]);
 const qa=await loudness(file,s.lufs);await ff(['-v','error','-xerror','-i',file,'-f','null','-']);
 if(Math.abs(Number(qa.input_i)-s.lufs)>1||Number(qa.input_tp)>-3)throw Error(s.id+' loudness/peak outside tolerance '+JSON.stringify(qa));
 const probe=JSON.parse((await run('ffprobe',['-v','error','-show_entries','format=duration','-of','json',file],{windowsHide:true})).stdout);
 r={...r,processingVersion:2,sha256:hash(await fs.readFile(file)),durationSec:Number(probe.format.duration),normalization:{targetLufs:s.lufs,truePeakLimitDb:-3,measured:qa},loop:s.loop?{crossfadeSec:1,derivativeDurationSec:dur-1,needsAudition:true}:null};
 await json(receiptPath,r);console.log(s.id+': MP3 '+qa.input_i+' LUFS / '+qa.input_tp+' dBTP');return r;
}
try{
 const tracks=[];
 for(const id of ['M08','M01','M02','M03','M04','M05','M06','M07','M09','M10']){
  if(args.has('--only=M08')&&id!=='M08')continue;
  const s=specs.find(s=>s.id===id),r=await processTrack(s,await compose(s));
  tracks.push({...s,prompt:undefined,durationSec:r.durationSec,sourceOffsetSec:s.id==='M02'?2:0,sha256:r.sha256,needsReview:r.needsReview});
 }
 if(tracks.length===10&&!check)await json(path.join(out,'manifest.json'),{version:1,modelId:'music_v2',duckDb:-9,duckAttackSec:.3,duckReleaseSec:.8,silence:{phase:'play',startSec:232,endSec:246},tracks:tracks.sort((a,b)=>a.id.localeCompare(b.id))});
 console.log(`Music production verified: ${tracks.length}/10`);
}catch(e){console.error(safe(e.stack));process.exitCode=1;}

