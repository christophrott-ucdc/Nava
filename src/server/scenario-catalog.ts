import { promises as fs } from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import type {ShowFile,VoiceCue,VoiceManifest,MarkerCue} from '../shared/types';
import type {ScenarioId} from '../shared/scenario-engine';
import {SCENARIO_LABELS} from '../shared/mission';

export interface ScenarioPackage {id:ScenarioId;label:string;show:ShowFile;hash:string;issues:string[];branches:Record<string,Array<{id:string;condition:string}>>;}
// Measured production voices retain their natural tempo. These offsets use existing silence only.
export const PRODUCTION_OFFSETS:Record<string,number>={'s1015-03':23.2,'s1015-26':418.3,'s1015-30':455.5,'s1015-36':55.5,'s1518-04':36.5,'s1518-29':452.4,'s1518-37':71};
const DRAFT_OFFSETS:Record<string,number>={'s1015-03':21,'s1015-26':416,'s1015-30':456,'s1015-36':54,'s1518-04':37,'s1518-29':454,'s1518-37':72};
export async function scenarioDirectory(root:string,id:ScenarioId):Promise<string>{
  if(id==='legacy-v3'||!Object.hasOwn(SCENARIO_LABELS,id))throw new Error('Pachet invalid');
  const local=path.join(root,'assets/scenarios',id);
  try{await fs.access(local);return local;}catch{if(typeof process.resourcesPath==='string')return path.join(process.resourcesPath,'assets/scenarios',id);throw new Error('Pachet indisponibil');}
}
export async function loadScenario(root:string,id:ScenarioId,legacy:ShowFile):Promise<ScenarioPackage> {
  if(!(id in SCENARIO_LABELS))throw new Error('Scenariu necunoscut');
  const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
  if(id==='legacy-v3')return {id,label:SCENARIO_LABELS[id],show:legacy,hash:digest(JSON.stringify(legacy)),issues:[],branches:{}};
  const dir=await scenarioDirectory(root,id);
  const raw=await fs.readFile(path.join(dir,'dialogue.ro.draft.json'),'utf8');
  const draft=JSON.parse(raw) as {cues:Array<{id:string;phase:'preshow'|'play'|'epilogue';at:number;maxDurationSec:number;speaker:VoiceCue['speaker'];condition:string;text:{ro:string}}>};
  if(!Array.isArray(draft.cues)||!draft.cues.length)throw new Error('Pachet fără replici');
  for(const c of draft.cues){
    if(!['preshow','play','epilogue'].includes(c.phase)||!Number.isFinite(c.at)||typeof c.text?.ro!=='string'||!c.text.ro.trim())throw new Error('Replică invalidă');
    if(PRODUCTION_OFFSETS[c.id]!==undefined&&c.at===DRAFT_OFFSETS[c.id])c.at=PRODUCTION_OFFSETS[c.id];
  }
  const issues:string[]=[];
  let manifest:VoiceManifest={lang:'ro',generatedAt:'',clips:{}};
  try{manifest=JSON.parse(await fs.readFile(path.join(dir,'voice/ro/manifest.json'),'utf8'));}catch{issues.push('Manifest vocal lipsă');}
  const branches:ScenarioPackage['branches']={};
  const voices:VoiceCue[]=[];
  const markers:MarkerCue[]=[];
  const seen=new Set<string>();
  for(const c of draft.cues){
    if(!/^[a-zA-Z0-9_-]+$/.test(c.id)||seen.has(c.id))throw new Error('ID vocal invalid/duplicat');seen.add(c.id);
    const meta=manifest.clips[c.id];
    if(!meta||meta.text!==c.text.ro||meta.speaker!==c.speaker)issues.push(`${c.id}: audio lipsă sau text diferit`);
    else {
      if(!/^[\w.-]+\.mp3$/.test(meta.file))throw new Error('Cale vocală invalidă');
      try{
        const bytes=await fs.readFile(path.join(dir,'voice/ro',meta.file));if(bytes.length<1024)issues.push(`${c.id}: audio gol`);
        const expected=(meta as typeof meta & {sha256?:string}).sha256;
        if(!expected||createHash('sha256').update(bytes).digest('hex')!==expected)issues.push(`${c.id}: integritatea audio nu corespunde manifestului`);
      }catch{issues.push(`${c.id}: fișier lipsă`);}
      if(!meta.words?.length||!meta.visemes?.length||!(meta.durationMs>0))issues.push(`${c.id}: sincronizare incompletă`);
      // Natural delivery may use the following silent gap, but never overlap another voice or phase.
      const next=Math.min(...draft.cues.filter(x=>x.phase===c.phase&&x.at>c.at).map(x=>x.at),c.phase==='preshow'?50:c.phase==='play'?465:75);
      if(meta.durationMs/1000>next-c.at)issues.push(`${c.id}: durata depășește următoarea replică (${meta.durationMs/1000}s)`);
    }
    const manual=c.condition!=='always';
    voices.push({id:c.id,kind:'voice',phase:c.phase,at:c.at,speaker:c.speaker,text:c.text,manual,fallback:'silent',subtitleHoldMs:300,audioDurationMs:meta?.durationMs});
    if(manual){const key=`branch-${c.phase}-${c.at}`;if(!branches[key]){branches[key]=[];markers.push({id:key,kind:'marker',phase:c.phase,at:c.at,label:'Răspunsul expediției'});}branches[key].push({id:c.id,condition:c.condition});}
  }
  const hash=digest(raw+JSON.stringify(manifest)+JSON.stringify(PRODUCTION_OFFSETS));
  const base=legacy.cues.filter(c=>['theme','entity','sfx','countdown','ambient','lights'].includes(c.kind));
  const show:ShowFile={...legacy,title:SCENARIO_LABELS[id],version:hash.slice(0,12),variants:undefined,
    scenario:{id,revision:hash.slice(0,12),voiceRoot:`assets/scenarios/${id}/voice`,contentHash:hash},
    cues:[...base,...voices,...markers].sort((a,b)=>a.phase.localeCompare(b.phase)||a.at-b.at)};
  return {id,label:SCENARIO_LABELS[id],show,hash,issues,branches};
}
