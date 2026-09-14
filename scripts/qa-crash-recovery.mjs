/** Deliberate crashes ONLY in child Electron processes and disposable SQLite directories. */
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';import {createRequire} from 'node:module';
import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {build} from 'esbuild';
const root=path.resolve(import.meta.dirname,'..'),temp=await mkdtemp(path.join(os.tmpdir(),'nava-crash-qa-'));
const playing=process.argv.includes('--playing');
const out=path.join(root,process.env.NAVA_QA_OUT??'runs/debug/reliability-2026-09-13',playing?'crash-playing':'crash');await mkdir(out,{recursive:true});
const main=path.join(temp,'worker.cjs'),require=createRequire(import.meta.url),results=[];
try{
 await build({entryPoints:[path.join(root,'scripts/qa-reliability-worker.mjs')],outfile:main,bundle:true,platform:'node',format:'cjs',external:['electron'],logLevel:'warning'});
 for(const mode of ['interrupt','recover']){
  const child=spawn(require('electron'),[main],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,NAVA_QA_ROOT:root,NAVA_QA_TEMP:temp,NAVA_QA_OUT:out,NAVA_QA_MODE:mode,NAVA_QA_KILL_PLAYING:playing?'1':'0'}});
  let output='',killed=false;const timer=setTimeout(()=>child.kill(),5*60*1000);
  child.stdout.on('data',b=>{output+=b;process.stdout.write(b);if(mode==='interrupt'&&!killed&&output.includes('READY_FOR_HARD_KILL')){killed=true;child.kill();}});
  child.stderr.on('data',b=>{output+=b;process.stderr.write(b);});
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});clearTimeout(timer);
  await writeFile(path.join(out,mode+'.log'),output);
  if(mode==='interrupt')assert(killed,'child reached committed checkpoint before hard kill');else assert.equal(code,0,'recovery worker');
  results.push({mode,exitCode:code,deliberateHardKill:killed});
 }
 const report=JSON.parse(await readFile(path.join(out,'recovery.json'),'utf8'));assert.equal(report.runMarker,path.basename(temp));assert(report.crashLoopStopped);
 await writeFile(path.join(out,'summary.json'),JSON.stringify({results,report},null,2));
 console.log('PASS: forced renderer crash, abrupt whole-process termination, SQLite recovery, hang watchdog and bounded crash loop');
}finally{await rm(temp,{recursive:true,force:true,maxRetries:15,retryDelay:300});}
