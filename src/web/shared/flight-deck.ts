import { FLIGHT_STOPS, flightFrame, type FlightFrame } from '../../shared/flight-model';
import type { ShowState } from '../../shared/types';
import {LOCALE,languageOf,uiText} from '../../shared/localization';
const svgNS='http://www.w3.org/2000/svg';
const el=(tag:string,cls:string,text='')=>{const e=document.createElement(tag);e.className=cls;e.textContent=text;return e;};
export const FLIGHT_STATIONS=['PARCURS','SECVENȚE','NAVIGAȚIE','REPERE','CRONOMETRIA MISIUNII'] as const;
const number=(n:number,d=1)=>n.toLocaleString(LOCALE[languageOf(document.documentElement.lang)],{minimumFractionDigits:d,maximumFractionDigits:d});
/** Shared tablet/TV navigation instrument. Interaction only inspects; never pilots the film. */
export function createFlightDeck(host:HTMLElement,interactive=true,post=3){
  const root=el('section','flight-deck');root.setAttribute('aria-label','Instrumentele navei · simulare educativă');
  const head=el('header','flight-head'),title=el('strong','',`POSTUL ${post} · ${FLIGHT_STATIONS[post-1]??FLIGHT_STATIONS[2]}`),clock=el('span','flight-clock');head.append(title,clock);
  const body=el('div','flight-body'),mapBox=el('div','flight-map'),radarBox=el('div','flight-radar');
  const map=document.createElementNS(svgNS,'svg');map.setAttribute('viewBox','0 0 100 90');map.setAttribute('preserveAspectRatio','none');map.setAttribute('role','img');map.setAttribute('aria-label','Traseul filmului, schemă fără scară astronomică');
  const path=document.createElementNS(svgNS,'polyline');path.setAttribute('points',FLIGHT_STOPS.map(p=>`${p.x},${p.y}`).join(' '));path.setAttribute('class','flight-route');map.append(path);
  const ship=document.createElementNS(svgNS,'path');ship.setAttribute('d','M0 -3 L2.4 2 L0 1 L-2.4 2 Z');ship.setAttribute('class','flight-ship');
  let selected=-1,last:FlightFrame|undefined,scale=1,expanded=false;
  root.addEventListener('keydown',e=>{if(e.key==='Escape'&&expanded){expanded=false;root.classList.remove('flight-expanded');toggle.textContent='Deschide harta';toggle.setAttribute('aria-expanded','false');toggle.focus();}});
  const info=el('p','flight-info'),buttons:HTMLElement[]=[];
  FLIGHT_STOPS.forEach((p,i)=>{
    const dot=document.createElementNS(svgNS,'circle');dot.setAttribute('cx',String(p.x));dot.setAttribute('cy',String(p.y));dot.setAttribute('r','1.5');dot.setAttribute('class','flight-stop');map.append(dot);
    const b=el(interactive?'button':'span','flight-destination',p.name);b.style.left=p.x+'%';b.style.top=p.y/90*100+'%';
    if(interactive){(b as HTMLButtonElement).type='button';b.addEventListener('click',()=>{selected=selected===i?-1:i;if(last)describe(last);});}buttons.push(b);mapBox.append(b);
  });map.append(ship);mapBox.prepend(map);
  const radar=document.createElement('canvas');radar.width=360;radar.height=300;radar.setAttribute('role','img');radarBox.append(radar);
  const radarTools=el('div','flight-radar-tools');
  const zoom=el('button','','Orizont ×1');(zoom as HTMLButtonElement).type='button';zoom.textContent='Orizont ×1';
  if(interactive){zoom.addEventListener('click',()=>{scale=scale===1?2:scale===2?4:1;zoom.textContent=`Orizont ×${scale}`;if(last)paint(last);});radarTools.append(zoom);}radarTools.append(el('small','','REPERELE CĂLĂTORIEI'));radarBox.append(radarTools);
  const metrics=el('div','flight-metrics'),values:HTMLElement[]=[];
  const labels=post===1?['STARE','SECVENȚĂ','PARCURS FILM','URMEAZĂ']:post===2?['STARE','SECVENȚĂ','TIMP ÎN SECVENȚĂ','MAI SUNT']:post===4?['STARE','REPER','PARCURS SECVENȚĂ','URMEAZĂ']:['STARE','SECVENȚĂ','PARCURS FILM','MAI SUNT'];
  const stationHelp=['Starea provine din secvența filmului afișată acum. În pauză, cifrele se opresc.','Secvența este determinată de reperele montajului video, nu de un scenariu aleator.','Timpul și progresul sunt calculate din durata filmului sau a secvenței. Nu reprezintă distanțe prin spațiu.','Următorul reper și timpul până la el provin din montaj. Filmul singur nu oferă forța motoarelor sau consumul real.'];
  labels.forEach((name,i)=>{const b=el(interactive?'button':'div','flight-metric');if(interactive){(b as HTMLButtonElement).type='button';b.addEventListener('click',()=>{selected=-2;info.textContent=stationHelp[i];});}const val=el('strong','','—');values.push(val);b.append(el('small','',name),val);metrics.append(b);});
  const foot=el('footer','flight-foot'),mode=el('span','flight-mode'),legend=el('small','','SINCRONIZAT CU FILMUL · TRASEU SCHEMATIC');foot.append(mode,legend);
  const toggle=el('button','flight-toggle','Deschide harta');(toggle as HTMLButtonElement).type='button';toggle.setAttribute('aria-expanded','false');if(interactive){toggle.addEventListener('click',()=>{expanded=!expanded;root.classList.toggle('flight-expanded',expanded);toggle.textContent=expanded?'Închide harta':'Deschide harta';toggle.setAttribute('aria-expanded',String(expanded));});head.append(toggle);}
  body.append(mapBox,radarBox);root.append(head,body,metrics,info,foot);host.append(root);
  function describe(f:FlightFrame){if(selected===-2)return;info.textContent=selected>=0?FLIGHT_STOPS[selected].fact:`${f.stop.name} · ${f.index===6?'Sosire':`Următoarea secvență: ${f.next.name}`} · ${Math.ceil(f.remainingSec)} s`;buttons.forEach((b,i)=>{b.classList.toggle('current',i===f.index);if(interactive)b.setAttribute('aria-pressed',String(i===selected));});}
  function paint(f:FlightFrame){
    const ctx=radar.getContext('2d');if(!ctx)return;ctx.clearRect(0,0,360,300);
    ctx.strokeStyle='#8ec9cd55';for(let i=1;i<=3;i++){ctx.beginPath();ctx.arc(180,142,34*i,0,Math.PI*2);ctx.stroke();}
    const horizon=120*scale;ctx.font='14px Segoe UI';ctx.textAlign='center';ctx.fillStyle='#ffe0a1';ctx.fillText(uiText('ACUM'),180,147);
    f.contacts.filter(c=>c.seconds<=horizon).forEach((c,i)=>{const radius=c.seconds/horizon*100,angle=-Math.PI/2+i*.95,x=180+Math.cos(angle)*radius,y=142+Math.sin(angle)*radius;ctx.fillStyle='#a4f1d7';ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();ctx.fillText(Math.ceil(c.seconds)+' s',x,y-10);});
    ctx.fillStyle='#d5e8ef';ctx.fillText(uiText(`Următoarele ${horizon} s din film`),180,279);ctx.textAlign='left';radar.setAttribute('aria-label',f.contacts.map(c=>`${c.name} în ${Math.ceil(c.seconds)} secunde`).join('; '));
  }
  return {element:root,update(state:ShowState|null,time:number,compact=false,quiet=false){last=flightFrame(state,time);root.style.setProperty("--flight-progress",String(last.progress*100)+"%");if(compact&&!root.classList.contains('flight-compact')){expanded=false;root.classList.remove('flight-expanded');toggle.textContent='Deschide harta';toggle.setAttribute('aria-expanded','false');if(root.contains(document.activeElement))(document.activeElement as HTMLElement).blur();}root.classList.toggle('flight-compact',compact);root.dataset.quiet=String(quiet);if(!compact&&expanded){expanded=false;root.classList.remove('flight-expanded');toggle.setAttribute('aria-expanded','false');toggle.textContent='Deschide harta';}clock.textContent=`T+${Math.floor(last.t/60).toString().padStart(2,'0')}:${Math.floor(last.t%60).toString().padStart(2,'0')}`;ship.setAttribute('transform',`translate(${last.x} ${last.y})`);const percent=number(last.progress*100,0)+' %',remaining=Math.ceil(last.remainingSec)+' s';
 const readouts=post===1?[last.stop.name,percent,last.next.name]:post===2?[last.stop.name,Math.floor(last.t-last.stop.at)+' s',remaining]:post===4?[last.stop.name,number(last.fraction*100,0)+' %',last.next.name]:[last.stop.name,percent,remaining];
 values[0].textContent=last.paused?'PAUZĂ':last.mode;readouts.forEach((value,i)=>values[i+1].textContent=value);
 mode.textContent=last.paused?'PAUZĂ':last.mode;describe(last);if(!compact||expanded)paint(last);},reset(){selected=-1;expanded=false;root.classList.remove('flight-expanded');toggle.setAttribute('aria-expanded','false');toggle.textContent='Deschide harta';},dispose(){root.remove();}};
}
