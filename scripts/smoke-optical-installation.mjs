/** Real Windows inventory + isolated persistence, with explicitly synthetic camera geometry. */
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';import {spawn} from 'node:child_process';import {createRequire} from 'node:module';import * as esbuild from 'esbuild';
const root=path.resolve(import.meta.dirname,'..'),temp=await mkdtemp(path.join(os.tmpdir(),'nava-optical-install-')),require=createRequire(import.meta.url),main=path.join(temp,'main.cjs');
const source=`import {app} from 'electron';import assert from 'node:assert/strict';import {promises as fs} from 'node:fs';
import {DisplayInventoryManager} from ${JSON.stringify(path.join(root,'src/main/display-inventory.ts'))};
import {createOpticalMarkerMap} from ${JSON.stringify(path.join(root,'src/shared/optical-calibration.ts'))};
app.setPath('userData',${JSON.stringify(path.join(temp,'userdata'))});
app.whenReady().then(async()=>{let manager;try{
 let applies=0,last;const options={config:{enabled:true,installationId:'qa',layout:'generic',allowEstimatedGeometry:true},appRoot:${JSON.stringify(temp)},resourcesRoot:${JSON.stringify(root)},log:()=>{},onTopologyChanged:()=>{},apply:async candidate=>{applies++;last=candidate;return async()=>{};}};
 manager=new DisplayInventoryManager(options);const status=await manager.initialize();assert(status.candidate.canApply,status.issues.join(';'));
 const displays=status.candidate.screens.map(s=>{const d=status.inventory.find(d=>d.index===s.displayIndex);return {displayId:s.id,hardwareKey:d.hardwareKey,pixelWidth:d.pixelSize.width,pixelHeight:d.pixelSize.height};}).sort((a,b)=>a.displayId.localeCompare(b.displayId));
 const raw=JSON.stringify({displays,bounds:status.inventory.map(d=>({key:d.hardwareKey,bounds:d.boundsDip,rotation:d.rotation}))});let hash=2166136261;for(let i=0;i<raw.length;i++){hash^=raw.charCodeAt(i);hash=Math.imul(hash,16777619);}
 const mapping=createOpticalMarkerMap(displays,'nava-topology-'+(hash>>>0).toString(16),'Synthetic fixture; not a room measurement');
 const panels=mapping.displays.map((d,i)=>{const x=.1+i*.8/displays.length,w=.75/displays.length;const normalizedCorners=[[x,.1],[x+w,.1],[x+w,.9],[x,.9]];return {displayId:d.displayId,hardwareKey:d.hardwareKey,markerIds:d.markerIds,normalizedCorners,activeCorners:normalizedCorners.map(([x,y])=>[x*3840,y*2160]),uvToCamera:[w,0,x,0,.8,.1,0,0,1],confidence:1,rmsPx:0,independentRmsPx:0,coverage:1};});
 const calibration={schemaVersion:1,kind:'nava-optical-calibration',status:'accepted',topologyHash:mapping.topologyHash,mapping,metric:false,source:'camera-image',imageSize:{width:3840,height:2160},coordinateSpace:'camera-pixels',referencePosition:mapping.referencePosition,displays:panels,order:panels.map(d=>d.displayId),gaps:panels.slice(1).map((d,i)=>({leftDisplayId:panels[i].displayId,rightDisplayId:d.displayId,projectedGap:d.normalizedCorners[0][0]-panels[i].normalizedCorners[1][0],units:'normalized-camera-width'})),reasons:[]};
 await assert.rejects(()=>manager.apply({...calibration,topologyHash:'stale'}));assert.equal(applies,0);
 const applied=await manager.apply(calibration);assert.equal(applies,1);assert.equal(applied.physicalCalibration.status,'camera-projected');assert(last.videoWall.optical);assert.equal(last.screens.filter(s=>s.showAvatar).length,1);assert(last.screens[0].playAudio);
 manager.stop();manager=new DisplayInventoryManager(options);const recovered=await manager.initialize();assert.equal(recovered.physicalCalibration.status,'camera-projected');assert.deepEqual(recovered.candidate.videoWall.optical,calibration);
 await fs.writeFile(${JSON.stringify(path.join(root,'runs/debug/scenarios-new/optical-installation-review.json'))},JSON.stringify({nativeProvider:status.provider,displayCount:displays.length,staleRejected:true,persisted:true,reloaded:true,fixture:'synthetic camera geometry; real Windows identity, no room calibration',windowRecreation:'separate windows-manager tests'},null,2));
 console.log('Optical native installation PASS: '+displays.length+' physical displays; stale rejection and persistent reload');
}catch(e){console.error(e);process.exitCode=1;}finally{manager?.stop();app.quit();}});`;
try{
 await esbuild.build({stdin:{contents:source,resolveDir:root},outfile:main,bundle:true,platform:'node',format:'cjs',external:['electron']});
 const child=spawn(require('electron'),[main],{stdio:'pipe',windowsHide:true});let output='';child.stdout.on('data',b=>{output+=b;process.stdout.write(b);});child.stderr.on('data',b=>process.stderr.write(b));
 const code=await new Promise(r=>child.once('exit',r));if(code!==0)throw new Error('Native optical smoke failed: '+code);
}finally{await rm(temp,{recursive:true,force:true});}
