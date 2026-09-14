import type {MissionRecord} from './mission';
import {CREW_CHARACTERS} from './crew';
import type {Lang} from './types';
const profiles=['legacy-v3','age-5-10','age-10-15','age-15-18','adults'] as const;
export interface PublicDiploma {version:1;lang:Lang;profile:typeof profiles[number];date:string;crew:Array<{seat:string;character:string}>;demo:boolean}
export function diplomaPayload(record:MissionRecord):PublicDiploma{return {version:1,lang:record.checkpoint?.lang??'ro',profile:record.scenarioId,date:record.createdAt.slice(0,10),crew:[...new Set(record.experience?.participants??[])].filter(seat=>/^[1-5][AB]$/.test(seat)).sort().map(seat=>({seat,character:record.experience?.crew?.characters[seat]??''})),demo:record.mode!=='public'||!record.experience?.participants.length};}
export function publicDiplomaUrl(base:string|undefined,record:MissionRecord):string|undefined{
 if(!base)return;try{const u=new URL(base);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!u.hostname.includes('.')||/^[\d.:\[\]]+$/.test(u.hostname)||/(^|\.)(localhost|local|lan|internal|test|invalid|example)$/.test(u.hostname))return;
 const p=diplomaPayload(record);u.hash=btoa(JSON.stringify([1,profiles.indexOf(p.profile),p.date,p.crew.map(c=>[c.seat,c.character]),p.demo?1:0,...(p.lang==='ro'?[]:[p.lang])])).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');return u.href;
 }catch{return;}
}
export function decodeDiploma(hash:string):PublicDiploma{
 const encoded=hash.replace(/^#/,'');if(encoded.length>2500||!encoded||!/^[\w-]+$/.test(encoded))throw Error('Cod de diplomă invalid.');
 const p=JSON.parse(atob(encoded.replace(/-/g,'+').replace(/_/g,'/')));
 if(!Array.isArray(p)||![5,6].includes(p.length)||(p.length===6&&!['ro','en','fr'].includes(p[5]))||p[0]!==1||!Number.isInteger(p[1])||!profiles[p[1]]||typeof p[2]!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(p[2])||!Number.isFinite(Date.parse(p[2]))||!Array.isArray(p[3])||p[3].length>10||![0,1].includes(p[4]))throw Error('Datele diplomei nu sunt valide.');
 const crew=p[3].map((c:unknown)=>{if(!Array.isArray(c)||c.length!==2||typeof c[0]!=='string'||!/^[1-5][AB]$/.test(c[0])||typeof c[1]!=='string'||c[1]!==''&&!CREW_CHARACTERS.some(x=>x.id===c[1]))throw Error('Echipaj invalid.');return {seat:c[0],character:c[1]};});
 if(new Set(crew.map((c:{seat:string})=>c.seat)).size!==crew.length)throw Error('Locuri duplicate.');
 return {version:1,lang:p[5]??'ro',profile:profiles[p[1]],date:p[2],crew,demo:p[4]===1};
}
