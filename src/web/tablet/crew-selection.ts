import type {MissionSnapshot} from '@shared/mission';
import {CREW_CHARACTERS,crewCharacter,characterPortrait} from '@shared/crew';

const el=<K extends keyof HTMLElementTagNameMap>(tag:K,cls:string,text?:string)=>{const n=document.createElement(tag);n.className=cls;if(text)n.textContent=text;return n;};
export function crewSelection(snapshot:MissionSnapshot,zone:'A'|'B',online:boolean,pending:boolean,draft:string|undefined,choose:(id:string)=>void,send:(zone:'A'|'B',value:string)=>void):HTMLElement{
  const crew=snapshot.experience!.crew!,seat=`${snapshot.post}${zone}`,own=crewCharacter(crew.characters[seat]);
  const panel=el('section','mission-zone crew-select');panel.dataset.zone=zone;panel.dataset.locked=String(!!own);
  panel.setAttribute('aria-label',`Alegerea personajului · ${zone==='A'?'stânga':'dreapta'}`);
  const heading=el('div','crew-select-heading');heading.append(el('span','crew-select-seat',`${zone} · ${zone==='A'?'STÂNGA':'DREAPTA'}`),el('h2','',own?`Bun venit, ${own.name}!`:'Cine ești în această aventură?'));
  panel.append(heading,el('p','crew-select-intro',own?'Locul tău în echipaj este confirmat.':'Atinge un personaj, apoi confirmă. Alege doar pentru tine.'));
  const blocked=!online||pending||snapshot.suspended;
  const preview=own||crewCharacter(draft);
  panel.classList.add('crew-arcade');panel.dataset.preview=String(!!preview);
  if(preview)panel.style.setProperty('--crew-accent',preview.color);
  const stage=el('div','crew-preview-stage');
  const podium=el('div','crew-preview-podium');podium.setAttribute('aria-hidden','true');stage.append(podium);
  const hero=el('img','crew-preview-hero');hero.src=characterPortrait(preview?.id||'dori');hero.alt=preview?.name||'Dori te invită să alegi un personaj';hero.draggable=false;stage.append(hero);
  const info=el('div','crew-preview-info');info.append(el('span','crew-preview-kicker',own?'ECHIPAJ CONFIRMAT':preview?'EXPLORATORUL TĂU':'ALEGE-ȚI EXPLORATORUL'),el('strong','crew-preview-name',preview?.name||'Cine vine la bord?'),el('span','crew-preview-role',preview?.role||'12 personaje · aventura ta'));
  stage.append(info);panel.append(stage);
  if(own){
    panel.style.setProperty('--crew-accent',own.color);
    const badge=el('div','crew-lock-badge','✓ LA BORD');badge.setAttribute('role','status');
    const change=el('button','crew-change','Schimbă personajul');change.type='button';change.disabled=blocked;change.dataset.value='crew:release';change.onclick=()=>send(zone,'crew:release');
    panel.append(badge,el('p','crew-select-wait','Privește ecranul central. Ghidul ne spune când pornim.'),change);
  }else{
    const grid=el('div','crew-character-grid');grid.style.setProperty('--crew-columns',String(Math.ceil(CREW_CHARACTERS.length/2)));grid.setAttribute('role','group');grid.setAttribute('aria-label',`${CREW_CHARACTERS.length} personaje ale echipajului`);
    for(const character of CREW_CHARACTERS){
      const taken=Object.entries(crew.characters).find(([other,id])=>other!==seat&&id===character.id);
      const button=el('button','crew-character');button.type='button';button.style.setProperty('--crew-accent',character.color);button.dataset.value=`crew:draft:${character.id}`;
      button.disabled=blocked||!!taken;button.setAttribute('aria-pressed',String(draft===character.id));button.setAttribute('aria-label',`${character.name} · ${character.role}${taken?' · ales deja':''}`);
      const image=el('img','');image.src=characterPortrait(character.id);image.alt='';image.draggable=false;image.decoding='async';
      button.append(image,el('strong','',character.name));
      if(taken||draft===character.id){const marker=el('span','crew-character-state',taken?'×':'✓');marker.setAttribute('aria-hidden','true');button.append(marker);}
      button.onclick=()=>choose(character.id);grid.append(button);
    }
    const character=crewCharacter(draft),taken=character&&Object.entries(crew.characters).some(([other,id])=>other!==seat&&id===character.id);
    const confirm=el('button','crew-lock',character?`Gata de aventură! · ${character.name}`:'Alege un personaj');confirm.type='button';confirm.disabled=blocked||!character||!!taken;confirm.dataset.value='crew:confirm';confirm.onclick=()=>{if(character)send(zone,`crew:lock:${character.id}`);};
    const selectionStatus=el('p','crew-draft-role',taken?'Personaj rezervat. Alege alt prieten.':character?`${character.name} este alegerea ta. Confirmă când ești gata.`:'Alege un portret. Personajele marcate cu × sunt deja rezervate.');selectionStatus.setAttribute('role','status');panel.append(grid,selectionStatus,confirm);
  }
  const status=el('p','crew-select-status',!online?'Refacem legătura cu nava…':snapshot.suspended?'Înscrierea este în pauză.':pending?'Confirmăm cu nava…':own?'Poți lăsa liberă cealaltă jumătate dacă ești singur.':'Nu este nimeni aici? Lasă această jumătate liberă.');status.setAttribute('role','status');panel.append(status);
  return panel;
}

export function attachCrewIdentity(panel:HTMLElement,snapshot:MissionSnapshot,zone:'A'|'B'):void{
  const character=crewCharacter(snapshot.experience?.crew?.characters[`${snapshot.post}${zone}`]);
  const existing=panel.querySelector<HTMLElement>('.crew-identity');if(existing?.dataset.character===character?.id&&character)return;existing?.remove();if(!character)return;
  const badge=el('div','crew-identity'),image=el('img','');image.src=characterPortrait(character.id);image.alt='';image.draggable=false;
  badge.dataset.character=character.id;const label=el('span','crew-identity-name',character.name);label.append(el('small','',`${snapshot.post}${zone} · ${character.role}`));
  badge.append(image,label);badge.style.setProperty('--crew-accent',character.color);panel.style.setProperty('--crew-accent',character.color);panel.prepend(badge);
}
