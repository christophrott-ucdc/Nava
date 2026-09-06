import type {MissionSnapshot} from '../../shared/mission';

/** A quiet shared object above the film; full result appears only after arrival. */
export function createMissionOverlay(parent:HTMLElement){
  const box=document.createElement('aside');box.className='mission-glass';box.hidden=true;
  const title=document.createElement('h2'),detail=document.createElement('p'),posts=document.createElement('div');
  const object=document.createElement('div');object.className='mission-object';
  posts.className='mission-posts';box.append(title,object,detail,posts);parent.append(box);
  let key='';
  return {element:box,update(s:MissionSnapshot){
    box.hidden=s.scenarioId==='legacy-v3'||s.state.state==='idle'||!!s.experience?.active||!!s.experience?.finaleActive;
    if(box.hidden)return;
    const final=s.state.state==='epilogue'||s.state.state==='ended';
    box.classList.toggle('mission-finale',final);
    const next=JSON.stringify([s.runId,s.revision,s.stage,s.suspended,s.state.state,s.summary]);if(next===key)return;key=next;
    title.textContent=s.summary.title;
    detail.textContent=s.suspended?'Misiunea este în pauză. Operatorul pregătește continuarea.':final?s.summary.lines.slice(0,2).join(' · '):s.stage?`${s.experience?.participants.length ?? 10} participanți · Etapa ${s.stage} din 3`:'Călătorim împreună. Următoarea descoperire ne așteaptă.';
    object.hidden=!s.lantern||!final;
    if(s.lantern&&final){
      const colors=['#ffb86b','#ffe38f','#90dbff','#76e0bc','#b9a3ff'];
      const pieces=s.lantern.map((p,i)=>{const a=i*Math.PI*2/Math.max(1,s.lantern!.length)-Math.PI/2,x=160+98*Math.cos(a),y=135+90*Math.sin(a);return `<path d="M160 135 L${x} ${y}" stroke="${p.linked?'#ffe38f':'#ffffff35'}" stroke-width="${p.linked?5:2}" ${p.linked?'':'stroke-dasharray="4 5"'}/><circle cx="${x}" cy="${y}" r="23" fill="${p.mounted?colors[p.seat?Number(p.seat[0])-1:Math.floor(i/2)]:'#ffffff12'}" stroke="${p.found?colors[p.seat?Number(p.seat[0])-1:Math.floor(i/2)]:'#ffffff66'}" stroke-width="3"/><text x="${x}" y="${y+5}" text-anchor="middle" fill="${p.mounted?'#172337':'#fff'}" font-size="14">${p.seat ?? `${Math.floor(i/2)+1}${i%2?'B':'A'}`}</text>`;}).join('');
      object.innerHTML=`<svg viewBox="0 0 320 270" role="img" aria-label="Lanterna echipajului: doar piesele și legăturile confirmate sunt colorate"><path d="M139 103 Q139 66 160 66 Q181 66 181 103" fill="none" stroke="#ffe38f" stroke-width="7"/>${pieces}<rect x="134" y="105" width="52" height="68" rx="18" fill="#ffe9a9"/><path d="M151 150L160 121L169 150Z" fill="#ffa658"/></svg>`;
      const caption=document.createElement('p');caption.textContent=`${s.lantern.filter(p=>p.mounted).length} piese așezate · ${s.lantern.filter(p=>p.linked).length} capete prinse`;object.append(caption);
    }
    posts.hidden=!!s.lantern&&final;
    posts.replaceChildren();
    for(const post of s.summary.posts){
      const card=document.createElement('div'),label=document.createElement('strong'),text=document.createElement('span');
      label.textContent=String(post.post).padStart(2,'0');text.textContent=post.lines.slice(0,2).join(' · ');
      card.append(label,text);posts.append(card);
    }
  }};
}
