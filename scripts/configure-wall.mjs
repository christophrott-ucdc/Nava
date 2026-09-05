#!/usr/bin/env node
/** Derive an independent local profile; retain existing credentials, media, voices and timings. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),value=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const basePath=path.resolve(root,value('--base','config.json'));
const outPath=path.resolve(root,value('--out','config.wall.local.json'));
const canonical=p=>{const value=fs.existsSync(p)?fs.realpathSync.native(p):path.join(fs.realpathSync.native(path.dirname(p)),path.basename(p));return process.platform==='win32'?value.toLowerCase():value};
const sameFile=fs.existsSync(outPath)&&fs.statSync(outPath).ino===fs.statSync(basePath).ino&&fs.statSync(outPath).dev===fs.statSync(basePath).dev;
if(canonical(basePath)===canonical(outPath)||sameFile)throw new Error('Profilul de bază trebuie păstrat; alege alt --out.');
if(fs.existsSync(outPath)&&!args.includes('--replace'))throw new Error('Profilul local există. Folosește alt --out sau --replace după verificare.');
const bundle=await build({entryPoints:[path.join(root,'src/shared/video-wall.ts')],bundle:true,format:'esm',platform:'node',write:false});
const {validateVideoWall,validateWallScreens}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const readJson=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const base=readJson(basePath);
const profile=readJson(path.resolve(root,value('--profile','config.samsung-wall.example.json')));
const template=readJson(path.join(root,'config.samsung-wall.example.json'));
const screens=profile.screens??template.screens;
const validated=validateVideoWall(profile.videoWall,screens.map(s=>s.id));
if(!validated.ok)throw new Error(validated.reason);
const screenResult=validateWallScreens(screens,validated.value);
if(!screenResult.ok)throw new Error(screenResult.reason);
const output={...base,displayMode:'span',videoWall:validated.value,screens:screenResult.screens,
  autoRun:{...base.autoRun,requireScreens:screens.map(s=>s.id),requireTablets:5},
  dev:{...base.dev,windowed:false}};
const tempPath=outPath+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
try{
  fs.writeFileSync(tempPath,JSON.stringify(output,null,2)+'\n',{flag:'wx'});
  // Atomic rename preserves the previous profile if the write fails or is interrupted.
  if(!args.includes('--replace')&&fs.existsSync(outPath))throw new Error('Profilul de ieșire a apărut între timp; păstrat.');
  fs.renameSync(tempPath,outPath);
}finally{if(fs.existsSync(tempPath))fs.unlinkSync(tempPath)}
if(validated.value.calibration)console.log('CALIBRARE ACTIVĂ: grila înlocuiește filmul și blochează auto-start. Dezactiveaz-o și reimportă profilul înainte de public.');
console.log(`Profil creat: ${path.relative(root,outPath)}. Configurația de bază este păstrată.\nPreview: npm run wall:preview\nÎn sală, după calibrare: npm run wall:start`);
