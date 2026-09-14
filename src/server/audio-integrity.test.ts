import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,unlink,rm,stat,utimes} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {audioIntegrity} from './audio-integrity';
test('audio cache reuses unchanged bytes and detects same-size edits, deletion and recreation',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'nava-audio-cache-')),file=path.join(dir,'voice.mp3');
 try{
  await writeFile(file,Buffer.alloc(2048,1));const first=await audioIntegrity(file),before=await stat(file);
  assert.equal(await audioIntegrity(file),first);
  await writeFile(file,Buffer.alloc(2048,2));await utimes(file,before.atime,before.mtime);
  assert.notEqual((await audioIntegrity(file)).sha256,first.sha256);
  await unlink(file);await assert.rejects(()=>audioIntegrity(file));
  await writeFile(file,Buffer.alloc(2048,3));assert.notEqual((await audioIntegrity(file)).sha256,first.sha256);
 }finally{await rm(dir,{recursive:true,force:true});}
});
