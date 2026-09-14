import type {SceneTheme,ShowState,TabletPost} from '@shared/types';
import {createFlightDeck} from '../shared/flight-deck';
export interface TelemetryInput {state:ShowState|null;phaseTime:number;theme:SceneTheme;post:TabletPost;sceneLabel:string;compact?:boolean;quiet?:boolean}
export function createTelemetry(container:HTMLElement){
 let deck=createFlightDeck(container),post=3;let visible=false;
 window.addEventListener('pagehide',e=>{if(!e.persisted)deck.dispose();});
 return {update(input:TelemetryInput){if(post!==input.post){deck.dispose();post=input.post;deck=createFlightDeck(container,true,post);}if(visible)deck.update(input.state,input.phaseTime,input.compact,input.quiet);},remember(_speaker:string,_text:string){},clearMemory(){deck.reset();},setVisible(value:boolean){visible=value;container.classList.toggle('hidden',!value);}};
}
