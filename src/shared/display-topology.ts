import type { ScreenConfig, VideoWallConfig } from './types';
import { samsungWallPreset, validateVideoWall, validateWallScreens, type WallRect } from './video-wall';

export interface AutoDisplaysConfig {
  enabled:boolean;
  installationId?:string;
  expectedAudienceCount?:number;
  operatorDisplayIds?:number[];
  audienceDisplayIds?:number[];
  centerDisplayId?:number;
  layout?:'generic'|'samsung-5';
  allowEstimatedGeometry?:boolean;
}
export interface InventoryDisplay {
  runtimeId:number; index:number; hardwareKey:string;
  identityConfidence:'serial'|'connector'|'runtime';
  label:string; boundsDip:WallRect; pixelSize:{width:number;height:number}; scaleFactor:number;
  rotation:number; refreshHz:number; internal:boolean; virtual:boolean;
  physicalSizeMm:{width:number;height:number}|null;
  physicalSizeSource:'edid'|'unavailable';
  nativeSourcePath?:string;
}
export interface DisplayAssignment {hardwareKey:string;runtimeId:number;role:'audience'|'operator';screenId?:string}
export interface PersistentWallProfile {
  schemaVersion:1; installationId:string; revision:number; savedAt:string;
  assignments:DisplayAssignment[]; expectedAudienceCount:number;
  videoWall:VideoWallConfig; screens:ScreenConfig[];
  geometryStatus:'estimated'|'measured';
  /** Measured geometry may only be imported with an explicit installation survey, not inferred from EDID. */
  measurementSource?:string;
}
export interface DisplayTopologyCandidate {
  screens:ScreenConfig[];videoWall:VideoWallConfig;displayMode:'span'|'windows';
  assignments:DisplayAssignment[];expectedAudienceCount:number;
  geometryStatus:'estimated'|'measured';measurementSource?:string;
  issues:string[];warnings:string[];canApply:boolean;
}
export interface DisplayAutomationStatus {
  enabled:boolean; inventory:InventoryDisplay[]; provider:'windows-native'|'electron'; providerIssue?:string;
  candidate:DisplayTopologyCandidate|null; profileRevision:number|null;
  state:'disabled'|'detected'|'applied'|'blocked'|'changed';
  issues:string[];
  physicalCalibration:{status:'blocked-no-camera'|'saved-measurement'|'camera-projected';reason:string};
}
export interface DisplayAutomationHooks {
  inventory():Promise<DisplayAutomationStatus>;
  detect():Promise<DisplayAutomationStatus>;
  apply():Promise<DisplayAutomationStatus>;
}

export function validateAutoDisplays(raw:unknown):AutoDisplaysConfig {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('autoDisplays trebuie să fie obiect.');
  const o=raw as Record<string,unknown>;
  if(typeof o.enabled!=='boolean')throw new Error('autoDisplays.enabled trebuie să fie boolean.');
  if(o.installationId!==undefined&&(typeof o.installationId!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(o.installationId)))throw new Error('installationId invalid.');
  if(o.expectedAudienceCount!==undefined&&(!Number.isInteger(o.expectedAudienceCount)||(o.expectedAudienceCount as number)<1||(o.expectedAudienceCount as number)>16))throw new Error('expectedAudienceCount trebuie să fie 1–16.');
  for(const key of ['operatorDisplayIds','audienceDisplayIds'])if(o[key]!==undefined&&(!Array.isArray(o[key])||(o[key] as unknown[]).length>32||(o[key] as unknown[]).some(id=>!Number.isSafeInteger(id))||new Set(o[key] as unknown[]).size!==(o[key] as unknown[]).length))throw new Error(`${key} trebuie să conțină ID-uri native unice.`);
  if(o.centerDisplayId!==undefined&&!Number.isSafeInteger(o.centerDisplayId))throw new Error('centerDisplayId invalid.');
  if(o.layout!==undefined&&o.layout!=='generic'&&o.layout!=='samsung-5')throw new Error('autoDisplays.layout invalid.');
  if(o.allowEstimatedGeometry!==undefined&&typeof o.allowEstimatedGeometry!=='boolean')throw new Error('allowEstimatedGeometry trebuie să fie boolean.');
  const operators=(o.operatorDisplayIds??[]) as number[],audience=(o.audienceDisplayIds??[]) as number[];
  if(operators.some(id=>audience.includes(id)))throw new Error('Un display nu poate fi operator și public simultan.');
  return {enabled:o.enabled,installationId:o.installationId as string|undefined,expectedAudienceCount:o.expectedAudienceCount as number|undefined,operatorDisplayIds:operators,audienceDisplayIds:o.audienceDisplayIds===undefined?undefined:audience,centerDisplayId:o.centerDisplayId as number|undefined,layout:o.layout as AutoDisplaysConfig['layout'],allowEstimatedGeometry:o.allowEstimatedGeometry as boolean|undefined};
}

