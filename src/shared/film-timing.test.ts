import test from 'node:test';
import assert from 'node:assert/strict';
import {remapFilmTime,videoCorrection,publicDurationSec,FILM_DURATION} from './film-timing';
import fs from 'node:fs';
test('visual mapping inserts Saturn without stretching the whole film',()=>{
 assert.equal(remapFilmTime(144),144);assert.equal(remapFilmTime(356),388);assert.equal(remapFilmTime(402),610);
 assert(remapFilmTime(401.5)<504);assert.throws(()=>remapFilmTime(NaN));
 let last=-Infinity;for(let t=-10;t<=465;t+=.5){const next=remapFilmTime(t);assert(next>=last&&next<=FILM_DURATION);last=next;}
});
test('panel drift uses deadband, both nudge directions, seeks and custom thresholds',()=>{
 assert.deepEqual(videoCorrection(10,10.01,1),{seek:false,rate:1});
 assert.deepEqual(videoCorrection(10,10.06,1),{seek:false,rate:1.05});
 assert.deepEqual(videoCorrection(10,9.94,2),{seek:false,rate:1.9});
 assert.equal(videoCorrection(0,.12,1).seek,true);
 assert.equal(videoCorrection(0,.12,1,{seekThresholdSec:.2}).seek,false);
});
test('all film cues and every age dialogue fit and preserve audible voice windows',()=>{
 const show=JSON.parse(fs.readFileSync('assets/show/show.json','utf8'));
 assert.equal(publicDurationSec(show),813.05);
 for(const c of show.cues)if(c.phase==='play')assert(c.at>=-10&&c.at<=show.videoDurationSec,c.id);
 const packages=[['assets/show/voice-script-v3.json','assets/voice/ro/manifest.json'],...['age-5-10','age-10-15','age-15-18','adults'].map(id=>[`assets/scenarios/${id}/dialogue.ro.draft.json`,`assets/scenarios/${id}/voice/ro/manifest.json`])];
 for(const [file,manifestFile] of packages){
  const {cues}=JSON.parse(fs.readFileSync(file,'utf8')),manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
  for(const c of cues){const end=c.phase==='play'?show.videoDurationSec:c.phase==='preshow'?50:75;
   assert(c.at<end,c.id);const next=Math.min(end,...cues.filter((n:{phase:string;at:number})=>n.phase===c.phase&&n.at>c.at).map((n:{at:number})=>n.at));
   assert(manifest.clips[c.id],`missing ${c.id}`);
   assert(manifest.clips[c.id].durationMs/1000<=next-c.at+.001,`overlap ${c.id}`);
  }
 }
});
