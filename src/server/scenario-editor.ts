import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {scenarioDirectory} from './scenario-catalog';
import type {ScenarioId} from '../shared/scenario-engine';

const hash=(raw:string)=>createHash('sha256').update(raw).digest('hex');
export async function readScenarioDraft(root:string,id:ScenarioId){
  const file=path.join(await scenarioDirectory(root,id),'dialogue.ro.draft.json');
  const raw=await fs.readFile(file,'utf8');return {hash:hash(raw),draft:JSON.parse(raw)};
}
const editing=new Set<string>();
export async function editScenarioDraft(root:string,id:ScenarioId,body:unknown){
  if(editing.has(id))throw new Error('O salvare este deja în curs.');
  editing.add(id);
  try{
    const b=body as {expectedHash?:string;cueId?:string;text?:string;at?:number};
    const dir=await scenarioDirectory(root,id),file=path.join(dir,'dialogue.ro.draft.json');
    const raw=await fs.readFile(file,'utf8');
    if(!b||b.expectedHash!==hash(raw))throw new Error('Documentul s-a schimbat. Reîncarcă înainte de salvare.');
    const draft=JSON.parse(raw),cue=draft.cues.find((c:{id:string})=>c.id===b.cueId);
    if(!cue)throw new Error('Replica nu există.');
    if(b.text!==undefined){if(typeof b.text!=='string'||!b.text.trim()||b.text.length>1600)throw new Error('Text invalid.');cue.text.ro=b.text.trim();}
    if(b.at!==undefined){const end=cue.phase==='play'?465:cue.phase==='preshow'?50:75;
      if(!Number.isFinite(b.at)||b.at<(cue.phase==='play'?-10:0)||b.at>=end)throw new Error('Momentul depășește faza.');cue.at=b.at;}
    const backupDir=path.join(dir,'backups');await fs.mkdir(backupDir,{recursive:true});
    const backup=path.join(backupDir,`${Date.now()}-${hash(raw).slice(0,12)}.json`);
    await fs.writeFile(backup,raw,{flag:'wx'});
    const next=JSON.stringify(draft,null,2)+'\n',temp=path.join(dir,`.draft-${randomUUID()}.tmp`);
    await fs.writeFile(temp,next,{flag:'wx'});try{await fs.rename(temp,file);}finally{await fs.rm(temp,{force:true});}
    return {ok:true,hash:hash(next),draft,backup:path.basename(backup),requiresAudioRegeneration:b.text!==undefined};
  }finally{editing.delete(id);}
}
