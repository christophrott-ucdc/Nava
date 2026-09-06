import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'assets/music/symphony');
try{process.loadEnvFile(path.join(root,'.env'));}catch(e){if(e.code!=='ENOENT')throw e;}
const common=['original cinematic orchestral space suite','instrumental only, absolutely no voices or choir','warm strings, harp, celesta, soft French horn, restrained woodwinds','recurring four-note motif D A B F sharp, spacious phrasing','D major with luminous Lydian colours, approximately 68 BPM','gentle background underscore beneath spoken Romanian dialogue','clear low mids, sparse melodic activity, restrained dynamics','wonder, kindness and curiosity, suitable for children and adults','organic symphonic development, seamless transitions, no abrupt cuts'];
const sections=[
 ['I. Portul stelelor',60000,'Begin quietly with harp harmonics and celesta introducing the four-note motif, long warm strings enter gradually. A welcoming space harbour, patient and luminous. No grand opening hit.'],
 ['II. Aripi de lumină',60000,'Develop the same motif in soft French horn above gently flowing strings. A graceful sense of departure, dignified lift, no action-movie intensity.'],
 ['III. Grădina dintre lumi',60000,'Woodwinds answer the motif in delicate counterpoint, harp ripples and restrained pizzicato, playful discovery with elegance rather than cartoon comedy.'],
 ['IV. Întrebarea',60000,'Thin the orchestra, introduce suspended harmony and distant celesta echoes of the motif. Curious uncertainty, never horror or menace. Leave generous breathing space.'],
 ['V. Împreună',60000,'Resolve the uncertainty as the motif returns in warm strings and rounded horns, the fullest but still restrained orchestration. Tender collective discovery, no percussion climax.'],
 ['VI. Acasă, printre stele',60000,'Return to the opening harp and celesta motif, softened strings and a reassuring homecoming. Gentle complete cadence in D major, long natural decay ending in silence.']
];
const request={model_id:'music_v2',store_for_inpainting:true,composition_plan:{chunks:sections.map(([name,duration_ms,direction])=>({text:'[Instrumental]',duration_ms,positive_styles:[...common,direction],negative_styles:['vocals','lyrics','spoken word','choir','trailer drums','aggressive brass','horror','sudden loud impacts','distortion'],context_adherence:'high'}))}};
await fs.mkdir(out,{recursive:true});
await fs.writeFile(path.join(out,'composition-plan.json'),JSON.stringify({title:'EXODUS7 — Dincolo de lumi',sections:sections.map(([title,durationMs,direction])=>({title,durationMs,direction})),request},null,2)+'\n');
if(!process.env.ELEVENLABS_API_KEY){console.log('BLOCKED: ELEVENLABS_API_KEY is not configured. Composition plan saved.');process.exitCode=2;}
else{
 const pending=path.join(out,'generation.pending.json'),file=path.join(out,'exodus7-dincolo-de-lumi-v1.mp3');
 try{
  for(const p of [pending,file]){try{await fs.access(p);throw new Error('Existing generation or audio: manual reconciliation required; no paid retry.');}catch(e){if(e.code!=='ENOENT')throw e;}}
  await fs.writeFile(pending,JSON.stringify({requestedAt:new Date().toISOString(),durationMs:360000,status:'requested'}));
  console.log('Requesting one 360-second orchestral suite from ElevenLabs music_v2.');
  const response=await fetch('https://api.elevenlabs.io/v1/music?output_format=mp3_48000_192',{method:'POST',headers:{'Content-Type':'application/json','xi-api-key':process.env.ELEVENLABS_API_KEY},body:JSON.stringify(request),signal:AbortSignal.timeout(900000)});
  if(!response.ok){await fs.writeFile(pending,JSON.stringify({status:'rejected',httpStatus:response.status,requestId:response.headers.get('request-id')}));throw new Error(`ElevenLabs HTTP ${response.status}; no automatic retry.`);}
  const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length<10000)throw new Error('Incomplete provider response; reconcile before retry.');
  await fs.writeFile(file,bytes,{flag:'wx'});
  await fs.writeFile(path.join(out,'receipt.json'),JSON.stringify({provider:'elevenlabs',model:'music_v2',requestId:response.headers.get('request-id'),songId:response.headers.get('song-id'),generatedAt:new Date().toISOString(),requestedDurationMs:360000,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),file:path.basename(file),needsAudition:true,integratedIntoShow:false},null,2)+'\n');
  await fs.unlink(pending);console.log('SAVED: '+file);
 }catch(e){console.error(String(e.message).replaceAll(process.env.ELEVENLABS_API_KEY,'[redacted]'));process.exitCode=1;}
}
