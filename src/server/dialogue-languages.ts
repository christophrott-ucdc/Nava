import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import type {Lang} from '../shared/types';

export interface DialogueTranslation {version:1;lang:Lang;sourceSha256:string;cues:Record<string,string>}
/** Translation files carry no timing or actions. IDs and Romanian source hash must match exactly. */
export async function loadDialogueTranslation(file:string,source:string,ids:string[],lang:Lang):Promise<Record<string,string>>{
  const value=JSON.parse(await fs.readFile(file,'utf8')) as DialogueTranslation;
  if(value.version!==1||value.lang!==lang||value.sourceSha256!==createHash('sha256').update(source).digest('hex'))throw Error(`Translation ${lang}: source mismatch`);
  if(!value.cues||Object.keys(value.cues).length!==ids.length||ids.some(id=>typeof value.cues[id]!=='string'||!value.cues[id].trim()))throw Error(`Translation ${lang}: missing or extra dialogue`);
  return value.cues;
}
export const dialogueFile=(directory:string,lang:Lang)=>path.join(directory,`dialogue.${lang}.json`);
