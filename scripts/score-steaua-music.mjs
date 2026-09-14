#!/usr/bin/env node
/** Re-edit existing original music into continuous, crossfaded scene-length masters. */
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),run=promisify(execFile);
const input=path.join(root,'assets/music'),out=path.join(root,'runs/steaua-production/staged/music');
await fs.mkdir(out,{recursive:true});
const manifest=JSON.parse(await fs.readFile(path.join(input,'manifest.json'),'utf8'));
const timing=JSON.parse(await fs.readFile(path.join(root,'runs/steaua-production/staged/timing-report.json'),'utf8')).timing;
const plan=[
 ['M01','prolog','M01-prolog.mp3','intro','preshow',0,60,1.5,2,-2],
 ['M02','numaratoare','M02-numaratoare.mp3','launch','play',-10,10,.4,0,-2],
 ['M03','decolare','M03-decolare.mp3','launch','play',0,60,1,3,-2],
 ['M04','lumina','M04-lumina.mp3','light','play',60,84,3,3,-1],
 ['M05','natura','M05-natura.mp3','nature','play',144,102,3,4,-1],
 ['M06','cristal','M06-tehnologie.mp3','tech','play',246,142,3,3,-2],
 ['M07','cometa','M07-wormhole.mp3','wormhole','play',388,116,5,4,-2],
 ['M08','revelatia','M08-revelatia.mp3','revelation','play',610,68.05,6,4,-2],
 ['M09','acasa','M09-epilog.mp3','reentry','epilogue',0,75,2,4,-2],
 ['M11','saturn','M11-simfonie.mp3','saturn','play',504,106,4,4,-5],
 ['M12','scanteie','M10-certificat.mp3','tech','play',timing.ignitionSec,8,.2,2,-5],
];
const tracks=[];
for(const [id,name,source,sceneId,phase,startSec,windowSec,fadeInSec,fadeOutSec,gainDb] of plan){
 const filepath=path.join(input,source),file=`${id}-steaua-${name}.mp3`;
 const {stdout}=await run('ffprobe',['-v','error','-show_entries','format=duration','-of','json',filepath],{windowsHide:true});
 const length=Number(JSON.parse(stdout).format.duration),offset=id==='M02'?2:id==='M11'?42:0;
 const usable=length-offset,cross=2,copies=Math.max(1,Math.ceil((windowSec-cross)/(usable-cross)));
 const args=['-hide_banner','-loglevel','error','-y'];
 for(let i=0;i<copies;i++)args.push('-ss',String(offset),'-i',filepath);
 const filters=[];let last='0:a';
 for(let i=1;i<copies;i++){const next=`join${i}`;filters.push(`[${last}][${i}:a]acrossfade=d=${cross}:c1=tri:c2=tri[${next}]`);last=next;}
 filters.push(`[${last}]atrim=0:${windowSec},asetpts=PTS-STARTPTS,afade=t=in:d=${fadeInSec}${fadeOutSec?`,afade=t=out:st=${windowSec-fadeOutSec}:d=${fadeOutSec}`:''}[music]`);
 args.push('-filter_complex',filters.join(';'),'-map','[music]','-ar','44100','-ac','2','-c:a','libmp3lame','-b:a','192k',path.join(out,file));
 await run('ffmpeg',args,{windowsHide:true,maxBuffer:2*1024*1024});
 const bytes=await fs.readFile(path.join(out,file)),sha256=createHash('sha256').update(bytes).digest('hex');
 const duration=await run('ffprobe',['-v','error','-show_entries','format=duration','-of','json',path.join(out,file)],{windowsHide:true});
 tracks.push({id,file,sceneId,phase,startSec,durationSec:Number(JSON.parse(duration.stdout).format.duration),windowSec,loop:false,
   fadeInSec:.08,fadeOutSec:.08,gainDb,sourceOffsetSec:0,sha256,promptRef:'docs/STEAUA-OMENIRII-INTEGRARE.md',needsReview:true,
   edit:{source,sourceOffsetSec:offset,copies,crossfadeSec:copies>1?cross:0,renderedFadeInSec:fadeInSec,renderedFadeOutSec:fadeOutSec}});
 console.log(`[score] ${file}: ${windowSec}s, ${copies} source segment(s)`);
}
manifest.scenarios??={};manifest.scenarios['age-5-10']={tracks,duckDb:-12,duckAttackSec:.15,duckReleaseSec:1.2,silence:timing.musicSilence};
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Scene music masters staged; live music untouched.');
