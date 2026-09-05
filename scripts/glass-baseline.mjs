import fs from 'node:fs/promises';
import {page,renderer,sleep} from './glass-cdp.mjs';
const dir='runs/debug/glass-r5/before';await fs.mkdir(dir,{recursive:true});
const config=JSON.parse(await fs.readFile('config.json','utf8'));
const p=await page('http://127.0.0.1:4321/login/');await p.size(1920,1080);await sleep(1200);await p.shot(dir+'/login.png');
const login=await p.eval(`fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin:${JSON.stringify(config.security?.operatorPin??'4078')}})}).then(r=>r.ok)`);if(!login)throw Error('Baseline login failed');
for(const route of ['control','debug','analytics','tablet']){await p.call('Page.navigate',{url:'http://127.0.0.1:4321/'+route+'/'});await sleep(1500);await p.shot(dir+'/'+route+'.png')}
p.close();const r=await renderer();await r.shot(dir+'/tv-windowed.png');r.close();console.log('Baseline captured:',dir);
