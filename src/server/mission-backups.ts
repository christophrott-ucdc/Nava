import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import type {MissionStore} from './mission-store';

/** SQLite online backup, integrity check, atomic publish, bounded retention. */
export class MissionBackups {
  status:{state:'idle'|'running'|'ok'|'error';lastSuccess:string|null;error:string|null;copies:number}={state:'idle',lastSuccess:null,error:null,copies:0};
  private initialized:Promise<void>;
  private pending:Promise<void>|null=null;private timer:ReturnType<typeof setInterval>;private lastAttempt=0;private stopped=false;
  constructor(private store:MissionStore,private directory:string,private canRun:()=>boolean,private log:(message:string)=>void){
    this.initialized=this.inventory();
    this.timer=setInterval(()=>{if(this.canRun()&&Date.now()-this.lastAttempt>=5*60000)void this.run();},60000);
  }
  private async inventory(){
    try{
      const names=(await fs.readdir(this.directory)).filter(n=>/^nava-[0-9T-Z-]+-[0-9a-f-]{36}\.sqlite$/.test(n)).sort().reverse();
      const files=await Promise.all(names.map(async name=>{const stat=await fs.lstat(path.join(this.directory,name));return stat.isFile()&&!stat.isSymbolicLink()?stat:null;}));
      const valid=files.filter(file=>file!==null);if(valid.length)this.status={state:'ok',lastSuccess:valid[0]!.mtime.toISOString(),error:null,copies:valid.length};
    }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT'){this.status={...this.status,state:'error',error:'Inventarul backupurilor nu poate fi citit.'};this.log(this.status.error!);}}
  }
  run():Promise<void>{
    if(this.pending)return this.pending;if(this.stopped)return Promise.resolve();
    this.lastAttempt=Date.now();
    const task=this.create();this.pending=task;void task.finally(()=>{this.pending=null;}).catch(()=>{});return task;
  }
  private async create(){
    await this.initialized;
    this.status={...this.status,state:'running',error:null};
    const name='nava-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID()+'.sqlite';
    const file=path.join(this.directory,name),partial=file+'.partial';
    try{
      await fs.mkdir(this.directory,{recursive:true});await this.store.backupTo(partial);
      // The online copy inherits WAL mode. Normalize only this private staging DB
      // so publishing/rotating a backup never leaves orphaned -wal/-shm files.
      const check=new DatabaseSync(partial);
      try{check.exec('PRAGMA journal_mode=DELETE');const rows=check.prepare('PRAGMA quick_check').all();if(rows.length!==1||Object.values(rows[0])[0]!=='ok')throw Error('Verificarea integrității copiei a eșuat.');}finally{check.close();}
      await fs.rename(partial,file);
      const names=(await fs.readdir(this.directory)).filter(n=>/^nava-[0-9T-Z-]+-[0-9a-f-]{36}\.sqlite$/.test(n)).sort().reverse();
      // Delete only regular files created by this service inside the named backup directory.
      for(const name of names.slice(12)){const old=path.join(this.directory,name),stat=await fs.lstat(old);if(stat.isFile()&&!stat.isSymbolicLink())await fs.unlink(old);}
      this.status={state:'ok',lastSuccess:new Date().toISOString(),error:null,copies:Math.min(names.length,12)};
    }catch(error){this.status={...this.status,state:'error',error:error instanceof Error?error.message:String(error)};this.log(this.status.error!);await fs.unlink(partial).catch(()=>{});}
  }
  async close(){this.stopped=true;clearInterval(this.timer);await this.pending;await this.initialized;}
}
