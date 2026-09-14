import type {ShowFile, SfxCue} from './types';
import {FILM_DURATION} from './film-timing';

/** Editorial anchors for the 678.05 s film, inspected against the center master. */
export const PLANET_STOPS = [
  {id:'light',at:96,durationSec:10},
  {id:'nature',at:202,durationSec:10},
  {id:'crystal',at:302,durationSec:10},
  {id:'saturn',at:532,durationSec:10},
  {id:'earth',at:640,durationSec:10},
] as const;

/** Applied to every language/age package, never rewrites source film or dialogue. */
export function withPlanetStops(show:ShowFile):ShowFile {
  if(Math.abs(show.videoDurationSec-FILM_DURATION)>.1)return show;
  const departures:SfxCue[]=[0,102,208,308,538].map((at,i)=>({
    id:`departure-engine-${i}`,phase:'play',at,kind:'sfx',sfx:'rocket-departure',durationSec:3.5,gain:.14,
  }));
  return {...show,planetStops:PLANET_STOPS.map(stop=>({...stop})),cues:[...show.cues.filter(c=>!departures.some(d=>d.id===c.id)),...departures]};
}
