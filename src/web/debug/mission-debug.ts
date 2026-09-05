import type { MissionSnapshot } from '@shared/mission';
import type { DisplayAutomationStatus } from '@shared/display-topology';

export function createMissionDebug(api:<T>(url:string,init?:RequestInit)=>Promise<T>):()=>Promise<void>{
  const panel=document.createElement('section');panel.className='glass panel span2 mission-debug';
  panel.innerHTML='<h2>MISIUNE · RECUPERARE · DISPLAY-URI</h2><div class="mission-debug-cards"><div><span>Rulare curentă</span><strong id="debug-mission-label">Se încarcă…</strong><small id="debug-mission-id"></small></div><div><span>Jurnal persistent</span><strong id="debug-mission-count">—</strong><small id="debug-recovery-state"></small></div><div><span>Ieșiri native</span><strong id="debug-display-count">—</strong><small id="debug-display-provenance"></small></div></div><p id="debug-mission-issue" role="status"></p><details><summary>Inventar și geometrie fizică</summary><pre id="debug-native-inventory"></pre></details><details><summary>Ultima verificare tehnică</summary><pre id="debug-diagnostic-report"></pre></details>';
  document.getElementById('p-status')?.after(panel);
  const el=(id:string)=>panel.querySelector<HTMLElement>(`#${id}`)!;
  let pending=false,lastAt=0;
  return async()=>{
    if(pending||Date.now()-lastAt<4500)return;pending=true;lastAt=Date.now();
    const results=await Promise.allSettled([
      api<MissionSnapshot>('/api/mission').then(m=>{el('debug-mission-label').textContent=m.label;el('debug-mission-id').textContent=`${m.runId} · revizia ${m.revision} · ${m.state.state}`;}),
      api<{runs:unknown[]}>('/api/missions?technical=1').then(m=>{el('debug-mission-count').textContent=`${m.runs.length} rulări citite`;}),
      api<{pending:boolean;issue:string|null}>('/api/recovery').then(r=>{el('debug-recovery-state').textContent=r.issue??(r.pending?'Recuperare în așteptare':'Fără recuperare în așteptare');}),
      api<DisplayAutomationStatus|{available:false;reason?:string}>('/api/wall/inventory').then(w=>{
        if('inventory'in w){el('debug-display-count').textContent=`${w.inventory.length} detectate · ${w.candidate?.screens.length??0} public`;el('debug-display-provenance').textContent=w.provider==='windows-native'?'Windows QueryDisplayConfig + Electron':'Electron · fără identificare fizică completă';el('debug-native-inventory').textContent=JSON.stringify(w,null,2);}
        else{el('debug-display-count').textContent='Indisponibil';el('debug-display-provenance').textContent=w.reason??'Providerul nativ necesită Electron.';el('debug-native-inventory').textContent='Nicio geometrie fizică verificată.';}
      }),
      api<unknown>('/api/diagnostics/latest').then(report=>{el('debug-diagnostic-report').textContent=report?JSON.stringify(report,null,2):'Niciun raport încă.';}),
    ]);
    const failures=results.filter((r):r is PromiseRejectedResult=>r.status==='rejected');
    el('debug-mission-issue').textContent=failures.length?`${failures.length} surse nu au fost actualizate. ${failures.map(r=>r.reason instanceof Error?r.reason.message:String(r.reason)).join(' · ')}`:'Date citite din API-urile active. Prezența software nu certifică montajul sau sunetul din sală.';
    el('debug-mission-issue').className=failures.length?'bad':'dim';pending=false;
  };
}
