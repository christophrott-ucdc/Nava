import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import type {MusicManifest} from '../shared/music';
/** Runtime never generates or repairs music. A complete verified pack is optional. */
export async function loadMusic(appRoot:string):Promise<{manifest:MusicManifest;directory:string}|null>{
  let directory=path.join(appRoot,'assets/music');
  try{await fs.access(directory);}catch{if(typeof process.resourcesPath==='string')directory=path.join(process.resourcesPath,'assets/music');}
  try{
    const manifest=JSON.parse(await fs.readFile(path.join(directory,'manifest.json'),'utf8')) as MusicManifest;
    if(manifest.version!==1||manifest.tracks.length!==10||new Set(manifest.tracks.map(t=>t.id)).size!==10)throw Error('Incomplete music pack');
    for(const t of manifest.tracks){
      if(!/^M\d{2}-[a-z-]+\.mp3$/.test(t.file)||!['preshow','play','epilogue'].includes(t.phase)||![t.startSec,t.durationSec,t.windowSec,t.fadeInSec,t.fadeOutSec,t.gainDb].every(Number.isFinite)||t.durationSec<=0||t.windowSec<=0)throw Error('Invalid music entry');
      if(createHash('sha256').update(await fs.readFile(path.join(directory,t.file))).digest('hex')!==t.sha256)throw Error('Music hash mismatch');
    }
    return {manifest,directory};
  }catch{return null;}
}
