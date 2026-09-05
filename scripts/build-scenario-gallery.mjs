import {readdir,writeFile} from 'node:fs/promises';
const dir='runs/debug/scenarios-new',entries=await readdir(dir);
const images=entries.filter(n=>n.endsWith('.png')).sort(),reports=entries.filter(n=>n.endsWith('.json')).sort();
const escape=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
await writeFile(dir+'/index.html',`<!doctype html><meta charset="utf-8"><title>Nava · scenarii și verificări</title>
<style>body{font:16px system-ui;background:#f5f4ff;color:#172337;padding:32px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:24px}figure{margin:0;background:white;padding:12px;border-radius:18px}img{width:100%;height:auto}a{color:#355477}nav{margin:20px 0;line-height:2}figcaption{overflow-wrap:anywhere}</style>
<h1>Nava · scenarii și verificări</h1><p>Capturi software reale; geometria optică sintetică este etichetată separat în rapoarte. Acestea nu sunt fotografii ale instalației Samsung.</p>
<nav>${reports.map(n=>`<a href="${encodeURIComponent(n)}">${escape(n)}</a>`).join(' · ')}</nav>
<main>${images.map(n=>`<figure><a href="${encodeURIComponent(n)}"><img loading="lazy" src="${encodeURIComponent(n)}" alt="${escape(n)}"></a><figcaption>${escape(n)}</figcaption></figure>`).join('')}</main>`);
console.log(`${images.length} screenshots and ${reports.length} reports indexed.`);
