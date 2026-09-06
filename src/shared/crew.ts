/** Anonymous fictional identities. A character never changes the physical A/B seat or age profile. */
export const CREW_CHARACTERS = [
  {id:'nova',name:'Nova',role:'Caută drumuri noi',color:'#ee9278'},
  {id:'nia',name:'Nia',role:'Găsește direcția aventurii',color:'#ec9878'},
  {id:'luca',name:'Luca',role:'Descoperă trasee',color:'#83bedf'},
  {id:'mira',name:'Mira',role:'Citește hărțile stelare',color:'#b6a0d9'},
  {id:'leo',name:'Leo',role:'Dă energie navei',color:'#e4bd65'},
  {id:'iris',name:'Iris',role:'Ocrotește viața',color:'#8acbb1'},
  {id:'arin',name:'Arin',role:'Deslușește semnale',color:'#eda86d'},
  {id:'tara',name:'Tara',role:'Ține echipajul aproape',color:'#dc9bb9'},
  {id:'radu',name:'Radu',role:'Păstrează descoperirile',color:'#73bfc1'},
  {id:'zori',name:'Zori',role:'Robotul curios',color:'#8dcdd5'},
  {id:'pipo',name:'Pipo',role:'Exploratorul jucăuș',color:'#c0a2db'},
  {id:'dori',name:'Dori',role:'Descoperă lumile de gheață',color:'#a59be8'},
] as const;
export type CrewCharacterId = typeof CREW_CHARACTERS[number]['id'];
export interface CrewRegistration { open:boolean; characters:Partial<Record<string,CrewCharacterId>> }
export const ALL_SEATS = Array.from({length:10},(_,i)=>`${Math.floor(i/2)+1}${i%2?'B':'A'}`);
export const crewCharacter = (id?:string) => CREW_CHARACTERS.find(c=>c.id===id);
export const characterPortrait = (id:string,renderer=false) => `${renderer?'':'/'}shared/crew/portraits/${id}-v1.png`;
export const occupiedSeats = (crew:CrewRegistration) => ALL_SEATS.filter(seat=>!!crewCharacter(crew.characters[seat]));
