/** Extract display-text candidates without changing game identifiers or authored Romanian files. */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'runs/debug/localization-2026-09-13');fs.mkdirSync(out,{recursive:true});
const entries=new Map();
function add(text,file){
  text=text.replace(/\s+/g,' ').trim();
  if(!text||text.length>1800||!/[\p{L}]/u.test(text)||/^(?:https?:|[./#]|var\(|rgb|rgba|\.[a-z]|[\w-]+\.(?:ts|js|png|json|mp3|glb|css))/.test(text))return;
  if(!/[ăâîșțĂÂÎȘȚ]/.test(text)&&!/[A-Za-z]{2,} [A-Za-z]{2,}/.test(text))return;
  if(/[<>{}]/.test(text.replace(/\{\d+\}/g,''))||/=>|querySelector|document\.|\bimport\b|Content-Type|SELECT |INSERT |UPDATE |PRAGMA |--[a-z]/.test(text))return;
  if(!entries.has(text))entries.set(text,new Set());entries.get(text).add(file);
}
function markup(text,file){
  for(const m of text.matchAll(/(?:aria-label|title|placeholder|alt)=["']([^"']+)["']/g))add(m[1],file);
  for(const s of text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi,'').split(/<[^>]*>/))add(s,file);
}
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){
  const p=path.join(dir,e.name),rel=path.relative(root,p).replaceAll('\\','/');if(e.isDirectory()){walk(p);continue;}
  if(p.endsWith('.html')){markup(fs.readFileSync(p,'utf8'),rel);continue;}
  if(!p.endsWith('.ts')||p.endsWith('.test.ts'))continue;
  const source=ts.createSourceFile(p,fs.readFileSync(p,'utf8'),ts.ScriptTarget.Latest,true);
  function visit(n){
    if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n)){if(n.text.includes('<'))markup(n.text,rel);else add(n.text,rel);}
    if(ts.isTemplateExpression(n)){let text=n.head.text;n.templateSpans.forEach((s,i)=>{text+='{'+i+'}'+s.literal.text;});if(text.includes('<'))markup(text,rel);else add(text,rel);}
    ts.forEachChild(n,visit);
  }visit(source);
}}
walk(path.join(root,'src'));
function authored(value,file){if(typeof value==='string')add(value,file);else if(Array.isArray(value))value.forEach(v=>authored(v,file));else if(value&&typeof value==='object')Object.values(value).forEach(v=>authored(v,file));}
authored(JSON.parse(fs.readFileSync(path.join(root,'assets/show/show.json'),'utf8')),'assets/show/show.json');
const speech=[];
for(const profile of ['legacy-v3','age-5-10','age-10-15','age-15-18','adults']){
 const file=profile==='legacy-v3'?'assets/show/show.json':`assets/scenarios/${profile}/dialogue.ro.draft.json`;
 const data=JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
 for(const cue of data.cues.filter(c=>c.text?.ro))speech.push({profile,id:cue.id,text:cue.text.ro,phase:cue.phase,at:cue.at,speaker:cue.speaker});
}
const narrator=JSON.parse(fs.readFileSync(path.join(root,'assets/experience/voice/ro/manifest.json'),'utf8'));
for(const [id,c] of Object.entries(narrator.clips))speech.push({profile:'tutorial',id,text:c.text});
fs.writeFileSync(path.join(out,'inventory.json'),JSON.stringify({ui:[...entries].map(([text,files])=>({text,files:[...files]})),speech},null,2));
console.log(JSON.stringify({ui:entries.size,speech:speech.length,characters:[...entries.keys(),...speech.map(x=>x.text)].reduce((n,t)=>n+t.length,0)}));
