#!/usr/bin/env node
/** Repeat server lifecycle tests against disposable databases; never connect to localhost:4321.
 * node scripts/qa-bugcatch.mjs [rounds=3] [output-directory]
 * Browser/GPU reviews and npm run check remain separate, so timings are not conflated.
 */
import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),rounds=Number(process.argv[2]??3);
if(!Number.isInteger(rounds)||rounds<1||rounds>10)throw Error('Rounds must be 1–10.');
const out=path.resolve(process.argv[3]??path.join(root,'runs/debug/qa-bugcatch-'+Date.now()));await mkdir(out,{recursive:true});
const results=[];
for(let round=1;round<=rounds;round++){
  for(const script of ['smoke-scenarios','smoke-experience']){
    const log=path.join(out,`round-${round}-${script}.log`),stream=createWriteStream(log),startedAt=new Date().toISOString();
    const exitCode=await new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,[`scripts/${script}.mjs`],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
      child.stdout.pipe(stream,{end:false});child.stderr.pipe(stream,{end:false});child.once('error',reject);child.once('close',code=>stream.end(()=>resolve(code)));
    });
    results.push({round,script,exitCode,startedAt,finishedAt:new Date().toISOString(),log});
    console.log(`Round ${round}/${rounds} ${script}: ${exitCode===0?'PASS':'FAIL'}`);
    await writeFile(path.join(out,'results.json'),JSON.stringify({isolated:true,syntheticScreen:true,results},null,2));
  }
}
process.exitCode=results.some(r=>r.exitCode!==0)?1:0;
