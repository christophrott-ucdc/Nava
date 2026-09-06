import {randomUUID} from 'node:crypto';
import {EXPERIENCE_PRACTICE,FINALE_CHOICES,type ExperienceState,type NarratorManifest} from '../shared/experience';
import type {ScenarioId} from '../shared/scenario-engine';

export const ALL_PARTICIPANTS=Array.from({length:5},(_,i)=>[`${i+1}A`,`${i+1}B`]).flat();
export function freshExperience():ExperienceState{return {version:1,status:'pending',step:'touch',epoch:0,crew:{open:true,characters:{}},participants:[],observed:[],touched:[],practiced:[],linked:[],practice:{},finale:{},narration:null};}
export function validParticipants(value:unknown):value is string[]{return Array.isArray(value)&&value.length>0&&value.length<=10&&new Set(value).size===value.length&&value.every(x=>ALL_PARTICIPANTS.includes(x));}
export function tutorialSatisfied(e:ExperienceState):boolean {
  const done=e.step==='touch'?e.touched:e.step==='practice'?e.practiced:e.linked;
  return e.participants.length>0&&e.participants.every(key=>e.observed.includes(key)||done.includes(key));
}
export function narrationFinished(e:ExperienceState,voices:NarratorManifest|null,now:number):boolean {
  if(e.pausedAt!==undefined)return false;
  if(!e.narration)return true;
  const duration=voices?.clips[e.narration.id]?.durationSec;
  return duration!==undefined&&now>=e.narration.startedAt+duration*1000+350;
}
export function narrate(e:ExperienceState,id:string,now:number):void {e.narration={id,instance:randomUUID(),startedAt:now};}
export function stepVoice(e:ExperienceState,id:ScenarioId):string{return e.step==='practice'?`${id}-practice`:e.step;}
export function acceptExperience(e:ExperienceState,profile:ScenarioId,key:string,value:string,finaleActive:boolean):ExperienceState|null {
  if(!ALL_PARTICIPANTS.includes(key))return null;
  const n=structuredClone(e);
  if(value.startsWith('finale:')){
    if(!finaleActive||e.pausedAt!==undefined||!e.participants.includes(key)||e.finale[key])return null;
    const chosen=value.slice(7);
    if(chosen!=='observe'&&!FINALE_CHOICES[profile].options.some(o=>o.value===chosen))return null;
    n.finale[key]=chosen;return n;
  }
  if(e.status!=='tutorial'||e.pausedAt!==undefined||e.launchRequested||!e.participants.includes(key))return null;
  if(e.step==='ready')return null;
  const add=(field:'touched'|'practiced'|'linked'|'observed')=>{if(!n[field].includes(key))n[field].push(key);};
  if(value==='tutorial:observe'){if(e.observed.includes(key))return null;add('observed');return n;}
  if(value==='tutorial:touch'){if(e.touched.includes(key)&&!e.observed.includes(key))return null;add('touched');n.observed=n.observed.filter(k=>k!==key);return n;}
  if(e.observed.includes(key))return null;
  if(e.step==='practice'){
    const practice=EXPERIENCE_PRACTICE[profile];
    if(e.practiced.includes(key))return null;
    if(value.startsWith('tutorial:pick:')){
      const pick=value.slice('tutorial:pick:'.length);
      if(!practice.options.some(o=>o.value===pick))return null;
      n.practice[key]=pick;return n;
    }
    if(value==='tutorial:confirm'&&e.practice[key]&&(practice.correct==='any'||practice.correct===e.practice[key])){add('practiced');return n;}
  }
  if(e.step==='cooperate'&&value==='tutorial:link'){if(e.linked.includes(key))return null;add('linked');return n;}
  return null;
}
