/** Bounded ownership of decoded frames. A wall commit requires one identical PTS
 * from every decoder, rather than approximately equal HTML media clocks. */
export class PanelFrames<T extends {close():void}> {
  private queues=new Map<string,Map<number,T>>();
  private committed=new Map<string,T>();
  private committedKey=-1;
  private displayedKey=-1;
  constructor(ids:readonly string[],readonly fps=60,private capacity=12){for(const id of ids)this.queues.set(id,new Map());}
  time():number|null{return this.committed.size?this.displayedKey/this.fps:null;}
  push(id:string,time:number,frame:T){
    const queue=this.queues.get(id);
    if(!queue||!Number.isFinite(time)){frame.close();return;}
    const key=Math.round(time*this.fps);
    queue.get(key)?.close();queue.set(key,frame);
    while(queue.size>this.capacity){const oldest=Math.min(...queue.keys());queue.get(oldest)!.close();queue.delete(oldest);}
  }
  /** Last coherent frame remains owned until its replacement is complete. */
  select(target:number):{key:number;time:number;frames:ReadonlyMap<string,T>}|null{
    const queues=[...this.queues.values()];
    if(!queues.length)return null;
    const limit=Math.floor(target*this.fps+1e-4);
    const key=[...queues[0].keys()].filter(k=>k<=limit&&k>this.committedKey&&queues.every(q=>q.has(k))).sort((a,b)=>b-a)[0];
    if(key!==undefined){
      for(const frame of this.committed.values())frame.close();this.committed.clear();
      for(const [id,q] of this.queues){this.committed.set(id,q.get(key)!);q.delete(key);for(const [k,f] of q)if(k<key){f.close();q.delete(k);}}
      this.committedKey=key;
      this.displayedKey=key;
    }
    return this.committed.size?{key:this.displayedKey,time:this.displayedKey/this.fps,frames:this.committed}:null;
  }
  /** Seek epochs discard queued frames, but retain the last coherent picture. */
  reset(){for(const q of this.queues.values()){for(const f of q.values())f.close();q.clear();}this.committedKey=-1;}
  dispose(){this.reset();for(const f of this.committed.values())f.close();this.committed.clear();}
}
