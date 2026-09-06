import type {MissionSnapshot} from '../../shared/mission';
import {EXPERIENCE_PRACTICE,FINALE_CHOICES,type NarratorManifest} from '../../shared/experience';
import {createExodusBrand} from './brand';
import {hasChildIllustrations,illustrationPath} from '../../web/shared/illustrations';
import {createCrewStage} from '../../web/shared/crew-stage';
import {crewRelay,CREW_POSTS,CREW_PATHS} from '../../web/shared/crew-relay';
import {crewCharacter,characterPortrait} from '../../shared/crew';

/** Narration uses the server instance and clock; only the configured audio owner plays it. */
export function createExperienceOverlay(parent:HTMLElement,options:{audio:boolean;visual:boolean;baseUrl:string;volume:number;outputDeviceId?:string;clockOffset:()=>number;onNarration:(instance:string,status:'ended'|'error')=>void;onAudioActive?:(active:boolean)=>void}){
  const box=document.createElement('section');box.className='experience-tv';box.hidden=true;parent.append(box);
  const brand=document.createElement('div');brand.className='experience-brand';brand.append(createExodusBrand());box.append(brand);
  const homecoming=document.createElement('img');homecoming.className='experience-homecoming';homecoming.alt='';homecoming.decoding='async';homecoming.draggable=false;homecoming.hidden=true;homecoming.setAttribute('aria-hidden','true');
  homecoming.addEventListener('error',()=>{homecoming.style.display='none';},{once:true});box.append(homecoming);
  const kicker=document.createElement('p'),title=document.createElement('h1'),copy=document.createElement('p'),sky=document.createElement('div'),foot=document.createElement('p'),subtitle=document.createElement('p'),world=document.createElement('div');
  kicker.className='experience-kicker';copy.className='experience-copy';sky.className='experience-sky';foot.className='experience-foot';subtitle.className='experience-narration';world.className='crew-world';world.setAttribute('role','img');subtitle.setAttribute('aria-live','polite');box.append(kicker,title,copy,world,sky,foot,subtitle);
  const crew=createCrewStage(box);
  const audio=new Audio();audio.preload='auto';audio.volume=Math.max(0,Math.min(1,options.volume));
  audio.addEventListener('playing',()=>options.onAudioActive?.(true));
  for(const event of ['pause','ended','error','emptied'])audio.addEventListener(event,()=>options.onAudioActive?.(false));
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
    const boarding=!!e?.crew?.open&&s.state.state==='idle';
    box.hidden=!options.visual||(boarding&&!e?.participants.length)||(!e?.active&&!final&&!boarding);if(box.hidden){crew.clear();return;}
    box.classList.toggle('experience-boarding',boarding);
    const showHomecoming=final&&hasChildIllustrations(s.scenarioId)&&!s.accessibility.reducedStimuli&&s.accessibility.showVisualGuidance!==false;
    homecoming.hidden=!showHomecoming;
    if(showHomecoming&&!homecoming.getAttribute('src'))homecoming.src=illustrationPath('homecoming-v1','renderer');
    const relay=crewRelay(s),confirmed=relay.seats.filter(seat=>seat.state==='confirmed');
    box.dataset.quiet=String(s.accessibility.reducedStimuli);box.dataset.motion=String(s.accessibility.reducedMotion);
    world.setAttribute('aria-label',`Nava echipajului. ${relay.seats.filter(seat=>seat.state!=='absent').length} locuri ocupate. ${confirmed.map(seat=>`${seat.id}: ${seat.label}`).join('. ')||'Așteptăm prima lumină.'}`);
    crew.update(relay,[{element:world}],{reduced:s.accessibility.reducedMotion||s.accessibility.reducedStimuli,paused:s.suspended||!!e?.paused,flat:s.accessibility.showVisualGuidance===false||s.accessibility.reducedStimuli});
    const next=JSON.stringify([s.runId,e,s.scenarioId,s.suspended,s.accessibility]);if(next===key)return;key=next;
    box.classList.toggle('experience-final',final);box.classList.toggle('experience-paused',!!e?.paused);
    kicker.textContent=final?'EXODUS7 · AM CONSTRUIT ÎMPREUNĂ':'BUN VENIT LA BORD · ECHIPAJUL PRINDE VIAȚĂ';
    const step=e!.step;
    title.textContent=final?'Nava poartă ceva de la fiecare':step==='touch'?'Călătoria începe cu tine':step==='practice'?EXPERIENCE_PRACTICE[s.scenarioId].title:step==='cooperate'?'Aprindem nava împreună':'Acum suntem un echipaj';
    copy.textContent=final?'Alege un simbol pe tabletă și apasă „Trimite simbolul meu”. Îl vei regăsi aici, la locul tău.':step==='touch'?'Apasă „Salut, navă!” pe tabletă. Caută numărul și litera ta pe navă.':step==='practice'?EXPERIENCE_PRACTICE[s.scenarioId].instruction:step==='cooperate'?'Fiecare aprinde lumina sa. Puteți apăsa pe rând.':'Comenzile răspund. Priviți înainte: Căpitanul preia călătoria.';
    if(boarding){kicker.textContent='EXODUS7 · ÎMBARCAREA A ÎNCEPUT';title.textContent='Eroii acestei călătorii sunteți voi';copy.textContent='Alege un personaj pe jumătatea ta de tabletă și confirmă. Îl vei vedea aici, în echipaj.';}
    if(!final&&!boarding&&step==='touch')copy.textContent='Apasă „Salut, navă!” pe tabletă. Caută personajul tău aici: culoarea lui îți arată lumina de pe navă.';
    if(final)copy.textContent='Alege un simbol și trimite-l de pe tabletă. Va apărea lângă personajul tău și pe navă.';
    sky.replaceChildren();sky.classList.toggle('experience-crew-finale',final);sky.dataset.count=String(e!.participants.length);sky.style.setProperty('--crew-final-columns',String(Math.min(5,Math.max(1,e!.participants.length))));const done=boarding?e!.participants:final?Object.keys(e!.finale):step==='touch'?e!.touched:step==='practice'?e!.practiced:e!.linked;
    const epoch=relay.epoch;if(epoch!==visualEpoch){visualEpoch=epoch;seen=new Set(done);}
    let contributions=0;
    for(let i=0;i<5;i++){
      const post=document.createElement('div');post.className='experience-star-post';const label=document.createElement('span');label.textContent=`${i+1} · ${CREW_POSTS[i]}`;post.append(label);
      for(const zone of ['A','B']){
        const id=`${i+1}${zone}`,seat=document.createElement('div'),orb=document.createElement('b'),caption=document.createElement('span');seat.className='experience-seat';
        const present=e!.participants.includes(id),character=crewCharacter(e!.crew?.characters[id]),observed=final?e!.finale[id]==='observe':e!.observed.includes(id);
        if(final&&!present)continue;
        const choice=FINALE_CHOICES[s.scenarioId].options.find(o=>o.value===e!.finale[id]);if(choice&&present)contributions++;
        seat.dataset.state=!present?'absent':observed?'observing':done.includes(id)?'done':'waiting';
        if(done.includes(id)&&!seen.has(id)&&!observed&&present){seat.classList.add('experience-new');seen.add(id);}
        if(character&&present){const image=document.createElement('img');image.src=characterPortrait(character.id,true);image.alt=character.name;image.className='experience-crew-portrait';orb.append(image);seat.style.setProperty('--crew-color',character.color);}else orb.textContent=zone;
        caption.textContent=!present?'Loc liber':boarding?`${character?.name??id} · La bord`:observed?'Privește':final?(choice?.label??'Alege pe tabletă'):done.includes(id)?`${character?.name??id} · Gata`:`${character?.name??id} · În ritmul tău`;
        seat.append(orb);
        if(final){
          const identity=document.createElement('strong');identity.className='experience-crew-name';identity.textContent=character?.name??`Explorator ${id}`;seat.append(identity);
          const contribution=document.createElement('div');contribution.className='experience-crew-contribution';
          if(choice){const symbol=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS('http://www.w3.org/2000/svg','path');symbol.setAttribute('viewBox','-52 -52 104 104');symbol.setAttribute('aria-hidden','true');symbol.classList.add('experience-crew-symbol');path.setAttribute('d',CREW_PATHS[relay.seats.find(item=>item.id===id)!.mark]);path.setAttribute('transform','scale(1,-1)');symbol.append(path);contribution.append(symbol);}
          contribution.append(caption);seat.append(contribution);
          const location=document.createElement('small');location.className='experience-crew-location';location.textContent=`La bord · ${id}`;seat.append(location);sky.append(seat);
        }else{seat.append(caption);post.append(seat);}
      }if(!final)sky.append(post);
    }
    foot.textContent=e!.paused||s.suspended?'Luăm o pauză. Continuăm împreună.':final?`${contributions} ${contributions===1?'simbol primit':'simboluri primite'} · Fiecare rămâne în jurnalul echipajului.`:'Un loc pentru fiecare. Poți participa sau poți privi.';
    if(boarding)foot.textContent=e!.participants.length?`${e!.participants.length} ${e!.participants.length===1?'explorator confirmat':'exploratori confirmați'} · Ghidul pornește călătoria când sunteți pregătiți.`:'Primul explorator poate urca la bord. Aventura merge și cu un singur participant.';
  }
  return{element:box,update,dispose(){disposed=true;stop();crew.dispose();window.removeEventListener('pointerdown',unlock);window.removeEventListener('keydown',unlock);box.remove();}};
}
