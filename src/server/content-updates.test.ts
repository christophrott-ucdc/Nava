import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {ContentUpdates,contentPanelSets,type ContentRelease} from './content-updates';
import {audiencePanelIds} from '../shared/display-topology';

test('signed content adaptive mapping only resolves complete manifest-listed sources',()=>{
 const base={video:{path:'media/film.mp4',panelsDir:'media/panels'},files:audiencePanelIds(5)!.map(id=>({path:`media/panels/${id}.mp4`}))} as ContentRelease;
 assert.deepEqual(contentPanelSets('/content',base),{'5':path.resolve('/content/media/panels')});
 const two='media/two';base.video.panelsByCount={'2':two};base.files.push(...audiencePanelIds(2)!.map(id=>({path:`${two}/${id}.mp4`}) as ContentRelease['files'][number]));
 assert.equal(contentPanelSets('/content',base)['2'],path.resolve('/content/media/two'));
 base.files.pop();assert.throws(()=>contentPanelSets('/content',base),/nesemnat sau incomplet/);
 base.video.panelsByCount={'2':'../outside'};assert.throws(()=>contentPanelSets('/content',base));
 base.video.panelsByCount={'4':'media/panels'};assert.throws(()=>contentPanelSets('/content',base),/nesemnat sau incomplet/,'never reuse a wider set as a count-specific export');
});

test('content downloads: signed manifest, interrupted retry, disk accounting and stale candidates',async t=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'nava-content-qa-'));
  const oldKey=process.env.NAVA_CONTENT_PUBLIC_KEY_FILE;
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');
  const keyFile=path.join(temp,'public.pem');await fs.writeFile(keyFile,publicKey.export({type:'spki',format:'pem'}));
  process.env.NAVA_CONTENT_PUBLIC_KEY_FILE=keyFile;
  const names=['assets/show/show.json','assets/music/manifest.json','assets/music/waiting.json','assets/voice/ro/manifest.json','assets/experience/voice/ro/manifest.json',...['age-5-10','age-10-15','age-15-18','adults'].flatMap(id=>[`assets/scenarios/${id}/dialogue.ro.draft.json`,`assets/scenarios/${id}/voice/ro/manifest.json`]),'media/film.mp4'];
  const bytes=Buffer.from('fixture content');
  const release={schema:1,id:'qa',appVersion:'0.1.0',video:{path:'media/film.mp4'},files:names.map(name=>({path:name,url:'https://qa.invalid/'+name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}))};
  const payload=Buffer.from(JSON.stringify(release));
  const envelope={payload:payload.toString('base64'),signature:sign(null,Buffer.concat([Buffer.from('EXODUS7-CONTENT-V1\0'),payload]),privateKey).toString('base64')};
  const digest=createHash('sha256').update(payload).digest('hex');
  let failManifest=false,failFile=false,calls:string[]=[];
  t.mock.method(globalThis,'fetch',async(input:unknown)=>{
    const url=String(input);calls.push(url);
    if(url.endsWith('/release.json'))return new Response(JSON.stringify(envelope),{status:failManifest?503:200});
    if(failFile&&url.endsWith('film.mp4'))return new Response('unavailable',{status:503});
    return new Response(bytes);
  });
  try{
    await t.test('rejects invalid signatures before writing content',async()=>{
      const original=envelope.signature;envelope.signature=Buffer.alloc(64).toString('base64');
      const u=new ContentUpdates(path.join(temp,'invalid'),'0.1.0');u.configure('https://qa.invalid/release.json');
      try{await assert.rejects(u.check(),/Semnătura/);assert.equal(u.status.state,'error');}finally{envelope.signature=original;}
    });
    await t.test('a failed new check invalidates an earlier candidate',async()=>{
      const u=new ContentUpdates(path.join(temp,'stale'),'0.1.0');u.configure('https://qa.invalid/release.json');await u.check();
      failManifest=true;try{await assert.rejects(u.check());}finally{failManifest=false;}
      await assert.rejects(u.download(),/Verifică mai întâi/);
    });
    await t.test('retry only reserves space for missing or damaged files',async st=>{
      const dir=path.join(temp,'resume'),u=new ContentUpdates(dir,'0.1.0');u.configure('https://qa.invalid/release.json');await u.check();
      failFile=true;try{await assert.rejects(u.download(),/Descărcare/);}finally{failFile=false;}
      const damaged=path.join(dir,digest,names[0]);await fs.writeFile(damaged,Buffer.alloc(bytes.length));
      st.mock.method(fs,'statfs',async()=>({bavail:512*1024**2+2*bytes.length,bsize:1}));
      calls=[];await u.download();assert.equal(u.status.state,'downloaded');assert.equal(u.status.filesDone,names.length);
      assert.deepEqual(calls.sort(),['https://qa.invalid/'+names[0],'https://qa.invalid/media/film.mp4'].sort());
      assert.deepEqual(await fs.readFile(damaged),bytes);
    });
  }finally{
    if(oldKey===undefined)delete process.env.NAVA_CONTENT_PUBLIC_KEY_FILE;else process.env.NAVA_CONTENT_PUBLIC_KEY_FILE=oldKey;
    await fs.rm(temp,{recursive:true,force:true});
  }
});
