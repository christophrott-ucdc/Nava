import {sessionFetch} from '../shared/session';
import type {IntegrationSettings,AppUpdateStatus} from '@shared/integrations';
interface Snapshot {settings:IntegrationSettings;canChange:boolean;content:{state:string;id?:string;filesDone:number;filesTotal:number;message:string};physicalRobotAvailable:boolean;updates:AppUpdateStatus|null;robot:{mode:string;state:string;preparedClips:number;events:number;last:{text:string;cueId:string}|null;message:string};}
export function mountIntegrations(){
  const host=document.getElementById('view-instalatie');if(!host||host.querySelector(".integrations-panel"))return;
  const section=document.createElement('section');section.className='glass-strong panel integrations-panel';
  section.innerHTML=`<h2>Robot și actualizări</h2><p>Simulatorul urmărește narațiunea fără sunet suplimentar. Robotul instalației este Unitree H2 EDU. Conexiunea fizică rămâne dezactivată până la confirmarea API-ului audio pentru firmware-ul lui.</p>
  <form id="integration-settings"><label>Prezentator<select name="robot"><option value="screen">Avatarul actual</option><option value="simulator">Simulator robot · fără sunet</option></select></label>
  <label>Sursa aplicației<select name="provider"><option value="disabled">Actualizări dezactivate</option><option value="github">GitHub Releases · repository de distribuție public</option><option value="generic">Server HTTPS</option></select></label>
  <label>GitHub owner<input name="owner" autocomplete="off" placeholder="organizație" maxlength="39"></label><label>Repository distribuție<input name="repo" autocomplete="off" placeholder="exodus7-releases" maxlength="100"></label>
  <label>Adresă HTTPS<input name="url" type="url" placeholder="https://updates.exemplu.ro/stable/" maxlength="2000"></label>
  <label>Manifest multimedia HTTPS<input name="contentUrl" type="url" placeholder="https://media.exemplu.ro/releases/stable.json" maxlength="2000"></label>
  <button type="submit" class="button-primary">Salvează configurația</button></form>
  <p id="integration-feedback" role="status"></p><h3>Simulatorul narațiunii</h3><p id="integration-robot"></p><blockquote id="integration-line"></blockquote>
  <h3>Actualizarea aplicației</h3><p id="integration-update" role="status"></p><div class="integration-actions"><button type="button" data-update="check">Verifică versiunea</button><button type="button" data-update="download">Descarcă</button><button type="button" data-update="install">Instalează și repornește</button></div>
  <h3>Scenarii, voci și filme</h3><p id="integration-content" role="status"></p><div class="integration-actions"><button type="button" data-content="check">Verifică pachetul</button><button type="button" data-content="download">Descarcă pachetul</button><button type="button" data-content="activate">Activează și repornește</button></div>
  <p>Instalarea cere o versiune semnată de editorul configurat și un backup SQLite reușit. Nicio instalare automată la închiderea aplicației.</p>`;
  host.prepend(section);
  const form=section.querySelector<HTMLFormElement>('form')!,feedback=section.querySelector<HTMLElement>('#integration-feedback')!;
  let state:Snapshot|null=null,busy=false,reading=false,dirty=false;
  const field=(name:string)=>form.elements.namedItem(name) as HTMLInputElement|HTMLSelectElement;
  form.addEventListener('input',()=>{dirty=true;});
  async function request(url:string,body?:unknown){const r=await sessionFetch(url,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const b=await r.json();if(!r.ok||b.ok===false)throw Error(b.reason??'Operația nu este disponibilă.');return b;}
  function controls(){
    for(const control of form.querySelectorAll<HTMLButtonElement|HTMLInputElement|HTMLSelectElement>('button,input,select'))control.disabled=busy||!state?.canChange;
    for(const b of section.querySelectorAll<HTMLButtonElement>('[data-content]'))b.disabled=busy||!state?.canChange||!state.settings.contentUrl||(b.dataset.content==='download'&&!['available','error'].includes(state.content.state))||(b.dataset.content==='activate'&&state.content.state!=='downloaded');
    for(const b of section.querySelectorAll<HTMLButtonElement>('[data-update]'))b.disabled=busy||!state?.canChange||!state.updates?.installSupported||state.updates.state==='disabled'||(b.dataset.update==='download'&&state.updates.state!=='available')||(b.dataset.update==='install'&&state.updates.state!=='downloaded');
  }
  async function refresh(){if(reading||document.hidden||host!.hidden)return;reading=true;try{
    state=await request('/api/integrations') as Snapshot;
    if(!dirty){field('contentUrl').value=state.settings.contentUrl??'';field('robot').value=state.settings.robotMode;const f=state.settings.updates;field('provider').value=f.provider;field('owner').value=f.provider==='github'?f.owner:'';field('repo').value=f.provider==='github'?f.repo:'';field('url').value=f.provider==='generic'?f.url:'';}
    section.querySelector('#integration-robot')!.textContent=`${state.robot.message} · ${state.robot.preparedClips} replici pregătite · ${state.robot.events} evenimente observate · ${state.robot.state}`;
    section.querySelector('#integration-line')!.textContent=state.robot.last?`${state.robot.last.cueId}: ${state.robot.last.text}`:'Simulatorul va urmări replicile AVATAR_AI din următoarea sesiune.';
    section.querySelector('#integration-content')!.textContent=`${state.content.message} · ${state.content.filesDone}/${state.content.filesTotal} fișiere${state.content.id?' · '+state.content.id:''}`;
    const u=state.updates;section.querySelector('#integration-update')!.textContent=u?`Versiunea curentă: ${u.version}. ${u.message}${u.percent!==undefined?' '+Math.round(u.percent)+'%':''}`:'Updater indisponibil în afara Electron.';
  }catch(error){feedback.textContent=String(error);state=null;}finally{reading=false;controls();}}
  async function action(work:()=>Promise<unknown>){if(busy)return;busy=true;controls();feedback.textContent='Se aplică…';try{await work();feedback.textContent='Operație încheiată.';}catch(error){feedback.textContent=String(error);}finally{busy=false;await refresh();}}
  form.addEventListener('submit',e=>{e.preventDefault();void action(async()=>{const provider=field('provider').value;await request('/api/integrations/settings',{version:1,robotMode:field('robot').value,contentUrl:field('contentUrl').value.trim()||undefined,updates:provider==='github'?{provider,owner:field('owner').value.trim(),repo:field('repo').value.trim()}:provider==='generic'?{provider,url:field('url').value.trim()}:{provider:'disabled'}});dirty=false;});});
  section.querySelectorAll<HTMLButtonElement>('[data-update]').forEach(button=>button.addEventListener('click',()=>{
    const name=button.dataset.update!,version=state?.updates?.availableVersion;
    if(name==='install'&&!window.confirm(`Instalezi versiunea ${version}? Aplicația va face backup, apoi se va închide pentru instalare.`))return;
    void action(()=>request('/api/integrations/updates/'+name,name==='install'?{version}:{}));
  }));
  section.querySelectorAll<HTMLButtonElement>('[data-content]').forEach(button=>button.addEventListener('click',()=>{const name=button.dataset.content!,id=state?.content.id;if(name==='activate'&&!window.confirm(`Activezi pachetul ${id}? Se face backup și se repornește aplicația.`))return;void action(()=>request('/api/integrations/content/'+name,name==='activate'?{id}:{}));}));
  const observer=new MutationObserver(()=>{if(!host.hidden)void refresh();});observer.observe(host,{attributes:true,attributeFilter:["hidden"]});
  void refresh();const timer=setInterval(()=>void refresh(),10000);
  window.addEventListener("pagehide",()=>{clearInterval(timer);observer.disconnect();},{once:true});
}
