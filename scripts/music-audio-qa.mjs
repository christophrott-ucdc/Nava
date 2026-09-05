import {promises as fs} from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..'),dir=path.join(root,'assets/music'),out=path.join(root,'runs/debug/music'),run=promisify(execFile);
const read=async p=>JSON.parse(await fs.readFile(p,'utf8')),hash=b=>createHash('sha256').update(b).digest('hex');
const ff=args=>run('ffmpeg',['-nostdin','-hide_banner',...args],{windowsHide:true,maxBuffer:6e6});
await fs.mkdir(out,{recursive:true});const m=await read(path.join(dir,'manifest.json')),report={generatedAt:new Date().toISOString(),tracks:[],loops:[],humanAuditionRequired:true};
for(const t of m.tracks){
 const file=path.join(dir,t.file),receipt=await read(path.join(dir,t.file.replace('.mp3','.receipt.json')));
 if(hash(await fs.readFile(file))!==t.sha256)throw Error('Hash '+t.id);
 await ff(['-v','error','-xerror','-i',file,'-f','null','-']);
 const probe=JSON.parse((await run('ffprobe',['-v','error','-show_entries','format=duration:stream=sample_rate,channels','-of','json',path.join(dir,'masters',t.file.replace('.mp3','.wav'))],{windowsHide:true})).stdout);
 report.tracks.push({id:t.id,masterDurationSec:Number(probe.format.duration),runtimeDurationSec:t.durationSec,sampleRate:Number(probe.streams[0].sample_rate),channels:probe.streams[0].channels,lufs:Number(receipt.normalization.measured.input_i),truePeakDb:Number(receipt.normalization.measured.input_tp),reference:receipt.reference?.id??null});
 if(t.loop){
   const pcm=path.join(out,t.id+'-loop.f32');await ff(['-y','-i',file,'-f','f32le','-acodec','pcm_f32le',pcm]);
   const b=await fs.readFile(pcm),frames=b.length/8;let jump=0,edgePeak=0;
   for(let c=0;c<2;c++){jump=Math.max(jump,Math.abs(b.readFloatLE((frames-1)*8+c*4)-b.readFloatLE(c*4)));for(let n=0;n<480;n++)edgePeak=Math.max(edgePeak,Math.abs(b.readFloatLE(n*8+c*4)),Math.abs(b.readFloatLE((frames-1-n)*8+c*4)));}
   const db=x=>20*Math.log10(Math.max(1e-12,x));
   if(db(jump)>-60)throw Error(t.id+' nonzero loop seam');
   await ff(['-y','-stream_loop','2','-i',file,'-c:a','pcm_s16le',path.join(out,t.id+'-three-loops.wav')]);
   report.loops.push({id:t.id,cycles:3,seamJumpDb:db(jump),edgePeak10msDb:db(edgePeak),zeroCrossingToleranceDb:-60,needsAudition:true});
 }
}
await fs.writeFile(path.join(out,'audio-qa.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
if(process.argv.includes('--transcribe')){
 try{process.loadEnvFile(path.join(root,'.env'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const voices=await read(path.join(root,'assets/voice/ro/manifest.json')),proof=await read(path.join(out,'renderer.json')),results=[];
 const words=x=>x.toLocaleLowerCase('ro').normalize('NFD').replace(/\p{M}/gu,'').match(/[\p{L}\p{N}]+/gu)??[];
 for(const clip of proof.voices){const audio=await fs.readFile(path.join(out,clip.recording)),sha256=hash(audio),p=path.join(out,clip.id+'-transcription.json');let r;try{r=await read(p);}catch{}
   if(r?.sha256!==sha256){const form=new FormData();form.append('file',new Blob([audio],{type:'audio/webm'}),clip.recording);form.append('model_id','scribe_v2');form.append('language_code','ro');form.append('tag_audio_events','false');
     const res=await fetch('https://api.elevenlabs.io/v1/speech-to-text',{method:'POST',headers:{'xi-api-key':process.env.ELEVENLABS_API_KEY},body:form,signal:AbortSignal.timeout(120000)});if(!res.ok)throw Error('Scribe HTTP '+res.status);
     r={sha256,...await res.json()};await fs.writeFile(p,JSON.stringify(r,null,2));}
   const expected=words(voices.clips[clip.id].text),actual=words(r.text);let prev=Array.from({length:actual.length+1},(_,i)=>i);for(let i=1;i<=expected.length;i++){const row=[i];for(let j=1;j<=actual.length;j++)row[j]=Math.min(row[j-1]+1,prev[j]+1,prev[j-1]+Number(expected[i-1]!==actual[j-1]));prev=row;}
   const result={id:clip.id,words:expected.length,transcribedWords:actual.length,wordErrorRate:prev[actual.length]/expected.length,text:r.text};results.push(result);console.log(JSON.stringify(result));
 }
 await fs.writeFile(path.join(out,'intelligibility.json'),JSON.stringify({results,humanRoomAuditionRequired:true},null,2));
}
