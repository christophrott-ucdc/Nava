import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {Hono} from 'hono';
import type {MissionRecord} from '../../shared/mission';
import {SCENARIO_LABELS} from '../../shared/mission';
import {crewCharacter} from '../../shared/crew';
import {translateText,LOCALE} from '../../shared/localization';
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const runPattern=/^[a-zA-Z0-9_-]{1,80}$/;
export async function createCrewDiplomas(deps:{directory:string;appRoot:string;getRecord:(run:string)=>MissionRecord|null;renderPdf?:(html:string)=>Promise<Buffer>}){
 await fs.mkdir(deps.directory,{recursive:true});
 const secretFile=path.join(deps.directory,'.download-secret');
 try{await fs.writeFile(secretFile,randomBytes(32),{flag:'wx'});}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}
 const secret=await fs.readFile(secretFile);if(secret.length!==32)throw Error('Cheia diplomelor este invalidă; fișierul a fost păstrat.');
 const token=(run:string)=>createHmac('sha256',secret).update('crew-diploma-v1:'+run).digest('hex');
 const urlPath=(run:string)=>`/souvenir/${encodeURIComponent(run)}/${token(run)}/diploma.pdf`;
 let logo='';for(const base of [deps.appRoot,...(typeof process.resourcesPath==='string'?[process.resourcesPath]:[])])try{logo='data:image/png;base64,'+(await fs.readFile(path.join(base,'dist/web/shared/brand/exodus7-v1.png'))).toString('base64');break;}catch{}
 // A bounded, shared generation prevents multiple simultaneous QR scans spawning renderers.
 const pending=new Map<string,Promise<Buffer>>();
 const router=new Hono();
 router.get('/:run/:token/diploma.pdf',async c=>{
   c.header('Referrer-Policy','no-referrer');c.header('X-Content-Type-Options','nosniff');
   const run=c.req.param('run'),provided=c.req.param('token');
   if(!runPattern.test(run)||!/^[a-f0-9]{64}$/.test(provided)||!timingSafeEqual(Buffer.from(provided,'hex'),Buffer.from(token(run),'hex')))return c.text('Legătură invalidă',404);
   const file=path.join(deps.directory,run+'.pdf');let bytes:Buffer;
   try{bytes=await fs.readFile(file);}catch(e){
     if((e as NodeJS.ErrnoException).code!=='ENOENT')return c.text('Diploma nu poate fi citită.',503);
     const record=deps.getRecord(run);
     if(!record||record.checkpoint?.state!=='ended')return c.text('Diploma va fi disponibilă după încheierea călătoriei.',409);
     if(!deps.renderPdf)return c.text('Generarea PDF necesită aplicația Electron a navei.',503);
     if(!pending.has(run)&&pending.size>=1){c.header('Retry-After','5');return c.text('O diplomă este în curs de pregătire. Reîncearcă în câteva secunde.',503);}
     if(!pending.has(run)){
       const immutable=structuredClone(record);
       const task=(async()=>{const pdf=await deps.renderPdf!(diplomaHtml(immutable,logo));if(pdf.subarray(0,5).toString()!=='%PDF-')throw Error('PDF invalid');await fs.writeFile(file+'.tmp',pdf);await fs.rename(file+'.tmp',file);return pdf;})();
       pending.set(run,task);void task.finally(()=>pending.delete(run)).catch(()=>{});
     }
     try{bytes=await pending.get(run)!;}catch{return c.text('Diploma nu a putut fi generată. Te rugăm să reîncerci.',503);}
   }
   return c.body(new Uint8Array(bytes),200,{'Content-Type':'application/pdf','Content-Disposition':`inline; filename="EXODUS7-diploma-echipaj.pdf"`,'Cache-Control':'private, max-age=3600'});
 });
 return {router,urlPath};
}

