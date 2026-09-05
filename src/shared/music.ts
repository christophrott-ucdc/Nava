import type {AmbientCue,Phase,ShowFile} from './types';
export interface MusicTrack {
  id:string;file:string;sceneId:string;phase:Phase;startSec:number;durationSec:number;windowSec:number;
  loop:boolean;fadeInSec:number;fadeOutSec:number;gainDb:number;sha256:string;promptRef:string;
  sourceOffsetSec?:number;trigger?:'thanks';needsReview:boolean;
}
export interface MusicManifest {version:1;tracks:MusicTrack[];duckDb:number;duckAttackSec:number;duckReleaseSec:number;silence:{phase:Phase;startSec:number;endSec:number}}
export function musicCues(manifest:MusicManifest,show:ShowFile):AmbientCue[]{
  return manifest.tracks.flatMap(t=>{
    const at=t.trigger==='thanks'?show.cues.find(c=>c.kind==='tablet'&&c.phase==='epilogue'&&c.interaction.type==='thanks')?.at:t.startSec;
    if(at===undefined)return [];
    const end=Math.max(...show.scenes.filter(s=>s.phase===t.phase).map(s=>s.end));
    return [{id:`music-${t.id}`,kind:'ambient' as const,action:'start' as const,phase:t.phase,at,fadeSec:t.fadeInSec,source:{type:'file' as const,file:t.file,sha256:t.sha256,durationSec:t.durationSec,windowSec:Math.min(t.windowSec,end-at),offsetSec:t.sourceOffsetSec,loop:t.loop,fadeOutSec:t.fadeOutSec,gainDb:t.gainDb,trigger:t.trigger}}];
  });
}
export function activeMusic(cues:readonly AmbientCue[],phase:Phase|null,time:number):AmbientCue[]{return cues.filter(c=>c.source&&c.phase===phase&&time>=c.at&&time<c.at+c.source.windowSec);}
export function musicOffset(cue:AmbientCue,time:number,bufferDuration:number):number{const n=Math.max(0,time-cue.at)+(cue.source?.offsetSec??0);return cue.source?.loop?n%bufferDuration:n;}
/** Exact zero throughout the dramatic pause; begin the release before M05 ends. */
export function musicSilenceGain(phase:Phase|null,time:number):number{return phase==='play'&&time>=231.5&&time<246?Math.max(0,Math.min(1,(232-time)/.5)):1;}
