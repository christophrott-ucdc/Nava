import {createFlightDeck} from '../../web/shared/flight-deck';
import type {MissionSnapshot} from '../../shared/mission';
/** Placed inside the wall's center focus wrapper, not stretched across five TVs. */
export function createFlightNavigation(host:HTMLElement,enabled:boolean,clock:()=>number){
 const element=document.createElement('aside');element.className='flight-tv';element.hidden=true;host.append(element);
 const deck=createFlightDeck(element,false);let snapshot:MissionSnapshot|undefined;
 const timer=window.setInterval(()=>{
   const show=enabled&&snapshot&&['playing','paused'].includes(snapshot.state.state)&&!snapshot.experience?.active&&clock()>=0;
   element.hidden=!show;document.body.classList.toggle('flight-nav-active',!!show);
   if(show&&!document.hidden)deck.update(snapshot!.state,clock(),false,snapshot!.accessibility.reducedMotion||snapshot!.accessibility.reducedStimuli);
 },100);
 return {element,update(s:MissionSnapshot){snapshot=s;},dispose(){clearInterval(timer);deck.dispose();element.remove();document.body.classList.remove('flight-nav-active');}};
}
