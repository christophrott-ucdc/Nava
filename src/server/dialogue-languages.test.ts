import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {loadDialogueTranslation} from './dialogue-languages';

test('a localized show refuses stale sources, missing cues, extra cues and wrong languages',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'nava-dialogue-test-')),file=path.join(dir,'dialogue.en.json');
 const source='authoritative Romanian',base={version:1,lang:'en',sourceSha256:createHash('sha256').update(source).digest('hex'),cues:{a:'Hello',b:'Welcome'}};
 try{
  await writeFile(file,JSON.stringify(base));assert.deepEqual(await loadDialogueTranslation(file,source,['a','b'],'en'),base.cues);
  await assert.rejects(()=>loadDialogueTranslation(file,source+' changed',['a','b'],'en'));
  await assert.rejects(()=>loadDialogueTranslation(file,source,['a','b'],'fr'));
  for(const cues of [{a:'Hello'},{a:'Hello',b:'Welcome',c:'Extra'},{a:'Hello',b:' '}]){await writeFile(file,JSON.stringify({...base,cues}));await assert.rejects(()=>loadDialogueTranslation(file,source,['a','b'],'en'));}
 }finally{await rm(dir,{recursive:true,force:true});}
});
