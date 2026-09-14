import {sessionFetch} from '../shared/session';
interface TechnicalStatus {state:string;message:string;launch:{state:string;message:string;required:string[];confirmed:string[];preview:boolean;startAtMs?:number};backup:{state:string;lastSuccess:string|null;error:string|null;copies:number};checkpointSavedAt:string|null;}
export function createTechnicalStatus(role:()=>string|null,onLaunch?:(launch:TechnicalStatus["launch"])=>void){
  const toolbar=document.querySelector('.presentation-toolbar');if(!toolbar)return;
  const box=document.createElement('section');box.className='technical-status glass';box.setAttribute('aria-label','Starea tehnică a navei');
  const title=document.createElement('strong'),message=document.createElement('p'),details=document.createElement('details'),summary=document.createElement('summary'),screens=document.createElement('p'),backup=document.createElement('p'),save=document.createElement('button'),feedback=document.createElement('p');
  title.textContent='Se verifică instalația';title.setAttribute('role','status');summary.textContent='TV-uri și backup';save.type='button';save.textContent='Creează backup acum';feedback.setAttribute('role','status');
  details.append(summary,screens,backup,save,feedback);box.append(title,message,details);toolbar.after(box);
  let busy=false,reading=false;
  async function refresh(){if(reading||document.hidden)return;reading=true;try{
    const r=await sessionFetch('/api/technical');if(!r.ok)throw Error('Starea tehnică nu poate fi citită.');const s=await r.json() as TechnicalStatus;onLaunch?.(s.launch);
    title.textContent=({attention:'Necesită intervenție',preparing:'TV-urile se pregătesc',ready:'Pregătit',waiting:'În așteptarea instalației'} as Record<string,string>)[s.state]??'Stare necunoscută';box.dataset.state=s.state;message.textContent=s.message;
    const missing=s.launch.required.filter(id=>!s.launch.confirmed.includes(id));screens.textContent=`${s.launch.preview?'PREVIEW · confirmarea nu certifică TV-urile fizice. ':''}Cadru inițial: ${s.launch.confirmed.length}/${s.launch.required.length} ieșiri confirmate.${missing.length?' Așteptăm: '+missing.join(', '):''}`;
    if(s.launch.state==='idle')screens.textContent='Confirmarea cadrelor TV se va face la comanda de pornire a filmului.';
    backup.textContent=`Backup SQLite: ${s.backup.state==='running'?'în curs':s.backup.lastSuccess?new Date(s.backup.lastSuccess).toLocaleString('ro-RO'):'prima copie automată se creează în așteptare'} · ${s.backup.copies} copii.${s.backup.error?' Eroare: '+s.backup.error:''}${s.checkpointSavedAt?' Ultimul checkpoint: '+new Date(s.checkpointSavedAt).toLocaleTimeString('ro-RO'):''}`;
    save.disabled=busy||s.backup.state==='running'||!role()||role()==='viewer';
  }catch(error){title.textContent='Stare tehnică indisponibilă';box.dataset.state='attention';message.textContent=String(error);}finally{reading=false;}}
  save.addEventListener('click',()=>{if(busy)return;busy=true;save.disabled=true;feedback.textContent='Se creează copia consistentă…';void(async()=>{try{
    const r=await sessionFetch('/api/technical/backup',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),body=await r.json();
    if(!r.ok||!body.ok)throw Error(body.reason??body.backup?.error??'Backupul nu a putut fi creat.');feedback.textContent='Backup creat și verificat.';
  }catch(error){feedback.textContent=String(error);}finally{busy=false;await refresh();}})();});
  void refresh();setInterval(()=>void refresh(),1000);
}
