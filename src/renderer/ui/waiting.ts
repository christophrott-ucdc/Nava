import {createExodusBrand} from './brand';

/** Local, silent scenery. Never starts a session or advances the show clock. */
export function createWaitingScreen(parent:HTMLElement){
  const root=document.createElement('section');root.className='exodus-waiting';root.hidden=true;root.setAttribute('aria-label','EXODUS7 · În așteptarea echipajului');
  const stars=document.createElement('div');stars.className='waiting-stars';stars.setAttribute('aria-hidden','true');
  for(let i=0;i<64;i++){const star=document.createElement('i');star.style.left=`${(i*37.71)%100}%`;star.style.top=`${(i*23.17)%100}%`;star.style.setProperty('--delay',`${-(i%13)}s`);star.style.setProperty('--size',`${i%4===0?3:1.5}px`);stars.append(star);}
  const planet=document.createElement('div');planet.className='waiting-planet';planet.setAttribute('aria-hidden','true');
  const orbit=document.createElement('div');orbit.className='waiting-orbit';orbit.setAttribute('aria-hidden','true');
  const ship=document.createElement('img');ship.className='waiting-ship';ship.src='shared/illustrations/exodus7/ship-boarding-v1.png';ship.alt='';ship.draggable=false;ship.addEventListener('error',()=>ship.remove(),{once:true});
  const content=document.createElement('div');content.className='waiting-content';
  const eyebrow=document.createElement('p');eyebrow.className='waiting-eyebrow';eyebrow.textContent='O ÎNTREAGĂ LUME NE AȘTEAPTĂ';
  const logo=createExodusBrand();logo.classList.add('waiting-logo');
  const title=document.createElement('h1');title.textContent='Următoarea aventură începe cu tine.';
  const note=document.createElement('p');note.className='waiting-note';note.textContent='Alege un personaj pe tabletă. Ghidul pornește călătoria când echipajul este pregătit.';
  const status=document.createElement('p');status.className='waiting-status';status.textContent='În așteptarea echipajului';
  content.append(eyebrow,logo,title,note,status);root.append(stars,planet,orbit,ship,content);parent.append(root);
  const visibility=()=>root.dataset.paused=String(document.hidden);document.addEventListener('visibilitychange',visibility);visibility();
  return {element:root,update(active:boolean,quiet=false,registration=true){root.hidden=!active;root.dataset.quiet=String(quiet);note.textContent=registration?'Alege un personaj pe tabletă. Ghidul pornește călătoria când echipajul este pregătit.':'Așază-te comod. Ghidul te va invita la bord.';},dispose(){document.removeEventListener('visibilitychange',visibility);root.remove();}};
}
