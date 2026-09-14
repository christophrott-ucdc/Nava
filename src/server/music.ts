import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import type {MusicManifest} from '../shared/music';
/** Optional lobby score is independent of the ten timed show tracks. */
export async function loadWaitingMusic(appRoot:string){
  const roots=[path.join(appRoot,'assets/music'),...(typeof process.resourcesPath==='string'?[path.join(process.resourcesPath,'assets/music')]:[])];
  for(const directory of roots)try{
    const metadata=JSON.parse(await fs.readFile(path.join(directory,'waiting.json'),'utf8')) as {file:string;sha256:string};
    if(metadata.file!=='M11-simfonie.mp3'||! /^[a-f0-9]{64}$/.test(metadata.sha256))continue;
    const bytes=await fs.readFile(path.join(directory,metadata.file));
    if(createHash('sha256').update(bytes).digest('hex')!==metadata.sha256)continue;
    return {directory,metadata};
  }catch{/* Missing optional score never prevents the show. */}
  return null;
}
/** Runtime never generates or repairs music. A complete verified pack is optional. */
export async function loadMusic(appRoot:string):Promise<{manifest:MusicManifest;directory:string}|null>{
  let directory=path.join(appRoot,'assets/music');
  try{await fs.access(directory);}catch{if(typeof process.resourcesPath==='string')directory=path.join(process.resourcesPath,'assets/music');}
  try{
    const manifest=JSON.parse(await fs.readFile(path.join(directory,'manifest.json'),'utf8')) as MusicManifest;
    const scores=[manifest,...Object.values(manifest.scenarios??{})];
    if(manifest.version!==1)throw Error('Invalid music version');
    for(const score of scores){
      if(!Array.isArray(score.tracks)||score.tracks.length<1||score.tracks.length>32||new Set(score.tracks.map(t=>t.id)).size!==score.tracks.length)throw Error('Incomplete music pack');
      if(![score.duckDb,score.duckAttackSec,score.duckReleaseSec,score.silence?.startSec,score.silence?.endSec].every(Number.isFinite)||score.duckDb>0||score.duckDb< -40||score.duckAttackSec<=0||score.duckReleaseSec<=0||!['preshow','play','epilogue'].includes(score.silence.phase)||score.silence.endSec<=score.silence.startSec)throw Error('Invalid music mix');
    }
    for(const t of scores.flatMap(s=>s.tracks)){
      if(!/^M\d{2}-[a-z-]+\.mp3$/.test(t.file)||!['preshow','play','epilogue'].includes(t.phase)||![t.startSec,t.durationSec,t.windowSec,t.fadeInSec,t.fadeOutSec,t.gainDb].every(Number.isFinite)||t.durationSec<=0||t.windowSec<=0)throw Error('Invalid music entry');
      if(createHash('sha256').update(await fs.readFile(path.join(directory,t.file))).digest('hex')!==t.sha256)throw Error('Music hash mismatch');
    }
    return {manifest,directory};
  }catch{return null;}
}
