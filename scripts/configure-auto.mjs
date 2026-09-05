/** Derive an automatic installation config without changing the existing manual setup. */
import {readFile,writeFile} from 'node:fs/promises';
const generic=process.argv.includes('--generic');
const config=JSON.parse(await readFile('config.json','utf8'));
config.autoDisplays={enabled:true,installationId:generic?'nava-generic':'nava-samsung-5',layout:generic?'generic':'samsung-5',...(generic?{}:{expectedAudienceCount:5}),allowEstimatedGeometry:true};
config.autoRun={...config.autoRun,enabled:false,requireScreens:[],requireTablets:5};
await writeFile('config.auto.local.json',JSON.stringify(config,null,2)+'\n',{flag:'wx'});
console.log('Created config.auto.local.json. Existing manual config preserved. Automatic '+(generic?'1–16-display':'98–98–115–98–98')+' panorama enabled; physical calibration still needs the room image.');
