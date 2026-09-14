import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {audiencePanelIds} from '../shared/display-topology';

/** A count-specific export is atomic: never substitute a subset of a wider wall. */
export function adaptivePanelDirectory(sets:Record<string,string>|undefined,ids:readonly string[]):string {
  const expected=audiencePanelIds(ids.length),directory=sets?.[String(ids.length)];
  if(!expected||ids.length!==new Set(ids).size||expected.some(id=>!ids.includes(id))||!directory)
    throw new Error(`Nu există un set panoramic configurat pentru ${ids.length} TV-uri.`);
  const issues:string[]=[];
  if(!panelSources(directory,ids,'panorama',issues))throw new Error(issues.join(' '));
  return directory;
}

/** Resolve the entire configured set before enabling independent panel playback. */
export function panelSources(directory:string|undefined,ids:readonly string[],mode?:string,issues?:string[]):Record<string,string>|undefined {
  if(!directory||mode==='cinema'||!ids.length)return;
  const sources:Record<string,string>={};
  let complete=true;
  for(const id of ids){
    if(!/^[\w-]+$/.test(id)){issues?.push(`ID de ecran invalid: ${id}`);complete=false;continue;}
    const file=path.join(directory,id+'.mp4');
    try{
      const stat=fs.statSync(file);
      if(!stat.isFile()||stat.size===0)throw new Error('not a nonempty file');
      sources[id]=pathToFileURL(file).href;
    }catch{issues?.push(`Film panoramic lipsă sau gol: ${file}`);complete=false;}
  }
  return complete?sources:undefined;
}
