/**
 * Pagina de testare a clipurilor: cele cinci fisiere de panou redate simultan, in geometria
 * fizica reala a zidului, cu masurarea derivei intre fluxuri.
 *
 * De ce e nevoie de sincronizare explicita: cinci elemente <video> sunt cinci decodoare
 * independente. Chiar pornite in aceeasi milisecunda, ceasurile lor divergeaza (cadre scapate,
 * granularitate de keyframe, planificarea firelor de decodare). Panoul CENTRAL e ceasul (e cel
 * cu avatarul si audio in configuratia reala), iar celelalte se corecteaza continuu:
 *
 *   |deriva| < softMs            -> nu se atinge nimic (corectia ar fi mai vizibila decat eroarea)
 *   softMs <= |deriva| < hardMs  -> se ajusteaza playbackRate, deci recuperarea e invizibila
 *   |deriva| >= hardMs           -> currentTime = ceas (salt; se vede, dar e mai bine decat divergenta)
 *
 * Aceeasi strategie va fi folosita si de player-ul real din src/renderer, unde ceasul e
 * autoritar pe server; aici ceasul e panoul central, ca pagina sa functioneze de una singura.
 */

import { sessionFetch } from "../shared/session";

// ---------------------------------------------------------------- tipuri API

interface ClipInfo {
  screenId: string;
  file: string;
  exists: boolean;
  bytes?: number;
  width?: number;
  height?: number;
  durationSec?: number;
  bitrateKbps?: number;
  codec?: string;
  order: number;
}
interface ClipsResponse { ok: boolean; dir?: string; reason?: string; hint?: string; panels: ClipInfo[]; issues?: string[] }
interface WallPanel { screenId: string; x: number; y: number; width: number; height: number }
interface WallResponse { videoWall: { panels: WallPanel[]; mode: string } | null; screens: Array<{ id: string; showAvatar?: boolean }> }

// Repere vizuale măsurate direct din film; ajustarea locală nu schimbă show.json.
const BEATS: Array<{ label: string; filmSec: number }> = [
  { label: "Decolare", filmSec: 10 },
  { label: "Siwarha · apropiere", filmSec: 80 },
  { label: "Kepler-186 d", filmSec: 180 },
  { label: "Mann", filmSec: 280 },
  { label: "Gargantua", filmSec: 345 },
  { label: "Wormhole", filmSec: 420 },
  { label: "Saturn", filmSec: 504 },
  { label: "Pământul", filmSec: 610 },
  { label: "Revelația", filmSec: 630 },
  { label: "Stele · final", filmSec: 677 },
];
const OFFSET_KEY = "nava.clips.visual-offsetSec";

