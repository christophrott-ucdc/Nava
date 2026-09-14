import { FILM_DURATION } from './film-timing';
import type { ShowState } from './types';

/** Film editorial coordinates, not celestial ephemerides. The three invented worlds
 * have no astronomical distance. Never infer camera position or propulsion from pixels. */
export const FLIGHT_STOPS = [
  {id:'earth-out',name:'Pământ · plecare',at:0,x:7,y:70,fact:'Pământul este punctul de plecare al poveștii.'},
  {id:'light',name:'Lumea Luminii',at:60,x:23,y:34,fact:'Siwarha este lumea fantastică în care căutăm lumina.'},
  {id:'nature',name:'Lumea Naturii',at:144,x:40,y:61,fact:'Grădina din poveste ne invită să observăm viața.'},
  {id:'crystal',name:'Lumea Cristalului',at:246,x:56,y:28,fact:'Mann este atelierul fantastic al cristalelor.'},
  {id:'transfer',name:'Tunelul',at:388,x:70,y:58,fact:'Transfer imaginar: distanța astronomică nu este definită.'},
  {id:'saturn',name:'Saturn',at:504,x:84,y:29,fact:'Saturn se află, în medie, la aproximativ 9,5 UA de Soare. O UA este distanța medie Pământ–Soare.'},
  {id:'earth-in',name:'Pământ · acasă',at:610,x:94,y:68,fact:'Ne întoarcem acasă. Luminile stelei sunt metafora echipajului.'},
] as const;
// Only measured editorial boundaries are available. An MP4 cannot determine thrust,
// mass, fuel or spatial velocity. Do not synthesize physical telemetry from a clock.
export function flightFrame(state:Pick<ShowState,'state'|'suspended'>|null,phaseTime:number){
  const live=state?.state==='playing'||state?.state==='paused';
  const t=live?Math.max(0,Math.min(FILM_DURATION,Number.isFinite(phaseTime)?phaseTime:0)):state?.state==='epilogue'||state?.state==='ended'?FILM_DURATION:0;
  let index=0;for(let i=1;i<FLIGHT_STOPS.length;i++)if(t>=FLIGHT_STOPS[i].at)index=i;
  const stop=FLIGHT_STOPS[index],next=FLIGHT_STOPS[Math.min(index+1,FLIGHT_STOPS.length-1)],end=index===FLIGHT_STOPS.length-1?FILM_DURATION:next.at;
  const fraction=Math.max(0,Math.min(1,(t-stop.at)/(end-stop.at))),u=fraction*fraction*(3-2*fraction),transfer=index===4;
  const contacts=FLIGHT_STOPS.filter(p=>p.at>t).slice(0,3).map(p=>({id:p.id,name:p.name,seconds:p.at-t}));
  return {t,index,stop,next,fraction,x:stop.x+(next.x-stop.x)*u,y:stop.y+(next.y-stop.y)*u,progress:t/FILM_DURATION,remainingSec:Math.max(0,end-t),transfer,
    contacts,
    paused:state?.state==='paused'||!!state?.suspended,
    mode:t>=FILM_DURATION?'ACASĂ':['PLECARE','EXPLORARE','EXPLORARE','EXPLORARE','TRANSFER','SURVOL SATURN','ÎNTOARCERE'][index],

  };
}
export type FlightFrame=ReturnType<typeof flightFrame>;
