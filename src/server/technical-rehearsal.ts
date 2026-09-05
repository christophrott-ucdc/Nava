import {randomUUID} from 'node:crypto';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import type {PerfSample,ShowState} from '../shared/types';

export interface RehearsalReport {
  id:string;kind:'rehearsal';status:'running'|'passed'|'failed'|'cancelled';startedAt:string;finishedAt?:string;
  scenario:string;contentHash:string;elapsedSec:number;sampleCount:number;
  checks:Array<{name:string;status:'passed'|'failed'|'not-tested'|'not-observable';detail:string}>;
}
interface Dependencies {
  directory:string;scenario:()=>{id:string;hash:string};state:()=>ShowState;samples:()=>PerfSample[];
  start:()=>void;finish:()=>void;
}
export function assessRehearsalVideo(first:PerfSample,last:PerfSample,elapsedSec:number,now=Date.now()){
  const frames=last.videoTotal-first.videoTotal,dropped=Math.max(0,last.videoDropped-first.videoDropped);
  const fresh=now-last.atMs<5000&&last.atMs<=now+1000,sustained=(last.atMs-first.atMs)/1000>=elapsedSec-10;
  return {frames,dropped,fresh,sustained,passed:fresh&&sustained&&frames>elapsedSec*15&&dropped/frames<.01};
}
/** Full normal-tempo mission, isolated from public mission statistics. No synthetic people or camera access. */
export class TechnicalRehearsal {
  report:RehearsalReport|null=null;
  private timer:ReturnType<typeof setInterval>|null=null;
  private started=0;
  private first=new Map<string,PerfSample>();
  private last=new Map<string,PerfSample>();
  private busy=false;
  constructor(private deps:Dependencies){}
  get running():boolean{return !!this.timer;}
  async start():Promise<RehearsalReport>{
    if(this.running)throw new Error('Repetiție deja activă');
    const s=this.deps.scenario();this.started=Date.now();this.first.clear();this.last.clear();
    this.report={id:randomUUID(),kind:'rehearsal',status:'running',startedAt:new Date().toISOString(),scenario:s.id,contentHash:s.hash,elapsedSec:0,sampleCount:0,checks:[]};
    this.deps.start();
    this.timer=setInterval(()=>{void this.tick().catch(()=>{void this.cancel('Eroare la colectarea sau salvarea raportului.').catch(()=>{});});},1000);
    try{await this.save();}catch(error){await this.cancel('Raportul nu poate fi salvat.').catch(()=>{});throw error;}return this.report;
  }
  private async tick():Promise<void>{
    if(!this.report||!this.timer||this.busy)return;this.busy=true;
    try{
      this.report.elapsedSec=(Date.now()-this.started)/1000;
      const state=this.deps.state();
      for(const s of this.deps.samples())if(s.atMs>=this.started&&s.atMs>(this.last.get(s.screenId)?.atMs??0)){
        if(!this.first.has(s.screenId))this.first.set(s.screenId,s);this.last.set(s.screenId,s);this.report.sampleCount++;
      }
      if(state.suspended){await this.cancel('Topologia sau misiunea a fost suspendată.');return;}
      if(state.state==='ended'){await this.complete();return;}
      if(this.report.elapsedSec>650){await this.cancel('Misiunea nu s-a încheiat în intervalul maxim.');return;}
      if(Math.floor(this.report.elapsedSec)%5===0)await this.save();
    }finally{this.busy=false;}
  }
  private async complete():Promise<void>{
    if(!this.report)return;
    const checks=this.report.checks;
    checks.push({name:'timeline',status:'passed',detail:`Misiune încheiată în ${this.report.elapsedSec.toFixed(1)} s la ritm normal.`});
    const readiness=this.deps.state().readiness;
    checks.push({name:'dispozitive-la-final',status:readiness?.ready?'passed':'failed',detail:readiness?.ready?'Readiness păstrat la încheiere.':readiness?.reasons.join('; ')||'Readiness indisponibil.'});
    for(const [id,last] of this.last){
      const {frames,dropped,fresh,sustained,passed}=assessRehearsalVideo(this.first.get(id)!,last,this.report.elapsedSec);
      checks.push({name:`film:${id}`,status:passed?'passed':'failed',detail:`${frames} cadre, ${dropped} pierdute (${frames?100*dropped/frames:0}%). Telemetrie proaspătă: ${fresh}; acoperire susținută: ${sustained}.`});
    }
    if(!this.last.size)checks.push({name:'film',status:'failed',detail:'Nicio telemetrie proaspătă de la un renderer.'});
    for(const name of ['atingere fizică','audibilitatea boxelor','aliniere fizică TV'])checks.push({name,status:'not-observable',detail:'Cere verificare în sala reală.'});
    checks.push({name:'interacțiuni participanți',status:'not-tested',detail:'Repetiția nu inventează răspunsuri ale publicului; testele deterministe ale mecanicilor sunt separate.'});
    this.report.status=checks.some(c=>c.status==='failed')?'failed':'passed';await this.stop();
  }
  async cancel(reason='Anulată de operator.'):Promise<void>{
    if(!this.report||!this.running)return;
    this.report.status='cancelled';this.report.checks.push({name:'anulare',status:'not-tested',detail:reason});await this.stop();
  }
  private async stop():Promise<void>{
    if(this.timer)clearInterval(this.timer);this.timer=null;
    if(this.report)this.report.finishedAt=new Date().toISOString();
    this.deps.finish();await this.save();
  }
  private async save():Promise<void>{
    if(!this.report)return;await fs.mkdir(this.deps.directory,{recursive:true});
    const raw=JSON.stringify(this.report,null,2);
    await fs.writeFile(path.join(this.deps.directory,this.report.id+'.json'),raw);
    await fs.writeFile(path.join(this.deps.directory,'latest.json'),raw);
  }
}
