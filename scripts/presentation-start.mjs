#!/usr/bin/env node
/** Presentation launcher: existing local wall profile, fresh build, no installation or configuration changes. */
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = path.join(ROOT, 'config.wall.local.json');
const args = new Set(process.argv.slice(2));
const out = text => console.log(`[EXODUS7] ${text}`);
const fail = text => { throw new Error(text); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function help() {
  console.log(`PREZENTARE.bat                 Reconstruiește codul și pornește panorama într-o fereastră.
PREZENTARE.bat --live          Reconstruiește codul și pornește TV-urile în kiosk.
PREZENTARE.bat --check-only    Verifică fișierele locale; nu construiește și nu pornește aplicația.
PREZENTARE.bat --help          Arată acest ajutor.

Se folosește exclusiv config.wall.local.json existent. Nu se schimbă profilul sălii,
personajele, readiness sau autostart. O aplicație deja pornită trebuie închisă manual
înainte de relansare, pentru ca noul cod să intre în funcțiune.`);
}

function file(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label}: calea lipsește din configurație.`);
  const resolved = path.resolve(ROOT, value);
  try {
    const stat = fs.statSync(resolved);
    if (stat.isFile() && stat.size > 0) return resolved;
  } catch {}
  fail(`${label}: fișierul lipsește sau este gol (${resolved}).`);
}

function readJson(filename, label) {
  try { return JSON.parse(fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, '')); }
  catch { fail(`${label}: fișier absent sau JSON invalid. Verifică ${filename}.`); }
}

function validate() {
  const c = readJson(CONFIG, 'Profilul local');
  if (c.role && c.role !== 'master') fail('Profilul local trebuie să fie master pentru prezentarea găzduită de acest PC. Configurația nu a fost schimbată.');
  if (c.videoWall?.mode !== 'panorama') fail('Profilul local nu este în modul panorama. Verifică configurația sălii înainte de prezentare.');
  const port = c.server?.port ?? 4321;
  if (!Number.isInteger(port) || port < 1 || port > 65535) fail('server.port nu este un port valid.');
  const ids = c.screens?.map(screen => screen.id);
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !/^[\w-]+$/.test(id))) fail('Configurația screens nu definește ID-uri valide și distincte.');
  if (typeof c.video?.panelsDir !== 'string' || !c.video.panelsDir.trim()) fail('video.panelsDir lipsește; lansatorul nu trece automat la filmul unic.');
  const panelDir = path.resolve(ROOT, c.video.panelsDir);
  for (const id of ids) file(path.join(panelDir, `${id}.mp4`), `Film ${id}`);
  const showPath = file(c.show, 'Scenariu');
  const show = readJson(showPath, 'Scenariu');
  if (!Array.isArray(show.cues) || !show.cues.length || !Array.isArray(show.scenes) || !show.scenes.length || !(show.videoDurationSec > 0)) fail('Scenariul nu conține scene, replici și durată valide.');
  const avatars = [c.avatar?.glb, ...Object.values(c.avatar?.glbBySpeaker ?? {})];
  for (const avatar of new Set(avatars)) {
    const avatarPath = file(avatar, 'Avatar GLB');
    const fd = fs.openSync(avatarPath, 'r');
    const header = Buffer.alloc(12);
    try {
      if (fs.readSync(fd, header, 0, 12, 0) !== 12 || header.toString('ascii', 0, 4) !== 'glTF' || header.readUInt32LE(4) !== 2 || header.readUInt32LE(8) !== fs.fstatSync(fd).size) fail(`Avatar GLB invalid: ${avatarPath}.`);
    } finally { fs.closeSync(fd); }
  }
  out(`Fișiere prezente: ${ids.length} filme panoramice, ${new Set(avatars).size} avatar(e) GLB și scenariul (${show.videoDurationSec} s).`);
  out(`Profil: ${CONFIG}`);
  out('Această verificare confirmă fișierele locale, nu redarea, sincronizarea sau televizoarele fizice.');
  return { port };
}

function portOpen(port, host) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ port, host });
    const done = result => { socket.destroy(); resolve(result); };
    socket.setTimeout(1200, () => { socket.destroy(); reject(new Error('Portul local nu a putut fi verificat. Închide aplicația existentă și încearcă din nou.')); });
    socket.once('connect', () => done(true));
    socket.once('error', error => {
      if (['ECONNREFUSED', 'EAFNOSUPPORT', 'ENETUNREACH'].includes(error.code)) done(false);
      else { socket.destroy(); reject(new Error('Verificarea portului local a eșuat. Nu a fost pornită o a doua aplicație.')); }
    });
  });
}
async function occupied(port) { return (await Promise.all(['127.0.0.1', '::1'].map(host => portOpen(port, host)))).some(Boolean); }

function guidance(port) {
  out('DEMO RAPID: apasă ▶ DEMO TV direct în fereastra Electron. Pornește filmul pentru copii fără tablete.');
  out('Butonul pregătește vocile, apoi pornește numărătoarea inversă. Pentru experiența interactivă completă, urmează pașii de mai jos.');
  out(`Consolă: http://localhost:${port}/control/`);
  out(`Tabletă pentru demonstrația solo: http://localhost:${port}/tablet/?post=2`);
  console.log('\n1. Autentifică-te în consolă; alege „5–10 ani · Bucățile de acasă”.');
  console.log('2. Resetează sala din consolă înainte de alegerea personajului.');
  console.log('3. Pe tableta postului 2, alege și confirmă un personaj doar în zona A (stânga). Lasă B liber.');
  console.log('4. Verifică în consolă că ai un singur participant confirmat, pe locul 2A.');
  console.log('5. Urmează fluxul de pregătire și tutorial. Participă la exercițiul de început, apoi pornește călătoria când pregătirea permite.');
  console.log('   Lansatorul nu selectează scenariul, nu confirmă locuri și nu ocolește verificările de pregătire.\n');
}

