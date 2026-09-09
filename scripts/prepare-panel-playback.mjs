/** Optional playback derivatives: preserve 60fps/timebase, avoid decoding upscaled pixels.
 * Never overwrites a source or an existing derivative. Uses installed ffmpeg/NVENC only.
 */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const input=path.resolve(process.argv[2]??'../Video/panels');
const output=path.resolve(process.argv[3]??'../Video/panels-playback-1440');
if(input===output)throw Error('Source and output must differ');
fs.mkdirSync(output,{recursive:true});
for(const id of ['port-outer','port-inner','center','starboard-inner','starboard-outer']){
 const source=path.join(input,id+'.mp4'),destination=path.join(output,id+'.mp4');
 if(fs.existsSync(destination)){console.log('Existing derivative, verify before reuse: '+id);continue;}
 console.log('Preparing '+id);
 const result=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-n','-hwaccel','cuda','-hwaccel_output_format','cuda','-i',source,'-an','-vf','scale_cuda=2560:1440','-c:v','h264_nvenc','-preset','p4','-cq','18','-b:v','0','-g','120','-fps_mode','passthrough','-movflags','+faststart',destination],{stdio:'inherit',windowsHide:true});
 if(result.status!==0)throw Error(`Transcode failed for ${id}; inspect partial output before retrying`);
 const probe=file=>JSON.parse(spawnSync('ffprobe',['-v','error','-show_entries','stream=width,height,r_frame_rate,duration','-of','json',file],{encoding:'utf8',windowsHide:true}).stdout).streams[0];
 const a=probe(source),b=probe(destination);if(b.width!==2560||b.height!==1440||b.r_frame_rate!==a.r_frame_rate||Math.abs(Number(a.duration)-Number(b.duration))>.02)throw Error('Derivative timing mismatch '+id);
 console.log(id+' verified '+b.duration+'s '+b.r_frame_rate);
}
