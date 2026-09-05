import type {MissionSnapshot} from '../../shared/mission';
import {EXPERIENCE_PRACTICE,FINALE_CHOICES,type NarratorManifest} from '../../shared/experience';

/** Narration uses the server instance and clock; only the configured audio owner plays it. */
export function createExperienceOverlay(parent:HTMLElement,options:{audio:boolean;visual:boolean;baseUrl:string;volume:number;outputDeviceId?:string;clockOffset:()=>number;onNarration:(instance:string,status:'ended'|'error')=>void}){
  const box=document.createElement('section');box.className='experience-tv';box.hidden=true;parent.append(box);
  const kicker=document.createElement('p'),title=document.createElement('h1'),copy=document.createElement('p'),sky=document.createElement('div'),foot=document.createElement('p'),subtitle=document.createElement('p'),constellation=document.createElement('div');
  kicker.className='experience-kicker';copy.className='experience-copy';sky.className='experience-sky';foot.className='experience-foot';subtitle.className='experience-narration';constellation.className='experience-constellation';subtitle.setAttribute('aria-live','polite');box.append(kicker,title,copy,constellation,sky,foot,subtitle);
  const audio=new Audio();audio.preload='auto';audio.volume=Math.max(0,Math.min(1,options.volume));
  const routed=audio as HTMLAudioElement&{setSinkId?:(id:string)=>Promise<void>};if(options.audio&&options.outputDeviceId&&routed.setSinkId)void routed.setSinkId(options.outputDeviceId).catch(()=>{});
  let manifest:NarratorManifest|null=null,last:MissionSnapshot|null=null,instance='',completed='',paused=false,key='',generation=0,failed=false,disposed=false;
  let visualEpoch='',seen=new Set<string>();
  const base=new URL('/assets/experience/voice/ro/',options.baseUrl).href;
  async function loadManifest(){try{const r=await fetch(new URL('/api/experience/voices',options.baseUrl));if(r.ok)manifest=await r.json();if(last&&manifest)update(last);}catch{}if(!disposed&&!manifest)setTimeout(()=>void loadManifest(),3000);}void loadManifest();
  function stop(){generation++;audio.pause();audio.removeAttribute('src');audio.load();instance='';paused=false;failed=false;}
  function syncAudio(s:MissionSnapshot){
    const e=s.experience,n=e?.narration,clip=n&&manifest?.clips[n.id];
    subtitle.textContent=clip?.text??'';
    if(!options.audio)return;
    if(!e||!n||(!e.active&&n.id!=='handoff'&&!(n.id==='finale'&&s.state.state==='ended'))||!clip){if(instance)stop();return;}
    const id=`${s.runId}:${n.instance}`;
    if(id===completed)return;
    const elapsed=Math.max(0,(Date.now()+options.clockOffset()-n.startedAt)/1000);
    if(id!==instance){
      stop();instance=id;const mine=generation;audio.src=new URL(clip.file,base).href;
      audio.onloadedmetadata=()=>{if(mine!==generation||!last)return;const current=last.experience;if(current?.narration?.instance!==n.instance)return;const seek=Math.max(0,(Date.now()+options.clockOffset()-current.narration.startedAt)/1000);if(seek>=clip.durationSec){completed=id;options.onNarration(n.instance,'ended');return;}audio.currentTime=seek;if(!current.paused)void audio.play().catch(()=>{failed=true;options.onNarration(n.instance,'error');});};
      audio.onended=()=>{if(mine!==generation)return;completed=id;options.onNarration(n.instance,'ended');};audio.onerror=()=>{if(mine===generation){failed=true;options.onNarration(n.instance,'error');}};audio.load();
    }
    if(e.paused){audio.pause();paused=true;}else if(paused){paused=false;audio.currentTime=Math.min(elapsed,clip.durationSec);void audio.play().catch(()=>{failed=true;options.onNarration(n.instance,'error');});}
  }
  const unlock=()=>{if(failed&&last&&!last.experience?.paused){failed=false;void audio.play().catch(()=>{failed=true;});}};window.addEventListener('pointerdown',unlock);window.addEventListener('keydown',unlock);
  function update(s:MissionSnapshot){
    last=s;syncAudio(s);const e=s.experience,final=!!e?.finaleActive;
    box.hidden=!options.visual||(!e?.active&&!final);if(box.hidden)return;
    const next=JSON.stringify([s.runId,e,s.scenarioId]);if(next===key)return;key=next;
    box.classList.toggle('experience-final',final);box.classList.toggle('experience-paused',!!e?.paused);
    kicker.textContent=final?'A PATRA LUME · AM FOST AICI':'BUN VENIT LA BORD · NAVA VĂ RECUNOAȘTE';
    const step=e!.step;
    title.textContent=final?FINALE_CHOICES[s.scenarioId].title:step==='touch'?'O lumină pentru fiecare':step==='practice'?EXPERIENCE_PRACTICE[s.scenarioId].title:step==='cooperate'?'Împreună, prindem lumină':'Acum suntem un echipaj';
    copy.textContent=final?'Alegeți pe tablete. Fiecare gând își găsește locul în constelația noastră.':step==='touch'?'Atinge lumina de pe jumătatea ta de ecran.':step==='practice'?EXPERIENCE_PRACTICE[s.scenarioId].instruction:step==='cooperate'?'Confirmați fiecare legătura. Priviți cum răspunde nava.':'Comenzile răspund. Călătoria poate începe.';
    sky.replaceChildren();const done=final?Object.keys(e!.finale):step==='touch'?e!.touched:step==='practice'?e!.practiced:e!.linked;
    const epoch=`${s.runId}:${final?'final':step}`;if(epoch!==visualEpoch){visualEpoch=epoch;seen=new Set(done);}
    let contributions=0;
    for(let i=0;i<5;i++){
      const post=document.createElement('div');post.className='experience-star-post';const label=document.createElement('span');label.textContent=`POSTUL ${i+1}`;post.append(label);
      for(const zone of ['A','B']){const id=`${i+1}${zone}`,seat=document.createElement('div'),orb=document.createElement('b'),caption=document.createElement('span');seat.className='experience-seat';const present=e!.participants.includes(id),observed=final?e!.finale[id]==='observe':e!.observed.includes(id);const choice=FINALE_CHOICES[s.scenarioId].options.find(o=>o.value===e!.finale[id]);if(choice)contributions++;seat.dataset.state=!present?'absent':observed?'observing':done.includes(id)?'done':'waiting';if(done.includes(id)&&!seen.has(id)&&!observed){seat.classList.add('experience-new');seen.add(id);}orb.textContent=zone;caption.textContent=final?(choice?.label??(observed?'A ales să privească':present?'Un gând în devenire':'Loc liber')):!present?'Loc liber':observed?'Privește':done.includes(id)?'Confirmat':'În ritmul tău';seat.append(orb,caption);post.append(seat);}sky.append(post);
    }
    foot.textContent=e!.paused?'Luăm o pauză. Continuăm împreună.':final?`${contributions} ${contributions===1?'contribuție confirmată':'contribuții confirmate'} · O amintire comună`:'Fiecare are locul său. Poți participa sau poți privi.';
    constellation.hidden=!final;
    if(final){
      const palette:Record<string,string>= {'age-5-10':'#ffe599','age-10-15':'#88e4f1','age-15-18':'#c5acff',adults:'#f5c7a0','legacy-v3':'#c7f7cf'},color=palette[s.scenarioId];
      const points=Array.from({length:10},(_,i)=>{const x=80+i*76,y=75+Math.sin(i*1.1)*32,id=`${Math.floor(i/2)+1}${i%2?'B':'A'}`,confirmed=FINALE_CHOICES[s.scenarioId].options.some(o=>o.value===e!.finale[id]);return {x,y,confirmed,id};});
      let paths='';for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];if(a.confirmed&&b.confirmed)paths+=`<path d="M${a.x} ${a.y}L${b.x} ${b.y}" stroke="${color}" stroke-width="2"/>`;}
      constellation.innerHTML=`<svg viewBox="0 0 850 155" role="img" aria-label="Constelația contribuțiilor: ${contributions} stele confirmate">${paths}${points.map(p=>p.confirmed?`<circle cx="${p.x}" cy="${p.y}" r="24" fill="${color}" opacity=".1"/><path d="M${p.x} ${p.y-13}L${p.x+4} ${p.y-4}L${p.x+13} ${p.y}L${p.x+4} ${p.y+4}L${p.x} ${p.y+13}L${p.x-4} ${p.y+4}L${p.x-13} ${p.y}L${p.x-4} ${p.y-4}Z" fill="${color}"/><text x="${p.x}" y="${p.y+35}" fill="#d7e5ef" font-size="11" text-anchor="middle">${p.id}</text>`:`<circle cx="${p.x}" cy="${p.y}" r="5" fill="none" stroke="#b7c9d54d"/>`).join('')}</svg>`;
    }
  }
  return{element:box,update,dispose(){disposed=true;stop();window.removeEventListener('pointerdown',unlock);window.removeEventListener('keydown',unlock);box.remove();}};
}
