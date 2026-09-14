import {redactLog} from '../../shared/log-sanitize';
/** Passive browser error capture. Does not inspect inputs, cookies or application state. */
let windowStart=Date.now(),sent=0;const seen=new Set<string>();
function report(kind:string,error:unknown){
 if(Date.now()-windowStart>60000){windowStart=Date.now();sent=0;seen.clear();}
 if(sent>=10)return;const clean=redactLog(error);let detail:string;try{detail=JSON.stringify(clean)??String(clean);}catch{detail='Eroare fără detalii serializabile';}
 detail=detail.slice(0,6000);const key=kind+detail;if(seen.has(key))return;seen.add(key);sent++;
 void fetch('/api/client-errors',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({page:location.pathname.split('/')[1],kind,detail}),keepalive:true}).catch(()=>{});
}
window.addEventListener('error',event=>{if(event instanceof ErrorEvent)report('javascript.error',event.error??event.message);});
window.addEventListener('unhandledrejection',event=>report('promise.unhandled',event.reason));
