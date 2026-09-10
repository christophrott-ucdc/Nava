import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

/** Resolve the entire configured set before enabling independent panel playback. */
export function panelSources(directory:string|undefined,ids:readonly string[],mode?:string):Record<string,string>|undefined {
  if(!directory||mode==='cinema'||!ids.length)return;
  const sources:Record<string,string>={};
  try{
    for(const id of ids){
      if(!/^[\w-]+$/.test(id))return;
      const file=path.join(directory,id+'.mp4');
      if(!fs.statSync(file).isFile())return;
      sources[id]=pathToFileURL(file).href;
    }
    return sources;
  }catch{return;}
}
