import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { geometry } from './wall-export.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const source = process.argv[2];
if (!source) throw Error('Pass the original SpaceEngine TXT path. Outputs are created once, never overwritten.');
const raw = fs.readFileSync(source), text = raw.toString('utf8');
const put = (name, data) => fs.writeFileSync(path.join(root, name), data, { flag: 'wx' });
const clean = text.replace(/\/\/[^\r\n]*/g, '');
const waits = [...clean.matchAll(/^\s*Wait\s+([\d.]+)/gm)].map(m => Number(m[1]));
const duration = waits.reduce((a, b) => a + b, 0);
const ids = ['01-stanga-exterior', '02-stanga-interior', '03-centru', '04-dreapta-interior', '05-dreapta-exterior'];
const x = [-(2565.2 / 2 + 500 + 2185.1 / 2 + 2185.1 + 500), -(2565.2 / 2 + 500 + 2185.1 / 2), 0,
  2565.2 / 2 + 500 + 2185.1 / 2, 2565.2 / 2 + 500 + 2185.1 / 2 + 2185.1 + 500];
const config = {
  version: 1, geometryVerified: false,
  arrangement: 'flat-coplanar', gapBetweenCasingsMm: 500,
  viewer: { distanceMm: 4500, xMm: 0, yMm: 0 },
  assumptions: ['4.5 m is the midpoint of the user estimate 4–5 m.', 'Vertical panel centres and eye height are provisionally equal.', '500 mm interpreted as casing-edge to casing-edge.', 'Active dimensions estimated from nominal diagonal and 16:9; measure visible pixels before final render.', 'Casings sourced from Samsung regional QN90F specifications; verify exact installed model.'],
  panels: ids.map((id, i) => {
    const diagonal = i === 2 ? 115 : 98;
    return { id, diagonalInches: diagonal, casingWidthMm: i === 2 ? 2565.2 : 2185.1, casingHeightMm: i === 2 ? 1467.6 : 1249.3,
      activeWidthMm: diagonal * 25.4 * 16 / Math.sqrt(337), activeHeightMm: diagonal * 25.4 * 9 / Math.sqrt(337), centerXmm: x[i], centerYmm: 0 };
  }),
};
put('wall-geometry.json', JSON.stringify(config, null, 2));
put('00-ORIGINAL.txt', raw);
put('00-ORIGINAL.se', raw);
const master = '// NAVA: FULL MONO 360 MASTER. Export unpadded 2:1; verify projection with a short test.\r\n' +
  '// Same source flight. No offsets, new turns, waits or position edits.\r\n' +
  text.replace(/^FOV 50\s*$/m, 'FOV 50\r\nDisplayMode "Cylinder"');
