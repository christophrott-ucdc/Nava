import {promises as fs} from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),read=async p=>JSON.parse(await fs.readFile(path.join(root,p),'utf8'));
const dir='runs/debug/localization-2026-09-13',inventory=await read(dir+'/inventory.json');
const normalize=s=>s.replace(/\s+/g,' ').trim();
const rows=(await fs.readFile(path.join(root,'assets/localization/ui-reviewed.tsv'),'utf8')).trim().split(/\r?\n/).slice(1).map(line=>{const cells=line.split('\t');if(cells.length!==3)throw Error('Invalid translation row: '+line);return cells.map(normalize);});
const reviewed={};for(const file of await fs.readdir(path.join(root,'assets/localization')))if(/^speech-reviewed.*\.json$/.test(file))Object.assign(reviewed,await read('assets/localization/'+file));
for(const [lang,column] of [['en',1],['fr',2]]){
 const draft=await read(`${dir}/draft-${lang}.json`),catalog={};
 for(const {text} of inventory.ui){if(!draft[text])throw Error('Missing draft: '+text);catalog[normalize(text)]=normalize(draft[text]).replaceAll('♪','').trim();}
 for(const row of rows)catalog[row[0]]=row[column];
 // Icon/template expressions can become separate DOM elements. Keep their adjacent text localizable.
 for(const [source,target] of Object.entries(catalog)){
  let short=source;const removed=[];
  short=short.replace(/^(?:\{\d+\}\s*)+|(?:\s*\{\d+\})+$/g,part=>{removed.push(...part.match(/\{\d+\}/g));return '';}).trim();
  if(short!==source&&short&&/[\p{L}]/u.test(short)&&!catalog[short])catalog[short]=normalize(removed.reduce((t,slot)=>t.replaceAll(slot,''),target));
 }
 for(const row of rows)catalog[row[0]]=row[column];
 for(const cue of inventory.speech)if(reviewed[cue.profile]?.[cue.id]?.[lang])catalog[normalize(cue.text)]=reviewed[cue.profile][cue.id][lang];
 for(const [key,value] of Object.entries(catalog)){
  const slots=s=>JSON.stringify((s.match(/\{\d+\}/g)||[]).sort());if(slots(key)!==slots(value))throw Error('Interpolation mismatch: '+key);
  if(/\b(fuck\w*|shit\w*|bitch\w*|putain|connard|merde)\b/i.test(value))throw Error('Unexpected vocabulary: '+key);
  if(/\\[a-z]|\{(?!\d+\})/.test(value)&&!/\\[a-z]|\{(?!\d+\})/.test(key))throw Error('Unexpected markup: '+key);
 }
 await fs.writeFile(path.join(root,`src/shared/locales/${lang}.json`),JSON.stringify(catalog,null,2)+'\n');
 console.log(`${lang}: ${Object.keys(catalog).length} entries; ${rows.length} editorial UI overrides`);
}
