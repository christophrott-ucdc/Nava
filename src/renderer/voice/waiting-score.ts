import type {Logger} from '../log';

/** Optional reception score: one decoded buffer, a natural ending and two silent seconds. */
export function createWaitingScore(ctx:AudioContext,destination:AudioNode,baseUrl:string,log:Logger){
  const LEVEL=10**(-18/20),FADE=3,GAP=2;
  let buffer:AudioBuffer|null=null,loading=false,unavailable=false,disposed=false;
  let wanted=false,run='',position=0,started=0,source:AudioBufferSourceNode|null=null,gain:GainNode|null=null;
  let gapTimer:number|undefined,gapRemaining=0,gapStarted=0;
  const abort=new AbortController();
  function pause(){
    if(gapTimer!==undefined){window.clearTimeout(gapTimer);gapTimer=undefined;gapRemaining=Math.max(0,gapRemaining-(ctx.currentTime-gapStarted));}
    if(source){position=Math.min(buffer?.duration??Infinity,position+ctx.currentTime-started);source.onended=null;try{source.stop();source.disconnect();gain?.disconnect();}catch{}source=null;gain=null;}
  }
  function play(){
    if(!wanted||disposed||source||gapTimer!==undefined||!buffer)return;
    if(gapRemaining>0){gapStarted=ctx.currentTime;gapTimer=window.setTimeout(()=>{gapTimer=undefined;gapRemaining=Math.max(0,gapRemaining-(ctx.currentTime-gapStarted));play();},gapRemaining*1000);return;}
    if(position>=buffer.duration)position=0;
    const remaining=buffer.duration-position,fade=Math.min(FADE,remaining/2),now=ctx.currentTime;
    source=ctx.createBufferSource();gain=ctx.createGain();source.buffer=buffer;source.connect(gain).connect(destination);
    gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(LEVEL,now+fade);
    gain.gain.setValueAtTime(LEVEL,now+remaining-fade);gain.gain.linearRampToValueAtTime(0,now+remaining);
    const playing=source,node=gain;started=now;
    source.onended=()=>{if(source!==playing)return;playing.disconnect();node.disconnect();source=null;gain=null;position=0;gapRemaining=GAP;play();};
    source.start(now,position);
  }
  async function load(){
    if(loading||unavailable||buffer||disposed)return;loading=true;
    try{
      const response=await fetch(new URL('/api/music/waiting',baseUrl),{signal:abort.signal});
      if(!response.ok)throw Error(`metadata HTTP ${response.status}`);
      const info=await response.json() as {file?:unknown;sha256?:unknown};
      if(typeof info.file!=='string'||!/^[a-zA-Z0-9_-]+\.mp3$/.test(info.file)||typeof info.sha256!=='string'||!/^[a-f0-9]{64}$/i.test(info.sha256))throw Error('invalid metadata');
      const audio=await fetch(new URL(info.file,baseUrl),{signal:abort.signal});if(!audio.ok)throw Error(`audio HTTP ${audio.status}`);
      const bytes=await audio.arrayBuffer();
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
      if(hash!==info.sha256.toLowerCase())throw Error('hash mismatch');
      const decoded=await ctx.decodeAudioData(bytes);if(disposed)return;
      if(!Number.isFinite(decoded.duration)||decoded.duration<=0)throw Error('empty audio');
      buffer=decoded;play();
    }catch(error){if(!disposed){unavailable=true;log('warn',`waiting score unavailable (show unaffected): ${String(error)}`);}}finally{loading=false;}
  }
  return {
    sync(runId:string,active:boolean){
      if(run!==runId){pause();run=runId;position=0;gapRemaining=0;}
      wanted=active;
      if(!active){pause();return;}void load();play();
    },
    dispose(){disposed=true;wanted=false;abort.abort();pause();buffer=null;},
  };
}
