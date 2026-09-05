/**
 * /analytics — tabloul de bord al rularilor (D-05). Citeste GET /api/analytics/summary (rol viewer) si
 * GET /api/analytics/run/:id; fara biblioteci, graficele sunt desenate pe <canvas>. La 401 → /login/?next=/analytics/.
 */

export {};

interface ChoiceStats {
  total: number;
  observed: number;
  byValue: Record<string, number>;
  byZone: Record<string, Record<string, number>>;
  posts: number[];
}
interface RunRow {
  id: string;
  file: string;
  startedAt: string | null;
  playStartedAt: string | null;
  endedAt: string | null;
  durationSec: number | null;
  missionDurationSec: number | null;
  started: boolean;
  reachedEpilogue: boolean;
  completed: boolean;
  events: number;
  cuesFired: number;
  cuesManual: number;
  cuesByKind: Record<string, number>;
  commands: Record<string, number>;
  commandsTotal: number;
  tabletAnswers: number;
  tabletChoices: Record<string, ChoiceStats>;
  tabletsSeen: number;
  photos: number;
  dynamicVoices: number;
  lastState: string | null;
  transitions?: number;
}
interface RunDetail extends RunRow {
  states: Array<{ t: string; from: string; to: string; reason?: string }>;
  timeline: Array<{ t: string; kind: string; data?: unknown }>;
}
interface Aggregate {
  runs: number;
  runsStarted: number;
  runsCompleted: number;
  completionRate: number | null;
  avgDurationSec: number | null;
  medianDurationSec: number | null;
  avgCuesFired: number | null;
  avgTabletAnswers: number | null;
  commands: Record<string, number>;
  choiceTotals: Record<string, Record<string, number>>;
  mostChosenPerInteraction: Record<string, { value: string; count: number; total: number; share: number }>;
  firstRunAt: string | null;
  lastRunAt: string | null;
}
interface Summary {
  generatedAt: string;
  aggregate: Aggregate;
  runs: RunRow[];
}

const $ = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Element lipsă: #${id}`);
  return node as T;
};

const COMMAND_LABELS: Record<string, string> = {
  preshow: "Pre-show", start: "Start", play: "Redă", pause: "Pauză", seek: "Salt", skipToScene: "Scenă", restart: "Restart",
  epilogue: "Epilog", fireCue: "Cue manual", stopVoice: "Stop voce", setVolume: "Volum", setLang: "Limbă", reloadShow: "Reîncarcă",
  testAvatar: "Test avatar", identifyScreens: "Identifică", rehearse: "Repetiție", setRate: "Viteză", autoRun: "Auto-run",
  lights: "Lumini", ambient: "Ambianță", say: "Spune", setVariant: "Variantă", photo: "Foto", preflight: "Preflight",
};
const STATE_LABELS: Record<string, string> = { idle: "idle", preshow: "pre-show", playing: "redare", paused: "pauză", epilogue: "epilog", ended: "încheiat" };

let summary: Summary | null = null;
let selectedRun: string | null = null;

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#59d9ff";
}

function fmtDuration(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec)) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ro-RO", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function goToLogin(): void {
  location.assign(`/login/?next=${encodeURIComponent("/analytics/")}`);
}

async function api<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin", cache: "no-store" });
  if (res.status === 401) {
    goToLogin();
    throw new Error("Sesiune expirată");
  }
  if (res.status === 404) throw new Error("Analitica nu este montată pe server (/api/analytics). Vezi src/server/features/INTEGRATION.md.");
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { reason?: string };
    throw new Error(body.reason ?? `Eroare ${res.status}`);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Canvas bar charts (no libraries)

interface BarOptions {
  horizontal?: boolean;
  color?: string | ((index: number) => string);
  format?: (v: number) => string;
  highlight?: number;
}

