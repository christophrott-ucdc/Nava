/** Test fixture only: explicit account data in disposable directories, never a runtime default. */
import {mkdir,writeFile,access} from 'node:fs/promises';
import {randomBytes,scryptSync,randomUUID} from 'node:crypto';
import path from 'node:path';
export async function seedTestIdentity(file,pin='9384'){
 try{await access(path.join(path.dirname(file),'identity.sqlite'));return;}catch{}
 await mkdir(path.dirname(file),{recursive:true});const salt=randomBytes(16).toString('hex');await writeFile(file,JSON.stringify({version:1,users:[{id:randomUUID(),name:'admin',role:'admin',salt,pinHash:scryptSync(pin,salt,32,{N:131072,r:8,p:1,maxmem:256*1024*1024}).toString('hex'),credentialVersion:2,createdAt:new Date().toISOString()}]}));
}
