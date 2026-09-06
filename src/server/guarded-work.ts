/** Failure containment for asynchronous entry points and periodic persistence. */
export function guardedCommand<T>(work:()=>Promise<T>,failure:(error:unknown)=>T):Promise<T>{
  return Promise.resolve().then(work).catch(failure);
}
export function guardedCheckpoint(work:()=>void,report:(error:unknown)=>void):boolean{
  try{work();return true;}catch(error){report(error);return false;}
}
