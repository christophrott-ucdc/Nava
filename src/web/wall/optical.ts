import { createOpticalMarkerMap, opticalMarkerSvg, validateOpticalCalibration } from '../../shared/optical-calibration';
import type { DisplayAutomationStatus } from '../../shared/display-topology';

type MarkerMap=ReturnType<typeof createOpticalMarkerMap>;
/** Stable identifier only; validator also compares the full map, never this fingerprint alone. */
function fingerprint(value:unknown):string{const text=JSON.stringify(value);let hash=2166136261;for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}return `nava-topology-${(hash>>>0).toString(16)}`;}
export function createOpticalWorkshop():void{
  const panel=document.createElement('section');panel.className='glass optical-workshop';
  panel.innerHTML=`<div class="section-top"><div><p class="eyebrow">CALIBRARE DIN IMAGINEA SĂLII</p><h2>Vedem împreună marginile ecranelor.</h2></div><span class="pill">Geometrie proiectată</span></div><p class="help">Modelele de calibrare identifică fiecare colț al fiecărui display. O fotografie făcută din poziția de referință permite verificarea ordinii și a spațiilor aparente. Rezultatul este în coordonatele imaginii camerei, fără milimetri presupuşi.</p><label class="optical-reference">Poziția de referință<input id="optical-reference" maxlength="180" value="Poziția de referință a publicului — de confirmat" /></label><div class="optical-actions"><button type="button" id="optical-prepare">Pregătește marcajele</button><button type="button" id="optical-export" disabled>Descarcă protocolul</button><label class="optical-import-button">Importă rezultatul camerei<input type="file" id="optical-import" accept="application/json,.json" disabled /></label></div><p id="optical-status" role="status">Pregătește marcajele din inventarul actual, înainte de a importa o calibrare.</p><div id="optical-markers" class="optical-markers"></div><details class="optical-guide"><summary>Cum obții imaginea de calibrare</summary><ol><li>Descarcă protocolul și planșa SVG pentru fiecare display. Afișează fiecare planșă pe display-ul indicat, complet, fără decupare.</li><li>Fotografiază toate marcajele din poziția de referință. Păstrează toate cele patru colțuri ale fiecărui display în cadru.</li><li>Pe PC-ul navei, rulează instrumentul local cu protocolul și imaginea. Importă aici fișierul JSON rezultat.</li></ol><code>python scripts/calibrate-wall.py --mapping marker-map.json --input photograph.jpg --output calibration.json</code><p class="help">Nu muta ecranele sau camera între captură și verificare. Un rezultat incomplet ori cu o topologie diferită este respins.</p></details><div id="optical-result" hidden><h3>Rezultatul verificării</h3><p id="optical-result-note"></p><canvas id="optical-preview" aria-label="Contururile display-urilor în vederea camerei"></canvas><div id="optical-result-metrics" class="optical-metrics"></div><div class="optical-actions"><button id="optical-export-accepted" type="button" disabled>Descarcă rezultatul verificat</button><button id="optical-apply" type="button" disabled>Aplică proiecția calibrată</button></div><p class="help">Proiecția este corectată pentru poziția de referință a camerei, fără dimensiuni fizice presupuse. Aplicarea cere admin și misiune oprită în pregătire; profilul se salvează și rendererele se redeschid.</p></div>`;
  document.querySelector('.handover')?.before(panel);
  const el=<T extends HTMLElement>(id:string)=>panel.querySelector<T>(`#${id}`)!;
  let map:MarkerMap|null=null,accepted:unknown=null,busy=false;
  const status=(text:string,error=false)=>{el('optical-status').textContent=text;el('optical-status').classList.toggle('invalid',error);};
  const download=(name:string,data:string,type:string)=>{const url=URL.createObjectURL(new Blob([data],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  const json=(name:string,value:unknown)=>download(name,JSON.stringify(value,null,2)+'\n','application/json');
  async function api<T>(url:string):Promise<T>{const response=await fetch(url,{credentials:'same-origin',cache:'no-store'});if(response.status===401){location.assign('/login/?next=%2Fwall%2F');throw new Error('Autentificare necesară.');}if(!response.ok)throw new Error('Inventarul playerului nu este disponibil.');return await response.json() as T;}
  async function prepare():Promise<void>{
    if(busy)return;busy=true;el<HTMLButtonElement>('optical-prepare').disabled=true;accepted=null;map=null;el('optical-result').hidden=true;el<HTMLInputElement>('optical-import').disabled=true;el<HTMLButtonElement>('optical-export').disabled=true;el<HTMLButtonElement>('optical-export-accepted').disabled=true;el<HTMLButtonElement>('optical-apply').disabled=true;el('optical-markers').replaceChildren();status('Citind ieșirile fizice și profilul playerului…');
    try{
      const [wall,inventory]=await Promise.all([api<{screens:Array<{id:string;displayIndex:number}>}>('/api/wall'),api<DisplayAutomationStatus|{available:false}>('/api/wall/inventory')]);
      if(!('inventory'in inventory)||!inventory.inventory.length)throw new Error('Marcajele cer inventarul nativ al aplicației Electron.');
      const displays=wall.screens.map(screen=>{
        const display=inventory.inventory.find(d=>d.index===screen.displayIndex);
        if(!display)throw new Error(`Ieșirea pentru ${screen.id} nu este conectată.`);
        return {displayId:screen.id,hardwareKey:display.hardwareKey,pixelWidth:display.pixelSize.width,pixelHeight:display.pixelSize.height};
      });
      displays.sort((a,b)=>a.displayId.localeCompare(b.displayId));
      if(new Set(displays.map(d=>d.hardwareKey)).size!==displays.length)throw new Error('Două ecrane partajează aceeași ieșire; este necesar desktop extins.');
      map=createOpticalMarkerMap(displays,fingerprint({displays,bounds:inventory.inventory.map(d=>({key:d.hardwareKey,bounds:d.boundsDip,rotation:d.rotation}))}),el<HTMLInputElement>('optical-reference').value.trim());
      for(const display of displays){
        const item=document.createElement('article'),title=document.createElement('strong'),detail=document.createElement('p'),button=document.createElement('button');title.textContent=display.displayId;detail.textContent=`${display.pixelWidth} × ${display.pixelHeight} · patru marcaje`;button.type='button';button.textContent='Descarcă planșa SVG';button.addEventListener('click',()=>{if(map)download(`markers-${display.displayId.replace(/[^a-zA-Z0-9_-]/g,'_')}.svg`,opticalMarkerSvg(map,display.displayId),'image/svg+xml');});item.append(title,detail,button);el('optical-markers').append(item);
      }
      el<HTMLButtonElement>('optical-export').disabled=false;el<HTMLInputElement>('optical-import').disabled=false;status(`${displays.length} display-uri identificate. Descarcă protocolul și planșele înainte de fotografia sălii.`);
    }catch(err){status(err instanceof Error?err.message:String(err),true);}
    finally{busy=false;el<HTMLButtonElement>('optical-prepare').disabled=false;}
  }
  el('optical-prepare').addEventListener('click',()=>void prepare());
  el('optical-export').addEventListener('click',()=>{if(map)json('marker-map.json',map);});
  el('optical-reference').addEventListener('input',()=>{map=null;accepted=null;el<HTMLInputElement>('optical-import').disabled=true;el<HTMLButtonElement>('optical-export').disabled=true;el<HTMLButtonElement>('optical-export-accepted').disabled=true;el<HTMLButtonElement>('optical-apply').disabled=true;el('optical-result').hidden=true;status('Poziția de referință s-a schimbat. Pregătește din nou marcajele.');});
  el('optical-import').addEventListener('change',async()=>{
    const field=el<HTMLInputElement>('optical-import'),file=field.files?.[0];accepted=null;el('optical-result').hidden=true;el<HTMLButtonElement>('optical-export-accepted').disabled=true;el<HTMLButtonElement>('optical-apply').disabled=true;
    if(!file||!map)return;
    try{
      if(file.size>2*1024*1024)throw new Error('Fișierul rezultat depășește 2 MB.');
      const [freshWall,freshInventory]=await Promise.all([api<{screens:Array<{id:string;displayIndex:number}>}>('/api/wall'),api<DisplayAutomationStatus|{available:false}>('/api/wall/inventory')]);
      if(!('inventory'in freshInventory))throw new Error('Inventarul nativ nu mai este disponibil.');
      const displays=freshWall.screens.map(screen=>{const d=freshInventory.inventory.find(item=>item.index===screen.displayIndex);if(!d)throw new Error('Un display a fost deconectat. Pregătește din nou marcajele.');return {displayId:screen.id,hardwareKey:d.hardwareKey,pixelWidth:d.pixelSize.width,pixelHeight:d.pixelSize.height};});
      displays.sort((a,b)=>a.displayId.localeCompare(b.displayId));
      const expected=createOpticalMarkerMap(displays,fingerprint({displays,bounds:freshInventory.inventory.map(d=>({key:d.hardwareKey,bounds:d.boundsDip,rotation:d.rotation}))}),el<HTMLInputElement>('optical-reference').value.trim());
      const result=validateOpticalCalibration(JSON.parse(await file.text()),expected);
      if(!result.ok)throw new Error(result.errors.join(' '));
      accepted=result.calibration;const calibration=result.calibration;
      el('optical-result').hidden=false;el('optical-result-note').textContent=`${calibration.displays.length} display-uri verificate · ordine în fotografie: ${calibration.order.join(' → ')}. Coordonate normalizate, nu dimensiuni fizice.`;
      const canvas=el<HTMLCanvasElement>('optical-preview'),scale=Math.min(1000/calibration.imageSize.width,600/calibration.imageSize.height);canvas.width=Math.max(1,Math.round(calibration.imageSize.width*scale));canvas.height=Math.max(1,Math.round(calibration.imageSize.height*scale));const context=canvas.getContext('2d')!;context.fillStyle='#edf0f8';context.fillRect(0,0,canvas.width,canvas.height);
      const metrics=el('optical-result-metrics');metrics.replaceChildren();
      for(const [index,display] of calibration.displays.entries()){
        const points=display.normalizedCorners;context.beginPath();points.forEach(([x,y],i)=>{if(i===0)context.moveTo(x*canvas.width,y*canvas.height);else context.lineTo(x*canvas.width,y*canvas.height);});context.closePath();context.fillStyle=index%2?'#d8ecfa':'#e7dffa';context.fill();context.strokeStyle='#586988';context.lineWidth=2;context.stroke();context.fillStyle='#263249';context.font='15px Segoe UI';const center=points.reduce((acc,[x,y])=>({x:acc.x+x/4,y:acc.y+y/4}),{x:0,y:0});context.fillText(display.displayId,center.x*canvas.width-30,center.y*canvas.height);
        const row=document.createElement('p');row.textContent=`${display.displayId} · eroare ${display.rmsPx.toFixed(2)} px de cameră · verificare independentă ${display.independentRmsPx.toFixed(2)} px`;metrics.append(row);
      }
      el<HTMLButtonElement>('optical-export-accepted').disabled=false;el<HTMLButtonElement>('optical-apply').disabled=false;status('Rezultat valid pentru protocolul pregătit. Verifică contururile și perspectiva din sală.');
    }catch(err){status(err instanceof Error?err.message:String(err),true);}
    finally{field.value='';}
  });
  el('optical-export-accepted').addEventListener('click',()=>{if(accepted)json('calibration-verified.json',accepted);});
  el('optical-apply').addEventListener('click',async()=>{
    if(!accepted||busy)return;busy=true;el<HTMLButtonElement>('optical-apply').disabled=true;status('Verificăm topologia actuală și aplicăm proiecția…');
    try{
      const response=await fetch('/api/wall/apply',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({optical:accepted})});
      const result=await response.json().catch(()=>({reason:'Răspuns invalid de la player.'}));
      if(!response.ok||result?.ok===false)throw new Error(result?.reason??`Aplicarea a fost refuzată (${response.status}).`);
      status('Proiecția calibrată a fost aplicată. Verifică continuitatea imaginii din poziția de referință.');
    }catch(err){status(err instanceof Error?err.message:String(err),true);}
    finally{busy=false;el<HTMLButtonElement>('optical-apply').disabled=!accepted;}
  });
}
