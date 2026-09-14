import { promises as fs } from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import type {ShowFile,VoiceCue,VoiceManifest,MarkerCue,Lang} from '../shared/types';
import {loadDialogueTranslation,dialogueFile} from './dialogue-languages';
import type {ScenarioId} from '../shared/scenario-engine';
import {SCENARIO_LABELS} from '../shared/mission';
import {scenarioPhaseEnd} from '../shared/film-timing';
import {audioIntegrity} from './audio-integrity';
import {withPlanetStops} from '../shared/planet-stops';

export interface ScenarioPackage {id:ScenarioId;label:string;show:ShowFile;hash:string;issues:string[];branches:Record<string,Array<{id:string;condition:string}>>;}
export async function scenarioDirectory(root:string,id:ScenarioId):Promise<string>{
  if(id==='legacy-v3'||!Object.hasOwn(SCENARIO_LABELS,id))throw new Error('Pachet invalid');
  const local=path.join(root,'assets/scenarios',id);
  try{await fs.access(local);return local;}catch{if(typeof process.resourcesPath==='string')return path.join(process.resourcesPath,'assets/scenarios',id);throw new Error('Pachet indisponibil');}
}
export async function loadScenario(root:string,id:ScenarioId,legacy:ShowFile,lang:Lang='ro'):Promise<ScenarioPackage> {
  legacy=withPlanetStops(legacy);
  if(!(id in SCENARIO_LABELS))throw new Error('Scenariu necunoscut');
  const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
  if(id==='legacy-v3'){
    if(lang==='ro')return {id,label:SCENARIO_LABELS[id],show:legacy,hash:digest(JSON.stringify(legacy)),issues:[],branches:{}};
    let dir=path.join(root,'assets/show');try{await fs.access(dir);}catch{if(typeof process.resourcesPath==='string')dir=path.join(process.resourcesPath,'assets/show');}
    const raw=await fs.readFile(path.join(dir,'show.json'),'utf8');
    const dialogueIdentity=(show:ShowFile)=>JSON.stringify(show.cues.filter(c=>c.kind==='voice').map(c=>({id:c.id,speaker:c.speaker,ro:c.text.ro,variants:Object.fromEntries(Object.entries(c.variants??{}).map(([v,t])=>[v,t.ro]))})));
    if(dialogueIdentity(legacy)!==dialogueIdentity(JSON.parse(raw)))throw Error('Romanian dialogue differs from the localized source; rebuild translations before selecting this language.');
    const text=await loadDialogueTranslation(dialogueFile(dir,lang),raw,legacy.cues.filter(c=>c.kind==='voice').flatMap(c=>[c.id,...Object.keys(c.variants??{}).map(v=>`${c.id}.${v}`)]),lang);
    const show={...legacy,cues:legacy.cues.map(c=>c.kind==='voice'?{...c,text:{...c.text,[lang]:text[c.id]},...(c.variants?{variants:Object.fromEntries(Object.entries(c.variants).map(([v,value])=>[v,{...value,[lang]:text[`${c.id}.${v}`]}]))}:{})}:c)};
    const issues:string[]=[],voiceDir=path.resolve(dir,'../voice',lang);
    let manifest:VoiceManifest={lang,generatedAt:'',clips:{}};
    try{manifest=JSON.parse(await fs.readFile(path.join(voiceDir,'manifest.json'),'utf8'));if(manifest.lang!==lang)issues.push('Voice language mismatch');}catch{issues.push('Voice manifest missing');}
    for(const [cueId,line] of Object.entries(text)){
      const meta=manifest.clips[cueId];
      if(!meta||meta.text!==line||!meta.words?.length||!meta.visemes?.length||!(meta.durationMs>0)||!/^[\w.-]+\.mp3$/.test(meta.file)){issues.push(`${cueId}: incomplete localized voice`);continue;}
      try{const audio=await audioIntegrity(path.join(voiceDir,meta.file));if(audio.size<1024)throw Error('Empty audio');const expected=(meta as typeof meta&{sha256?:string}).sha256;if(!expected||audio.sha256!==expected)throw Error('Audio hash mismatch');}catch{issues.push(`${cueId}: missing or damaged audio`);}
    }
    for(const cue of show.cues)if(cue.kind==='voice')cue.audioDurationMs=manifest.clips[cue.id]?.durationMs;
    return {id,label:SCENARIO_LABELS[id],show,hash:digest(JSON.stringify(show)+JSON.stringify(manifest)),issues,branches:{}};
  }
  const dir=await scenarioDirectory(root,id);
  const raw=await fs.readFile(path.join(dir,'dialogue.ro.draft.json'),'utf8');
  const draft=JSON.parse(raw) as {cues:Array<{id:string;phase:'preshow'|'play'|'epilogue';at:number;maxDurationSec:number;speaker:VoiceCue['speaker'];condition:string;text:VoiceCue['text']}>};
  if(!Array.isArray(draft.cues)||!draft.cues.length)throw new Error('Pachet fără replici');
  if(lang!=='ro'){
    const text=await loadDialogueTranslation(dialogueFile(dir,lang),raw,draft.cues.map(c=>c.id),lang);
    for(const cue of draft.cues)cue.text={...cue.text,[lang]:text[cue.id]};
  }
  for(const c of draft.cues){
    if(!['preshow','play','epilogue'].includes(c.phase)||!Number.isFinite(c.at)||typeof c.text?.ro!=='string'||!c.text.ro.trim())throw new Error('Replică invalidă');
  }
  const issues:string[]=[];
  const preshowEnd=scenarioPhaseEnd(id,'preshow',legacy);
  const epilogueEnd=scenarioPhaseEnd(id,'epilogue',legacy);
  let manifest:VoiceManifest={lang,generatedAt:'',clips:{}};
  try{manifest=JSON.parse(await fs.readFile(path.join(dir,'voice',lang,'manifest.json'),'utf8'));if(manifest.lang!==lang)issues.push('Limba manifestului vocal nu corespunde.');}catch{issues.push('Manifest vocal lipsă');}
  const branches:ScenarioPackage['branches']={};
  const voices:VoiceCue[]=[];
  const markers:MarkerCue[]=[];
  const seen=new Set<string>();
  for(const c of draft.cues){
    if(!/^[a-zA-Z0-9_-]+$/.test(c.id)||seen.has(c.id))throw new Error('ID vocal invalid/duplicat');seen.add(c.id);
    const meta=manifest.clips[c.id];
    if(!meta||meta.text!==c.text[lang]||meta.speaker!==c.speaker)issues.push(`${c.id}: audio lipsă sau text diferit`);
    else {
      if(!/^[\w.-]+\.mp3$/.test(meta.file))throw new Error('Cale vocală invalidă');
      try{
        const audio=await audioIntegrity(path.join(dir,'voice',lang,meta.file));if(audio.size<1024)issues.push(`${c.id}: audio gol`);
        const expected=(meta as typeof meta & {sha256?:string}).sha256;
        if(!expected||audio.sha256!==expected)issues.push(`${c.id}: integritatea audio nu corespunde manifestului`);
      }catch{issues.push(`${c.id}: fișier lipsă`);}
      if(!meta.words?.length||!meta.visemes?.length||!(meta.durationMs>0))issues.push(`${c.id}: sincronizare incompletă`);
      // Natural delivery may use the following silent gap, but never overlap another voice or phase.
      const next=Math.min(...draft.cues.filter(x=>x.phase===c.phase&&x.at>c.at).map(x=>x.at),c.phase==='preshow'?preshowEnd:c.phase==='play'?legacy.videoDurationSec:epilogueEnd);
      if(meta.durationMs/1000>next-c.at)issues.push(`${c.id}: durata depășește următoarea replică (${meta.durationMs/1000}s)`);
    }
    const manual=c.condition!=='always';
    voices.push({id:c.id,kind:'voice',phase:c.phase,at:c.at,speaker:c.speaker,text:c.text,manual,fallback:'silent',subtitleHoldMs:300,audioDurationMs:meta?.durationMs});
    if(manual){const key=`branch-${c.phase}-${c.at}`;if(!branches[key]){branches[key]=[];markers.push({id:key,kind:'marker',phase:c.phase,at:c.at,label:'Răspunsul expediției'});}branches[key].push({id:c.id,condition:c.condition});}
  }
  const hash=digest(raw+JSON.stringify(manifest)+JSON.stringify({preshowEnd,epilogueEnd,planetStops:legacy.planetStops,scenes:legacy.scenes,videoDurationSec:legacy.videoDurationSec,launchLeadInSec:legacy.launchLeadInSec,effects:legacy.cues.filter(c=>['theme','entity','sfx','countdown','ambient','lights'].includes(c.kind))}));
  const base=legacy.cues.filter(c=>['theme','entity','sfx','countdown','ambient','lights'].includes(c.kind));
  const show:ShowFile={...legacy,title:SCENARIO_LABELS[id],version:hash.slice(0,12),variants:undefined,
    scenes:legacy.scenes.map(scene=>id==='age-5-10'?{...scene,end:scene.phase==='preshow'?preshowEnd:scene.phase==='epilogue'?epilogueEnd:scene.end,
      label:({intro:'Primirea · Legenda stelei',tech:'Lumea Cristalului · Atelierul Mann',reentry:'Steaua Omenirii · Acasă'} as Record<string,string>)[scene.id]??scene.label}:scene),
    scenario:{id,revision:hash.slice(0,12),voiceRoot:`assets/scenarios/${id}/voice`,contentHash:hash},
    cues:[...base,...voices,...markers].sort((a,b)=>a.phase.localeCompare(b.phase)||a.at-b.at)};
  return {id,label:SCENARIO_LABELS[id],show,hash,issues,branches};
}