async function main() {
  if (args.has('--help')) { help(); return; }
  if ([...args].some(arg => !['--live', '--check-only'].includes(arg))) { help(); fail('Argument necunoscut.'); }
  if (Number(process.versions.node.split('.')[0]) < 22) fail('Este necesar Node.js 22 sau mai nou.');
  const { port } = validate();
  if (args.has('--check-only')) { out('Verificarea fișierelor s-a încheiat. Nu s-a construit și nu s-a pornit aplicația.'); return; }
  if (await occupied(port)) {
    out(`Portul ${port} este deja ocupat. Poți deschide consola: http://localhost:${port}/control/`);
    fail('Nu am reconstruit și nu am lansat alt player. Codul nou NU este activat de această comandă. Închide manual aplicația Nava existentă, apoi rulează din nou PREZENTARE.bat.');
  }
  let electron;
  try { electron = createRequire(import.meta.url)('electron'); }
  catch { fail('Electron lipsește din instalarea locală. Nu au fost instalate sau schimbate dependențe.'); }
  file(electron, 'Electron');
  out('Construiesc versiunea curentă a repository-ului…');
  const build = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build.mjs')], { cwd: ROOT, stdio: 'inherit', windowsHide: true });
  if (build.error || build.status !== 0) fail('Buildul a eșuat. Playerul nu a fost pornit.');
  for (const built of ['dist/main/main.js', 'dist/preload/preload.js', 'dist/renderer/renderer.js', 'dist/web/control/app.js', 'dist/web/tablet/app.js']) file(built, 'Fișier construit');
  if (await occupied(port)) fail(`Portul ${port} a devenit ocupat în timpul buildului. Închide aplicația deja pornită și relansează; noul player nu a fost lansat.`);
  const logDir = path.join(ROOT, 'runs', 'presentation');
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, `start-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
  const log = fs.openSync(logPath, 'ax');
  const child = spawn(electron, [ROOT, '--config', CONFIG, args.has('--live') ? '--kiosk' : '--wall-preview'], { cwd: ROOT, detached: true, windowsHide: true, stdio: ['ignore', log, log], env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } });
  fs.closeSync(log);
  let launchError = null, exited = false;
  child.once('error', error => { launchError = error; });
  child.once('exit', () => { exited = true; });
  child.unref();
  out(`Pornire ${args.has('--live') ? 'pe TV-uri, în kiosk' : 'în fereastra de previzualizare'}. PID: ${child.pid ?? 'în așteptare'}.`);
  out(`Jurnal: ${logPath}`);
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (launchError || exited) fail(`Playerul s-a oprit la pornire. Consultă jurnalul: ${logPath}`);
    if (await occupied(port)) {
      out('Serverul răspunde pe portul local. Verifică filmul, avatarul și sunetul în fereastra Nava.');
      guidance(port);
      return;
    }
    await delay(400);
  }
  fail(`Serverul nu a răspuns în 45 de secunde. Procesul nu a fost oprit automat; verifică fereastra Nava și jurnalul ${logPath} înainte de altă pornire.`);
}

main().catch(error => { console.error(`[EXODUS7] ${error.message}`); process.exitCode = 1; });
