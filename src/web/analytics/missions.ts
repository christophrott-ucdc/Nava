import { SCENARIO_LABELS } from '@shared/mission';
import { summarizeScenario, type ScenarioId, type ScenarioProgress } from '@shared/scenario-engine';

interface MissionRow{runId:string;scenarioId:ScenarioId;status:string;createdAt:string;mode:string}
const states:Record<string,string>={prepared:'Pregătită',active:'În desfășurare',completed:'Încheiată',interrupted:'Întreruptă'};
export function createMissionAnalytics(api:<T>(url:string)=>Promise<T>):()=>Promise<void>{
  const panel=document.createElement('section');panel.className='glass panel mission-history';
  panel.innerHTML=`<div class="section-heading"><div><p class="eyebrow">EXPERIENȚE PE VÂRSTE</p><h2>Fiecare echipaj, propria călătorie</h2></div><span id="mission-history-count" class="note"></span></div><div class="mission-history-filters"><label>Experiență<select id="mission-history-profile"><option value="">Toate experiențele</option>${Object.entries(SCENARIO_LABELS).map(([id,label])=>`<option value="${id}">${label}</option>`).join('')}</select></label><label class="toggle"><input type="checkbox" id="mission-history-technical" /> Include verificările tehnice</label></div><p id="mission-history-status" role="status">Se încarcă jurnalul misiunilor…</p><div class="table-wrap"><table class="runs"><thead><tr><th>Experiență</th><th>Început</th><th>Stare</th><th>Mod</th><th>Rezumat</th></tr></thead><tbody id="mission-history-rows"></tbody></table></div><section id="mission-history-detail" hidden><div class="section-heading"><div><p class="eyebrow">STAREA PĂSTRATĂ A MISIUNII</p><h3 id="mission-history-detail-title"></h3></div><button type="button" id="mission-history-detail-close" class="nav-link nav-button">Închide rezumatul</button></div><p id="mission-history-detail-id"></p><div id="mission-history-summary"></div></section>`;
  document.querySelector('.page-intro')?.after(panel);
  const el=<T extends HTMLElement>(id:string)=>panel.querySelector<T>(`#${id}`)!;
  let rows:MissionRow[]=[],loading=false,detailRequest=0;
  function render():void{
    const selected=el<HTMLSelectElement>('mission-history-profile').value,list=rows.filter(r=>!selected||r.scenarioId===selected);
    el('mission-history-count').textContent=`${list.length} rulări`;const body=el('mission-history-rows');body.replaceChildren();
    for(const record of list){
      const row=document.createElement('tr');
      for(const value of [SCENARIO_LABELS[record.scenarioId]??record.scenarioId,new Date(record.createdAt).toLocaleString('ro-RO'),states[record.status]??record.status,record.mode==='public'?'Public':record.mode==='diagnostic'?'Diagnostic':'Repetiție']){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}
      const cell=document.createElement('td'),button=document.createElement('button');button.type='button';button.className='nav-link nav-button';button.textContent='Vezi contribuțiile';button.addEventListener('click',()=>void detail(record));cell.append(button);row.append(cell);body.append(row);
    }
    el('mission-history-status').textContent=list.length?'Rezultatele provin din misiuni identificate separat. Statisticile jurnalelor anterioare rămân mai jos.':'Nu există misiuni pentru acest filtru. Jurnalele anterioare rămân disponibile mai jos.';
  }
  async function detail(record:MissionRow):Promise<void>{
    const request=++detailRequest;el('mission-history-detail').hidden=false;el('mission-history-detail-title').textContent=SCENARIO_LABELS[record.scenarioId]??record.scenarioId;el('mission-history-detail-id').textContent=`${record.runId} · ${states[record.status]??record.status}`;el('mission-history-summary').textContent='Se încarcă…';
    try{
      const data=await api<{progress:ScenarioProgress}>(`/api/runs/${encodeURIComponent(record.runId)}/summary`);if(request!==detailRequest)return;
      const box=el('mission-history-summary');box.replaceChildren();
      if(record.scenarioId==='legacy-v3'){box.textContent='Această rulare folosește scenariul original. Detaliile cue-urilor și alegerilor sunt în jurnalele anterioare de mai jos.';return;}
      const summary=summarizeScenario(data.progress);
      for(const text of summary.lines){const p=document.createElement('p');p.textContent=text;box.append(p);}
      const grid=document.createElement('div');grid.className='mission-summary-posts';
      for(const post of summary.posts){const article=document.createElement('article'),title=document.createElement('h4');title.textContent=`Postul ${post.post}`;article.append(title);for(const text of post.lines){const p=document.createElement('p');p.textContent=text;article.append(p);}grid.append(article);}box.append(grid);
    }catch(err){if(request===detailRequest)el('mission-history-summary').textContent=err instanceof Error?err.message:String(err);}
  }
  const refresh=async()=>{
    if(loading)return;loading=true;
    try{const data=await api<{runs:MissionRow[]}>(`/api/missions${el<HTMLInputElement>('mission-history-technical').checked?'?technical=1':''}`);rows=data.runs;render();}
    catch(err){el('mission-history-status').textContent=err instanceof Error?err.message:String(err);}
    finally{loading=false;}
  };
  el('mission-history-profile').addEventListener('change',render);el('mission-history-technical').addEventListener('change',()=>void refresh());
  el('mission-history-detail-close').addEventListener('click',()=>{detailRequest++;el('mission-history-detail').hidden=true;});
  return refresh;
}
