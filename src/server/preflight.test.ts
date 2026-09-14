import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {mp4Duration,runPreflight} from './preflight';
import type {AppConfig,ShowFile} from '../shared/types';

function film(seconds:number,version=0){const out=Buffer.alloc(2048);out.writeUInt32BE(2048,0);out.write('moov',4);out.writeUInt32BE(2040,8);out.write('mvhd',12);out[16]=version;const offset=16+(version?20:12);out.writeUInt32BE(1000,offset);if(version)out.writeBigUInt64BE(BigInt(Math.round(seconds*1000)),offset+4);else out.writeUInt32BE(Math.round(seconds*1000),offset+4);return out;}
test('single-film preflight checks actual MP4 duration and fails closed on invalid metadata',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'nava-duration-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.mkdir(path.join(root,'assets/voice/ro'),{recursive:true});await fs.writeFile(path.join(root,'assets/voice/ro/manifest.json'),JSON.stringify({clips:{}}));await fs.writeFile(path.join(root,'avatar.glb'),'avatar');
 const file=path.join(root,'film.mp4'),config={video:{path:'film.mp4'},avatar:{glb:'avatar.glb'}} as AppConfig;
 const show={videoDurationSec:678.05,cues:[]} as unknown as ShowFile;
 const run=()=>runPreflight(show,'ro',null,{appRoot:root,config,log:()=>{}});
 for(const version of [0,1]){await fs.writeFile(file,film(678.05,version));assert.equal(await mp4Duration(file),678.05);assert.equal((await run()).ok,true);}
 const normal=film(678.05),extended=Buffer.alloc(normal.length+8);extended.writeUInt32BE(1,0);extended.write('moov',4);extended.writeBigUInt64BE(BigInt(extended.length),8);normal.copy(extended,16,8);await fs.writeFile(file,extended);assert.equal(await mp4Duration(file),678.05,'64-bit atom header');
 await fs.writeFile(file,film(741.78));let result=await run();assert.equal(result.ok,false);assert.match(result.reasons.join(' '),/741.78.*678.05/);
 await fs.writeFile(file,film(465));assert.equal((await run()).ok,false);
 await fs.writeFile(file,film(678));assert.equal((await run()).ok,true,'one frame short source is tolerated');
 await fs.writeFile(file,Buffer.alloc(2048,1));result=await run();assert.equal(result.ok,false);assert.equal(result.video.durationSec,null);
 const malformed=film(678.05);malformed.writeUInt32BE(4096,0);await fs.writeFile(file,malformed);assert.equal(await mp4Duration(file),null,'atom cannot extend outside file');
 await fs.writeFile(file,film(678.05));await fs.writeFile(path.join(root,'assets/voice/ro/line.mp3'),Buffer.alloc(2048,1));
 const cue={id:'line',kind:'voice' as const,phase:'play' as const,at:0,speaker:'CAPITANUL' as const,text:{ro:'Text nou.'},variants:{child:{ro:'Varianta nouă.'}}};show.cues=[cue];
 const clip={file:'line.mp3',text:'Text vechi.',lang:'ro',speaker:'CAPITANUL',durationMs:1000,words:['Text']};
 const save=()=>fs.writeFile(path.join(root,'assets/voice/ro/manifest.json'),JSON.stringify({clips:{line:clip}}));
 await save();result=await run();assert.equal(result.ok,false);assert.equal(result.voice.issues[0].problem,'text-mismatch');
 clip.text='Text nou.';await save();assert.equal((await run()).ok,true);
 result=await runPreflight(show,'ro','child',{appRoot:root,config,log:()=>{}});assert.equal(result.ok,false,'base recording cannot voice a different variant');assert(result.voice.issues.some(i=>i.problem==='text-mismatch'));
 clip.speaker='AVATAR_AI';await save();assert((await run()).voice.issues.some(i=>i.problem==='metadata-mismatch'));
});
