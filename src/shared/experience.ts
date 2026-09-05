import type {ScenarioId} from './scenario-engine';
export type TutorialStep = 'touch'|'practice'|'cooperate'|'ready';
export interface ExperienceState {
  version:1; status:'pending'|'tutorial'|'complete'|'skipped'; step:TutorialStep; epoch:number;
  pausedAt?:number; launchRequested?:boolean;
  finaleNarrated?:boolean;
  participants:string[]; observed:string[]; touched:string[]; practiced:string[]; linked:string[];
  practice:Record<string,string>; finale:Record<string,string>;
  narration:{id:string;instance:string;startedAt:number}|null;
}
export interface ExperienceSnapshot extends ExperienceState {
  active:boolean; finaleActive:boolean; canContinue:boolean; paused:boolean;
}
export interface NarratorClip {file:string;durationSec:number;text:string;sha256:string}
export interface NarratorManifest {voiceId:string;voiceName:string;clips:Record<string,NarratorClip>}
export const EXPERIENCE_PRACTICE:Record<ScenarioId,{title:string;instruction:string;options:{value:string;label:string}[];correct:string;detail:string}>={
  'legacy-v3':{title:'Prima comandă',instruction:'Alege steaua, apoi confirmă.',options:[{value:'star',label:'Stea'},{value:'circle',label:'Cerc'}],correct:'star',detail:'Poți schimba alegerea înainte de confirmare.'},
  'age-5-10':{title:'Găsește steaua',instruction:'Caută piesa în formă de stea. Atinge-o, apoi apasă Confirmă.',options:[{value:'star',label:'Stea'},{value:'circle',label:'Cerc'},{value:'drop',label:'Picătură'}],correct:'star',detail:'Te poți răzgândi înainte să confirmi.'},
  'age-10-15':{title:'Ce spune semnalul?',instruction:'Primim câte un impuls la fiecare 2 secunde. Ce putem spune sigur?',options:[{value:'regular',label:'Se repetă la intervale egale'},{value:'life',label:'Este trimis de o ființă vie'}],correct:'regular',detail:'Cunoaștem ritmul. Încă nu știm cine sau ce îl produce.'},
  'age-15-18':{title:'Cine dă undă verde?',instruction:'Începem cu o probă: cum ai vrea să luăm o decizie împreună?',options:[{value:'both',label:'Decidem împreună'},{value:'review',label:'Verificăm înainte să decidem'}],correct:'any',detail:'Alege regula pe care o preferi. În misiune vei stabili ce poate decide pilotul automat.'},
  adults:{title:'Cercetezi sau păstrezi rezerva?',instruction:'Pentru această probă ai o singură unitate de energie. Cum o folosești?',options:[{value:'observe',label:'Cercetez acum · consum 1'},{value:'reserve',label:'Păstrez energia · consum 0'}],correct:'any',detail:'Alege, apoi confirmă. Energia misiunii rămâne întreagă.'},
};
export const FINALE_CHOICES:Record<ScenarioId,{title:string;options:{value:string;label:string}[]}>={
  'legacy-v3':{title:'Ce iei cu tine?',options:[{value:'wonder',label:'Curiozitatea'},{value:'together',label:'Echipajul'},{value:'home',label:'Acasă'}]},
  'age-5-10':{title:'Ce dar duci acasă?',options:[{value:'light',label:'O lumină'},{value:'care',label:'Grijă pentru ceilalți'},{value:'courage',label:'Curaj de explorator'}]},
  'age-10-15':{title:'Ce întrebare lași următorului echipaj?',options:[{value:'source',label:'Cine trimite semnalul?'},{value:'test',label:'Ce mai trebuie să testăm?'},{value:'meaning',label:'Ce ar putea însemna semnalul?'}]},
  'age-15-18':{title:'Ce regulă lași următorului echipaj?',options:[{value:'voice',label:'Ascultăm fiecare voce'},{value:'review',label:'Revedem decizia când apar date noi'},{value:'responsibility',label:'Ne asumăm deciziile luate'}]},
  adults:{title:'Ce lași deschis pentru cei care urmează?',options:[{value:'question',label:'O întrebare de cercetat'},{value:'possibility',label:'O posibilitate de explorat'},{value:'connection',label:'O legătură de păstrat'}]},
};
