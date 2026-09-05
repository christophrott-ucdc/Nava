import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {page,sleep} from './glass-cdp.mjs';
const dir='runs/debug/final-wall';await fs.mkdir(dir,{recursive:true});const result=[];
const p=await page('http://127.0.0.1:4321/wall/');await p.size(1920,1080);await sleep(1200);
await p.eval(`window.__errors=[];window.addEventListener('error',e=>__errors.push(e.message))`);
assert.equal(await p.eval(`document.querySelector('#validation').classList.contains('invalid')`),false);
await p.shot(dir+'/wall-cinema-1920.png');
await p.eval(`document.querySelector('#panorama').click()`);await p.shot(dir+'/wall-panorama-1920.png');
assert.match(await p.eval(`document.querySelector('#crop-note').textContent`),/\d+%/);
await p.eval(`document.querySelector('#gap').value='30';document.querySelector('#apply-gap').click();document.querySelector('.settings').scrollIntoView({block:'start'})`);await sleep(300);await p.shot(dir+'/wall-settings-1920.png');
assert.equal(await p.eval(`document.querySelectorAll('#geometry-body tr')[1].querySelectorAll('input')[1].value`),'2200');
await p.eval(`document.querySelectorAll('#geometry-body tr')[1].querySelector('input').value='0';document.querySelectorAll('#geometry-body tr')[1].querySelector('input').dispatchEvent(new Event('input'))`);assert.equal(await p.eval(`document.querySelector('#export').disabled`),true);
await p.eval(`document.querySelectorAll('#geometry-body tr')[1].querySelector('input').value='1';document.querySelectorAll('#geometry-body tr')[1].querySelector('input').dispatchEvent(new Event('input'))`);
const download=path.resolve(dir,'exported');await fs.mkdir(download,{recursive:true});await p.call('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:download});await p.eval(`document.querySelector('#export').click()`);await sleep(500);
const profile=JSON.parse(await fs.readFile(path.join(download,'nava-wall-profile.json'),'utf8'));assert.equal(profile.videoWall.mode,'panorama');assert.equal(profile.videoWall.panels[1].x,2200);assert.equal(profile.security,undefined);assert.equal(profile.screens.filter(s=>s.showAvatar).length,1);result.push({export:'Downloaded real JSON; 5 outputs,30mm gaps, panorama, no credentials'});
await p.eval(`document.querySelector('#grid').click();window.scrollTo(0,0)`);await sleep(200);await p.shot(dir+'/wall-calibration-1920.png');assert.match(await p.eval(`document.querySelector('#crop-note').textContent`),/blochează/);
await p.eval(`document.querySelector('#grid').click();document.querySelector('#reset').click()`);
for(const [w,h] of [[1440,900],[800,900]]){await p.size(w,h);await p.eval('window.scrollTo(0,0)');await p.shot(dir+'/wall-'+w+'.png');assert.equal(await p.eval('document.documentElement.scrollWidth>innerWidth'),false);}
for(const [w,h] of [[1920,1080],[1440,900]]){
 await p.size(w,h);
 for(const route of ['control','debug','analytics','login']){
  await p.call('Page.navigate',{url:`http://127.0.0.1:4321/${route}/`});await sleep(700);
  assert.equal(await p.eval('document.documentElement.scrollWidth>innerWidth'),false);
  await p.shot(`${dir}/${route}-${w}.png`);
  if(route==='control'){
   if(w===1920)assert.equal(await p.eval('document.documentElement.scrollHeight>innerHeight'),false);
   for(const mode of ['live','tools']){await p.eval(`document.querySelector('[data-mode=${mode}]').click()`);await sleep(200);await p.shot(`${dir}/operator-${mode}-${w}.png`);}
   await p.eval(`document.querySelector('.editor-panel').scrollIntoView({block:'start'})`);await sleep(200);await p.shot(`${dir}/editor-${w}.png`);
   assert.equal(await p.eval(`(()=>{const rs=[...document.querySelectorAll('.ed-marker')].map(e=>e.getBoundingClientRect());return rs.some((a,i)=>rs.slice(i+1).some(b=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top))})()`),false);
  }
 }
}
result.push({operator:'before/live/tools1920 and1440,debug/analytics/login1920 and1440,no horizontaloverflow;guided1920 no scroll;editor markers nooverlap'});
await p.call('Page.navigate',{url:'http://127.0.0.1:4321/shared/preview.html'});await p.size(1920,1080);await sleep(300);
for(const theme of ['prologue','launch','light','nature','tech','void','home','white']){await p.eval(`document.documentElement.dataset.theme='${theme}'`);await p.shot(`${dir}/theme-${theme}.png`)}
await p.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});assert.equal(await p.eval('document.getAnimations().length'),0);result.push({themes:8,reducedMotionAnimations:0});
await fs.writeFile(dir+'/ui-results.json',JSON.stringify(result,null,2));p.close();console.log('wall/operator UI review PASS');
