import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createLogsRouter} from './logs';

test('log history remains fully reachable when the row limit truncates a sub-MiB file',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'nava-logs-qa-'));
  try{
    const name='app-20260913-120000.jsonl';
    // Repeated timestamps reproduce real bursts; the cursor must follow file offsets.
    await fs.writeFile(path.join(temp,name),Array.from({length:37},(_,i)=>JSON.stringify({ts:'2026-09-13T12:00:00Z',level:i%2?'warn':'info',msg:'event '+i,data:{token:'fixture-secret'}})).join('\n')+'\n');
    const router=createLogsRouter(temp,path.join(temp,'audit.jsonl'));
    let before:number|undefined;const ids:string[]=[],messages:string[]=[];
    for(let page=0;page<10;page++){
      const response=await router.request('/?file='+name+'&limit=10'+(before===undefined?'':'&before='+before));
      assert.equal(response.status,200);const body=await response.json();
      for(const e of body.entries){ids.push(e.id);messages.push(e.message);assert.equal(e.data.token,'[redacted]');}
      if(body.nextBefore===null)break;
      assert(body.nextBefore>0&&(before===undefined||body.nextBefore<before),'cursor moves backwards');before=body.nextBefore;
    }
    assert.equal(ids.length,37);assert.equal(new Set(ids).size,37);assert.equal(messages[0],'event 36');
    const filtered=await (await router.request('/?file='+name+'&level=WARNING&limit=100')).json();assert.equal(filtered.entries.length,18);
    assert.equal((await router.request('/?file=../../private.jsonl')).status,404);
  }finally{await fs.rm(temp,{recursive:true,force:true});}
});

test('large Romanian logs paginate by original UTF-8 bytes without losing lines at the read boundary',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'nava-logs-utf8-'));
  try{
    const name='show-20260913-130000.jsonl',lines=Array.from({length:400},(_,i)=>JSON.stringify({ts:'2026-09-13T13:00:00Z',msg:i+' '+ 'ă'.repeat(1800)})+'\n');
    const offsets=new Set<string>();let offset=0;
    for(const line of lines){offsets.add(name+':'+offset);offset+=Buffer.byteLength(line);}
    let bytes=Buffer.from(lines.join('')+'{"incomplete":"');
    // Force the 1 MiB read to begin inside a two-byte Romanian character.
    while((bytes[bytes.length-1024*1024]&0xc0)!==0x80)bytes=Buffer.concat([bytes,Buffer.from('x')]);
    await fs.writeFile(path.join(temp,name),bytes);
    const router=createLogsRouter(temp,path.join(temp,'audit.jsonl'));let before:number|undefined;const found=new Set<string>();
    for(let page=0;page<30;page++){
      const data=await (await router.request('/?file='+name+'&limit=37'+(before===undefined?'':'&before='+before))).json();
      for(const e of data.entries){assert(offsets.has(e.id),'exact original byte offset: '+e.id);assert(!found.has(e.id),'no duplicated line');found.add(e.id);}
      if(data.nextBefore===null)break;before=data.nextBefore;
    }
    assert.equal(found.size,400);
  }finally{await fs.rm(temp,{recursive:true,force:true});}
});
