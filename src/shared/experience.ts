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
  'legacy-v3':{title:'Descoperim comenzile',instruction:'Alege steaua, apoi confirmă.',options:[{value:'star',label:'Stea'},{value:'circle',label:'Cerc'}],correct:'star',detail:'Poți schimba alegerea înainte de confirmare.'},
  'age-5-10':{title:'Piesa care se potrivește',instruction:'Locul luminos are formă de stea. Găsește piesa.',options:[{value:'star',label:'Stea'},{value:'circle',label:'Cerc'},{value:'drop',label:'Picătură'}],correct:'star',detail:'Alege piesa, apoi apasă Confirmă. Poți încerca din nou.'},
  'age-10-15':{title:'O ipoteză, o dovadă',instruction:'Semnalul apare la 2, 2 și 2 secunde. Ce ai observat?',options:[{value:'regular',label:'Intervale egale'},{value:'life',label:'Dovada vieții'}],correct:'regular',detail:'Observația susține ritmul regulat. Nu dovedește cine trimite semnalul.'},
  'age-15-18':{title:'Decizia în doi',instruction:'Propune o regulă pentru proba echipajului.',options:[{value:'both',label:'Confirmăm amândoi'},{value:'review',label:'Cerem o verificare'}],correct:'any',detail:'Ambele propuneri sunt valide. În pasul următor, fiecare confirmă participarea la legătura comună.'},
  adults:{title:'O alegere cu un cost',instruction:'Ai o unitate de probă. Cum o folosești?',options:[{value:'observe',label:'Observație precisă · cost 1'},{value:'reserve',label:'Păstrez rezerva · cost 0'}],correct:'any',detail:'Ambele alegeri sunt valide. Resursa de probă nu afectează misiunea.'},
};
export const FINALE_CHOICES:Record<ScenarioId,{title:string;options:{value:string;label:string}[]}>={
  'legacy-v3':{title:'Ce iei cu tine?',options:[{value:'wonder',label:'Curiozitatea'},{value:'together',label:'Echipajul'},{value:'home',label:'Acasă'}]},
  'age-5-10':{title:'Ce dar trimiți spre casă?',options:[{value:'light',label:'O lumină'},{value:'care',label:'Grijă'},{value:'courage',label:'Curaj'}]},
  'age-10-15':{title:'Ce întrebare ai cerceta mai departe?',options:[{value:'source',label:'Cine a trimis?'},{value:'test',label:'Ce probă lipsește?'},{value:'meaning',label:'Ce înseamnă?'}]},
  'age-15-18':{title:'Ce regulă merită dusă mai departe?',options:[{value:'voice',label:'Fiecare are o voce'},{value:'review',label:'Deciziile pot fi revizuite'},{value:'responsibility',label:'Puterea cere răspundere'}]},
  adults:{title:'Ce alegi să păstrezi deschis?',options:[{value:'question',label:'O întrebare'},{value:'possibility',label:'O posibilitate'},{value:'connection',label:'O legătură'}]},
};
