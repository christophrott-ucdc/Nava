import type {MissionSnapshot} from '../../shared/mission';
import type {ScreenConfig,SpanViewport} from '../../shared/types';
import {createFlightDeck} from '../../web/shared/flight-deck';
import {scaleViewports} from '../span';
/** Separate viewport-scoped overlays: never put lateral stations into the center focus layer. */
export function createWallFlightStations(host:HTMLElement,viewports:SpanViewport[],screens:ScreenConfig[],orderedIds:string[],clock:()=>number){
 const entries=viewports.filter(v=>!screens.find(s=>s.id===v.screenId)?.showAvatar).map(v=>{
   const index=orderedIds.indexOf(v.screenId),post=({ 'port-outer':1,'port-inner':2,center:3,'starboard-inner':4,'starboard-outer':5 } as Record<string,number>)[v.screenId]??(Math.max(0,index)%5)+1;
   const box=document.createElement('div');box.className='wall-flight-viewport';box.dataset.screen=v.screenId;box.hidden=true;
   const logical=document.createElement('div');logical.className='wall-flight-logical';box.append(logical);
   const panel=document.createElement('aside');panel.className='flight-tv flight-side';logical.append(panel);
   const deck=createFlightDeck(panel,false,post),crew=document.createElement('div');crew.className='flight-crew-link';panel.append(crew);host.append(box);
   return {box,logical,panel,deck,crew,post,id:v.screenId};
 });
 function resize(){const scaled=scaleViewports(viewports,host.clientWidth,host.clientHeight);for(const e of entries){const v=scaled.find(v=>v.screenId===e.id);if(!v)continue;Object.assign(e.box.style,{left:v.x+'px',top:v.y+'px',width:v.width+'px',height:v.height+'px'});const w=1920,h=v.height/v.width*w;Object.assign(e.logical.style,{width:w+'px',height:h+'px',transform:`scale(${v.width/w})`});}}
 const observer=new ResizeObserver(resize);observer.observe(host);resize();let snapshot:MissionSnapshot|undefined;
 const timer=setInterval(()=>{const s=snapshot,time=clock(),active=!!s&&['playing','paused'].includes(s.state.state)&&time>=0&&!s.experience?.active;
   for(const e of entries){e.box.hidden=!active;if(!active||document.hidden)continue;e.deck.update(s!.state,time,false,s!.accessibility.reducedMotion||s!.accessibility.reducedStimuli);const count=s!.experience?.participants.filter(id=>id.startsWith(String(e.post))).length??0;e.crew.textContent=`POSTUL ${e.post} · ${count} ${count===1?'explorator la bord':'exploratori la bord'} · ${s!.suspended||s!.state.state==='paused'?'PAUZĂ COMUNĂ':'ACELAȘI CEAS CU TABLETA'}`;}
 },100);
 return {update(s:MissionSnapshot){snapshot=s;},dispose(){clearInterval(timer);observer.disconnect();for(const e of entries){e.deck.dispose();e.box.remove();}}};
}
