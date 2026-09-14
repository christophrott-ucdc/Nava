#!/usr/bin/env node
/** Disposable manual QA server: real Hono/SQLite, synthetic TV clock, no live installation commands.
 * node scripts/qa-interactive.mjs [output-directory]
 * Stop by creating <output-directory>/stop, or Ctrl+C. Automatically closes after 30 minutes.
 */
import {createHarness,ROOT} from './smoke-scenarios.mjs';
import {mkdir,writeFile,access} from 'node:fs/promises';
import path from 'node:path';
const out=path.resolve(process.argv[2]??path.join(ROOT,'runs/debug/qa-interactive'));
await mkdir(out,{recursive:true});
const h=await createHarness({connectTablets:false,tutorial:true});
try{
  await h.select('age-5-10');await h.prepareFixture();
  await writeFile(path.join(out,'server.json'),JSON.stringify({base:h.base,syntheticScreen:true,temporaryDatabase:true},null,2));
  console.log('QA server: '+h.base+' (isolated fixture; login PIN 9384)');
  await new Promise(resolve=>{
    const stop=()=>{clearInterval(poll);clearTimeout(deadline);process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);resolve();};
    const poll=setInterval(()=>{void access(path.join(out,'stop')).then(stop,()=>{});},500);
    const deadline=setTimeout(stop,30*60*1000);process.once('SIGINT',stop);process.once('SIGTERM',stop);
  });
}finally{await h.close();console.log('QA server closed; temporary data removed.');}