put('01-MASTER-360.se', master);
put('RESTORE-NORMAL.se', 'DisplayMode "Normal"\r\nFOV 50\r\n');
const timeline = [];
let clock = 0;
for (const [i, line] of text.split(/\r?\n/).entries()) {
  const code = line.replace(/\/\/.*$/, '').trim();
  if (/^(Select|Center|Track|Untrack|Goto|Orbit|StopOrbit|PlaySplinePath|Fly|StopFly)\b/.test(code)) timeline.push({ scriptTimeSeconds: clock, sourceLine: i + 1, command: code, position: 'Engine-evaluated; command start, not arrival' });
  const wait = code.match(/^Wait\s+([\d.]+)/);
  if (wait) clock += Number(wait[1]);
}
const knots = [...clean.matchAll(/^\s*\(([^()]+)\)\s*$/gm)].map(m => m[1].trim().split(/\s+/).map(Number)).filter(v => v.length === 9 && v.every(Number.isFinite));
const pcKm = 3.0856775814913673e13;
put('camera-earth-knots.csv', 'time_s,x_pc,y_pc,z_pc,qw,qx,qy,qz,stereobase,x_km,y_km,z_km,radius_from_reference_km\n' + knots.map(v => [...v, ...v.slice(1, 4).map(n => n * pcKm), Math.hypot(...v.slice(1, 4)) * pcKm].join(',')).join('\n') + '\n');
put('source-audit.json', JSON.stringify({ sourceFile: path.basename(source), sha256: crypto.createHash('sha256').update(raw).digest('hex'), explicitWaitCount: waits.length, explicitWaitSumSeconds: duration,
  spline: { name: 'EARTH_DEPARTURE', body: 'Earth', parent: 'Earth-Moon', syncRot: false, explicitDurationSeconds: 40, knots: knots.length, positionsAreRelativeNotAbsolute: true },
  remainingPositions: 'Not numerically present in source. SpaceEngine resolves bodies, flight integration and wormhole transport. Do not invent absolute positions.',
  showMovieSeconds: 465, compatibleWithExistingShowTiming: false, timeline,
  geometryComparisons: [4000, 4500, 5000].map(distanceMm => ({ distanceMm, panels: geometry({ ...config, viewer: { ...config.viewer, distanceMm } }) })),
}, null, 2));
for (const id of [...ids, 'all']) {
  put(`${id === 'all' ? 'EXPORT-TOATE' : 'EXPORT-' + id}.ps1`, `param(\n  [Parameter(Mandatory=$true)][string]$Master,\n  [string]$OutputDirectory = (Join-Path $PSScriptRoot 'exports'),\n  [switch]$AllowProvisional,\n  [int]$Width = 3840\n)\n$ErrorActionPreference = 'Stop'\n$renderArgs = @((Join-Path $PSScriptRoot 'wall-export.mjs'), 'render', '--master', $Master, '--projection', 'equirect', '--screen', '${id}', '--out', $OutputDirectory, '--width', $Width)\nif ($AllowProvisional) { $renderArgs += '--allow-provisional' }\n& node @renderArgs\nif ($LASTEXITCODE -ne 0) { throw 'Export failed; see the error above.' }\n`);
}
const views = geometry(config);
put('camera-calculations.json', JSON.stringify(views, null, 2));
// A standalone, physical-scale diagram; no screenshot or fabricated space image.
const sx = n => 700 + n * 0.09;
const panelsSvg = views.map(p => `<rect x="${sx(p.centerXmm - p.casingWidthMm / 2)}" y="80" width="${p.casingWidthMm * .09}" height="18" rx="3" fill="#245b82"/><path d="M700,503 L${sx(p.leftMm)},98 M700,503 L${sx(p.rightMm)},98" stroke="#b5c9dc"/><text x="${sx(p.centerXmm)}" y="65" text-anchor="middle">${p.id.slice(0, 2)} · ${p.diagonalInches}″</text>`).join('');
put('schema-peretelui.html', `<!doctype html><html lang="ro"><meta charset="utf-8"><title>Nava · geometria celor cinci TV-uri</title><style>body{font:18px system-ui;background:#eef5fa;color:#183549;margin:36px}main{max-width:1400px;margin:auto}svg{width:100%;background:white;border-radius:24px}table{border-collapse:collapse;width:100%;background:white}td,th{padding:12px;border-bottom:1px solid #d8e2ea;text-align:left}strong{color:#985615}</style><main><h1>Un singur punct de vedere. Cinci ferestre.</h1><p>98″ — 50 cm — 98″ — 50 cm — 115″ — 50 cm — 98″ — 50 cm — 98″</p><p><strong>Calcul provizoriu:</strong> spectator centrat la 4,5 m; centrele ecranelor și ochii la aceeași înălțime. Dimensiunile active sunt estimate.</p><svg viewBox="0 0 1400 560" role="img" aria-label="Plan de sus, ecrane în linie și razele comune din poziția spectatorului">${panelsSvg}<circle cx="700" cy="503" r="8" fill="#df7654"/><text x="720" y="515">spectator · 4,5 m</text></svg><table><tr><th>TV</th><th>Centru X</th><th>Direcție spre centru</th><th>Margine stângă / dreaptă</th></tr>${views.map(p => `<tr><td>${p.id}</td><td>${(p.centerXmm/1000).toFixed(4)} m</td><td>${p.bearingDeg.toFixed(3)}°</td><td>${p.leftAngleDeg.toFixed(3)}° / ${p.rightAngleDeg.toFixed(3)}°</td></tr>`).join('')}</table><p>Unghiurile sunt direcții către punctele peretelui, nu comenzi de rotire a cinci camere. Ecranele sunt coplanare: proiecțiile sunt asimetrice și paralele. Spațiile dintre televizoare ascund razele corespunzătoare.</p><p>Lățime totală carcase + spații: 13,3056 m. Fiecare pixel folosește raza normalize(X − ochiX, Y − ochiY, 4500). Poziția virtuală a navei rămâne identică pentru toate ieșirile.</p></main></html>`);
console.log(JSON.stringify({ folder: root, waits: waits.length, duration, knots: knots.length, panels: views.map(p => ({ id: p.id, bearing: p.bearingDeg, bounds: [p.leftAngleDeg, p.rightAngleDeg] })) }, null, 2));
