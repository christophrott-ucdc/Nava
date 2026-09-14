import {validateShowFile} from './features/show-validate';
import {loadScenario} from './scenario-catalog';
import {loadMusic,loadWaitingMusic} from './music';
import {FILM_DURATION} from '../shared/film-timing';
import {audiencePanelIds} from '../shared/display-topology';
import {createHash,createPublicKey,verify} from 'node:crypto';
import {promises as fs,createReadStream,createWriteStream} from 'node:fs';
import path from 'node:path';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';

export interface ContentRelease {schema:1;id:string;appVersion:string;compatibleAppVersions?:string[];video:{path:string;panelsDir?:string;panelsByCount?:Record<string,string>};files:Array<{path:string;url:string;bytes:number;sha256:string}>;}
interface Envelope {payload:string;signature:string;}
const pathOK=(s:string)=>typeof s==='string'&&/^(assets|media)\/[A-Za-z0-9_./-]+$/.test(s)&&s.split('/').every(p=>p!=='.'&&p!=='..'&&p.length>0&&!/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p))&&!s.endsWith('.');
/** Derive adaptive sources exclusively from a verified release, never local config.
 * Older signed releases can supply their one complete canonical set. */
export function contentPanelSets(root:string,release:ContentRelease):Record<string,string>{
  const sets:Record<string,string>={},names=new Set(release.files.map(f=>f.path));
  const supplied=release.video.panelsByCount;
  if(supplied&&(typeof supplied!=='object'||Array.isArray(supplied)))throw Error('Seturile adaptive din pachet sunt invalide.');
  for(const [count,directory] of Object.entries(supplied??{})){
    const ids=audiencePanelIds(Number(count));
    if(!/^[1-5]$/.test(count)||!ids||!pathOK(directory)||ids.some(id=>!names.has(directory+'/'+id+'.mp4'))||release.files.filter(f=>path.posix.dirname(f.path)===directory&&f.path.endsWith('.mp4')).length!==ids.length)throw Error('Set panoramic nesemnat sau incomplet: '+count);
    sets[count]=path.resolve(root,directory);
  }
  if(release.video.panelsDir){
    const dir=release.video.panelsDir;if(!pathOK(dir))throw Error('Director panoramic invalid.');
    const direct=release.files.filter(f=>path.posix.dirname(f.path)===dir&&f.path.endsWith('.mp4'));
    const ids=audiencePanelIds(direct.length);
    if(ids&&ids.every(id=>names.has(dir+'/'+id+'.mp4'))&&!sets[String(ids.length)])sets[String(ids.length)]=path.resolve(root,dir);
  }
  return sets;
}
function https(value:string){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password)throw Error('Resursa trebuie să folosească HTTPS fără credențiale în URL.');return u.href;}
async function envelope(value:unknown,appVersion:string){
  const e=value as Envelope;if(!e||typeof e.payload!=='string'||e.payload.length>1400000||typeof e.signature!=='string'||e.signature.length>100)throw Error('Manifest invalid.');
  const keyFile=process.env.NAVA_CONTENT_PUBLIC_KEY_FILE;if(!keyFile)throw Error('Lipsește cheia publică pentru pachetele multimedia.');
  const key=createPublicKey(await fs.readFile(keyFile));if(key.asymmetricKeyType!=='ed25519')throw Error('Cheia pentru conținut trebuie să fie Ed25519.');
  const bytes=Buffer.from(e.payload,'base64');if(!verify(null,Buffer.concat([Buffer.from('EXODUS7-CONTENT-V1\0'),bytes]),key,Buffer.from(e.signature,'base64')))throw Error('Semnătura pachetului nu este validă.');
  const r=JSON.parse(bytes.toString('utf8')) as ContentRelease;
  if(r.schema!==1||!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(r.id)||(r.appVersion!==appVersion&&!(Array.isArray(r.compatibleAppVersions)&&r.compatibleAppVersions.length<=16&&r.compatibleAppVersions.includes(appVersion)))||!Array.isArray(r.files)||!r.files.length||r.files.length>5000)throw Error('Pachet incompatibil cu aplicația.');
  const names=new Set<string>();let total=0;
  for(const f of r.files){if(!pathOK(f.path)||!(/\.(json|mp3|mp4|glb|png|jpg|jpeg|webp|svg|wav|ogg)$/i.test(f.path))||names.has(f.path.toLowerCase())||!Number.isSafeInteger(f.bytes)||f.bytes<=0||f.bytes>64*1024**3||!/^[a-f0-9]{64}$/.test(f.sha256))throw Error('Fișier invalid în manifest.');https(f.url);names.add(f.path.toLowerCase());total+=f.bytes;}
  if(total>200*1024**3||!r.video||!pathOK(r.video.path)||!names.has(r.video.path.toLowerCase())||(r.video.panelsDir&&!pathOK(r.video.panelsDir)))throw Error('Configurație video invalidă.');
  contentPanelSets('.',r);
  for(const name of ['assets/show/show.json','assets/music/manifest.json','assets/music/waiting.json','assets/voice/ro/manifest.json','assets/experience/voice/ro/manifest.json',...['age-5-10','age-10-15','age-15-18','adults'].flatMap(id=>[`assets/scenarios/${id}/dialogue.ro.draft.json`,`assets/scenarios/${id}/voice/ro/manifest.json`])])if(!names.has(name))throw Error('Pachetul trebuie să conțină toate scenariile și manifestele vocale: '+name);
  return {release:r,envelope:e,digest:createHash('sha256').update(bytes).digest('hex')};
}
async function digest(file:string){const h=createHash('sha256');for await(const chunk of createReadStream(file))h.update(chunk);return h.digest('hex');}
export async function activeContent(directory:string,version:string){
  let pointer:{directory:string};try{pointer=JSON.parse(await fs.readFile(path.join(directory,'active.json'),'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
  if(!/^[a-f0-9]{64}$/.test(pointer.directory))throw Error('Referință de conținut invalidă.');
  const root=path.join(directory,pointer.directory),verified=await envelope(JSON.parse(await fs.readFile(path.join(root,'release.json'),'utf8')),version);
  if(verified.digest!==pointer.directory)throw Error('Identitatea pachetului diferă.');
  return {root,release:verified.release};
}
export class ContentUpdates {
  status:{state:string;id?:string;filesDone:number;filesTotal:number;message:string}={state:'disabled',filesDone:0,filesTotal:0,message:'Configurează manifestul HTTPS și cheia publică Ed25519.'};
  private candidate:Awaited<ReturnType<typeof envelope>>|null=null;private url:string|undefined;
  constructor(private directory:string,private version:string,private screenIds:()=>string[]=()=>[]){}
  configure(url?:string){this.url=url?https(url):undefined;this.candidate=null;this.status={state:url?'idle':'disabled',filesDone:0,filesTotal:0,message:url?'Verificarea pachetelor se face la cerere.':'Conținutul separat nu este configurat.'};}
  async check(){if(!this.url)throw Error('Configurează URL-ul manifestului.');this.candidate=null;this.status.state='checking';try{
    const r=await fetch(this.url,{redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok||!r.body)throw Error('Manifest indisponibil.');let text='';for await(const chunk of Readable.fromWeb(r.body as never)){text+=chunk.toString();if(Buffer.byteLength(text)>1500000)throw Error('Manifest prea mare.');}
    this.candidate=await envelope(JSON.parse(text),this.version);this.status={state:'available',id:this.candidate.release.id,filesDone:0,filesTotal:this.candidate.release.files.length,message:'Semnătură verificată; pachet disponibil.'};
  }catch(error){this.fail(error);throw error;}}
  private fail(error:unknown){this.status.state='error';this.status.message=String(error);}
  async download(){const candidate=this.candidate;if(!candidate)throw Error('Verifică mai întâi manifestul.');const root=path.join(this.directory,candidate.digest);this.status.state='downloading';try{
    await fs.mkdir(root,{recursive:true});
    const pending:ContentRelease['files']=[];this.status.filesDone=0;
    for(const f of candidate.release.files){
      const target=path.join(root,f.path);
      try{const stat=await fs.lstat(target);if(stat.isFile()&&!stat.isSymbolicLink()&&stat.size===f.bytes&&await digest(target)===f.sha256){this.status.filesDone++;continue;}}catch{}
      pending.push(f);
    }
    const space=await fs.statfs(root),bytes=pending.reduce((n,f)=>n+f.bytes,0);
    if(space.bavail*space.bsize<bytes+512*1024**2)throw Error('Spațiu insuficient pentru pachet și rezerva de lucru.');
    for(const f of pending){const target=path.join(root,f.path);await fs.mkdir(path.dirname(target),{recursive:true});
      const response=await fetch(f.url,{redirect:'error',signal:AbortSignal.timeout(30*60000)});if(!response.ok||!response.body)throw Error('Descărcare eșuată: '+f.path);
      let size=0;const h=createHash('sha256'),temp=target+'.partial';
      const meter=new Transform({transform(chunk,_,done){size+=chunk.length;if(size>f.bytes){done(Error('Resursă mai mare decât manifestul.'));return;}h.update(chunk);done(null,chunk);}});
      try{await pipeline(Readable.fromWeb(response.body as never),meter,createWriteStream(temp));if(size!==f.bytes||h.digest('hex')!==f.sha256)throw Error('Integritate invalidă: '+f.path);await fs.rename(temp,target);}catch(error){await fs.unlink(temp).catch(()=>{});throw error;}
      this.status.filesDone++;
    }
    await fs.writeFile(path.join(root,'release.json'),JSON.stringify(candidate.envelope));this.status.state='downloaded';this.status.message='Pachet verificat, separat de cel activ.';
  }catch(error){this.fail(error);throw error;}}
  async activate(){const c=this.candidate;if(!c||this.status.state!=='downloaded')throw Error('Descarcă și verifică mai întâi pachetul.');
    const root=path.join(this.directory,c.digest);
    for(const f of c.release.files){const file=path.join(root,f.path),stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==f.bytes||await digest(file)!==f.sha256)throw Error('Fișier modificat după descărcare: '+f.path);}
    const show=validateShowFile(JSON.parse(await fs.readFile(path.join(root,'assets/show/show.json'),'utf8')));
    if(!show.ok||!show.show||show.show.videoDurationSec!==FILM_DURATION)throw Error('Scenariul sau montajul nu este compatibil cu această aplicație.');
    for(const id of ['age-5-10','age-10-15','age-15-18','adults'] as const){const pack=await loadScenario(root,id,show.show);if(pack.issues.length)throw Error(id+': '+pack.issues.join('; '));}
    const waiting=await loadWaitingMusic(root);
    if(!await loadMusic(root)||!waiting||waiting.directory!==path.join(root,'assets/music'))throw Error('Pachetul muzical nu este complet.');
    const screenIds=this.screenIds(),sets=contentPanelSets(root,c.release),selected=c.release.video.panelsByCount?sets[String(screenIds.length)]:c.release.video.panelsDir?path.resolve(root,c.release.video.panelsDir):undefined;
    if(screenIds.length&&(c.release.video.panelsDir||c.release.video.panelsByCount)){
      if(!selected)throw Error('Pachetul nu include un set complet pentru '+screenIds.length+' ecrane.');
      for(const id of screenIds)if(!c.release.files.some(f=>path.resolve(root,f.path)===path.join(selected,id+'.mp4')))throw Error('Lipsește filmul semnat pentru '+id);
    }
    // Resolve every referenced audio asset before publishing the immutable root.
    for(const f of c.release.files.filter(f=>f.path.endsWith('/manifest.json'))){
      const manifest=JSON.parse(await fs.readFile(path.join(root,f.path),'utf8'));
      for(const clip of Object.values(manifest.clips??{}) as Array<{file?:string}>){if(!clip.file||path.basename(clip.file)!==clip.file)throw Error('Manifest vocal invalid.');const rel=path.posix.join(path.posix.dirname(f.path),clip.file);if(!c.release.files.some(x=>x.path===rel))throw Error('Fișier audio lipsă: '+rel);}
    }
    const pointer=path.join(this.directory,'active.json');try{await fs.copyFile(pointer,path.join(this.directory,'previous.json'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    await fs.writeFile(pointer+'.tmp',JSON.stringify({directory:c.digest}));await fs.rename(pointer+'.tmp',pointer);this.status.state='activated';this.status.message='Pachet activat pentru următoarea pornire.';
  }
}