export function validatePersistentWallProfile(raw:unknown,installationId:string):PersistentWallProfile {
  if(!raw||typeof raw!=='object')throw new Error('Profilul instalației este invalid.');
  const o=raw as PersistentWallProfile;
  if(o.schemaVersion!==1||o.installationId!==installationId||!Number.isSafeInteger(o.revision)||o.revision<1||!Number.isInteger(o.expectedAudienceCount)||o.expectedAudienceCount<1||o.expectedAudienceCount>16||!Array.isArray(o.assignments)||o.assignments.length>32)throw new Error('Schema profilului instalației este invalidă.');
  if(o.geometryStatus!=='estimated'&&o.geometryStatus!=='measured')throw new Error('Proveniența geometriei lipsește.');
  if(o.geometryStatus==='measured'&&(typeof o.measurementSource!=='string'||!o.measurementSource.trim()||o.measurementSource.length>1024))throw new Error('Geometria măsurată necesită sursa măsurătorii.');
  const keys=new Set<string>(),ids=new Set<string>();
  for(const a of o.assignments){
    if(!a||typeof a.hardwareKey!=='string'||!a.hardwareKey||a.hardwareKey.length>1024||keys.has(a.hardwareKey)||!Number.isSafeInteger(a.runtimeId)||(a.role!=='operator'&&a.role!=='audience'))throw new Error('Asociere de display invalidă.');
    keys.add(a.hardwareKey);
    if(a.role==='audience'){if(typeof a.screenId!=='string'||!a.screenId||ids.has(a.screenId))throw new Error('ID de ecran duplicat sau absent.');ids.add(a.screenId);}
  }
  const wall=validateVideoWall(o.videoWall,[...ids]);if(!wall.ok)throw new Error(wall.reason);
  const screens=validateWallScreens(o.screens,wall.value);if(!screens.ok)throw new Error(screens.reason);
  if(ids.size!==o.expectedAudienceCount)throw new Error('Profilul nu conține toate display-urile așteptate.');
  return {...o,videoWall:wall.value,screens:screens.screens};
}

