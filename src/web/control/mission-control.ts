import { DEFAULT_ACCESSIBILITY, type MissionSnapshot, type PostAccessibility } from '@shared/mission';
import type { DisplayAutomationStatus } from '@shared/display-topology';
import type { Command, } from '@shared/protocol';
import type { ShowState } from '@shared/types';
import { icon } from '../shared/glass';
import { createPackageEditor } from './package-editor';

interface Catalog {selected:string;catalog:Array<{id:string;label:string;ready:boolean;issues:string[];revision?:string}>}
interface Recovery {pending:boolean;issue:string|null;mission:MissionSnapshot}
type DiagnosticReport={kind:'preflight';at:string;softwareReady:boolean;assets:{ok:boolean;reasons:string[]};readiness:{ready:boolean;reasons:string[]};note:string}|{kind:'rehearsal';status:'running'|'passed'|'failed'|'cancelled';startedAt:string;elapsedSec:number;sampleCount:number;checks:Array<{name:string;status:'passed'|'failed'|'not-tested'|'not-observable';detail:string}>};
const postLabels=['NAVIGAȚIE','PROPULSIE','COMUNICAȚII','BIOSEMNALE','MEMORIE'];

export function createMissionControl(deps:{snapshot():{state:ShowState|null;role:string|null};dispatch(command:Command):Promise<void>}):void{
  const flight=document.querySelector('.present-flight'),toolbar=document.querySelector('.presentation-toolbar');
  if(!flight||!toolbar)return;
  const picker=document.createElement('div');picker.className='scenario-picker';
  picker.innerHTML=`<label for="mission-profile">Experiența echipajului</label><div class="scenario-select-row"><select id="mission-profile"><option>Se încarcă experiențele…</option></select><button id="mission-select" type="button">Aplică</button></div><p id="mission-profile-note" role="status">Verificăm pachetele și vocile.</p><button id="mission-recovery-alert" class="recovery-alert" type="button" hidden>O misiune așteaptă recuperarea</button>`;
  flight.querySelector('.present-checks')?.before(picker);
  const launch=document.createElement('button');launch.type='button';launch.className='mission-tools-button';launch.innerHTML=`${icon('tablet')} Misiune și instalație`;toolbar.append(launch);
  const dialog=document.createElement('dialog');dialog.className='mission-dialog glass';dialog.setAttribute('aria-labelledby','mission-dialog-title');
  dialog.innerHTML=`<header class="mission-dialog-header"><div><p class="eyebrow">PREGĂTIM FIECARE CĂLĂTORIE</p><h2 id="mission-dialog-title">Misiune și instalație</h2><p id="mission-identity">Așteptăm identitatea misiunii.</p></div><button id="mission-close" type="button" aria-label="Închide setările">Închide</button></header>
  <nav class="mission-tabs" aria-label="Setări misiune"><button type="button" data-mission-tab="crew" aria-pressed="true">Confortul echipajului</button><button type="button" data-mission-tab="wall" aria-pressed="false">Display-uri</button><button type="button" data-mission-tab="recovery" aria-pressed="false">Recuperare</button><button type="button" data-mission-tab="diagnostics" aria-pressed="false">Verificare tehnică</button></nav>
  <div class="mission-dialog-body"><section data-mission-panel="crew"><h3>O experiență confortabilă, la fiecare post</h3><p>Setările se aplică tabletei alese. Profilul și durata călătoriei rămân comune.</p><label class="mission-post-label">Postul echipajului<select id="mission-post">${postLabels.map((label,i)=>`<option value="${i+1}">${i+1} · ${label}</option>`).join('')}</select></label><form id="mission-accessibility" class="mission-access-grid"><label class="mission-text-size">Mărimea textului<select name="textScale"><option value="1">Standard</option><option value="1.15">Mai mare</option><option value="1.3">Foarte mare</option></select></label>${[
    ['contrastMode','Contrast ridicat'],['reducedMotion','Mișcare redusă'],['reducedStimuli','Mai puține efecte'],['simplifiedChrome','Interfață simplificată'],['showVisualGuidance','Explicații vizuale'],['sfxEnabled','Sunete la atingere'],
  ].map(([name,label])=>`<label class="mission-check"><input type="checkbox" name="${name}" /><span>${label}</span></label>`).join('')}<button type="submit" id="mission-save-access" class="mission-primary">Aplică pe acest post</button></form><p class="mission-help">Sunetele respectă și comanda globală „Sunete tablete” din consolă.</p></section>
  <section data-mission-panel="wall" hidden><h3>O singură imagine, ieșiri distincte</h3><p id="mission-wall-status">Inventarul se încarcă la deschiderea acestei vederi.</p><div class="mission-wall-actions"><button type="button" id="mission-detect">Detectează display-urile</button><button type="button" id="mission-apply-wall" class="mission-primary">Aplică împărțirea</button><a href="/wall/" target="_blank" rel="noreferrer">Deschide atelierul de panoramă</a></div><p id="mission-wall-geometry" class="mission-notice"></p><div id="mission-display-list" class="mission-display-list"></div><ul id="mission-wall-issues" class="mission-issues"></ul><p class="mission-help">Aplicarea cere rol admin și o misiune în pregătire. Identificarea fizică rămâne separată de numărul conexiunilor.</p></section>
  <section data-mission-panel="recovery" hidden><h3>Continuăm de unde s-a păstrat călătoria</h3><p id="mission-recovery-status">Verificăm ultima stare salvată.</p><div id="mission-recovery-details" class="mission-facts"></div><div class="mission-wall-actions"><button type="button" id="mission-resume" class="mission-primary">Verifică și continuă</button><button type="button" id="mission-restart">Pregătește un grup nou</button></div><p class="mission-help">Continuarea verifică readiness. Un grup nou închide sesiunea veche și păstrează confirmarea de restart existentă.</p></section>
  <section data-mission-panel="diagnostics" hidden><h3>Verificarea tehnică a instalației</h3><p>Verificăm starea raportată de dispozitive înainte de public. Raportul separă probele reușite de ceea ce necesită verificare fizică.</p><div class="mission-wall-actions"><button type="button" id="mission-diagnostics-start">Verificare rapidă</button><button type="button" id="mission-rehearsal-start" class="mission-primary">Repetiție completă · 10 minute</button><button type="button" id="mission-rehearsal-cancel" disabled>Oprește repetiția</button></div><p class="mission-help">Repetiția pornește filmul și misiunea la ritm normal, cu renderer real și toate dispozitivele pregătite. Comenzile obișnuite sunt blocate până la încheiere. Raportul și rularea tehnică sunt separate de sesiunile publicului; sunetul auzit, atingerea și alinierea fizică se verifică în sală.</p><div id="mission-diagnostics-report" class="mission-diagnostic-results">Niciun raport încărcat.</div></section></div><footer id="mission-action-status" role="status" aria-live="polite">Setările se salvează doar când apeși Aplică.</footer>`;
  document.body.append(dialog);
  createPackageEditor(dialog,()=>{const {state,role}=deps.snapshot();return !!role&&role!=='viewer'&&state?.state==='idle'&&!state.suspended;});
  const el=<T extends HTMLElement>(id:string)=>(document.getElementById(id) as T);
  let catalog:Catalog|null=null,mission:MissionSnapshot|null=null,recovery:Recovery|null=null,wall:DisplayAutomationStatus|null=null;
  let settings:Record<string,PostAccessibility>={},busy=false,refreshing=false,tab='crew',lastRun='';
  let accessDirty=false,rehearsalRunning=false;
  const status=(text:string,error=false)=>{el('mission-action-status').textContent=text;el('mission-action-status').dataset.error=String(error);};
  async function api<T>(url:string,body?:unknown):Promise<T>{
    const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
    if(response.status===401){location.assign('/login/?next=%2Fcontrol%2F');throw new Error('Sesiunea a expirat.');}
    const data=await response.json().catch(()=>({reason:'Răspuns invalid de la server.'}));
    if(!response.ok||data?.ok===false)throw new Error(data?.reason??`Cererea nu a reușit (${response.status}).`);
    return data as T;
  }
  async function action(work:()=>Promise<unknown>,message:string):Promise<void>{
    if(busy)return;busy=true;renderControls();status('Se aplică…');
    try{await work();await refresh(true);status(message);}catch(err){status(err instanceof Error?err.message:String(err),true);}
    finally{busy=false;renderControls();}
  }
  function renderControls():void{
    const {state,role}=deps.snapshot(),operator=!!role&&role!=='viewer',idle=state?.state==='idle'&&!state.suspended;
    el<HTMLSelectElement>('mission-profile').disabled=busy||!operator||!idle||!!recovery?.pending;
    const selected=el<HTMLSelectElement>('mission-profile').value;
    el<HTMLButtonElement>('mission-select').disabled=busy||!operator||!idle||!!recovery?.pending||!catalog?.catalog.find(p=>p.id===selected)?.ready||selected===catalog.selected;
    el<HTMLButtonElement>('mission-save-access').disabled=busy||!operator||!mission;
    el<HTMLButtonElement>('mission-detect').disabled=busy||!operator;
    el<HTMLButtonElement>('mission-apply-wall').disabled=busy||role!=='admin'||!idle||wall?.enabled!==true||!wall.candidate?.canApply;
    el<HTMLButtonElement>('mission-resume').disabled=busy||!operator||!recovery?.pending||!!recovery.issue;
    el<HTMLButtonElement>('mission-restart').disabled=busy||!operator||!mission;
    el<HTMLButtonElement>('mission-diagnostics-start').disabled=busy||!operator||!idle||rehearsalRunning;
    el<HTMLButtonElement>('mission-rehearsal-start').disabled=busy||!operator||!idle||rehearsalRunning;
    el<HTMLButtonElement>('mission-rehearsal-cancel').disabled=busy||!operator||!rehearsalRunning;
    el('mission-recovery-alert').hidden=!recovery?.pending;
  }
  function renderCatalog():void{
    if(!catalog)return;const select=el<HTMLSelectElement>('mission-profile');const previous=select.value;
    select.replaceChildren(...catalog.catalog.map(item=>{const option=document.createElement('option');option.value=item.id;option.textContent=item.label+(item.ready?'':' · în pregătire');option.disabled=!item.ready&&item.id!==catalog!.selected;return option;}));
    select.value=catalog.catalog.some(p=>p.id===previous&&p.ready)?previous:catalog.selected;
    if(lastRun!==mission?.runId){select.value=catalog.selected;lastRun=mission?.runId??'';}
    const current=catalog.catalog.find(p=>p.id===catalog!.selected);
    el('mission-profile-note').textContent=current?`Activ: ${current.label}${current.issues.length?` · ${current.issues.join('; ')}`:''}`:'Alege experiența înainte de show.';
  }
  function renderAccess():void{
    if(accessDirty)return;const chosen=settings[el<HTMLSelectElement>('mission-post').value]??DEFAULT_ACCESSIBILITY;
    const form=el<HTMLFormElement>('mission-accessibility');
    for(const [name,value]of Object.entries(chosen)){const field=form.elements.namedItem(name);if(field instanceof HTMLInputElement)field.checked=!!value;else if(field instanceof HTMLSelectElement)field.value=String(value);}
  }
  function renderRecovery():void{
    el('mission-identity').textContent=mission?`${mission.label} · ${mission.runId.slice(0,8)}`:'Identitatea misiunii nu este disponibilă.';
    el('mission-recovery-status').textContent=recovery?.issue??(recovery?.pending?'Misiunea este suspendată. Starea păstrată așteaptă verificarea instalației.':'Nu există o recuperare în așteptare.');
    const details=el('mission-recovery-details');details.replaceChildren();
    if(mission)for(const [label,value]of [['Experiență',mission.label],['Rulare',mission.runId],['Moment păstrat',`${mission.state.state} · ${Math.max(0,mission.state.phaseTime).toFixed(1)} s`]]){const row=document.createElement('p'),strong=document.createElement('strong');strong.textContent=label;row.append(strong,document.createTextNode(value));details.append(row);}
  }
  function renderWall():void{
    el('mission-wall-status').textContent=wall?`${wall.inventory.length} ieșiri detectate · ${wall.candidate?.screens.length??0} pentru public · ${wall.provider==='windows-native'?'inventar Windows':'inventar Electron'}${wall.profileRevision?` · profil ${wall.profileRevision}`:''}`:'Inventarul nativ necesită aplicația Electron și automatizarea configurată.';
    el('mission-wall-geometry').textContent=wall?.physicalCalibration.reason??'Calibrarea fizică nu a fost verificată.';
    const list=el('mission-display-list');list.replaceChildren();
    for(const d of wall?.inventory??[]){const card=document.createElement('article'),title=document.createElement('strong'),detail=document.createElement('p'),role=document.createElement('span');title.textContent=d.label;detail.textContent=`${d.pixelSize.width} × ${d.pixelSize.height} · ${Math.round(d.scaleFactor*100)}% · ${d.refreshHz} Hz`;const assignment=wall?.candidate?.assignments.find(a=>a.hardwareKey===d.hardwareKey);role.textContent=assignment?.role==='operator'?'Operator':assignment?.screenId==='center'?'Centru · Căpitan':assignment?.role==='audience'?'Public':'Neatribuit';card.append(title,detail,role);list.append(card);}
    const issues=el('mission-wall-issues');issues.replaceChildren();for(const message of [...(wall?.issues??[]),...(wall?.candidate?.warnings??[]),...(wall?.providerIssue?[wall.providerIssue]:[])]){const li=document.createElement('li');li.textContent=message;issues.append(li);}
  }
  async function loadWall():Promise<void>{const result=await api<DisplayAutomationStatus|{available:false;reason?:string}>('/api/wall/inventory');wall='inventory'in result?result:null;renderWall();renderControls();}
  async function loadDiagnostics():Promise<void>{
    const report=await api<DiagnosticReport|null>('/api/diagnostics/latest');const box=el('mission-diagnostics-report');box.replaceChildren();
    rehearsalRunning=report?.kind==='rehearsal'&&report.status==='running';renderControls();
    if(!report){box.textContent='Nicio verificare tehnică rulată încă.';return;}
    if(report.kind==='rehearsal'){
      const states={running:'Repetiție în desfășurare',passed:'Probele software ale repetiției au trecut',failed:'Repetiția necesită verificări',cancelled:'Repetiție oprită'};
      const heading=document.createElement('p');heading.className='mission-notice';heading.textContent=`${states[report.status]} · ${Math.floor(report.elapsedSec/60)} min ${Math.floor(report.elapsedSec%60)} s · ${report.sampleCount} probe de telemetrie`;box.append(heading);
      if(report.status==='running'){const progress=document.createElement('progress');progress.max=600;progress.value=Math.min(600,report.elapsedSec);progress.setAttribute('aria-label','Timpul repetiției, din aproximativ zece minute');box.append(progress);}
      for(const check of report.checks){const row=document.createElement('p');row.className=`present-check ${check.status==='passed'?'ready':'pending'}`;row.textContent=`${check.status==='passed'?'✓':check.status==='failed'?'!':'○'} ${check.name}: ${check.detail}`;box.append(row);}
      const note=document.createElement('p');note.className='mission-help';note.textContent='Raport tehnic separat de sesiunile publicului. Probele software nu certifică sunetul auzit, atingerile sau geometria fizică.';box.append(note);return;
    }
    const heading=document.createElement('p');heading.className='mission-notice';heading.textContent=`${report.softwareReady?'Verificarea software a trecut':'Sunt necesare verificări'} · ${new Date(report.at).toLocaleString('ro-RO')}`;box.append(heading);
    for(const [label,passed]of [['Fișierele filmului, vocilor și avatarului',report.assets.ok],['Pregătirea dispozitivelor',report.readiness.ready]] as const){const row=document.createElement('p');row.className=`present-check ${passed?'ready':'pending'}`;row.textContent=`${passed?'✓':'!'} ${label}`;box.append(row);}
    const list=document.createElement('ul');list.className='mission-issues';for(const message of [...new Set([...report.assets.reasons,...report.readiness.reasons])]){const item=document.createElement('li');item.textContent=message;list.append(item);}box.append(list);
    const note=document.createElement('p');note.className='mission-help';note.textContent=report.note;box.append(note);
    const physical=document.createElement('p');physical.className='mission-help';physical.textContent='În sală: verifică continuitatea imaginii, sunetul auzit, atingerea tabletelor și geometria ecranelor.';box.append(physical);
  }
  async function refresh(force=false):Promise<void>{
    if(refreshing)return;refreshing=true;
    const tasks=[api<Catalog>('/api/scenarios').then(value=>{catalog=value;}),api<MissionSnapshot>('/api/mission').then(value=>{mission=value;}),api<Recovery>('/api/recovery').then(value=>{recovery=value;}),api<{posts:Record<string,PostAccessibility>}>('/api/mission/accessibility').then(value=>{settings=value.posts;})];
    if(dialog.open&&tab==='wall')tasks.push(loadWall());if(dialog.open&&tab==='diagnostics')tasks.push(loadDiagnostics());
    const results=await Promise.allSettled(tasks);refreshing=false;
    renderCatalog();renderAccess();renderRecovery();renderControls();
    const failed=results.find((result):result is PromiseRejectedResult=>result.status==='rejected');if(failed&&(dialog.open||force))status(failed.reason instanceof Error?failed.reason.message:String(failed.reason),true);
  }
  function selectTab(next:string):void{tab=next;dialog.querySelectorAll<HTMLButtonElement>('[data-mission-tab]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.missionTab===next)));dialog.querySelectorAll<HTMLElement>('[data-mission-panel]').forEach(panel=>{panel.hidden=panel.dataset.missionPanel!==next;});void refresh();}
  launch.addEventListener('click',()=>{dialog.showModal();void refresh(true);});
  el('mission-close').addEventListener('click',()=>dialog.close());
  el('mission-recovery-alert').addEventListener('click',()=>{dialog.showModal();selectTab('recovery');});
  dialog.querySelectorAll<HTMLButtonElement>('[data-mission-tab]').forEach(button=>button.addEventListener('click',()=>selectTab(button.dataset.missionTab!)));
  el('mission-profile').addEventListener('change',renderControls);
  el('mission-select').addEventListener('click',()=>void action(()=>api('/api/scenarios/select',{id:el<HTMLSelectElement>('mission-profile').value}),'Experiența este încărcată și verificată.'));
  el('mission-post').addEventListener('change',()=>{accessDirty=false;renderAccess();});
  el('mission-accessibility').addEventListener('input',()=>{accessDirty=true;});
  el('mission-accessibility').addEventListener('submit',event=>{event.preventDefault();const form=el<HTMLFormElement>('mission-accessibility'),next={...DEFAULT_ACCESSIBILITY};for(const key of Object.keys(next)as Array<keyof PostAccessibility>){const field=form.elements.namedItem(key);if(key==='textScale'&&field instanceof HTMLSelectElement)next.textScale=Number(field.value);else if(key!=='textScale'&&field instanceof HTMLInputElement)next[key]=field.checked;}void action(async()=>{await api('/api/mission/accessibility',{post:Number(el<HTMLSelectElement>('mission-post').value),settings:next});accessDirty=false;},'Setările postului sunt salvate.');});
  el('mission-detect').addEventListener('click',()=>void action(async()=>{const result=await api<DisplayAutomationStatus|{available:false}>('/api/wall/detect',{});wall='inventory'in result?result:null;renderWall();},'Detectarea s-a încheiat. Verifică rezultatul înainte de aplicare.'));
  el('mission-apply-wall').addEventListener('click',()=>void action(()=>api('/api/wall/apply',{}),'Împărțirea display-urilor a fost aplicată.'));
  el('mission-resume').addEventListener('click',()=>void action(()=>api('/api/recovery/resume',{}),'Misiunea a fost reluată.'));
  el('mission-restart').addEventListener('click',()=>void action(()=>deps.dispatch({action:'restart'}),'Cererea pentru un grup nou a fost procesată.'));
  el('mission-diagnostics-start').addEventListener('click',()=>void action(()=>api('/api/diagnostics/start',{}),'Verificarea tehnică a fost cerută.'));
  el('mission-rehearsal-start').addEventListener('click',()=>void action(()=>api('/api/diagnostics/start',{mode:'rehearsal'}),'Repetiția completă a fost pornită. Urmărește progresul și instalația.'));
  el('mission-rehearsal-cancel').addEventListener('click',()=>void action(()=>api('/api/diagnostics/cancel',{}),'Repetiția a fost oprită.'));
  void refresh();window.setInterval(()=>{if(!document.hidden)void refresh();},10000);window.setInterval(renderControls,500);
  window.setInterval(()=>{if(!document.hidden&&dialog.open&&tab==='diagnostics'&&rehearsalRunning&&!refreshing&&!busy)void loadDiagnostics().catch(err=>status(err instanceof Error?err.message:String(err),true));},2000);
}
