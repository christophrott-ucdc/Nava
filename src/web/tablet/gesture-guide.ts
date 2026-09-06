import type {PlayView} from '@shared/play-engine';

type Gesture={selector:string;end?:string;kind:'tap'|'drag'|'rotate';text:string};
function gestureFor(v:PlayView):Gesture{
  if(v.kind==='light')return v.stage===1?{selector:'[data-play^="play:match:"]',kind:'tap',text:'Atinge o piesă. Compară-i conturul cu forma de sus.'}:v.stage===2?{selector:'[data-play="play:rotate"]',end:'[data-play="play:fit"]',kind:'drag',text:'Atinge piesa pentru a o roti. Apoi trage-o în contur.'}:{selector:'[data-play="play:wire:0"]',kind:'rotate',text:'Atinge fiecare cot ca să-l rotești. Unește capetele drumului.'};
  if(v.kind==='signal')return v.stage===1?{selector:'[data-play="play:tune"]',kind:'drag',text:'Ține de antenă și mișc-o spre stânga sau dreapta.'}:v.stage===2?{selector:'[data-play="draft:beat:0"]',end:'[data-play="draft:beat:1"]',kind:'drag',text:'Trage o piesă pe alt loc. Apoi apasă butonul de trimitere.'}:{selector:'[data-play="draft:record:0"]',end:'[data-play^="play:conclude:"]',kind:'drag',text:'Trage o înregistrare peste explicația aleasă. Compară întâi rezultatele.'};
  if(v.kind==='pilot')return v.stage===2?{selector:'.older-test-switches button',kind:'tap',text:'Apasă câte o probă. Urmărește ce face nava în fiecare situație.'}:{selector:'.older-lever-range',kind:'drag',text:'Glisează maneta între cele două reguli. Poți apăsa și etichetele.'};
  return v.stage===1?{selector:'.older-scan-window',kind:'drag',text:'Trage fereastra peste zona cercetată. Alege tipul scanării, apoi pornește-o.'}:v.stage===2?{selector:'.older-shutter-handle',kind:'drag',text:'Trage mânerul obturatorului sau folosește butoanele de sub sondă.'}:{selector:'.older-record-card[data-available="true"]',end:'.older-capsule',kind:'drag',text:'Trage documentul spre capsulă. Poți și să-l selectezi, apoi să apeși Trimite.'};
}

/** A finite pointer demonstration anchored to the real controls; never dispatches game input. */
export function createGestureGuide(host:HTMLElement,toolbar:HTMLElement){
  const button=document.createElement('button');button.type='button';button.className='gesture-help';button.textContent='Arată-mi';toolbar.append(button);
  const layer=document.createElement('div');layer.className='gesture-guide';layer.hidden=true;layer.setAttribute('aria-hidden','true');
  const cursor=document.createElement('span');cursor.className='gesture-cursor';cursor.textContent='☝';layer.append(cursor);
  const caption=document.createElement('p');caption.className='gesture-caption';caption.hidden=true;caption.setAttribute('role','status');toolbar.append(caption);
  let current:PlayView|undefined,blocked=true,reduced=false,timer:ReturnType<typeof setTimeout>|undefined,frame=0,animation:Animation|undefined,active=false;
  const seen=new Set<string>(),abort=new AbortController();
  const hide=()=>{clearTimeout(timer);cancelAnimationFrame(frame);animation?.cancel();animation=undefined;layer.hidden=true;caption.hidden=true;active=false;};
  function show(){
    if(!current||blocked||document.hidden)return;
    hide();const spec=gestureFor(current),target=host.querySelector(spec.selector);
    caption.textContent=spec.text;caption.hidden=false;
    if(!target){timer=setTimeout(hide,6000);return;}
    host.append(layer);layer.hidden=false;active=true;
    const base=host.getBoundingClientRect(),rect=target.getBoundingClientRect(),destination=spec.end?host.querySelector(spec.end)?.getBoundingClientRect():undefined;
    const x=rect.left-base.left+rect.width/2,y=rect.top-base.top+rect.height/2;
    const dx=destination?destination.left+destination.width/2-(rect.left+rect.width/2):Math.min(45,rect.width*.3),dy=destination?destination.top+destination.height/2-(rect.top+rect.height/2):0;
    cursor.style.left=`${x}px`;cursor.style.top=`${y}px`;
    if(!reduced){const frames=spec.kind==='tap'?[{transform:'scale(1.15)',opacity:.7},{transform:'scale(.88)',opacity:1},{transform:'scale(1.15)',opacity:.7}]:spec.kind==='rotate'?[{transform:'rotate(-30deg)'},{transform:'rotate(40deg)'},{transform:'rotate(-30deg)'}]:[{transform:'translate(0,0)',opacity:.5},{transform:`translate(${dx}px,${dy}px)`,opacity:1},{transform:`translate(${dx}px,${dy}px)`,opacity:.3}];animation=cursor.animate(frames,{duration:1400,iterations:2,easing:'ease-in-out'});}
    timer=setTimeout(hide,4200);
  }
  button.addEventListener('click',show,{signal:abort.signal});
  host.addEventListener('pointerdown',hide,{capture:true,signal:abort.signal});host.addEventListener('keydown',hide,{capture:true,signal:abort.signal});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)hide();},{signal:abort.signal});
  return {update(v:PlayView,settings:{blocked:boolean;reduced:boolean}){
    const changed=current?.kind!==v.kind||current?.stage!==v.stage;current=v;blocked=settings.blocked;reduced=settings.reduced;button.disabled=blocked;button.hidden=v.observed;
    if(changed||blocked||v.solved||v.observed)hide();else if(active&&reduced)animation?.cancel();
    const key=`${v.kind}:${v.stage}`;
    if(!blocked&&!v.solved&&!v.observed&&!seen.has(key)){seen.add(key);frame=requestAnimationFrame(show);}
  },dispose(){hide();abort.abort();button.remove();caption.remove();layer.remove();}};
}
