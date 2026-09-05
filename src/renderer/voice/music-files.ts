import type {AmbientCue,Phase} from '../../shared/types';
import {activeMusic,musicOffset} from '../../shared/music';
import type {Logger} from '../log';

type Playing={source:AudioBufferSourceNode;gain:GainNode;started:number;offset:number;rate:number};
/** Buffer sources feed the ambient duck bus. The Player supplies its server-disciplined phase clock. */
export function createMusicFiles(ctx:AudioContext,destination:AudioNode,baseUrl:string,log:Logger){
  const buffers=new Map<string,AudioBuffer>(),pending=new Set<string>(),failed=new Set<string>(),playing=new Map<string,Playing>();
  let disposed=false;
  const stop=(id:string)=>{const p=playing.get(id);if(!p)return;try{p.source.stop();p.source.disconnect();p.gain.disconnect();}catch{}playing.delete(id);};
  async function load(c:AmbientCue){
    const s=c.source;if(!s||buffers.has(s.file)||pending.has(s.file)||failed.has(s.file))return;
    pending.add(s.file);
    try{const response=await fetch(new URL(s.file,baseUrl));if(!response.ok)throw Error(`HTTP${response.status}`);const bytes=await response.arrayBuffer();
      const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
      if(digest!==s.sha256)throw Error('hash mismatch');const buffer=await ctx.decodeAudioData(bytes);if(!disposed)buffers.set(s.file,buffer);
    }catch(e){failed.add(s.file);log('warn',`music ${c.id} unavailable: ${String(e)}`);}finally{pending.delete(s.file);}
  }
  return {
    preload(cues:readonly AmbientCue[]){for(const c of cues)void load(c);},
    sync(cues:readonly AmbientCue[],phase:Phase|null,time:number,rate:number,enabled:boolean){
      const active=enabled&&rate>0?activeMusic(cues,phase,time):[];
      for(const id of playing.keys())if(!active.some(c=>c.id===id))stop(id);
      for(const c of active){const s=c.source!,b=buffers.get(s.file);if(!b){void load(c);continue;}
        const offset=musicOffset(c,time,b.duration);if(!s.loop&&offset>=b.duration){stop(c.id);continue;}
        let p=playing.get(c.id);
        if(p){let expected=p.offset+(ctx.currentTime-p.started)*p.rate;if(s.loop)expected%=b.duration;const drift=Math.abs(expected-offset);if(drift>.12||Math.abs(p.rate-rate)>.0005){stop(c.id);p=undefined;}}
        if(!p){const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=b;source.loop=s.loop;source.playbackRate.value=rate;source.connect(gain).connect(destination);p={source,gain,started:ctx.currentTime,offset,rate};playing.set(c.id,p);source.start(0,offset);source.stop(ctx.currentTime+(s.windowSec-(time-c.at))/rate);}
        const elapsed=time-c.at,remaining=s.windowSec-elapsed,level=10**(s.gainDb/20)*Math.min(1,elapsed/Math.max(.001,c.fadeSec??.5),s.fadeOutSec?remaining/s.fadeOutSec:1);
        p.gain.gain.value=Math.max(0,level);
      }
    },
    status(){return {loaded:[...buffers.keys()],failed:[...failed],active:[...playing.keys()]};},
    dispose(){disposed=true;for(const id of playing.keys())stop(id);buffers.clear();}
  };
}
