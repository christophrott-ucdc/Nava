import {promises as fs} from 'node:fs';
import path from 'node:path';
import {Hono} from 'hono';
import {eventLevel,redactLog} from '../../shared/log-sanitize';
const fileRE=/^(?:app|show|diagnostic)-\d{8}-\d{6}(?:-\d+)?\.jsonl$/;
interface Entry {id:string;time:string;level:string;source:string;message:string;data?:unknown;file:string}
export function createLogsRouter(runsDir:string,auditPath:string){
 const router=new Hono();
 async function catalog(){const items:Array<{id:string;path:string;bytes:number;modified:string}>=[];
   const names=await fs.readdir(runsDir).catch(()=>[] as string[]);
   for(const name of names.filter(n=>fileRE.test(n))){try{const p=path.join(runsDir,name),s=await fs.lstat(p);if(s.isFile())items.push({id:name,path:p,bytes:s.size,modified:s.mtime.toISOString()});}catch{}}
   for(let i=0;i<4;i++){const p=i?auditPath.replace(/\.jsonl$/,`.${i}.jsonl`):auditPath;try{const s=await fs.lstat(p);if(s.isFile())items.push({id:i?`audit.${i}.jsonl`:'audit.jsonl',path:p,bytes:s.size,modified:s.mtime.toISOString()});}catch{}}
   return items.sort((a,b)=>b.modified.localeCompare(a.modified));
 }
 router.get('/files',async c=>c.json({files:(await catalog()).map(({path:_,...x})=>x)}));
 router.get('/',async c=>{
   c.header('Cache-Control','no-store');
   const file=c.req.query('file'),level=c.req.query('level')?.toUpperCase(),q=(c.req.query('q')??'').slice(0,200).toLocaleLowerCase('ro');
   const limit=Math.min(1000,Math.max(1,Number(c.req.query('limit'))||300));
   const catalogItems=await catalog(),selected=file?catalogItems.filter(x=>x.id===file):catalogItems.slice(0,8);
   if(file&&!selected.length)return c.json({error:'Jurnalul nu mai este disponibil.'},404);
   const entries:Entry[]=[];let partial=false,skipped=0,unreadable=0,nextBefore:number|null=null;
   for(const item of selected){let handle;try{
     handle=await fs.open(item.path,'r');const stat=await handle.stat();
     const end=Math.min(stat.size,Number(c.req.query('before'))>0&&file?Number(c.req.query('before')):stat.size),start=Math.max(0,end-1024*1024);
     const buffer=Buffer.alloc(end-start);const {bytesRead}=await handle.read(buffer,0,buffer.length,start);const bytes=buffer.subarray(0,bytesRead);
     partial ||= start>0;let offset=0;
     // Locate newlines before decoding: a bounded read can start halfway through
     // a UTF-8 character; replacement characters must never alter byte cursors.
     if(start>0){const first=bytes.indexOf(10);offset=first<0?bytes.length:first+1;if(file)nextBefore=first<0||start+offset>=end?start:start+offset;}
     for(let newline;(newline=bytes.indexOf(10,offset))>=0;){const at=start+offset,line=bytes.subarray(offset,newline).toString('utf8');offset=newline+1;if(!line.trim())continue;
       try{const raw=JSON.parse(line);if(!raw||typeof raw!=='object'){skipped++;continue;}
         const data=redactLog(raw.data??(raw.action?raw:undefined)),message=String(redactLog(raw.msg??raw.kind??raw.action??'event'));
         let sev=String(raw.level??eventLevel(message,data)).toUpperCase();if(sev==='WARN')sev='WARNING';if(!['DEBUG','INFO','WARNING','ERROR','FATAL'].includes(sev))sev='INFO';
         const e:Entry={id:`${item.id}:${at}`,file:item.id,time:String(raw.ts??raw.t??raw.at??raw.time??''),level:sev,source:String(redactLog(raw.src??(item.id.startsWith('audit')?'audit':item.id.startsWith('app')?'app':'show'))),message,data};
         if(level&&level!==sev)continue;if(q&&!JSON.stringify(e).toLocaleLowerCase('ro').includes(q))continue;entries.push(e);
       }catch{skipped++;}
     }
   }catch{unreadable++;}finally{await handle?.close();}}
   // A selected journal is paginated in physical append order, including bursts
   // with equal timestamps and wall-clock corrections. IDs contain byte offsets.
   const offsetOf=(entry:Entry)=>Number(entry.id.slice(entry.id.lastIndexOf(':')+1));
   entries.sort(file?(a,b)=>offsetOf(b)-offsetOf(a):(a,b)=>b.time.localeCompare(a.time)||b.id.localeCompare(a.id));
   const result=entries.slice(0,limit);
   if(file&&entries.length>result.length&&result.length)nextBefore=offsetOf(result[result.length-1]);
   if(c.req.query('format')==='jsonl')return c.body(result.map(e=>JSON.stringify(e)).join('\n')+'\n',200,{'Content-Type':'application/x-ndjson; charset=utf-8','Content-Disposition':'attachment; filename="exodus7-logs.jsonl"'});
   return c.json({entries:result,matched:entries.length,partial:partial||entries.length>limit,skipped,unreadable,nextBefore,filesScanned:selected.length,windowBytes:1024*1024});
 });return router;
}
