import {promises as fs} from 'node:fs';
import {createHash} from 'node:crypto';

/** Cache verified bytes by filesystem identity, not by the requested manifest hash. */
const cache=new Map<string,{stamp:string;size:number;sha256:string}>();
export async function audioIntegrity(file:string):Promise<{size:number;sha256:string}>{
  const stat=await fs.stat(file,{bigint:true});
  const stamp=[stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs].join(':');
  const prior=cache.get(file);if(prior?.stamp===stamp)return prior;
  const bytes=await fs.readFile(file);
  const after=await fs.stat(file,{bigint:true});
  if(stamp!==[after.dev,after.ino,after.size,after.mtimeNs,after.ctimeNs].join(':'))throw Error('Audio changed during verification');
  const result={stamp,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  if(cache.size>=2048)cache.delete(cache.keys().next().value!);
  cache.set(file,result);return result;
}
