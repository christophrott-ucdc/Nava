import type {MissionSnapshot} from '../../shared/mission';
export function createDiplomaQr(host:HTMLElement,baseUrl:string){
 const element=document.createElement('aside');element.className='crew-diploma';element.hidden=true;
 const image=document.createElement('img');image.alt='Cod QR pentru diploma echipajului';image.width=180;image.height=180;
 const copy=document.createElement('div'),title=document.createElement('strong'),help=document.createElement('p'),link=document.createElement('a'),status=document.createElement('small');
 title.textContent='Diploma echipajului';help.textContent='Scanează și păstrează călătoria noastră.';link.textContent='Deschide diploma PDF';link.target='_blank';link.rel='noopener noreferrer';status.textContent='Merge pe date mobile sau pe orice Wi-Fi cu internet.';
 let url='';
 image.addEventListener('error',()=>{if(!url)return;image.hidden=true;status.textContent='QR indisponibil. Poți deschide diploma prin buton.';});
 image.addEventListener('load',()=>{if(!url)return;image.hidden=false;status.textContent='Merge pe date mobile sau pe orice Wi-Fi cu internet.';});copy.append(title,help,link,status);element.append(image,copy);host.append(element);
 return {element,update(s:MissionSnapshot|null){const next=s?.state.state==='ended'?s.crewDiplomaUrl??'':'';element.hidden=s?.state.state!=='ended';help.textContent=next?'Scanează și păstrează călătoria noastră.':'Diploma online nu este disponibilă pentru această sesiune.';link.hidden=!next;if(next&&url!==next){url=next;link.href=next;image.hidden=false;image.src=new URL('/api/qr?size=384&url='+encodeURIComponent(next),baseUrl).href;}if(!next){url='';link.removeAttribute('href');image.hidden=true;image.removeAttribute('src');status.textContent='Ghidul poate verifica activarea accesului public la diplomă.';}},dispose(){element.remove();}};
}
