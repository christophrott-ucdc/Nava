import {randomUUID} from 'node:crypto';
export interface LaunchStatus {state:'idle'|'preparing'|'scheduled'|'ready'|'error';required:string[];confirmed:string[];message:string;startAtMs?:number;preview:boolean;}
/** A one-shot preparation barrier; never pauses an already running film. */
export class LaunchBarrier {
  status:LaunchStatus={state:'idle',required:[],confirmed:[],message:'Verificarea TV-urilor se face înainte de pornire.',preview:false};
  private epoch=0;private id='';private accepted=new Set<string>();
  private retryAt=0;
  canRetryAutomatically(now=Date.now()){return this.status.state!=='error'||now>=this.retryAt;}
  get busy(){return ['preparing','scheduled'].includes(this.status.state);}
  constructor(private deps:{identity():string;validate():string|null;required():string[];connected():string[];preview():boolean;prepare(id:string):void;commit(id:string,at:number):void;cancel(id:string):void;start(id:string):{ok:boolean;reason?:string}}){}
  acknowledge(id:string,ids:string[]){if(id!==this.id||this.status.state!=='preparing')return;for(const screen of ids)if(this.status.required.includes(screen))this.accepted.add(screen);this.status.confirmed=[...this.accepted];}
  disconnected(ids:string[]){
    if(!this.busy||!ids.some(id=>this.status.required.includes(id)))return;
    for(const id of ids)this.accepted.delete(id);this.status.confirmed=[...this.accepted];
    if(this.status.state==='scheduled'){this.cancel('Un TV s-a deconectat înainte de start. Reîncearcă după reconectare.');this.status.state='error';this.retryAt=Date.now()+5000;}
  }
  cancel(message='Pregătirea a fost anulată.'){
    ++this.epoch;if(this.id)this.deps.cancel(this.id);this.accepted.clear();this.status={...this.status,state:'idle',confirmed:[],message};
  }
  async start(){
    if(this.busy)return;
    const epoch=++this.epoch,identity=this.deps.identity();this.id=randomUUID();this.accepted.clear();
    this.status={state:'preparing',required:[...this.deps.required()],confirmed:[],preview:this.deps.preview(),message:'Așteptăm cadrele pregătite pe toate ieșirile.'};
    try{
      if(!this.status.required.length)throw Error('Nu există ecrane configurate.');
      this.deps.prepare(this.id);
      const deadline=Date.now()+15000;
      while(epoch===this.epoch&&Date.now()<deadline){
        if(this.deps.identity()!==identity)throw Error('Sesiunea sau configurația s-a schimbat.');
        const connected=new Set(this.deps.connected());
        if(this.status.required.every(id=>connected.has(id)&&this.accepted.has(id)))break;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      if(epoch!==this.epoch)return;
      if(!this.status.required.every(id=>this.accepted.has(id)&&this.deps.connected().includes(id)))throw Error('TV-uri nepregătite: '+this.status.required.filter(id=>!this.accepted.has(id)||!this.deps.connected().includes(id)).join(', '));
      const issue=this.deps.validate();if(issue)throw Error(issue);
      const at=Date.now()+1200;this.status={...this.status,state:'scheduled',startAtMs:at,message:'Cadre confirmate. Pornire la momentul comun.'};this.deps.commit(this.id,at);
      while(epoch===this.epoch&&Date.now()<at){
        if(this.deps.identity()!==identity||!this.status.required.every(id=>this.deps.connected().includes(id)))throw Error('O ieșire s-a deconectat înainte de start.');
        await new Promise(resolve=>setTimeout(resolve,Math.min(50,Math.max(1,at-Date.now()))));
      }
      if(epoch!==this.epoch)return;
      const finalIssue=this.deps.validate();if(finalIssue)throw Error(finalIssue);
      const result=this.deps.start(this.id);if(!result.ok)throw Error(result.reason??'Pornirea a fost respinsă.');
      this.status={...this.status,state:'ready',message:'Pornire comună executată. Verificarea inițială s-a încheiat.'};
    }catch(error){if(epoch!==this.epoch)return;this.deps.cancel(this.id);this.retryAt=Date.now()+5000;this.status={...this.status,state:'error',message:error instanceof Error?error.message:String(error)};}
  }
}
