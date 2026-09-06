import {randomUUID} from 'node:crypto';
import type {ShowState,TabletPost} from '../shared/types';
import {createProgress,applyScenarioAction,scenarioView,summarizeScenario,scenarioConditions,type ScenarioId} from '../shared/scenario-engine';
import {DEFAULT_ACCESSIBILITY,SCENARIO_LABELS,STAGE_WINDOWS,type MissionRecord,type MissionSnapshot,type MissionEvent,type PostAccessibility} from '../shared/mission';
import {MissionStore} from './mission-store';
import {freshExperience,acceptExperience,tutorialSatisfied,ALL_PARTICIPANTS} from './experience';
import {crewCharacter,occupiedSeats} from '../shared/crew';

export class MissionSession {
  readonly serverEpoch=randomUUID();
  record:MissionRecord;
  recovery:MissionRecord|null;
  constructor(readonly store:MissionStore){this.recovery=store.recoverable();this.record=this.fresh('legacy-v3','');}
  private fresh(id:ScenarioId,hash:string):MissionRecord{return {runId:randomUUID(),scenarioId:id,contentHash:hash,revision:0,timelineEpoch:0,createdAt:new Date().toISOString(),status:'prepared',progress:{...createProgress(id),participants:[]},checkpoint:null,accessibility:{},mode:'public',experience:freshExperience()};}
  reset(id=this.record.scenarioId,hash=this.record.contentHash):void {
    const old=this.record;
    if(old.status==='active')old.status='interrupted';
    this.store.save(old);
    this.record=this.fresh(id,hash);this.record.accessibility=structuredClone(old.accessibility);this.store.save(this.record);
  }
  checkpoint(state:ShowState):void {
    this.record.checkpoint=state;
    if(state.state==='ended')this.record.status='completed';
    else if(state.state!=='idle')this.record.status='active';
    if(state.rate>1)this.record.mode='rehearsal';
    this.store.save(this.record);
  }
  stage(state:ShowState):number {
    if(state.state!=='playing'&&state.state!=='paused')return 0;
    return STAGE_WINDOWS[this.record.scenarioId].findIndex(([a,b])=>state.phaseTime>=a&&state.phaseTime<b)+1;
  }
  finaleActive(state:ShowState):boolean{return state.state==='ended'||(state.state==='epilogue'&&state.phaseTime>=60);}
  instance(state:ShowState):string{
    const e=this.record.experience;
    const scope=e?.status==='tutorial'?`tutorial-${e.epoch}-${e.step}`:this.finaleActive(state)?'finale':this.stage(state);
    return `${this.record.runId}:${this.record.timelineEpoch}:${scope}`;
  }
  seek():void {this.record.timelineEpoch++;this.record.revision++;this.store.save(this.record);}
  snapshot(state:ShowState,post?:TabletPost):MissionSnapshot {
    const r=this.record,stage=this.stage(state);
    const view=post&&stage?scenarioView(r.progress,stage,post):null;
    if(view&&r.scenarioId==='age-10-15'&&stage===2&&state.phaseTime<199){
      for(const zone of ['A','B'] as const)if(!r.progress.zones[`${post}${zone}`]?.choices['2']?.startsWith('measure:')){
        view.zones[zone].options=view.zones[zone].options.map(o=>o.value==='construct'||o.value.startsWith('piece:')||['send','undo'].includes(o.value)?{...o,disabled:true}:o);
        view.zones[zone].detail+=' · Poți construi după măsurare sau când se încheie scurta fereastră de observație.';
        const play=view.zones[zone].play;if(play?.kind==='signal')play.canTransmit=false;
      }
    }
    const experience=r.experience??{...freshExperience(),crew:undefined,participants:[...ALL_PARTICIPANTS],status:'skipped' as const};
    return {experience:{...experience,active:experience.status==='tutorial',finaleActive:this.finaleActive(state),paused:experience.pausedAt!==undefined||!!state.suspended,canContinue:tutorialSatisfied(experience)},runId:r.runId,serverEpoch:this.serverEpoch,scenarioId:r.scenarioId,label:SCENARIO_LABELS[r.scenarioId],revision:r.revision,
      lantern:r.scenarioId==='age-5-10'?Object.entries(r.progress.zones).filter(([seat])=>!r.progress.participants||r.progress.participants.includes(seat)).map(([seat,z])=>({seat,found:z.choices['1']==='found',mounted:z.choices['2']==='fitted',linked:z.choices['3']==='linked'})):undefined,
      cueInstanceId:this.instance(state),stage,endsAt:stage?STAGE_WINDOWS[r.scenarioId][stage-1][1]:null,
      suspended:!!state.suspended,state,post,view,
      summary:summarizeScenario(r.progress),accessibility:r.accessibility[String(post)]??DEFAULT_ACCESSIBILITY};
  }
  accept(event:MissionEvent,post:TabletPost,state:ShowState):{ok:boolean;status:string;eventId:string;reason?:string} {
    const result=(status:string)=>({ok:status==='accepted'||status==='duplicate',status,eventId:event.eventId});
    if(typeof event.eventId!=='string'||! /^[\w-]{8,100}$/.test(event.eventId)||typeof event.value!=='string'||event.value.length>200||!['A','B'].includes(event.zone))return result('invalid');
    if(event.runId!==this.record.runId)return result('stale-run');
    const payload=JSON.stringify({post,zone:event.zone,value:event.value,instance:event.cueInstanceId});
    const previous=this.store.event(event.runId,event.eventId);
    if(previous)return result(previous.payload===payload?'duplicate':'invalid');
    if(event.value.startsWith('crew:')){
      if(event.cueInstanceId!==this.instance(state)||state.suspended)return result('expired');
      const experience=structuredClone(this.record.experience),seat=`${post}${event.zone}`;
      if(state.state!=='idle'||!experience?.crew?.open||experience.status!=='pending')return result('registration-closed');
      if(event.value==='crew:release')delete experience.crew.characters[seat];
      else if(event.value.startsWith('crew:lock:')){
        const character=crewCharacter(event.value.slice('crew:lock:'.length));
        if(!character)return result('invalid');
        if(Object.entries(experience.crew.characters).some(([other,id])=>other!==seat&&id===character.id))return result('character-taken');
        experience.crew.characters[seat]=character.id;
      }else return result('invalid');
      experience.participants=occupiedSeats(experience.crew);
      const next={...this.record,experience,progress:{...this.record.progress,participants:[...experience.participants]},status:'active' as const,revision:this.record.revision+1,checkpoint:state};
      const response=result('accepted');this.store.accept(next,event.eventId,payload,response);this.record=next;return response;
    }
    if(this.record.progress.participants&&!this.record.progress.participants.includes(`${post}${event.zone}`))return result('inactive-seat');
    if(event.value.startsWith('tutorial:')||event.value.startsWith('finale:')){
      if(event.cueInstanceId!==this.instance(state)||state.suspended)return result('expired');
      const experience=acceptExperience(this.record.experience??{...freshExperience(),crew:undefined,participants:[...ALL_PARTICIPANTS],status:'skipped'},this.record.scenarioId,`${post}${event.zone}`,event.value,this.finaleActive(state));
      if(!experience)return result('invalid');
      const next={...this.record,experience,revision:this.record.revision+1,checkpoint:state};
      const response=result('accepted');this.store.accept(next,event.eventId,payload,response);this.record=next;return response;
    }
    const stage=this.stage(state);
    if(!stage||event.cueInstanceId!==this.instance(state)||state.suspended||state.state!=='playing')return result('expired');
    if(this.record.scenarioId==='age-10-15'&&stage===2&&(event.value==='construct'||event.value.startsWith('piece:')||event.value.startsWith('play:signal:')||['send','undo'].includes(event.value))&&state.phaseTime<199&&!this.record.progress.zones[`${post}${event.zone}`]?.choices['2']?.startsWith('measure:'))return result('expired');
    const changed=applyScenarioAction(this.record.progress,{stage,post,zone:event.zone,action:'choose',value:event.value});
    if(!changed.ok)return {...result('invalid'),reason:changed.reason};
    const next={...this.record,progress:changed.progress,revision:this.record.revision+1,checkpoint:state};
    const response=result('accepted');this.store.accept(next,event.eventId,payload,response);this.record=next;return response;
  }
  conditions():Set<string>{return scenarioConditions(this.record.progress);}
  setAccessibility(post:TabletPost,value:unknown):void {
    if(!value||typeof value!=='object')throw new Error('Setări invalide');
    const v=value as Record<string,unknown>,next:PostAccessibility={...DEFAULT_ACCESSIBILITY};
    for(const k of Object.keys(next) as (keyof PostAccessibility)[]){
      if(v[k]===undefined)continue;
      if(k==='textScale'){if(![1,1.15,1.3].includes(Number(v[k])))throw new Error('Scară invalidă');next.textScale=Number(v[k]);}
      else {if(typeof v[k]!=='boolean')throw new Error('Setare invalidă');next[k]=v[k] as boolean;}
    }
    this.record.accessibility[String(post)]=next;this.record.revision++;this.store.save(this.record);
  }
}
