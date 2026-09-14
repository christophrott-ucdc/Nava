// Offline authoring only. Reads a curated full snapshot; never uploads or activates it.
// node scripts/sign-content-release.mjs release-plan.json <snapshot-root> <private-key.pem> <output.json>
import {promises as fs,createReadStream} from 'node:fs';
import path from 'node:path';
import {createHash,createPrivateKey,sign} from 'node:crypto';

const [planFile,rootArg,keyFile,output]=process.argv.slice(2);
if(!planFile||!rootArg||!keyFile||!output)throw Error('Usage: release-plan.json snapshot-root private-key.pem output.json');
const root=await fs.realpath(rootArg),plan=JSON.parse(await fs.readFile(planFile,'utf8'));
const base=new URL(plan.baseUrl);
if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||!base.pathname.endsWith('/'))throw Error('baseUrl must be HTTPS, end with / and contain no credentials/query.');
if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(plan.id)||typeof plan.appVersion!=='string')throw Error('Invalid release identity.');
const files=[];
async function collect(relative){
  const absolute=path.join(root,relative),stat=await fs.lstat(absolute);
  if(stat.isSymbolicLink())throw Error('Symlinks are not allowed: '+relative);
  if(stat.isDirectory()){for(const name of (await fs.readdir(absolute)).sort())await collect(relative+'/'+name);return;}
  if(!stat.isFile()||!stat.size||! /\.(json|mp3|mp4|glb|png|jpg|jpeg|webp|svg|wav|ogg)$/i.test(relative)||! /^[A-Za-z0-9_./-]+$/.test(relative))throw Error('Unsupported file in curated snapshot: '+relative);
  if(stat.size>64*1024**3)throw Error('File exceeds 64 GiB: '+relative);
  const hash=createHash('sha256');for await(const chunk of createReadStream(absolute))hash.update(chunk);
  files.push({path:relative,url:new URL(relative,base).href,bytes:stat.size,sha256:hash.digest('hex')});
}
await collect('assets');await collect('media');
if(files.length>5000||files.reduce((n,f)=>n+f.bytes,0)>200*1024**3)throw Error('Release exceeds runtime limits.');
if(!files.some(f=>f.path===plan.video?.path))throw Error('Main video missing.');
const release={schema:1,id:plan.id,appVersion:plan.appVersion,...(plan.compatibleAppVersions?{compatibleAppVersions:plan.compatibleAppVersions}:{}),video:plan.video,files};
const key=createPrivateKey(await fs.readFile(keyFile));if(key.asymmetricKeyType!=='ed25519')throw Error('Use an Ed25519 private key.');
const payload=Buffer.from(JSON.stringify(release));
const signature=sign(null,Buffer.concat([Buffer.from('EXODUS7-CONTENT-V1\0'),payload]),key).toString('base64');
// Never overwrite a prior signed release or key by accident.
await fs.writeFile(output,JSON.stringify({payload:payload.toString('base64'),signature},null,2)+'\n',{flag:'wx'});
console.log('Signed release '+release.id+': '+files.length+' files. No upload or activation performed.');