// ---------------------------------------------------------------- utilitare

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} lipsește din pagină`);
  return el as T;
};
const fmtTime = (s: number): string => {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};
const fmtBytes = (b?: number): string => {
  if (!b) return "—";
  const gb = b / 1073741824;
  return gb >= 1 ? `${gb.toFixed(2)} GB` : `${Math.round(b / 1048576)} MB`;
};

// ---------------------------------------------------------------- starea paginii

interface Panel {
  info: ClipInfo;
  geom: WallPanel;
  video: HTMLVideoElement;
  box: HTMLDivElement;
  central: boolean;
  driftMs: number;
  action: "—" | "fin" | "salt";
  corrections: number;
  jumps: number;
}

let panels: Panel[] = [];
let master: Panel | null = null;
let offsetSec = Number(localStorage.getItem(OFFSET_KEY) ?? "0") || 0;

// sessionFetch trateaza 401/403 uniform cu restul paginilor de operator (redirect la /login).
async function getJson<T>(url: string): Promise<T> {
  const res = await sessionFetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return (await res.json()) as T;
}

// ---------------------------------------------------------------- construcția zidului

function buildWall(clips: ClipInfo[], wall: WallResponse): void {
  const stage = $("wall");
  stage.textContent = "";
  panels = [];

  const geoms = wall.videoWall?.panels ?? [];
  // Fara geometrie in mm nu putem reproduce proporțiile reale; se cade pe benzi egale,
  // marcat vizibil in nota de sub zid ca sa nu se ia drept adevar.
  const fallback = geoms.length === 0;
  const usable = clips.filter((c) => c.exists);
  if (!usable.length) { stage.textContent = ""; return; }

  const boxes: WallPanel[] = usable.map((c, i) => {
    const g = geoms.find((p) => p.screenId === c.screenId);
    if (g) return g;
    return { screenId: c.screenId, x: i * 1000, y: 0, width: 1000, height: 562 };
  });

  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.width));
  const maxY = Math.max(...boxes.map((b) => b.y + b.height));
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  stage.style.aspectRatio = `${spanX} / ${spanY}`;

  const centralId = wall.screens.find((s) => s.showAvatar)?.id;

  for (const info of usable) {
    const geom = boxes.find((b) => b.screenId === info.screenId)!;
    const box = document.createElement("div");
    box.className = "panel";
    box.style.left = `${((geom.x - minX) / spanX) * 100}%`;
    box.style.top = `${((geom.y - minY) / spanY) * 100}%`;
    box.style.width = `${(geom.width / spanX) * 100}%`;
    box.style.height = `${(geom.height / spanY) * 100}%`;
    const central = info.screenId === centralId;
    if (central) box.dataset.central = "true";

    const video = document.createElement("video");
    video.src = `/api/clips/${encodeURIComponent(info.screenId)}/media`;
    video.muted = true;          // filmul nu are pistă audio; muted permite si autoplay
    video.playsInline = true;
    video.preload = "auto";
    video.loop = false;
    box.appendChild(video);

    const name = document.createElement("span");
    name.className = "panel-name";
    name.textContent = central ? `${info.screenId} · ceas` : info.screenId;
    box.appendChild(name);

    const p: Panel = { info, geom, video, box, central, driftMs: 0, action: "—", corrections: 0, jumps: 0 };
    box.addEventListener("click", () => soloToggle(p));
    video.addEventListener("stalled", () => { box.dataset.stalled = "true"; });
    video.addEventListener("playing", () => { delete box.dataset.stalled; });
    video.addEventListener("error", () => { box.dataset.stalled = "true"; });

    stage.appendChild(box);
    panels.push(p);
  }

  master = panels.find((p) => p.central) ?? panels[Math.floor(panels.length / 2)] ?? null;
  if (master && !master.central) master.box.querySelector(".panel-name")!.textContent = `${master.info.screenId} · ceas`;

  $("stage-note").textContent = fallback
    ? "Configurația nu are geometrie videoWall, deci panourile sunt afișate în benzi egale — proporțiile NU sunt cele din sală."
    : "Fiecare dreptunghi e un televizor, la proporțiile și distanțele din configurație. Panoul central are ramă mai groasă: e cel de 115″.";

  const wallPill = $("wall-pill");
  const totalW = usable.reduce((s, c) => s + (c.width ?? 0), 0);
  wallPill.textContent = `${usable.length} panouri · ${totalW}×${usable[0]?.height ?? "?"} px`;
}

// ---------------------------------------------------------------- solo

let soloed: Panel | null = null;
function soloToggle(p: Panel): void {
  if (!$<HTMLInputElement>("solo-mode").checked) return;
  soloed = soloed === p ? null : p;
  for (const q of panels) {
    if (soloed && q !== soloed) q.box.dataset.dim = "true";
    else delete q.box.dataset.dim;
  }
}

// ---------------------------------------------------------------- sincronizare

function applySync(): void {
  if (!master) return;
  const soft = Math.max(5, Number($<HTMLInputElement>("soft-ms").value) || 25) / 1000;
  const hard = Math.max(soft * 2, Number($<HTMLInputElement>("hard-ms").value) || 120) / 1000;
  const clock = master.video.currentTime;
  const rate = master.video.playbackRate;

  for (const p of panels) {
    if (p === master) { p.driftMs = 0; p.action = "—"; continue; }
    const drift = p.video.currentTime - clock;
    p.driftMs = drift * 1000;
    const mag = Math.abs(drift);

    if (mag >= hard) {
      // Salt: se vede, dar divergenta e mai rea. Nu se face in pauza, ca sa nu smuceasca cadrul.
      p.video.currentTime = clock;
      p.video.playbackRate = rate;
      p.action = "salt";
      p.jumps++;
    } else if (mag >= soft && !p.video.paused) {
      // Corecție fina: +/-5 % din viteza recupereaza deriva fara sa se vada.
      p.video.playbackRate = rate * (drift > 0 ? 0.95 : 1.05);
      p.action = "fin";
      p.corrections++;
    } else {
      if (p.video.playbackRate !== rate) p.video.playbackRate = rate;
      p.action = "—";
    }
  }
}

function renderSync(): void {
  const body = $("sync-body");
  const rows: string[] = [];
  let worst = 0;
  for (const p of panels) {
    const abs = Math.abs(p.driftMs);
    if (!p.central) worst = Math.max(worst, abs);
    const cls = abs < 25 ? "drift-ok" : abs < 120 ? "drift-warn" : "drift-bad";
    const drift = p.central ? "ceas" : `${p.driftMs > 0 ? "+" : ""}${p.driftMs.toFixed(0)} ms`;
    const act = p.central ? "—" : `${p.action}${p.jumps ? ` · ${p.jumps} salt` : ""}`;
    rows.push(
      `<tr><td>${p.info.screenId}</td><td class="${p.central ? "" : cls}">${drift}</td><td>${act}</td>` +
      `<td>${p.info.width ?? "?"}×${p.info.height ?? "?"}</td><td>${p.info.bitrateKbps ? (p.info.bitrateKbps / 1000).toFixed(1) + " Mbps" : "—"}</td></tr>`,
    );
  }
  body.innerHTML = rows.join("");
  const verdict = $("sync-verdict");
  verdict.textContent = panels.length < 2 ? "—" : worst < 25 ? `strâns · ${worst.toFixed(0)} ms` : worst < 120 ? `acceptabil · ${worst.toFixed(0)} ms` : `derivă · ${worst.toFixed(0)} ms`;
}

// ---------------------------------------------------------------- transport

function duration(): number {
  return panels.reduce((m, p) => Math.max(m, p.info.durationSec ?? p.video.duration ?? 0), 0);
}

async function playAll(): Promise<void> {
  if (!master) return;
  // Se aliniaza toate pe ceas INAINTE de play, altfel pornirea insasi introduce deriva.
  const t = master.video.currentTime;
  for (const p of panels) if (p !== master) p.video.currentTime = t;
  await Promise.allSettled(panels.map((p) => p.video.play()));
}
function pauseAll(): void { for (const p of panels) p.video.pause(); }
function seekAll(t: number): void {
  const d = duration();
  const clamped = Math.min(Math.max(0, t), Math.max(0, d - 0.05));
  for (const p of panels) p.video.currentTime = clamped;
}

function wireTransport(): void {
  const playBtn = $<HTMLButtonElement>("play");
  const seek = $<HTMLInputElement>("seek");
  let dragging = false;

  playBtn.addEventListener("click", async () => {
    if (!master) return;
    if (master.video.paused) { await playAll(); playBtn.textContent = "⏸ Pauză"; }
    else { pauseAll(); playBtn.textContent = "▶ Redă"; }
  });
  $("back10").addEventListener("click", () => master && seekAll(master.video.currentTime - 10));
  $("fwd10").addEventListener("click", () => master && seekAll(master.video.currentTime + 10));
  $<HTMLSelectElement>("rate").addEventListener("change", (e) => {
    const r = Number((e.target as HTMLSelectElement).value) || 1;
    for (const p of panels) p.video.playbackRate = r;
  });
  $("resync").addEventListener("click", () => master && seekAll(master.video.currentTime));

  seek.addEventListener("pointerdown", () => { dragging = true; });
  seek.addEventListener("pointerup", () => { dragging = false; });
  seek.addEventListener("input", () => {
    const d = duration();
    if (d > 0) seekAll((Number(seek.value) / 1000) * d);
  });

  const wall = $("wall");
  const bind = (id: string, attr: string) => {
    const cb = $<HTMLInputElement>(id);
    const sync = () => { wall.dataset[attr] = cb.checked ? "on" : "off"; };
    cb.addEventListener("change", sync); sync();
  };
  bind("seams", "seams"); bind("grid", "grid"); bind("solo-mode", "solo");
  const labels = $<HTMLInputElement>("labels");
  const syncLabels = () => { wall.dataset.labels = labels.checked ? "on" : "off"; };
  labels.addEventListener("change", syncLabels); syncLabels();

  const tick = (): void => {
    if (master) {
      applySync();
      renderSync();
      const t = master.video.currentTime;
      const d = duration();
      $("time").textContent = fmtTime(t);
      $("duration").textContent = d > 0 ? fmtTime(d) : "—";
      if (!dragging && d > 0) seek.value = String(Math.round((t / d) * 1000));
      if (master.video.paused && playBtn.textContent !== "▶ Redă") playBtn.textContent = "▶ Redă";
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------- markere

function renderMarkers(): void {
  const host = $("markers");
  host.textContent = "";

  const off = document.createElement("label");
  off.className = "rate";
  off.textContent = "Ajustare locală a reperelor vizuale · s";
  const input = document.createElement("input");
  input.type = "number"; input.step = "0.5"; input.value = String(offsetSec); input.style.maxWidth = "90px";
  input.addEventListener("change", () => {
    offsetSec = Number(input.value) || 0;
    localStorage.setItem(OFFSET_KEY, String(offsetSec));
    renderMarkers();
  });
  off.appendChild(input);
  host.appendChild(off);

  const d = duration();
  for (const b of BEATS) {
    const t = b.filmSec + offsetSec;
    if (d > 0 && (t < 0 || t > d)) continue;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = `${b.label} · ${fmtTime(t)}`;
    btn.addEventListener("click", () => seekAll(t));
    host.appendChild(btn);
  }
}

// ---------------------------------------------------------------- fișiere

function renderFiles(clips: ClipsResponse): void {
  $("dir-pill").textContent = clips.dir ?? "panelsDir nesetat";
  const issues = $("issues");
  issues.innerHTML = (clips.issues ?? []).map((i) => `<li>${i}</li>`).join("");
  $("files-body").innerHTML = clips.panels
    .map((p) => {
      const file = p.file.split(/[\\/]/).pop() ?? p.file;
      if (!p.exists) return `<tr><td>${p.screenId}</td><td class="missing">${file} — lipsește</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>`;
      return `<tr><td>${p.screenId}</td><td>${file}</td><td>${p.width}×${p.height}</td><td>${fmtTime(p.durationSec ?? 0)}</td>` +
        `<td>${p.bitrateKbps ? (p.bitrateKbps / 1000).toFixed(1) + " Mbps" : "—"}</td><td>${fmtBytes(p.bytes)}</td></tr>`;
    })
    .join("");
}

// ---------------------------------------------------------------- boot

async function boot(): Promise<void> {
  const status = $("load-status");
  try {
    const [clips, wall] = await Promise.all([getJson<ClipsResponse>("/api/clips"), getJson<WallResponse>("/api/wall")]);
    renderFiles(clips);

    if (!clips.ok) {
      status.dataset.state = "error";
      status.textContent = `${clips.reason ?? "Nu am găsit clipuri"}. ${clips.hint ?? ""}`.trim();
      return;
    }
    buildWall(clips.panels, wall);
    wireTransport();
    renderMarkers();
    const missing = clips.panels.filter((p) => !p.exists).length;
    status.hidden = missing === 0;
    if (missing) { status.dataset.state = "error"; status.textContent = `${missing} din ${clips.panels.length} clipuri lipsesc — vezi lista de fișiere.`; }
  } catch (err) {
    status.dataset.state = "error";
    status.textContent = `Nu am putut încărca clipurile: ${err instanceof Error ? err.message : String(err)}`;
  }
}

void boot();