function drawBars(canvas: HTMLCanvasElement, labels: string[], values: number[], opts: BarOptions = {}): void {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || canvas.width;
  const cssH = canvas.clientHeight || canvas.height;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssW, cssH);
  const muted = cssVar("--muted");
  const text = cssVar("--text");
  const line = "rgba(132,190,226,0.18)";
  const colorAt = (i: number): string => (typeof opts.color === "function" ? opts.color(i) : opts.color ?? cssVar("--cyan"));
  const fmt = opts.format ?? ((v: number) => String(Math.round(v * 10) / 10));
  const max = Math.max(1, ...values);
  ctx.font = "11px ui-monospace, monospace";
  ctx.textBaseline = "middle";

  if (opts.horizontal) {
    const labelW = Math.min(cssW * 0.38, Math.max(...labels.map((l) => ctx.measureText(l).width)) + 16);
    const valueW = 52;
    const rowH = Math.min(30, (cssH - 8) / Math.max(1, labels.length));
    const barX = labelW;
    const barW = cssW - labelW - valueW;
    labels.forEach((label, i) => {
      const y = 4 + i * rowH;
      ctx.fillStyle = muted;
      ctx.textAlign = "right";
      ctx.fillText(truncate(ctx, label, labelW - 12), labelW - 8, y + rowH / 2);
      const w = (values[i] / max) * barW;
      ctx.fillStyle = i === opts.highlight ? cssVar("--amber") : colorAt(i);
      roundRect(ctx, barX, y + rowH * 0.2, Math.max(2, w), rowH * 0.6, 3);
      ctx.fillStyle = text;
      ctx.textAlign = "left";
      ctx.fillText(fmt(values[i]), barX + w + 6, y + rowH / 2);
    });
    return;
  }

  const padL = 44;
  const padB = 34;
  const padT = 12;
  const plotW = cssW - padL - 10;
  const plotH = cssH - padT - padB;
  // grid + axis
  const steps = 4;
  ctx.textAlign = "right";
  for (let i = 0; i <= steps; i += 1) {
    const v = (max / steps) * i;
    const y = padT + plotH - (v / max) * plotH;
    ctx.strokeStyle = line;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
    ctx.fillStyle = muted;
    ctx.fillText(fmt(v), padL - 6, y);
  }
  const n = Math.max(1, values.length);
  const slot = plotW / n;
  const barW = Math.max(4, Math.min(46, slot * 0.62));
  values.forEach((v, i) => {
    const h = (v / max) * plotH;
    const x = padL + i * slot + (slot - barW) / 2;
    const y = padT + plotH - h;
    ctx.fillStyle = i === opts.highlight ? cssVar("--amber") : colorAt(i);
    roundRect(ctx, x, y, barW, Math.max(1, h), 3);
    ctx.fillStyle = muted;
    ctx.textAlign = "center";
    const label = labels[i] ?? "";
    ctx.save();
    ctx.translate(x + barW / 2, padT + plotH + 8);
    if (n > 8) {
      ctx.rotate(-Math.PI / 5);
      ctx.textAlign = "right";
      ctx.fillText(truncate(ctx, label, 70), 0, 6);
    } else {
      ctx.textBaseline = "top";
      ctx.fillText(truncate(ctx, label, slot - 4), 0, 0);
    }
    ctx.restore();
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  ctx.fill();
}

function truncate(ctx: CanvasRenderingContext2D, label: string, maxW: number): string {
  if (ctx.measureText(label).width <= maxW) return label;
  let s = label;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  return `${s}…`;
}

// ---------------------------------------------------------------------------
// Rendering

function renderCards(a: Aggregate): void {
  $("k-runs").textContent = String(a.runs);
  $("k-runs-note").textContent = `${a.runsStarted} misiuni pornite · ${a.runs - a.runsStarted} doar server${a.lastRunAt ? ` · ultima ${fmtDate(a.lastRunAt)}` : ""}`;
  $("k-completion").textContent = a.completionRate === null ? "—" : `${a.completionRate}%`;
  $("k-completion-note").textContent = a.runsStarted ? `${a.runsCompleted} din ${a.runsStarted} au ajuns în epilog / final` : "nicio misiune pornită";
  $("k-duration").textContent = fmtDuration(a.avgDurationSec);
  $("k-duration-note").textContent = a.medianDurationSec === null ? "—" : `mediană ${fmtDuration(a.medianDurationSec)} · cue-uri medii ${a.avgCuesFired ?? "—"}`;
  $("k-answers").textContent = a.avgTabletAnswers === null ? "—" : String(a.avgTabletAnswers);
  const interactions = Object.keys(a.choiceTotals).length;
  $("k-answers-note").textContent = `${interactions} ${interactions === 1 ? "interacțiune" : "interacțiuni"} cu răspunsuri`;
}

function renderDurations(runs: RunRow[]): void {
  const canvas = $<HTMLCanvasElement>("chart-durations");
  const started = runs.filter((r) => r.started && (r.missionDurationSec ?? r.durationSec) !== null).slice(0, 20).reverse();
  $("durations-empty").hidden = started.length > 0;
  canvas.hidden = started.length === 0;
  if (!started.length) return;
  const green = cssVar("--green");
  const cyan = cssVar("--cyan");
  drawBars(
    canvas,
    started.map((r) => r.id.replace(/^show-\d{8}-/, "")),
    started.map((r) => (r.missionDurationSec ?? r.durationSec ?? 0) / 60),
    { color: (i) => (started[i].completed ? green : cyan), format: (v) => `${Math.round(v * 10) / 10} min` },
  );
}

function renderCommands(a: Aggregate): void {
  const canvas = $<HTMLCanvasElement>("chart-commands");
  const entries = Object.entries(a.commands).sort((x, y) => y[1] - x[1]).slice(0, 12);
  $("commands-empty").hidden = entries.length > 0;
  canvas.hidden = entries.length === 0;
  if (!entries.length) return;
  drawBars(canvas, entries.map(([k]) => COMMAND_LABELS[k] ?? k), entries.map(([, v]) => v), { horizontal: true, color: cssVar("--violet"), format: (v) => String(Math.round(v)) });
}

function renderChoices(a: Aggregate): void {
  const host = $("choices");
  host.replaceChildren();
  const cueIds = Object.keys(a.choiceTotals);
  $("choices-note").textContent = cueIds.length ? `${cueIds.length} interacțiuni · „observe” = doar privesc` : "";
  if (!cueIds.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "Nicio alegere înregistrată încă pe tablete.";
    host.append(p);
    return;
  }
  for (const cueId of cueIds) {
    const byValue = a.choiceTotals[cueId];
    const entries = Object.entries(byValue).sort((x, y) => y[1] - x[1]);
    const total = entries.reduce((s, [, n]) => s + n, 0);
    const best = a.mostChosenPerInteraction[cueId];
    const card = document.createElement("article");
    card.className = "choice-card";
    const title = document.createElement("strong");
    title.textContent = cueId;
    const p = document.createElement("p");
    p.textContent = best ? `Cel mai ales: ${labelOf(best.value)} (${best.count}/${best.total}, ${best.share}%)` : `${total} răspunsuri, toate „doar privesc”`;
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 150;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", `Alegeri pentru ${cueId}`);
    card.append(title, p, canvas);
    host.append(card);
    const highlight = best ? entries.findIndex(([v]) => v === best.value) : -1;
    drawBars(canvas, entries.map(([v]) => labelOf(v)), entries.map(([, n]) => n), { horizontal: true, color: (i) => (entries[i][0] === "observe" ? cssVar("--muted") : cssVar("--cyan")), format: (v) => String(Math.round(v)), highlight });
  }
}

function labelOf(value: string): string {
  return value === "observe" ? "Doar privesc" : value;
}

function renderRuns(runs: RunRow[]): void {
  const body = $<HTMLTableElement>("runs-table").tBodies[0];
  const onlyStarted = $<HTMLInputElement>("only-started").checked;
  body.replaceChildren();
  const visible = runs.filter((r) => !onlyStarted || r.started);
  if (!visible.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 8;
    td.className = "dim";
    td.textContent = "Nicio rulare de afișat.";
    tr.append(td);
    body.append(tr);
    return;
  }
  const cell = (text: string, cls?: string): HTMLTableCellElement => {
    const td = document.createElement("td");
    td.textContent = text;
    if (cls) td.className = cls;
    return td;
  };
  for (const r of visible) {
    const tr = document.createElement("tr");
    tr.dataset.id = r.id;
    if (r.id === selectedRun) tr.classList.add("selected");
    tr.append(
      cell(r.id),
      cell(fmtDate(r.playStartedAt ?? r.startedAt), r.started ? "" : "dim"),
      cell(fmtDuration(r.missionDurationSec ?? r.durationSec)),
      cell(r.lastState ? STATE_LABELS[r.lastState] ?? r.lastState : "—", r.started ? "" : "dim"),
      cell(`${r.cuesFired}${r.cuesManual ? ` (${r.cuesManual} manuale)` : ""}`),
      cell(String(r.tabletAnswers)),
      cell(String(r.tabletsSeen)),
      cell(r.started ? (r.completed ? "DA" : "NU") : "—", r.started ? (r.completed ? "ok" : "bad") : "dim"),
    );
    tr.addEventListener("click", () => void openRun(r.id));
    body.append(tr);
  }
}

async function openRun(id: string): Promise<void> {
  selectedRun = id;
  if (summary) renderRuns(summary.runs);
  try {
    const run = await api<RunDetail>(`/api/analytics/run/${encodeURIComponent(id)}`);
    const panel = $("detail");
    panel.hidden = false;
    $("detail-title").textContent = `${run.id} · ${fmtDate(run.startedAt)} · ${fmtDuration(run.missionDurationSec ?? run.durationSec)}`;
    const states = $("detail-states");
    states.replaceChildren();
    for (const s of run.states) {
      const li = document.createElement("li");
      li.textContent = `${fmtTime(s.t)}  ${STATE_LABELS[s.from] ?? s.from} → ${STATE_LABELS[s.to] ?? s.to}`;
      if (s.reason) {
        const span = document.createElement("span");
        span.textContent = `  (${s.reason})`;
        li.append(span);
      }
      states.append(li);
    }
    if (!run.states.length) states.textContent = "—";
    const choices = $("detail-choices");
    choices.replaceChildren();
    const cueIds = Object.keys(run.tabletChoices);
    if (!cueIds.length) choices.textContent = "—";
    for (const cueId of cueIds) {
      const stats = run.tabletChoices[cueId];
      const table = document.createElement("table");
      table.className = "zone-table";
      const caption = document.createElement("caption");
      caption.textContent = `${cueId} · ${stats.total} răspunsuri · posturi ${stats.posts.join(", ") || "—"}`;
      table.append(caption);
      const values = Object.keys(stats.byValue);
      const zones = Object.keys(stats.byZone).sort();
      const thead = document.createElement("thead");
      const hr = document.createElement("tr");
      for (const h of ["Opțiune", ...zones.map((z) => `Zona ${z}`), "Total"]) {
        const th = document.createElement("th");
        th.textContent = h;
        hr.append(th);
      }
      thead.append(hr);
      const tbody = document.createElement("tbody");
      for (const v of values) {
        const tr = document.createElement("tr");
        const cells = [labelOf(v), ...zones.map((z) => String(stats.byZone[z]?.[v] ?? 0)), String(stats.byValue[v])];
        for (const c of cells) {
          const td = document.createElement("td");
          td.textContent = c;
          tr.append(td);
        }
        tbody.append(tr);
      }
      table.append(thead, tbody);
      choices.append(table);
    }
    const cues = $("detail-cues");
    cues.replaceChildren();
    const kinds = Object.entries(run.cuesByKind).sort((x, y) => y[1] - x[1]);
    for (const [k, n] of [...kinds, ["comenzi", run.commandsTotal] as [string, number], ["replici dinamice", run.dynamicVoices] as [string, number], ["fotografii", run.photos] as [string, number]]) {
      const a = document.createElement("div");
      a.className = "k";
      a.textContent = k;
      const b = document.createElement("div");
      b.textContent = String(n);
      cues.append(a, b);
    }
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

function setStatus(text: string, error = false): void {
  const el = $("status");
  el.textContent = text;
  el.classList.toggle("error", error);
}

async function refresh(): Promise<void> {
  setStatus("Se încarcă…");
  try {
    summary = await api<Summary>("/api/analytics/summary");
    renderCards(summary.aggregate);
    renderDurations(summary.runs);
    renderCommands(summary.aggregate);
    renderChoices(summary.aggregate);
    renderRuns(summary.runs);
    setStatus(`${summary.runs.length} rulări · actualizat ${fmtTime(summary.generatedAt)}`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

$("refresh").addEventListener("click", () => void refresh());
$("only-started").addEventListener("change", () => {
  if (summary) renderRuns(summary.runs);
});
$("detail-close").addEventListener("click", () => {
  $("detail").hidden = true;
  selectedRun = null;
  if (summary) renderRuns(summary.runs);
});
$("logout").addEventListener("click", async () => {
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
  } catch {
    /* redirect anyway */
  }
  goToLogin();
});
let resizeTimer: number | null = null;
window.addEventListener("resize", () => {
  if (resizeTimer !== null) window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    if (!summary) return;
    renderDurations(summary.runs);
    renderCommands(summary.aggregate);
    renderChoices(summary.aggregate);
  }, 150);
});

void refresh();
window.setInterval(() => void refresh(), 30_000);
