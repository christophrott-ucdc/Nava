/** Render the production Web Audio effect offline, inspect PCM, save an audition WAV. */
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
import os from 'node:os';
import {build} from 'esbuild';
const root=path.resolve(import.meta.dirname,'..'),temp=await mkdtemp(path.join(os.tmpdir(),'nava-rocket-qa-'));
const out=path.join(root,'runs/debug/planet-stops-2026-09-14');await mkdir(out,{recursive:true});
try{
 const bundle=await build({stdin:{contents:`import {playSfx} from './src/renderer/voice/sfx';import {setSfxVolume} from './src/renderer/voice/context';
 window.renderRocket=async(muted=false)=>{let offline;window.AudioContext=function(){return offline=new OfflineAudioContext(1,192000,48000)};setSfxVolume(muted?0:1);const handle=playSfx('rocket-departure');const buffer=await offline.startRendering();const samples=Array.from(buffer.getChannelData(0));handle.stop();return samples;};`,resolveDir:root,loader:'ts'},bundle:true,platform:'browser',write:false});
 const main=path.join(temp,'main.cjs');
 await writeFile(main,`const {app,BrowserWindow}=require('electron');const fs=require('node:fs');const assert=require('node:assert/strict');app.setPath('userData',${JSON.stringify(path.join(temp,'userdata'))});app.whenReady().then(async()=>{let w;try{w=new BrowserWindow({show:false,webPreferences:{offscreen:true}});await w.loadURL('data:text/html,<title>Rocket audio QA</title>');await w.webContents.executeJavaScript(${JSON.stringify(bundle.outputFiles[0].text)});
 const samples=await w.webContents.executeJavaScript('renderRocket()');let peak=0,sum=0;for(const s of samples){assert(Number.isFinite(s));peak=Math.max(peak,Math.abs(s));sum+=s*s;}const rms=Math.sqrt(sum/samples.length);assert(peak>.0001&&peak<.2);assert(rms<.05);
 const muted=await w.webContents.executeJavaScript('renderRocket(true)');assert(muted.every(s=>s===0),'SFX master must mute active graph');
 const wav=Buffer.alloc(44+samples.length*2);wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(48000,24);wav.writeUInt32LE(96000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples.length*2,40);samples.forEach((s,i)=>wav.writeInt16LE(Math.round(s*32767),44+i*2));fs.writeFileSync(${JSON.stringify(path.join(out,'rocket-departure-preview.wav'))},wav);fs.writeFileSync(${JSON.stringify(path.join(out,'rocket-audio.json'))},JSON.stringify({peak,rms,seconds:samples.length/48000,muted:true},null,2));console.log('PASS production rocket synthesis, finite PCM, subtle level, SFX mute', {peak,rms});}catch(e){console.error(e);process.exitCode=1;}finally{w?.destroy();app.exit(process.exitCode||0);}});`);
 const child=spawn(createRequire(import.meta.url)('electron'),[main],{stdio:'pipe',windowsHide:true});child.stdout.pipe(process.stdout);child.stderr.pipe(process.stderr);
 if(await new Promise(resolve=>child.once('exit',resolve))!==0)throw Error('Rocket audio QA failed');
}finally{await rm(temp,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
