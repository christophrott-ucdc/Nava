import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {MissionBackups} from './mission-backups';
import {MissionStore} from './mission-store';
import {MissionSession} from './mission-session';

test('online backups deduplicate requests, preserve committed sessions and rotate only their own files',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'nava-backup-qa-')),dir=path.join(temp,'backups');
  const store=new MissionStore(path.join(temp,'source.sqlite')),session=new MissionSession(store);
  store.save(session.record);const errors:string[]=[];
  const backup=new MissionBackups(store,dir,()=>false,m=>errors.push(m));
  try{
    const first=backup.run();assert.equal(backup.run(),first);await first;assert.equal(backup.status.state,'ok');
    await fs.writeFile(path.join(dir,'keep.sqlite'),'unrelated');
    for(let i=0;i<13;i++)await backup.run();
    assert.equal(backup.status.copies,12);assert.deepEqual(errors,[]);
    const files=(await fs.readdir(dir)).filter(n=>n.startsWith('nava-'));assert.equal(files.length,12);
    const db=new DatabaseSync(path.join(dir,files[0]),{readOnly:true});
    try{assert.equal(db.prepare('SELECT run_id FROM missions').get()?.run_id,session.record.runId);}finally{db.close();}
    assert.equal(await fs.readFile(path.join(dir,'keep.sqlite'),'utf8'),'unrelated');
  }finally{await backup.close();store.close();await fs.rm(temp,{recursive:true,force:true});}
});
