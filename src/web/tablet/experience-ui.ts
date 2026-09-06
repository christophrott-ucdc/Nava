import type { MissionSnapshot } from '@shared/mission';
import { EXPERIENCE_PRACTICE, FINALE_CHOICES } from '@shared/experience';
import { hasChildIllustrations, illustrationPath, type ExodusIllustration } from '../shared/illustrations';
import { CREW_POSTS } from '../shared/crew-relay';
import {crewCharacter} from '@shared/crew';

type Zone = 'A' | 'B';
const el = <K extends keyof HTMLElementTagNameMap>(tag:K, cls:string, text?:string) => { const e=document.createElement(tag); e.className=cls; if(text!==undefined)e.textContent=text; return e; };
const icons:Record<string,string> = {
  star:'<path d="m50 8 12 27 30 3-22 21 6 31-26-16-26 16 6-31L8 38l30-3Z"/>',
  circle:'<circle cx="50" cy="50" r="32"/>',
  drop:'<path d="M50 9C42 32 20 47 20 64a30 30 0 0 0 60 0C80 47 58 32 50 9Z"/>',
  orbit:'<circle cx="50" cy="50" r="13"/><ellipse cx="50" cy="50" rx="42" ry="23" fill="none" stroke="currentColor" stroke-width="4" transform="rotate(-30 50 50)"/><circle cx="85" cy="28" r="6"/>',
  link:'<path d="M40 31 28 43a16 16 0 0 0 23 23l10-10M60 69l12-12a16 16 0 0 0-23-23L39 44M38 62l24-24" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round"/>',
  check:'<path d="m23 51 18 18 36-39" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>',
};
function art(name:string) { const e=el('span','experience-art'); e.innerHTML=`<svg viewBox="0 0 100 100" fill="currentColor" aria-hidden="true">${icons[name]||icons.orbit}</svg>`; return e; }
function illustration(name:ExodusIllustration, cls:string) {
  const image=el('img',cls);image.src=illustrationPath(name);image.alt='';image.draggable=false;image.decoding='async';
  image.setAttribute('aria-hidden','true');image.addEventListener('error',()=>image.remove(),{once:true});return image;
}
const showIllustrations=(snapshot:MissionSnapshot)=>snapshot.accessibility.showVisualGuidance!==false&&!snapshot.accessibility.reducedStimuli;
const keepsakeIllustrations:Record<string,ExodusIllustration>={light:'keepsake-light-v1',care:'keepsake-care-v1',courage:'keepsake-compass-v1'};
export function experienceHeader(snapshot:MissionSnapshot, finale:boolean) {
  const head=el('header','experience-intro');
  const heading=el('h2','',finale?FINALE_CHOICES[snapshot.scenarioId].title:'Pregătim decolarea');
  if(!finale&&hasChildIllustrations(snapshot.scenarioId)) {
    heading.classList.add('experience-illustrated-heading');
    heading.prepend(illustration('tutorial-pair-v1','experience-tutorial-pair'));
  }
  head.append(el('p','eyebrow',finale?'JURNALUL ECHIPAJULUI':'BUN VENIT LA BORD'),heading);
  if(!finale) {
    const steps=el('ol','experience-steps'); const current=['touch','practice','cooperate','ready'].indexOf(snapshot.experience!.step);
    ['Salută nava','Încearcă','Împreună','Echipaj pregătit'].forEach((label,i)=>{const item=el('li',i===current?'current':i<current?'done':'',label); if(i===current)item.setAttribute('aria-current','step'); steps.append(item);}); head.append(steps);
  }
  return head;
}
export function experienceZone(snapshot:MissionSnapshot, zone:Zone, online:boolean, pending:boolean, send:(zone:Zone,value:string)=>void, finale:boolean, draft?:string, select?:(value:string)=>void) {
  const exp=snapshot.experience!, key=`${snapshot.post}${zone}`, observer=exp.observed.includes(key), included=exp.participants.includes(key), blocked=!online||snapshot.suspended||exp.paused||pending;
  const character=crewCharacter(exp.crew?.characters[key]), personal=character?.name??`locul ${key}`, paired=exp.participants.includes(`${snapshot.post}${zone==='A'?'B':'A'}`);
  const panel=el('section',`mission-zone mission-zone-${zone.toLowerCase()} experience-zone`); panel.dataset.zone=zone; panel.dataset.kind=finale?'experience-finale':`tutorial-${exp.step}`;
  panel.setAttribute('aria-label',`Zona ${zone}, ${zone==='A'?'stânga':'dreapta'}`);
  const head=el('div','mission-zone-head'); head.append(el('b','mission-seat',zone),el('span','',zone==='A'?'Locul din stânga':'Locul din dreapta')); panel.append(head);
  const title=el('h2','mission-instruction');title.tabIndex=-1;panel.append(title);
  const detail=el('p','mission-detail'); const options=el('div','experience-options');
  const button=(label:string,value:string,cls='',disabled=false,icon?:string)=>{const b=el('button',`mission-option ${cls}`);b.type='button';b.dataset.value=value;b.disabled=blocked||disabled;if(icon)b.append(art(icon));b.append(el('span','',label));b.addEventListener('click',()=>send(zone,value));options.append(b);return b;};
  const beacon=(label:string,value:string,done:boolean,disabled=false)=>{
    const b=button(label,value,'experience-beacon crew-trigger',disabled);
    b.dataset.confirmed=String(done);b.setAttribute('aria-busy',String(pending));
    const model=el('span','crew-trigger-art');model.setAttribute('aria-hidden','true');model.dataset.seat=key;
    b.prepend(model);b.append(el('small','crew-trigger-hint',pending?'Trimitem către navă…':done?`Caută ${personal} pe ecran`:`${CREW_POSTS[(snapshot.post||1)-1]} · ${key}`));
    return b;
  };
  let status='';
  if(!included) {
    title.textContent='Urmărește călătoria';panel.dataset.empty='true';panel.append(art('orbit'));detail.textContent=finale?'Privește amintirile echipajului pe ecranul central.':'Acest loc este liber. Povestea continuă pe ecrane.';status='Nu este nevoie să apeși nimic aici.';
  } else if(finale) {
    const config=FINALE_CHOICES[snapshot.scenarioId], chosen=exp.finale[key];title.textContent=chosen==='observe'?'Momentul tău de liniște':chosen?'Alegerea ta este la bord':`Simbolul tău · ${key}`;
    const contribution=snapshot.summary.posts.find(p=>p.post===snapshot.post)?.lines[zone==='A'?0:1];
    if(contribution){const journal=el('section','experience-memory');journal.setAttribute('aria-label','Contribuția ta la expediție');journal.append(el('strong','','Din călătoria ta'),el('p','experience-contribution',contribution.replace(/^[AB]: /,'')));panel.append(journal);}
    detail.textContent=chosen==='observe'?'Poți urmări nava și alegerile echipajului.':chosen?`Caută ${personal} și simbolul tău pe ecranul central.`:'Alege un simbol. Apoi trimite-l pe ecran.';
    for(const choice of config.options.filter(choice=>!chosen||choice.value===chosen)){
      const selected=chosen===choice.value||(!chosen&&draft===choice.value);
      const b=el('button',`mission-option crew-choice ${selected?'experience-selected':''}`);b.type='button';b.dataset.value=`draft:${choice.value}`;b.disabled=blocked||!!chosen;b.setAttribute('aria-pressed',String(selected));b.append(el('span','',choice.label));
      b.addEventListener('click',()=>select?.(choice.value));options.append(b);
      const keepsake=keepsakeIllustrations[choice.value];
      if(snapshot.scenarioId==='age-5-10'&&showIllustrations(snapshot)&&keepsake){
        b.classList.add('experience-keepsake-option');b.prepend(illustration(keepsake,'experience-keepsake-image'));
      }
    }
    if(chosen!=='observe')beacon(chosen?'Simbolul tău este la bord':pending?'Trimitem simbolul…':'Trimite simbolul meu',`finale:${chosen||draft||''}`,!!chosen,!!chosen||!draft);
    if(chosen==='observe')button('Prefer să privesc','finale:observe','mission-observe',true);
    if(!chosen)button('Prefer să privesc','finale:observe','mission-observe');
    status=chosen==='observe'?'Poți păstra momentul pentru tine.':chosen?`Primit la bord · ${key}. Alegerea este păstrată în jurnal.`:draft?'Poți schimba simbolul înainte să-l trimiți.':'Alege ce contează pentru tine.';
    panel.dataset.complete=String(!!chosen);
  } else if(observer) {
    title.textContent='Urmărește călătoria';panel.append(art('orbit'));detail.textContent=exp.step==='ready'?'Proba s-a încheiat. Privește începutul călătoriei.':'Poți privi sau poți încerca împreună cu noi.';if(exp.step!=='ready')button('Vreau să particip','tutorial:touch','experience-primary');status=exp.step==='ready'?'Pornim împreună.':'Te poți alătura când ești gata.';
  } else if(exp.step==='touch') {
    const done=exp.touched.includes(key);title.textContent=done?'Bun venit în echipaj!':'Salută nava';
    detail.textContent=done?'Lumina ta a ajuns pe ecran. Privește cum se adună echipajul.':`Atinge butonul și caută ${personal} pe ecranul central. Culoarea personajului îți arată lumina de pe navă.`;
    beacon(done?'Salut primit':'Salut, navă!','tutorial:touch',done,done);status=done?`Privește ecranul central: ${personal} este la bord.`:'O singură atingere este suficientă.';panel.dataset.complete=String(done);
  } else if(exp.step==='practice') {
    const config=EXPERIENCE_PRACTICE[snapshot.scenarioId], chosen=exp.practice[key], done=exp.practiced.includes(key);title.textContent=done?'Ai încheiat proba':config.title;detail.textContent=done?'Comanda ta a ajuns la navă. Mai avem un pas înainte de decolare.':config.instruction;
    if(!done){for(const choice of config.options){const b=button(choice.label,`tutorial:pick:${choice.value}`,chosen===choice.value?'experience-selected':'',false,icons[choice.value]?choice.value:undefined);b.setAttribute('aria-pressed',String(chosen===choice.value));}button('Confirmă','tutorial:confirm','experience-primary',!chosen);}
    else panel.append(art('check'));
    status=done?'Acum știi: alegi, apoi confirmi.':config.detail;panel.dataset.complete=String(done);
  } else {
    const done=exp.linked.includes(key), ready=exp.step==='ready';title.textContent=ready?'Echipajul este pregătit':done?'Lumina ta este aprinsă':'Aprindem luminile împreună';
    detail.textContent=ready?'Privește ecranul central. Căpitanul preia călătoria.':paired?'Atinge butonul din jumătatea ta. Când sunteți gata amândoi, luminile voastre se unesc pe ecran.':'Atinge butonul din jumătatea ta. Lumina ta aprinde nava de pe ecran.';
    beacon(ready?'Pregătit de călătorie':done?'Lumina este aprinsă':'Aprinde lumina mea','tutorial:link',done,done||ready);status=ready?'Rămâi la postul tău. Pornim împreună.':done?'Lumina ta rămâne aprinsă. Privește ecranul central.':paired?'Puteți apăsa pe rând.':'O singură atingere este suficientă.';panel.dataset.complete=String(done);
  }
  panel.append(detail,options);
  if(!finale&&included&&!observer&&exp.step!=='ready') { const b=el('button','mission-option mission-observe experience-observe','Prefer să privesc');b.dataset.value='tutorial:observe';b.disabled=blocked;b.addEventListener('click',()=>send(zone,'tutorial:observe'));panel.append(b); }
  const delivery=el('p','mission-delivery',!online?'Refacem legătura cu nava. Așteaptă puțin.':snapshot.suspended||exp.paused?'Facem o pauză. Continuăm împreună.':pending?'Trimitem răspunsul…':status);delivery.setAttribute('role','status');panel.append(delivery);return panel;
}
