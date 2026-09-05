import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAmbient} from './ambient';
import type {AmbientCue} from '../../shared/types';
test('playAudio=false builds no music graph, fetches no files and remains silent',()=>{
 const e=createAmbient({audible:false,enabled:true,volume:1,duck:.25,sfxVolume:1,fileBaseUrl:'http://127.0.0.1/assets/music/'});
 const c:AmbientCue={id:'music-test',phase:'play',at:0,kind:'ambient',action:'start',source:{type:'file',file:'test.mp3',sha256:'a'.repeat(64),durationSec:10,windowSec:10,loop:false,fadeOutSec:.5,gainDb:0}};
 e.setFileCues([c]);e.followTheme('launch');e.syncFiles('play',5,1);e.setDucked(true);e.setEnabled(false);e.setEnabled(true);
 assert.deepEqual(e.musicStatus(),{loaded:[],failed:[],active:[],silenceGain:1,duckGain:1});e.dispose();
});
