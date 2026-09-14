/** Derive an automatic installation config without changing the existing manual setup. */
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const generic=process.argv.includes('--generic');
const config=JSON.parse(await readFile('config.json','utf8'));
config.autoDisplays={enabled:true,installationId:generic?'nava-generic':'nava-samsung-5',layout:generic?'generic':'samsung-5',...(generic?{}:{countMode:'adaptive',panelGapMm:500}),allowEstimatedGeometry:true};
if(!generic&&!config.video.panelsByCount)config.video.panelsByCount={'1':'../Video/panels-playback-1440','2':'../Video/panels-2','3':'../Video/panels-3','4':'../Video/panels-4','5':config.video.panelsDir??'../Video/panels'};
if(!generic)for(const [n,ids] of Object.entries({2:['port-inner','starboard-inner'],3:['port-inner','center','starboard-inner'],4:['port-outer','port-inner','starboard-inner','starboard-outer']})){
  const directory=`../Video/panels-${n}-1440`;
  try{
    for(const id of ids){const data=JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height,duration','-of','json',`${directory}/${id}.mp4`],{encoding:'utf8',windowsHide:true,timeout:15000}));const stream=data.streams?.[0],duration=Number(stream?.duration);if(stream?.width!==2560||stream?.height!==1440||!Number.isFinite(duration)||Math.abs(duration-678.05)>.25)throw Error('Set incomplet sau montaj diferit.');}
    config.video.panelsByCount[n]=directory;
  }catch{console.warn(`Setul ${n}×1440p nu a fost validat; păstrez sursa configurată.`);}
}
config.autoRun={...config.autoRun,enabled:false,requireScreens:[],requireTablets:5};
await writeFile('config.auto.local.json',JSON.stringify(config,null,2)+'\n',{flag:'wx'});
console.log('Created config.auto.local.json. Existing manual config preserved. Automatic '+(generic?'1–16-display':'adaptive 1–5-display')+' panorama enabled; physical calibration still needs the room image.');
