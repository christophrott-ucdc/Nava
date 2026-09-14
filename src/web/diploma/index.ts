import {decodeDiploma} from '../../shared/public-diploma';
import {crewCharacter} from '../../shared/crew';
import {SCENARIO_LABELS} from '../../shared/mission';
import {startUiLocalization,setUiLanguage,localizeCanvas} from '../shared/localization';
startUiLocalization(false);
const canvas=document.getElementById('diploma') as HTMLCanvasElement,button=document.getElementById('download') as HTMLButtonElement,status=document.getElementById('status')!;
/** A self-contained one-page PDF with a high-resolution JPEG; no font/service dependency. */
function pdfBlob(canvas:HTMLCanvasElement):Blob{
 const raw=atob(canvas.toDataURL('image/jpeg',.95).split(',')[1]),jpeg=Uint8Array.from(raw,c=>c.charCodeAt(0)),enc=new TextEncoder(),parts:Uint8Array[]=[],offsets=[0];let size=0;
 const add=(x:string|Uint8Array)=>{const b=typeof x==='string'?enc.encode(x):x;parts.push(b);size+=b.length;};
 add('%PDF-1.4\n');const obj=(id:number,text:string)=>{offsets[id]=size;add(`${id} 0 obj\n${text}\nendobj\n`);};
 obj(1,'<< /Type /Catalog /Pages 2 0 R >>');obj(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');obj(3,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 841.89 595.28] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
 offsets[4]=size;add(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);add(jpeg);add('\nendstream\nendobj\n');const commands='q\n841.89 0 0 595.28 0 0 cm\n/Im0 Do\nQ\n';obj(5,`<< /Length ${enc.encode(commands).length} >>\nstream\n${commands}endstream`);const xref=size;add('xref\n0 6\n0000000000 65535 f \n');for(let i=1;i<=5;i++)add(offsets[i].toString().padStart(10,'0')+' 00000 n \n');add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);return new Blob(parts as BlobPart[],{type:'application/pdf'});
}
async function main(){try{
 const p=decodeDiploma(location.hash),ctx=canvas.getContext('2d');if(!ctx)throw Error('Browserul nu poate desena diploma.');
 setUiLanguage(p.lang);localizeCanvas(ctx,p.lang);
 const W=canvas.width,H=canvas.height;ctx.fillStyle='#f4f8f8';ctx.fillRect(0,0,W,H);const glow=ctx.createLinearGradient(0,0,W,H);glow.addColorStop(0,'#fff9e7');glow.addColorStop(.5,'#eaf4fb');glow.addColorStop(1,'#f8e8ce');ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);ctx.strokeStyle='#b8995c';ctx.lineWidth=5;ctx.strokeRect(55,55,W-110,H-110);
 ctx.textAlign='center';const text=(value:string,y:number,size:number,color='#17394f')=>{ctx.fillStyle=color;ctx.font=`600 ${size}px Segoe UI, sans-serif`;ctx.fillText(value,W/2,y,W-180);};
 text('EXODUS7',175,64);try{const logo=new Image();logo.src='logo.png';await Promise.race([logo.decode(),new Promise<never>((_,reject)=>setTimeout(()=>reject(Error('logo')),4000))]);ctx.fillStyle='#f4f8f8';ctx.fillRect(680,96,440,95);ctx.drawImage(logo,680,100,440,147);}catch{/* The typographic brand remains usable without the optional artwork. */}
 text('DIPLOMA ECHIPAJULUI',320,64);text(SCENARIO_LABELS[p.profile],385,36,'#56758a');text('Am privit, am descoperit și am dus povestea mai departe.',460,30);
 const columns=Math.min(5,Math.max(1,p.crew.length)),width=290,gap=22,start=(W-(columns*width+(columns-1)*gap))/2;
 p.crew.forEach((member,i)=>{const col=i%5,row=Math.floor(i/5),x=start+col*(width+gap),y=520+row*190,c=crewCharacter(member.character);ctx.fillStyle='#ffffffcc';ctx.fillRect(x,y,width,160);ctx.strokeStyle='#c0d4df';ctx.lineWidth=2;ctx.strokeRect(x,y,width,160);ctx.textAlign='center';ctx.fillStyle='#235f78';ctx.font='600 36px Segoe UI';ctx.fillText(c?.name??'Explorator',x+width/2,y+55,width-20);ctx.font='25px Segoe UI';ctx.fillText(`Post ${member.seat[0]} · Loc ${member.seat[1]}`,x+width/2,y+103);});
 if(!p.crew.length)text('Demonstrație fără participanți înregistrați',620,35);
 text('Pământ → Lumina → Natura → Cristal → Saturn → Acasă',955,29,'#56758a');text('Curiozitatea este începutul fiecărei descoperiri.',1025,36,'#8c6b31');if(p.demo)text('EXEMPLAR DE DEMONSTRAȚIE / REPETIȚIE',1090,23,'#8c6b31');text(`${p.date.split('-').reverse().join('.')} · ${p.crew.length} exploratori · Amintire de participare`,1170,25);
 canvas.hidden=false;button.disabled=false;status.textContent='Diploma este pregătită. PC-ul navei nu este necesar.';
 button.addEventListener('click',()=>{try{const url=URL.createObjectURL(pdfBlob(canvas)),a=document.createElement('a');a.href=url;a.download='EXODUS7-diploma-echipaj.pdf';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);status.textContent='Salvează PDF-ul în fișierele telefonului.';}catch{status.textContent='Descărcarea nu a reușit. Încearcă din browserul telefonului.';}});
 }catch(e){status.textContent=e instanceof Error?e.message:'Cod invalid.';button.hidden=true;}}
void main();
