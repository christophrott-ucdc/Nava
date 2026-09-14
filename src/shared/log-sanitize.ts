/** Used both before persistence and when exposing historical journals. */
export function redactLog(value:unknown,depth=0,seen=new WeakSet<object>()):unknown{
 if(depth>8)return '[depth limit]';
 if(typeof value==='string')return value.slice(0,16000).replace(/\bsk_[a-zA-Z0-9_-]+/g,'[secret]').replace(/Bearer\s+[\w.+/=-]+/gi,'Bearer [secret]').replace(/((?:api[_-]?key|token|password|secret|pin|authorization|cookie)["']?\s*[:=]\s*["']?)[^\s,"'&}]+/gi,'$1[secret]').replace(/(\/souvenir\/[^/\s]+\/)[a-f0-9]{64}/g,'$1[secret]').replace(/data:(?:image|audio)\/[^\s]+/g,'[media omitted]');
 if(value instanceof Error)return redactLog({name:value.name,message:value.message,stack:value.stack},depth+1,seen);
 if(typeof value==='bigint')return value.toString();
 if(!value||typeof value!=='object')return value;
 if(seen.has(value))return '[circular]';seen.add(value);
 if(Array.isArray(value))return value.slice(0,100).map(v=>redactLog(v,depth+1,seen));
 return Object.fromEntries(Object.entries(value).slice(0,100).map(([key,v])=>[key,/(token|password|secret|api.?key|authorization|cookie|dataurl|audio_base64|^pin$|pinhash)/i.test(key)?'[redacted]':redactLog(v,depth+1,seen)]));
}
export function eventLevel(kind:string,data?:unknown):'INFO'|'WARNING'|'ERROR'|'DEBUG'{
 const d=data&&typeof data==='object'?data as Record<string,unknown>:{};
 if(/error|crash|exception|failed|failure/i.test(kind))return 'ERROR';
 if(d.ok===false||/warn|reject|denied|timeout|disconnect|blocked/i.test(kind))return 'WARNING';
 if(/perf|heartbeat|clock|sample/i.test(kind))return 'DEBUG';
 return 'INFO';
}
