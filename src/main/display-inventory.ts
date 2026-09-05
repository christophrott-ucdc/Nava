import { screen, type Display } from 'electron';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { buildDisplayTopology, validatePersistentWallProfile, type AutoDisplaysConfig, type DisplayAutomationStatus, type DisplayTopologyCandidate, type InventoryDisplay, type PersistentWallProfile } from '../shared/display-topology';
import type { LogFn } from './logger';
import {createOpticalMarkerMap,validateOpticalCalibration,type OpticalMarkerMap} from '../shared/optical-calibration';

interface NativeDisplay {sourcePath:string;devicePath:string;label:string;serial:string;manufacturer:string;pixelBounds:{x:number;y:number;width:number;height:number};physicalWidthMm:number;physicalHeightMm:number;technology:number}
interface InventoryOptions {
  config:AutoDisplaysConfig; appRoot:string;resourcesRoot:string;log:LogFn;
  /** Caller holds the server's idle-only transaction lock. Returns rollback for a failed disk commit. */
  apply(candidate:DisplayTopologyCandidate):Promise<()=>Promise<void>>;
  onTopologyChanged(reason:string):void;
}
const topologyFingerprint=(displays:readonly InventoryDisplay[])=>JSON.stringify(displays.map(d=>({id:d.runtimeId,key:d.hardwareKey,bounds:d.boundsDip,dpi:d.scaleFactor,rotation:d.rotation,refresh:d.refreshHz})).sort((a,b)=>a.id-b.id));