/** Local, escaped HTML. No user names, scripts, remote images or external fonts. */
export function diplomaHtml(record:MissionRecord,logo:string){
 const lang=record.checkpoint?.lang??'ro';
 const seats=[...new Set(record.experience?.participants??record.progress.participants??[])].filter(s=>/^[1-5][AB]$/.test(s)).sort();
 const crew=seats.map(seat=>{const character=crewCharacter(record.experience?.crew?.characters[seat]);return `<div class="member"><b>${escape(character?.name??'Explorator')}</b><span>Postul ${seat[0]} · Locul ${seat[1]}</span><small>${escape(character?.role??'Membru al echipajului')}</small></div>`;}).join('');
 const demo=record.mode!=='public'||!seats.length;
 const date=new Date(record.createdAt).toLocaleDateString(LOCALE[lang],{timeZone:'Europe/Bucharest',year:'numeric',month:'long',day:'numeric'});
 const html=`<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>
 @page{size:A4 landscape;margin:0}*{box-sizing:border-box}html,body{margin:0;width:297mm;height:210mm;font-family:'Segoe UI',sans-serif;color:#17364b;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{padding:12mm;background:radial-gradient(ellipse at 80% 0%,#d8eef7,transparent 55%),linear-gradient(135deg,#fffdf2,#eef5ff 60%,#fff0db)}main{height:186mm;border:1mm solid #d4b574;border-radius:8mm;padding:9mm 12mm;position:relative;overflow:hidden}header{display:flex;align-items:center;justify-content:space-between}header img{width:55mm;height:18mm;object-fit:contain}header strong{font-size:11pt;letter-spacing:2px}.seal{color:#ba8937;font-size:32pt}h1{text-align:center;font-size:32pt;letter-spacing:1px;margin:5mm 0 1mm}.subtitle{text-align:center;font-size:17pt;color:#547089;margin:0 0 3mm}.intro{text-align:center;font-size:12pt;margin:0 auto 4mm;max-width:230mm;line-height:1.5}.crew{display:grid;grid-template-columns:repeat(5,1fr);gap:3mm;min-height:40mm;align-content:center}.member{background:#ffffffb8;border:0.3mm solid #c8dae5;border-radius:3mm;padding:3mm;text-align:center}.member b{display:block;font-size:15pt;color:#235f78}.member span{display:block;font-size:9pt;margin:1mm 0}.member small{font-size:8pt;color:#547089}.route{margin:5mm 0;text-align:center;color:#617f91;font-size:10pt}.message{text-align:center;font-size:15pt;color:#87662f;margin:3mm 0}footer{position:absolute;bottom:7mm;left:12mm;right:12mm;border-top:0.3mm solid #d0bd92;padding-top:3mm;display:flex;justify-content:space-between;font-size:9pt}.demo{font-size:10pt;text-align:center;color:#805328}.empty{text-align:center;grid-column:1/-1;font-size:15pt}
 </style></head><body><main><header>${logo?`<img src="${logo}" alt="EXODUS7">`:'<strong>EXODUS7</strong>'}<strong>A PATRA LUME</strong><span class="seal">✦</span></header><h1>DIPLOMA ECHIPAJULUI</h1><p class="subtitle">${escape(SCENARIO_LABELS[record.scenarioId])}</p><p class="intro">${seats.length===1?'Acest explorator a luat parte':'Acest echipaj a luat parte'} la călătoria navei EXODUS7.<br>Am privit, am descoperit și am dus povestea mai departe.</p><section class="crew">${crew||'<p class="empty">EXODUS7 · Demonstrație fără participanți înregistrați</p>'}</section><p class="route">Pământ → Lumina → Natura → Cristal → Tunel → Saturn → Acasă</p><p class="message">Curiozitatea este începutul fiecărei descoperiri.</p>${demo?'<p class="demo">EXEMPLAR DE DEMONSTRAȚIE / REPETIȚIE</p>':''}<footer><span>${escape(date)}</span><span>${seats.length} ${seats.length===1?'explorator':'exploratori'} · Personaje ale poveștii</span><span>Amintire de participare · EXODUS7</span></footer></main></body></html>`;
 return lang==='ro'?html:html.split(/(<style[\s\S]*?<\/style>|<[^>]*>)/g).map(part=>part.startsWith('<')?part:escape(translateText(part.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>'),lang))).join('');
}
