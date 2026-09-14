import type {RobotMode,RobotNarration,RobotDriver} from '../shared/integrations';
import type {ShowFile,ShowState,VoiceCue} from '../shared/types';
/** Shadow adapter: observes the real score, never speaks over the room or commands motors. */
export class RobotNarrator implements RobotDriver {
  readonly kind='simulator' as const;
  private mode:RobotMode='screen';private ids=new Set<string>();private preparedHash='';
  private prepared=new Set<string>();private showKey='';
  status:{mode:RobotMode;state:string;preparedClips:number;current:RobotNarration|null;last:RobotNarration|null;events:number;message:string}={mode:'screen',state:'disabled',preparedClips:0,current:null,last:null,events:0,message:'Vocea este redată de sistemul actual. Robotul fizic nu este conectat.'};
  configure(mode:RobotMode){this.stop('Mod schimbat');this.mode=mode;this.status.mode=mode;this.status.state=mode==='simulator'?'ready':'disabled';this.status.message=mode==='simulator'?'Simulator fără sunet: urmărește replicile reale AVATAR_AI.':'Vocea rămâne pe sistemul actual.';}
  async prepare(contentHash:string,clips:RobotNarration['asset'][]){this.preparedHash=contentHash;this.prepared=new Set(clips.map(c=>c.language+':'+c.cueId));this.status.preparedClips=this.prepared.size;}
  prepareShow(show:ShowFile,hash:string,language:string){const key=hash+':'+language;if(key===this.showKey)return;this.showKey=key;void this.prepare(hash,show.cues.filter((c):c is VoiceCue=>c.kind==='voice'&&c.speaker==='AVATAR_AI').map(c=>({cueId:c.id,language,contentHash:hash})));}
  speak(event:RobotNarration){
    if(this.mode!=='simulator'||this.ids.has(event.instanceId))return;
    if(event.contentHash!==this.preparedHash||!this.prepared.has(event.language+':'+event.cueId)){this.status.state='error';this.status.message='Replica nu aparține pachetului pregătit.';return;}
    this.ids.add(event.instanceId);if(this.ids.size>2048)this.ids.delete(this.ids.values().next().value!);
    this.status.current=event;this.status.last=event;this.status.events++;this.status.state=event.durationMs===null?'observing':'speaking';
  }
  tick(state:ShowState){
    const e=this.status.current;if(!e)return;
    const phase=state.state==='preshow'?'preshow':state.state==='epilogue'?'epilogue':['playing','paused'].includes(state.state)?'play':null;
    if(e.runId!==state.runId||e.timelineEpoch!==state.timelineEpoch||phase!==e.phase){this.stop('Cronologie schimbată');return;}
    if(state.suspended||state.state==='paused'){this.status.state='paused';return;}
    if(e.durationMs!==null&&state.phaseTime>=e.at+e.durationMs/1000)this.stop('Replica s-a încheiat');else this.status.state=e.durationMs===null?'observing':'speaking';
  }
  stop(reason:string){this.status.current=null;this.status.state=this.mode==='screen'?'disabled':'ready';this.status.message=reason;}
}