/** Main-only read-only native probe; shell is never exposed to renderer/browser. */
async function readNative(helper:string):Promise<NativeDisplay[]> {
  const output=await new Promise<string>((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-File',helper],{windowsHide:true,timeout:8000,maxBuffer:256*1024,encoding:'utf8'},(err,stdout)=>err?reject(new Error(`Inventarul Windows nu este disponibil (${err.code??'helper'}).`)):resolve(stdout)));
  const data=JSON.parse(output.replace(/^\uFEFF/,'')) as {schemaVersion?:number;displays?:unknown};
  if(data.schemaVersion!==1||!Array.isArray(data.displays)||data.displays.length>64)throw new Error('Format invalid de inventar Windows.');
  return data.displays.map((raw:unknown)=>{
    if(!raw||typeof raw!=='object')throw new Error('Display nativ invalid.');
    const d=raw as NativeDisplay;
    if(!['sourcePath','devicePath','label','serial','manufacturer'].every(k=>typeof d[k as keyof NativeDisplay]==='string'&&(d[k as keyof NativeDisplay] as string).length<=1024)||!d.pixelBounds||!['x','y','width','height'].every(k=>Number.isFinite(d.pixelBounds[k as keyof NativeDisplay['pixelBounds']]))||d.pixelBounds.width<=0||d.pixelBounds.height<=0)throw new Error('Geometrie nativă invalidă.');
    return d;
  });
}

function inventoryRows(displays:Display[],native:NativeDisplay[]):InventoryDisplay[] {
  return displays.map((d,index)=>{
    const origin=d.nativeOrigin??{x:Math.round(d.bounds.x*d.scaleFactor),y:Math.round(d.bounds.y*d.scaleFactor)};
    const size={width:Math.round(d.bounds.width*d.scaleFactor),height:Math.round(d.bounds.height*d.scaleFactor)};
    const matches=native.filter(n=>Math.abs(n.pixelBounds.x-origin.x)<=1&&Math.abs(n.pixelBounds.y-origin.y)<=1&&Math.abs(n.pixelBounds.width-size.width)<=1&&Math.abs(n.pixelBounds.height-size.height)<=1);
    const n=matches.length===1?matches[0]:undefined;
    const uniqueSerial=n&&n.serial.trim()&&!/^(0+|unknown|default)$/i.test(n.serial.trim())&&native.filter(v=>v.serial===n.serial&&v.manufacturer===n.manufacturer).length===1;
    const hardwareKey=uniqueSerial?`serial:${n!.manufacturer}:${n!.serial}`:n?.devicePath?`connector:${n.devicePath}`:`electron:${d.id}`;
    const sizeValid=n&&Number.isFinite(n.physicalWidthMm)&&Number.isFinite(n.physicalHeightMm)&&n.physicalWidthMm>=50&&n.physicalWidthMm<=10000&&n.physicalHeightMm>=50&&n.physicalHeightMm<=10000;
    return {runtimeId:d.id,index,hardwareKey,identityConfidence:uniqueSerial?'serial':n?'connector':'runtime',label:n?.label||d.label||`Display ${index+1}`,boundsDip:{...d.bounds},pixelSize:size,scaleFactor:d.scaleFactor,rotation:d.rotation,refreshHz:d.displayFrequency,internal:d.internal||n?.technology===0x80000000||n?.technology===11||n?.technology===6,virtual:/virtual|remote|rdp|indirect/i.test(n?.label||d.label||'')||n?.technology===16,physicalSizeMm:sizeValid?{width:n.physicalWidthMm,height:n.physicalHeightMm}:null,physicalSizeSource:sizeValid?'edid':'unavailable',nativeSourcePath:n?.sourcePath};
  });
}

export class DisplayInventoryManager {
  private profile:PersistentWallProfile|undefined;
  private profileError:string|undefined;
  private fingerprint='';
  private timer:ReturnType<typeof setTimeout>|undefined;
  private stopped=false;
  private pending:Promise<DisplayAutomationStatus>|undefined;
  private applying=false;
  private topologyChanged=false;
  private status:DisplayAutomationStatus;
  private readonly profilePath:string;
  private readonly onEvent=()=>{
    if(!this.opts.config.enabled||this.stopped)return;
    this.topologyChanged=true;
    this.status.state='changed';
    this.opts.onTopologyChanged('Topologia display-urilor s-a schimbat. Verifică ieșirile înainte de reluare.');
    if(this.timer)clearTimeout(this.timer);
    this.timer=setTimeout(()=>{if(!this.stopped)void this.detect().catch(err=>this.opts.log('warn','display re-detection failed',String(err)));},1000);
  };
  constructor(private readonly opts:InventoryOptions){
    this.profilePath=path.join(opts.appRoot,'data','installations',opts.config.installationId??'default','wall-profile.json');
    this.status={enabled:opts.config.enabled,inventory:[],provider:'electron',candidate:null,profileRevision:null,state:opts.config.enabled?'detected':'disabled',issues:[],physicalCalibration:{status:'blocked-no-camera',reason:'Nu există provider optic/cameră calibrată; geometria fizică nu poate fi certificată automat.'}};
  }
  async initialize():Promise<DisplayAutomationStatus>{
    try{const stat=await fs.stat(this.profilePath);if(stat.size>1024*1024)throw new Error('Profil prea mare.');this.profile=validatePersistentWallProfile(JSON.parse(await fs.readFile(this.profilePath,'utf8')),this.opts.config.installationId??'default');}
    catch(err){if((err as NodeJS.ErrnoException).code!=='ENOENT'){this.profileError='Profilul persistent este invalid; nu a fost înlocuit automat.';this.opts.log('warn',this.profileError);}}
    await this.detect();
    screen.on('display-added',this.onEvent);screen.on('display-removed',this.onEvent);screen.on('display-metrics-changed',this.onEvent);
    return this.snapshot();
  }
  snapshot():DisplayAutomationStatus{return structuredClone(this.status);}
  /** Native status in the readiness path must be synchronous and must invalidate on any hotplug event. */
  readinessIssues():string[]{return this.opts.config.enabled?[...(this.topologyChanged?['Topologia display-urilor s-a schimbat; aplică o configurație verificată în pregătire.']:[]),...this.status.issues]:[];}
  async inventory():Promise<DisplayAutomationStatus>{return this.detect();}
  async detect():Promise<DisplayAutomationStatus>{
    if(this.pending)return this.pending;
    this.pending=this.probe().finally(()=>{this.pending=undefined;});return this.pending;
  }
  private async probe():Promise<DisplayAutomationStatus>{
    let native:NativeDisplay[]=[],providerIssue:string|undefined;
    if(process.platform==='win32'){
      const candidates=[path.join(this.opts.appRoot,'scripts','display-inventory.ps1'),path.join(this.opts.resourcesRoot,'scripts','display-inventory.ps1')];
      try{let helper:string|undefined;for(const p of candidates){try{await fs.access(p);helper=p;break;}catch{/* next bundled candidate */}}if(!helper)throw new Error('Helperul Windows nu este împachetat.');native=await readNative(helper);if(!native.length)providerIssue='Windows nu a furnizat trasee fizice; inventar Electron disponibil.';}
      catch(err){providerIssue=err instanceof Error?err.message:'Inventar Windows indisponibil.';}
    }else providerIssue='Providerul fizic Windows nu este disponibil pe acest sistem.';
    if(this.stopped)return this.snapshot();
    const displays=screen.getAllDisplays().slice().sort((a,b)=>a.bounds.x-b.bounds.x||a.bounds.y-b.bounds.y);
    const rows=inventoryRows(displays,native),candidate=buildDisplayTopology(rows,this.opts.config,this.profile);
    if(native.length>displays.length){candidate.issues.push('Mai multe trasee native partajează același desktop: posibil mod duplicat.');candidate.canApply=false;}
    if(this.profileError){candidate.issues.push(this.profileError);candidate.canApply=false;}
    const fingerprint=topologyFingerprint(rows);
    if(this.fingerprint&&fingerprint!==this.fingerprint)this.topologyChanged=true;
    this.status={enabled:this.opts.config.enabled,inventory:rows,provider:native.length?'windows-native':'electron',providerIssue,candidate,profileRevision:this.profile?.revision??null,state:!this.opts.config.enabled?'disabled':this.topologyChanged?'changed':candidate.canApply?(this.status.state==='applied'?'applied':'detected'):'blocked',issues:[...candidate.issues],physicalCalibration:candidate.geometryStatus==='measured'?{status:'saved-measurement',reason:`Geometrie din profilul măsurat: ${candidate.measurementSource}. Nu a fost reverificată optic la această pornire.`}:{status:'blocked-no-camera',reason:'Împărțirea logică este calculată; spațiile, unghiurile și ordinea fizică nu sunt observabile fără cameră sau măsurători salvate.'}};
    if(candidate.videoWall.optical)this.status.physicalCalibration={status:'camera-projected',reason:'Proiecție salvată din imaginea camerei; poziția fizică trebuie să fie aceeași ca la captură.'};
    return this.snapshot();
  }
  async apply(optical?:unknown):Promise<DisplayAutomationStatus>{
    if(!this.opts.config.enabled)throw new Error('Automatizarea display-urilor nu este activată în configurație.');
    if(this.applying)throw new Error('O configurație de display-uri este deja în curs de aplicare.');
    this.applying=true;
    try{
      const status=await this.detect(),candidate=status.candidate;
      if(!candidate?.canApply)throw new Error(status.issues.join(' ')||'Candidatul nu poate fi aplicat.');
      if(optical!==undefined){
        const reference=(optical as {mapping?:OpticalMarkerMap})?.mapping?.referencePosition;
        const displays=candidate.screens.map(s=>{const d=status.inventory.find(d=>d.index===s.displayIndex);if(!d)throw new Error('Display deconectat.');return {displayId:s.id,hardwareKey:d.hardwareKey,pixelWidth:d.pixelSize.width,pixelHeight:d.pixelSize.height};});
        displays.sort((a,b)=>a.displayId.localeCompare(b.displayId));
        const raw=JSON.stringify({displays,bounds:status.inventory.map(d=>({key:d.hardwareKey,bounds:d.boundsDip,rotation:d.rotation}))});let hash=2166136261;for(let i=0;i<raw.length;i++){hash^=raw.charCodeAt(i);hash=Math.imul(hash,16777619);}
        const expected=createOpticalMarkerMap(displays,`nava-topology-${(hash>>>0).toString(16)}`,reference);
        const checked=validateOpticalCalibration(optical,expected);if(!checked.ok)throw new Error(checked.errors.join(' '));
        candidate.videoWall={...candidate.videoWall,mode:'panorama',optical:checked.calibration};
        const panels=checked.calibration.displays;
        const points=panels.flatMap(d=>d.normalizedCorners),mid=(Math.min(...points.map(p=>p[0]))+Math.max(...points.map(p=>p[0])))/2;
        const center=[...panels].sort((a,b)=>Math.abs(a.normalizedCorners.reduce((s,p)=>s+p[0],0)/4-mid)-Math.abs(b.normalizedCorners.reduce((s,p)=>s+p[0],0)/4-mid))[0].displayId;
        candidate.screens=candidate.screens.map(s=>({...s,showAvatar:s.id===center,showSubtitles:s.id===center,showEntities:s.id===center,playAudio:s.id===center}));
      }
      candidate.screens.sort((a,b)=>Number(b.playAudio)-Number(a.playAudio));
      const revision=(this.profile?.revision??0)+1;
      const profile:PersistentWallProfile={schemaVersion:1,installationId:this.opts.config.installationId??'default',revision,savedAt:new Date().toISOString(),assignments:candidate.assignments,expectedAudienceCount:candidate.expectedAudienceCount,videoWall:candidate.videoWall,screens:candidate.screens,geometryStatus:candidate.geometryStatus,measurementSource:candidate.measurementSource};
      validatePersistentWallProfile(profile,profile.installationId);
      await fs.mkdir(path.dirname(this.profilePath),{recursive:true});
      const tmp=`${this.profilePath}.${crypto.randomUUID()}.tmp`;
      let rollback:(()=>Promise<void>)|undefined;
      try{
        const handle=await fs.open(tmp,'wx');try{await handle.writeFile(JSON.stringify(profile,null,2)+'\n');await handle.sync();}finally{await handle.close();}
        rollback=await this.opts.apply(candidate);
        // Detect a display event racing window recreation before accepting the profile.
        const current=screen.getAllDisplays().map(d=>({id:d.id,bounds:d.bounds,scale:d.scaleFactor}));
        if(status.inventory.some(d=>!current.some(c=>c.id===d.runtimeId&&JSON.stringify(c.bounds)===JSON.stringify(d.boundsDip)&&c.scale===d.scaleFactor)))throw new Error('Display-urile s-au schimbat în timpul aplicării.');
        await fs.rename(tmp,this.profilePath);
      }catch(err){if(rollback)await rollback();await fs.unlink(tmp).catch(()=>{});throw err;}
      this.profile=profile;this.fingerprint=topologyFingerprint(status.inventory);this.topologyChanged=false;
      this.status.state='applied';this.status.profileRevision=revision;this.opts.log('info','display profile applied',{revision,displayCount:candidate.screens.length,geometry:candidate.geometryStatus});
      if(candidate.videoWall.optical)this.status.physicalCalibration={status:'camera-projected',reason:'Proiecție calibrată din imaginea camerei, pentru poziția de referință declarată. Nu sunt măsurători în milimetri.'};
      return this.snapshot();
    }finally{this.applying=false;}
  }
  stop():void{this.stopped=true;if(this.timer)clearTimeout(this.timer);screen.removeListener('display-added',this.onEvent);screen.removeListener('display-removed',this.onEvent);screen.removeListener('display-metrics-changed',this.onEvent);}
}