/** Deterministic physical-coordinate candidate; an OS desktop is never labelled optically measured. */
export function buildDisplayTopology(displays:readonly InventoryDisplay[],options:AutoDisplaysConfig,saved?:PersistentWallProfile):DisplayTopologyCandidate {
  const issues:string[]=[],warnings:string[]=[];
  const match=(a:DisplayAssignment)=>displays.find(d=>d.hardwareKey===a.hardwareKey);
  const operators=new Set(displays.filter(d=>options.operatorDisplayIds?.includes(d.runtimeId)).map(d=>d.hardwareKey));
  for(const a of saved?.assignments??[])if(a.role==='operator')operators.add(a.hardwareKey);
  let audience:InventoryDisplay[];
  if(saved){
    const assignments=saved.assignments.filter(a=>a.role==='audience');
    audience=assignments.map(match).filter((d):d is InventoryDisplay=>!!d);
    if(audience.length!==assignments.length)issues.push('Lipsesc display-uri din instalația salvată; numărul așteptat nu a fost redus.');
    if(audience.some(d=>operators.has(d.hardwareKey)))issues.push('Rolurile salvate intră în conflict cu ieșirea operatorului.');
    const known=new Set(saved.assignments.map(a=>a.hardwareKey));
    if(displays.some(d=>!known.has(d.hardwareKey)))warnings.push('Display nou neatribuit; nu este adăugat automat instalației salvate.');
  }else{
    audience=displays.filter(d=>!operators.has(d.hardwareKey)&&!d.internal&&!d.virtual&&(options.audienceDisplayIds===undefined||options.audienceDisplayIds.includes(d.runtimeId)));
    if(options.audienceDisplayIds?.some(id=>!audience.some(d=>d.runtimeId===id)))issues.push('O ieșire de public selectată lipsește sau nu este eligibilă.');
    if(!audience.length)issues.push('Nu există ieșiri de public eligibile; atribuie explicit display-urile externe.');
  }
  audience.sort((a,b)=>a.boundsDip.x-b.boundsDip.x||a.boundsDip.y-b.boundsDip.y||a.hardwareKey.localeCompare(b.hardwareKey));
  const expected=saved?.expectedAudienceCount??options.expectedAudienceCount??(options.layout==='samsung-5'?5:audience.length);
  if(audience.length!==expected)issues.push(`Instalația așteaptă ${expected} display-uri de public; sunt disponibile ${audience.length}.`);
  if(audience.length>16||expected<1||expected>16)issues.push('Sunt acceptate între 1 și 16 display-uri de public.');
  if(new Set(audience.map(d=>d.hardwareKey)).size!==audience.length)issues.push('Identități de display duplicate; asocierea automată nu este sigură.');
  if(audience.some(d=>d.rotation!==0))issues.push('Instalația necesită display-uri landscape fără rotație.');
  for(let i=0;i<audience.length;i++)for(let j=i+1;j<audience.length;j++){
    const a=audience[i].boundsDip,b=audience[j].boundsDip;
    if(Math.min(a.x+a.width,b.x+b.width)>Math.max(a.x,b.x)&&Math.min(a.y+a.height,b.y+b.height)>Math.max(a.y,b.y))issues.push('Desktop clonat sau suprafețe Windows suprapuse; extinderea trebuie configurată înainte de show.');
  }
  const oldCenter=saved?.screens.find(s=>s.showAvatar)?.id;
  let center=audience.find(d=>saved?.assignments.some(a=>a.hardwareKey===d.hardwareKey&&a.screenId===oldCenter))??audience.find(d=>d.runtimeId===options.centerDisplayId);
  if(options.centerDisplayId!==undefined&&!audience.some(d=>d.runtimeId===options.centerDisplayId))issues.push('Display-ul central selectat nu este disponibil.');
  if(!center&&audience.length){
    if(options.layout==='samsung-5'){
      const sizes=audience.filter(d=>d.physicalSizeMm).sort((a,b)=>b.physicalSizeMm!.width-a.physicalSizeMm!.width);
      center=sizes.length===5&&sizes[0].physicalSizeMm!.width>sizes[1].physicalSizeMm!.width*1.08?sizes[0]:audience[Math.floor(audience.length/2)];
    }else{
      const mid=(audience[0].boundsDip.x+audience[audience.length-1].boundsDip.x+audience[audience.length-1].boundsDip.width)/2;
      center=[...audience].sort((a,b)=>Math.abs(a.boundsDip.x+a.boundsDip.width/2-mid)-Math.abs(b.boundsDip.x+b.boundsDip.width/2-mid)||a.hardwareKey.localeCompare(b.hardwareKey))[0];
    }
  }
  if(options.layout==='samsung-5'&&audience.length===5&&audience.indexOf(center!)!==2)issues.push('TV-ul central de 115″ nu este în centrul ordinii Windows; este necesară verificarea ordinii instalației.');
  const names=['port-outer','port-inner','center','starboard-inner','starboard-outer'];
  const screens=audience.map((d,i):ScreenConfig=>{
    const id=saved?.assignments.find(a=>a.hardwareKey===d.hardwareKey)?.screenId??(options.layout==='samsung-5'&&audience.length===5?names[i]:d===center?'center':`audience-${i+1}`);
    return {id,displayIndex:d.index,roleLabel:d===center?'CENTRU':`TV ${i+1}`,showAvatar:d===center,showSubtitles:d===center,showEntities:d===center,playAudio:d===center,kiosk:true,yawOffsetDeg:0};
  });
  let videoWall:VideoWallConfig;
  if(saved)videoWall=structuredClone(saved.videoWall);
  else if(options.layout==='samsung-5'&&audience.length===5)videoWall=samsungWallPreset();
  else{
    const dims=audience.map(d=>d.physicalSizeMm??{width:Math.round(d.pixelSize.width/d.pixelSize.height*1000),height:1000});
    const height=Math.max(1,...dims.map(d=>d.height));let x=0;
    videoWall={mode:'cinema',fit:'cover',focusX:.5,focusY:.5,calibration:false,panels:dims.map((size,i)=>{const panel={screenId:screens[i].id,x,y:(height-size.height)/2,width:size.width,height:size.height};x+=size.width;return panel;})};
  }
  if(!saved)videoWall.mode='panorama';
  const geometryStatus=saved?.geometryStatus??'estimated';
  if(geometryStatus==='estimated'&&!videoWall.optical){
    warnings.push('Ordinea fizică, spațiile și unghiurile nu au fost măsurate optic. Geometria este estimată.');
    if(options.allowEstimatedGeometry===false)issues.push('Politica instalației cere geometrie măsurată înainte de aplicare.');
  }
  if(audience.some(d=>d.identityConfidence==='runtime'))warnings.push('Unele display-uri au numai identitate Electron; schimbarea identificatorului necesită reasociere.');
  const mixedDpi=new Set(audience.map(d=>d.scaleFactor)).size>1;
  if(mixedDpi)warnings.push('Scalări DPI diferite: se folosesc ferestre separate, cu verificare de sincronizare necesară.');
  const operatorAssignments:DisplayAssignment[]=displays.filter(d=>operators.has(d.hardwareKey)).map(d=>({hardwareKey:d.hardwareKey,runtimeId:d.runtimeId,role:'operator' as const}));
  for(const a of saved?.assignments??[])if(a.role==='operator'&&!operatorAssignments.some(o=>o.hardwareKey===a.hardwareKey))operatorAssignments.push({...a});
  const assignments:DisplayAssignment[]=[...audience.map((d,i)=>({hardwareKey:d.hardwareKey,runtimeId:d.runtimeId,role:'audience' as const,screenId:screens[i].id})),...operatorAssignments];
  if(!issues.length){const v=validateVideoWall(videoWall,screens.map(s=>s.id));if(!v.ok)issues.push(v.reason);else{const sc=validateWallScreens(screens,v.value);if(!sc.ok)issues.push(sc.reason);}}
  return {screens,videoWall,displayMode:mixedDpi?'windows':'span',assignments,expectedAudienceCount:expected,geometryStatus,measurementSource:saved?.measurementSource,issues,warnings,canApply:issues.length===0};
}
