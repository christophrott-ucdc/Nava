export type RobotMode='screen'|'simulator';
export type UpdateFeed={provider:'disabled'}|{provider:'github';owner:string;repo:string}|{provider:'generic';url:string};
export interface IntegrationSettings {version:1;robotMode:RobotMode;updates:UpdateFeed;contentUrl?:string;}
export const DEFAULT_INTEGRATIONS:IntegrationSettings={version:1,robotMode:'screen',updates:{provider:'disabled'}};
export function integrationSettings(value:unknown):IntegrationSettings {
  const v=value as IntegrationSettings;
  if(!v||v.version!==1||!['screen','simulator'].includes(v.robotMode)||!v.updates)throw Error('Configurație de integrare invalidă.');
  const f=v.updates;let updates:UpdateFeed;
  if(f.provider==='disabled')updates={provider:'disabled'};
  else if(f.provider==='github'&&/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(f.owner)&&/^[a-zA-Z0-9_.-]{1,100}$/.test(f.repo)&&f.repo!=='.'&&f.repo!=='..')updates={provider:'github',owner:f.owner,repo:f.repo};
  else if(f.provider==='generic'){
    const u=new URL(f.url);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw Error('Sursa cere HTTPS, fără credențiale sau query în URL.');
    updates={provider:'generic',url:u.href.endsWith('/')?u.href:u.href+'/'};
  }else throw Error('Sursă de actualizare invalidă.');
  let contentUrl:string|undefined;if(v.contentUrl){const u=new URL(v.contentUrl);if(u.protocol!=='https:'||u.username||u.password||u.hash)throw Error('Manifestul multimedia cere HTTPS fără credențiale.');contentUrl=u.href;}
  return {version:1,robotMode:v.robotMode,updates,...(contentUrl?{contentUrl}:{})};
}
export interface AppUpdateStatus {state:'disabled'|'idle'|'checking'|'available'|'downloading'|'downloaded'|'installing'|'error';version:string;availableVersion?:string;percent?:number;message:string;installSupported:boolean;}
export interface AppUpdatePort {
  status():AppUpdateStatus;
  configure(feed:UpdateFeed):Promise<void>;
  check():Promise<void>;
  download():Promise<void>;
  install():void;
}
/** Local narration contract for H2 EDU; physical audio API compatibility is not yet verified. */
export interface RobotNarration {
  instanceId:string;runId:string;timelineEpoch:number;contentHash:string;
  cueId:string;speaker:'AVATAR_AI';phase:'preshow'|'play'|'epilogue';at:number;
  text:string;language:string;durationMs:number|null;
  asset:{cueId:string;contentHash:string;language:string};
}
export interface RobotDriver {
  readonly kind:'simulator'|'unitree-h2-edu';
  prepare(contentHash:string,clips:RobotNarration['asset'][]):Promise<void>;
  speak(event:RobotNarration):void;
  stop(reason:string):void;
}
