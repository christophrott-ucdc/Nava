import type { MissionSnapshot } from '@shared/mission';
import { EXPERIENCE_PRACTICE, FINALE_CHOICES } from '@shared/experience';

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
export function experienceHeader(snapshot:MissionSnapshot, finale:boolean) {
  const head=el('header','experience-intro');
  head.append(el('p','eyebrow',finale?'ULTIMUL GEST · O AMINTIRE COMUNĂ':'ÎNAINTE DE DECOLARE · PROBĂ FĂRĂ PUNCTAJ'),el('h2','',finale?'Povestea merge cu voi':'Nava vă recunoaște'));
  if(!finale) {
    const steps=el('ol','experience-steps'); const current=['touch','practice','cooperate','ready'].indexOf(snapshot.experience!.step);
    ['Salută nava','Încearcă','Conectează','Echipaj pregătit'].forEach((label,i)=>{const item=el('li',i===current?'current':i<current?'done':'',label); if(i===current)item.setAttribute('aria-current','step'); steps.append(item);}); head.append(steps);
  }
  return head;
}
export function experienceZone(snapshot:MissionSnapshot, zone:Zone, online:boolean, pending:boolean, send:(zone:Zone,value:string)=>void, finale:boolean) {
  const exp=snapshot.experience!, key=`${snapshot.post}${zone}`, observer=exp.observed.includes(key), included=exp.participants.includes(key), blocked=!online||snapshot.suspended||exp.paused||pending;
  const panel=el('section',`mission-zone mission-zone-${zone.toLowerCase()} experience-zone`); panel.dataset.zone=zone; panel.dataset.kind=finale?'experience-finale':`tutorial-${exp.step}`;
  panel.setAttribute('aria-label',`Zona ${zone}, ${zone==='A'?'stânga':'dreapta'}`);
  const head=el('div','mission-zone-head'); head.append(el('b','mission-seat',zone),el('span','',zone==='A'?'Locul din stânga':'Locul din dreapta')); panel.append(head);
  const title=el('h2','mission-instruction');title.tabIndex=-1;panel.append(title);
  const detail=el('p','mission-detail'); const options=el('div','experience-options');
  const button=(label:string,value:string,cls='',disabled=false,icon?:string)=>{const b=el('button',`mission-option ${cls}`);b.type='button';b.dataset.value=value;b.disabled=blocked||disabled;if(icon)b.append(art(icon));b.append(el('span','',label));b.addEventListener('click',()=>send(zone,value));options.append(b);return b;};
  let status='';
  if(!included) {
    title.textContent='Un loc pentru mai târziu';panel.append(art('orbit'));detail.textContent='Acest loc nu este inclus în echipajul curent. Operatorul te poate adăuga la pregătirea grupului.';status='Poți urmări povestea pe ecrane.';
  } else if(finale) {
    const config=FINALE_CHOICES[snapshot.scenarioId], chosen=exp.finale[key];title.textContent=config.title;
    const contribution=snapshot.summary.posts.find(p=>p.post===snapshot.post)?.lines[zone==='A'?0:1];
    if(contribution)panel.append(el('p','experience-contribution',contribution.replace(/^[AB]: /,'')));
    detail.textContent='Un ultim gest pe tabletă. Privește cum ajunge pe ecranul central.';
    for(const choice of config.options){const b=button(choice.label,`finale:${choice.value}`,chosen===choice.value?'experience-selected':'',!!chosen);b.setAttribute('aria-pressed',String(chosen===choice.value));}
    if(!chosen)button('Prefer să privesc','finale:observe','mission-observe');
    status=chosen==='observe'?'Poți păstra momentul pentru tine.':chosen?'Gestul tău face parte din amintirea echipajului.':'Alege o singură dată. Nu există răspuns greșit.';
    panel.dataset.complete=String(!!chosen);
  } else if(observer) {
    title.textContent='Poți privi în ritmul tău';panel.append(art('orbit'));detail.textContent=exp.step==='ready'?'Proba s-a încheiat. Privește începutul călătoriei.':'Povestea este și pentru tine. Te poți alătura probei.';if(exp.step!=='ready')button('Vreau să particip','tutorial:touch','experience-primary');status='Fără grabă. Fără punctaj.';
  } else if(exp.step==='touch') {
    const done=exp.touched.includes(key);title.textContent=done?'Nava te-a recunoscut':'Atinge lumina din fața ta';
    detail.textContent=done?'Lumina ta a ajuns pe ecran. Privește cum se adună echipajul.':'Această jumătate a tabletei este a ta.';
    button(done?'Salut primit':'Salut, navă!','tutorial:touch','experience-beacon',done,done?'check':'orbit');status=done?'Atingerea ta este confirmată.':'O singură atingere este suficientă.';panel.dataset.complete=String(done);
  } else if(exp.step==='practice') {
    const config=EXPERIENCE_PRACTICE[snapshot.scenarioId], chosen=exp.practice[key], done=exp.practiced.includes(key);title.textContent=done?'Ai prins ideea':config.title;detail.textContent=done?'Proba este confirmată. Urmează legătura cu echipajul.':config.instruction;
    if(!done){for(const choice of config.options){const b=button(choice.label,`tutorial:pick:${choice.value}`,chosen===choice.value?'experience-selected':'',false,icons[choice.value]?choice.value:undefined);b.setAttribute('aria-pressed',String(chosen===choice.value));}button('Confirmă','tutorial:confirm','experience-primary',!chosen);}
    else panel.append(art('check'));
    status=done?'Proba nu consumă resurse din misiune.':config.detail;panel.dataset.complete=String(done);
  } else {
    const done=exp.linked.includes(key), ready=exp.step==='ready';title.textContent=ready?'Echipajul este pregătit':done?'Legătura ta este aprinsă':'Aprinde legătura cu echipajul';
    detail.textContent=ready?'Privește ecranul central. Căpitanul preia călătoria.':'Fiecare confirmă în jumătatea sa. Gesturile voastre se întâlnesc pe TV.';
    button(ready?'Pregătit de călătorie':done?'Legătură confirmată':'Conectează lumina mea','tutorial:link','experience-beacon',done||ready,done||ready?'check':'link');status=ready?'Rămâi la postul tău. Pornim împreună.':done?'Contribuția ta este păstrată.':'Nu trebuie să apăsați exact în același timp.';panel.dataset.complete=String(done);
  }
  panel.append(detail,options);
  if(!finale&&included&&!observer&&exp.step!=='ready') { const b=el('button','mission-option mission-observe experience-observe','Prefer să privesc');b.dataset.value='tutorial:observe';b.disabled=blocked;b.addEventListener('click',()=>send(zone,'tutorial:observe'));panel.append(b); }
  const delivery=el('p','mission-delivery',!online?'Reconectare. Așteaptă revenirea legăturii.':snapshot.suspended||exp.paused?'O pauză de bord. Continuăm împreună.':pending?'Trimitem gestul tău…':status);delivery.setAttribute('role','status');panel.append(delivery);return panel;
}
