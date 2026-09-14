export interface WallHealthEvent {status:'stalled'|'recovered';detail:string;filmTime:number;stalledForMs:number;}
/** Pure wall-level watchdog. A held/recovered wall never resumes the show itself. */
export class WallHealth {
  private unhealthyAt:number|null=null;private announced=false;private lastTime:number|null=null;private advancedAt=0;
  update(input:{now:number;playing:boolean;target:number;shown:number|null;ready:boolean;jumped:boolean}):WallHealthEvent|null{
    const {now,playing,target,shown,ready,jumped}=input;
    if(jumped){this.unhealthyAt=null;this.advancedAt=now;}
    if(shown!==null&&(this.lastTime===null||Math.abs(shown-this.lastTime)>.008)){this.lastTime=shown;this.advancedAt=now;}
    const aligned=ready&&shown!==null&&Math.abs(shown-target)<.2;
    if(this.announced){
      if(!playing&&aligned){this.announced=false;this.unhealthyAt=null;return{status:'recovered',detail:'Panourile sunt pregătite la cadrul ținut. Reluarea se face explicit din consolă.',filmTime:shown!,stalledForMs:0};}
      return null;
    }
    const unhealthy=playing&&target>0&&(!ready||shown===null||Math.abs(target-shown)>.5||now-this.advancedAt>750);
    if(!unhealthy){this.unhealthyAt=null;return null;}
    this.unhealthyAt??=now;
    if(now-this.unhealthyAt<3000)return null;
    this.announced=true;
    return{status:'stalled',detail:'Peretele video nu mai prezintă cadre coerente. Redarea este oprită pentru recuperarea întregului grup.',filmTime:Math.max(0,shown??target),stalledForMs:now-this.unhealthyAt};
  }
  stalled(){return this.announced;}
}
