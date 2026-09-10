/** Reuse the three identical educational lines across age packages without paid regeneration. */
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['src/renderer/avatar/lipsync-ro.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {distributeWordVisemes}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const source=read('assets/voice/ro/manifest.json');
for(const profile of ['age-5-10','age-10-15','age-15-18','adults']){
 const dir=`assets/scenarios/${profile}/voice/ro/`,manifest=read(dir+'manifest.json');
 for(const id of ['v4-saturn-01','v4-saturn-02','v4-saturn-03']){
  const clip=structuredClone(source.clips[id]);if(!clip)throw Error(`Missing ${id}`);
  const file='assets/voice/ro/'+clip.file,bytes=fs.readFileSync(file);
  const {streams:[stream]}=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','stream=codec_name,sample_rate,channels','-of','json',file],{encoding:'utf8'}));
  Object.assign(clip,distributeWordVisemes(clip.words,clip.wtimes,clip.wdurations),{sharedFrom:'show',sha256:createHash('sha256').update(bytes).digest('hex'),codec:stream.codec_name,sampleRate:Number(stream.sample_rate),channels:stream.channels});
  fs.writeFileSync(dir+clip.file,bytes);manifest.clips[id]=clip;
 }
 fs.writeFileSync(dir+'manifest.json',JSON.stringify(manifest,null,2)+'\n');
}
console.log('Saturn: three recordings shared by four age packages with measured media and Romanian visemes.');
