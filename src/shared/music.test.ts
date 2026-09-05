import {test} from 'node:test';
import assert from 'node:assert/strict';
import {activeMusic,musicCues,musicOffset,musicSilenceGain,type MusicManifest} from './music';
import type {AmbientCue,ShowFile} from './types';
const cue:AmbientCue={id:'music-M05',kind:'ambient',action:'start',phase:'play',at:144,source:{type:'file',file:'M05-natura.mp3',sha256:'a'.repeat(64),durationSec:88,windowSec:88,loop:false,fadeOutSec:.5,gainDb:0}};
test('M05 cannot spill into silence, including direct forward and reverse seeks',()=>{
 for(const time of [144,200,231.999])assert.equal(activeMusic([cue],'play',time).length,1);
 for(const time of [143.99,232,233,245.99,246])assert.equal(activeMusic([cue],'play',time).length,0);
 assert.equal(activeMusic([cue],'epilogue',150).length,0);
});
test('silence bus has exactly zero gain at 232 through 246 and fades before marker',()=>{
 assert.equal(musicSilenceGain('play',231.5),1);assert.equal(musicSilenceGain('play',231.75),.5);
 for(const time of [232,233,240,245.999])assert.equal(musicSilenceGain('play',time),0);
 assert.equal(musicSilenceGain('play',246),1);assert.equal(musicSilenceGain('epilogue',233),1);
});
test('file playback offsets derive from phase time, with loop wrapping and countdown source offset',()=>{
 assert.equal(musicOffset(cue,200,88),56);
 const loop={...cue,source:{...cue.source!,loop:true}};assert.equal(musicOffset(loop,233,59),30);
 const countdown={...cue,at:-10,source:{...cue.source!,offsetSec:2}};assert.equal(musicOffset(countdown,-10,12),2);assert.equal(musicOffset(countdown,-.5,12),11.5);
});
test('thanks binds once to existing cue and is clipped to the phase end without modifying show',()=>{
 const show={scenes:[{phase:'epilogue',end:75}],cues:[{id:'thanks',kind:'tablet',phase:'epilogue',at:68,interaction:{type:'thanks'}}]} as ShowFile;
 const before=JSON.stringify(show);
 const manifest={tracks:[{id:'M10',file:'M10-certificat.mp3',phase:'epilogue',startSec:0,durationSec:8,windowSec:8,trigger:'thanks',loop:false,fadeInSec:.5,fadeOutSec:.5,gainDb:0,sha256:'a'}]} as MusicManifest;
 const c=musicCues(manifest,show);assert.equal(c.length,1);assert.equal(c[0].at,68);assert.equal(c[0].source?.windowSec,7);assert.equal(activeMusic(c,'epilogue',75).length,0);assert.equal(JSON.stringify(show),before);
 assert.deepEqual(musicCues(manifest,{...show,cues:[]}),[]);
});
