import { applyTheme, icon } from "../shared/glass";
import { createMissionDebug } from "./mission-debug";
/**
 * /debug — operator/engineer diagnostics page. Polls /api/debug/summary (viewer role) every 2 s.
 * Redirects to /login/?next=/debug/ on 401. Admins additionally manage users here.
 */

type Summary = {
  now: string;
  version: string;
  uptimeSec: number;
  versions: Record<string, string | null | undefined>;
  host: { hostname: string; platform: string; cpus: number; memTotalMb: number; memFreeMb: number; loadavg: number[] };
  process: { rssMb: number; heapUsedMb: number; pid: number };
  health: Record<string, unknown>;
  state: Record<string, unknown> & { readiness?: { ready: boolean; reasons: string[]; screensConnected: string[]; screensMissing: string[]; tabletsConnected: number; tabletsRequired: number; videoReady: boolean; assetsOk: boolean | null } };
  showError: string | null;
  clients: Array<{ kind: string | null; id: string; name?: string; remote: string; connectedAt: number; isClockSource: boolean }>;
  cues: { statuses?: Array<{ id: string; status: string; at?: number; phase?: string }>; lastVoiceCueId?: string | null } | unknown;
  preflight: null | {
    ok: boolean; checkedAt: string; lang: string; variant: string | null; durationMs: number;
    voice: { total: number; ok: number; withVisemes: number; issues: Array<{ cueId: string; problem: string; detail?: string }>; manifestPath: string | null };
    video: { path: string; exists: boolean; bytes: number }; avatar: { path: string; exists: boolean; bytes: number }; reasons: string[];
  };
  perf: { latest: unknown[]; summary: Array<{ screenId: string; samples: number; lastSeenMs: number; droppedPct: number | null; videoFps: number | null; avatarFps: number | null; lipsyncLatencyMs: number | null; worstDriftSec: number | null; roomLevel: number | null; heapMb: number | null; audioOutput: string | null }> };
  tts: Record<string, unknown>;
  runlog: { path: string | null; tail: Array<{ ts?: string; t?: string; kind?: string; data?: unknown }> };
  config: unknown;
  env: Record<string, unknown>;
  paths: Record<string, unknown>;
  sessions: Array<{ name: string; role: string; createdAt: string; expiresAt: string }>;
  ffmpeg: boolean;
};

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
let me: { name: string; role: string } | null = null;
let timer: number | null = null;

function fmtBytes(n: number): string {
  if (n > 1e9) return `${(n / 1e9).toFixed(2)} GB`;
  if (n > 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n > 1e3) return `${(n / 1e3).toFixed(0)} KB`;
  return `${n} B`;
}
function fmtAgo(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${Math.floor(s / 3600)}h`;
}
function fmtTime(sec: unknown): string {
  if (typeof sec !== "number" || !Number.isFinite(sec)) return "—";
  const neg = sec < 0;
  const a = Math.abs(sec);
  return `${neg ? "T-" : ""}${Math.floor(a / 60)}:${String(Math.floor(a % 60)).padStart(2, "0")}`;
}
function kv(el: HTMLElement, rows: Array<[string, unknown, string?]>): void {
  el.innerHTML = "";
  for (const [k, v, cls] of rows) {
    const a = document.createElement("div");
    a.className = "k";
    a.textContent = k;
    const b = document.createElement("div");
    b.className = `v ${cls ?? ""}`;
    b.textContent = typeof v === "object" ? JSON.stringify(v) : String(v ?? "—");
    el.append(a, b);
  }
}
function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] as string);
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin", ...init });
  if (res.status === 401) {
    location.assign(`/login/?next=${encodeURIComponent("/debug/")}`);
    throw new Error("401");
  }
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => "")}`);
  return (await res.json()) as T;
}

function render(s: Summary): void {
  const st = s.state;
  applyTheme(st.theme);
  const badge = $("conn");
  badge.textContent = `v${s.version} · uptime ${Math.floor(s.uptimeSec / 60)}m · ${s.host.hostname}`;
  badge.className = "badge ok";

  kv($("state-kv"), [
    ["stare", st.state],
    ["timp fază", fmtTime(st.phaseTime)],
    ["scenă", st.sceneId],
    ["temă", st.theme],
    ["rată", st.rate],
    ["limbă / variantă", `${st.lang} / ${st.variant ?? "—"}`],
    ["ultima replică", st.lastVoiceCueId],
    ["ecrane / tablete", `${st.screensConnected} / ${st.tabletsConnected}`],
    ["video gata", st.videoReady, st.videoReady ? "ok" : "bad"],
    ["autoRun / ambianță / lumini", `${st.autoRun ?? "—"} / ${st.ambientEnabled ?? "—"} / ${st.lightsDriver ?? "—"}`],
    ["show.json", s.showError ? `EROARE: ${s.showError}` : "ok", s.showError ? "bad" : "ok"],
  ]);
  const rd = st.readiness;
  const rEl = $("readiness");
  if (rd) {
    rEl.className = `readiness ${rd.ready ? "ok" : "bad"}`;
    rEl.innerHTML = `${icon(rd.ready ? "check" : "warning")} <b>READINESS: ${rd.ready ? "GATA" : "NU E GATA"}</b> · ecrane ${esc(rd.screensConnected.join(", ") || "—")}${rd.screensMissing.length ? ` · <span class="issue">lipsesc: ${esc(rd.screensMissing.join(", "))}</span>` : ""} · tablete ${rd.tabletsConnected}/${rd.tabletsRequired} · video ${rd.videoReady ? "ok" : "NU"} · active ${rd.assetsOk === null ? "neverificate" : rd.assetsOk ? "ok" : "PROBLEME"}${rd.reasons.length ? `<br>${esc(rd.reasons.join(" · "))}` : ""}`;
  } else {
    rEl.className = "readiness";
    rEl.textContent = "Readiness: neimplementat încă în server/state.ts (pachet D-01).";
  }

  const h = s.health;
  kv($("health-kv"), [
    ["rol", h.role],
    ["ceas sursă", h.clockSource ?? "niciunul", h.clockSource ? "ok" : "warn"],
    ["node / electron / chrome", `${s.versions.node} / ${s.versions.electron ?? "—"} / ${s.versions.chrome ?? "—"}`],
    ["proces", `pid ${s.process.pid} · rss ${s.process.rssMb} MB · heap ${s.process.heapUsedMb} MB`],
    ["gazdă", `${s.host.platform} · ${s.host.cpus} CPU · RAM liber ${s.host.memFreeMb}/${s.host.memTotalMb} MB`],
    ["ffmpeg", s.ffmpeg ? "disponibil" : "lipsește (fără previzualizare cadre)", s.ffmpeg ? "ok" : "warn"],
    ["sesiuni active", s.sessions.map((x) => `${x.name}(${x.role})`).join(", ") || "—"],
  ]);

  const pf = s.preflight;
  const pfEl = $("preflight");
  if (!pf) pfEl.innerHTML = `<span class="dim">Nu s-a rulat încă.</span>`;
  else {
    const hard = pf.voice.issues.filter((i) => i.problem !== "variant-missing");
    pfEl.innerHTML =
      `<div class="kv">` +
      `<div class="k">rezultat</div><div class="v ${pf.ok ? "ok" : "bad"}">${pf.ok ? "OK" : "PROBLEME"} · ${new Date(pf.checkedAt).toLocaleTimeString("ro-RO")} · ${pf.durationMs} ms</div>` +
      `<div class="k">voci</div><div class="v ${pf.voice.ok === pf.voice.total ? "ok" : "bad"}">${pf.voice.ok}/${pf.voice.total} valide · ${pf.voice.withVisemes} cu viseme · ${pf.lang}${pf.variant ? ` · varianta ${pf.variant}` : ""}</div>` +
      `<div class="k">film</div><div class="v ${pf.video.exists ? "ok" : "bad"}">${pf.video.exists ? fmtBytes(pf.video.bytes) : "LIPSEȘTE"} · ${esc(pf.video.path)}</div>` +
      `<div class="k">avatar</div><div class="v ${pf.avatar.exists ? "ok" : "bad"}">${pf.avatar.exists ? fmtBytes(pf.avatar.bytes) : "LIPSEȘTE"} · ${esc(pf.avatar.path)}</div>` +
      `</div>` +
      (hard.length ? `<div style="margin-top:8px">${hard.slice(0, 30).map((i) => `<div class="issue">${esc(i.cueId)} — ${esc(i.problem)}${i.detail ? ` (${esc(i.detail)})` : ""}</div>`).join("")}</div>` : "");
  }

  const tb = $("perf-tbl").querySelector("tbody") as HTMLTableSectionElement;
  tb.innerHTML = s.perf.summary.length
    ? s.perf.summary
        .map(
          (p) =>
            `<tr><td>${esc(p.screenId)}</td>` +
            `<td class="${p.droppedPct === null ? "" : p.droppedPct > 2 ? "bad" : p.droppedPct > 0.5 ? "warn" : "ok"}">${p.droppedPct === null ? "—" : `${p.droppedPct}%`}</td>` +
            `<td>${p.videoFps ?? "—"}</td><td>${p.avatarFps ?? "—"}</td>` +
            `<td class="${p.lipsyncLatencyMs === null ? "" : p.lipsyncLatencyMs > 120 ? "warn" : "ok"}">${p.lipsyncLatencyMs === null ? "—" : `${Math.round(p.lipsyncLatencyMs)} ms`}</td>` +
            `<td class="${p.worstDriftSec === null ? "" : Math.abs(p.worstDriftSec) > 0.25 ? "bad" : Math.abs(p.worstDriftSec) > 0.08 ? "warn" : "ok"}">${p.worstDriftSec === null ? "—" : `${(p.worstDriftSec * 1000).toFixed(0)} ms`}</td>` +
            `<td>${p.roomLevel === null ? "—" : p.roomLevel.toFixed(2)}</td><td>${p.heapMb === null ? "—" : `${p.heapMb} MB`}</td><td>${esc(p.audioOutput ?? "—")}</td><td>${fmtAgo(p.lastSeenMs)}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="10" class="dim">Niciun ecran nu a trimis încă mesaje perf (pachet B-02).</td></tr>`;

  const cb = $("clients-tbl").querySelector("tbody") as HTMLTableSectionElement;
  cb.innerHTML = s.clients.length
    ? s.clients
        .map(
          (c) =>
            `<tr><td>${esc(c.kind)}${c.isClockSource ? " ⏱" : ""}</td><td>${esc(c.id)}</td><td>${esc(c.name ?? "")}</td><td>${esc(c.remote)}</td><td>${fmtAgo(c.connectedAt)}</td>` +
            `<td>${me && me.role !== "viewer" ? `<button class="btn small danger" data-close="${esc(c.id)}">DECONECTEAZĂ</button>` : ""}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="6" class="dim">niciun client</td></tr>`;

  const cues = s.cues as { statuses?: Array<{ id: string; status: string }> | Record<string, string>; lastVoiceCueId?: string | null };
  const cuesEl = $("cues");
  // The server returns `statuses` as a map { cueId: status } (or, in older builds, an array of {id,status}).
  const statusList: Array<{ id: string; status: string }> = Array.isArray(cues?.statuses)
    ? cues.statuses
    : cues?.statuses && typeof cues.statuses === "object"
      ? Object.entries(cues.statuses).map(([id, status]) => ({ id, status: String(status) }))
      : [];
  if (statusList.length) {
    const counts: Record<string, number> = {};
    for (const c of statusList) counts[c.status] = (counts[c.status] ?? 0) + 1;
    cuesEl.innerHTML =
      `<div class="dim" style="margin-bottom:6px">${Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(" · ")} · ultima voce: ${esc(cues.lastVoiceCueId ?? "—")}</div>` +
      `<div class="cuelist">${statusList.map((c) => `<span class="cue ${esc(c.status)}${c.id === cues.lastVoiceCueId ? " current" : ""}" title="${esc(c.status)}">${esc(c.id)}</span>`).join("")}</div>`;
  } else cuesEl.textContent = JSON.stringify(s.cues).slice(0, 500);

  kv($("tts-kv"), Object.entries(s.tts ?? {}).map(([k, v]) => [k, v] as [string, unknown]));

  kv($("env-kv"), [
    ...Object.entries(s.env).map(([k, v]) => [k, v] as [string, unknown]),
    ...Object.entries(s.paths).map(([k, v]) => [k, v] as [string, unknown]),
    ["acum (server)", s.now],
  ]);
  $("config").textContent = JSON.stringify(s.config, null, 2);
  $("runlog-path").textContent = s.runlog.path ?? "";
  $("logs").textContent = s.runlog.tail
    .map((e) => `${esc(e.ts ?? e.t ?? "")}  ${esc(e.kind ?? "")}  ${e.data === undefined ? "" : JSON.stringify(e.data)}`)
    .join("\n");
}

async function refresh(): Promise<void> {
  void refreshMissionDebug();
  try {
    const s = await api<Summary>("/api/debug/summary");
    render(s);
  } catch (err) {
    const b = $("conn");
    b.textContent = `eroare: ${String(err).slice(0, 80)}`;
    b.className = "badge bad";
  }
}

const refreshMissionDebug=createMissionDebug(api);

async function loadUsers(): Promise<void> {
  const el = $("users");
  if (!me || me.role !== "admin") {
    el.innerHTML = `<span class="dim">Vizibil doar pentru admin.</span>`;
    ($("user-form") as HTMLFormElement).style.display = "none";
    return;
  }
  try {
    const data = await api<{ users: Array<{ id: string; name: string; role: string; createdAt: string; lastLoginAt?: string; disabled?: boolean }> }>("/api/users");
    el.innerHTML =
      `<table class="tbl"><thead><tr><th>Nume</th><th>Rol</th><th>Creat</th><th>Ultimul login</th><th>Stare</th><th></th></tr></thead><tbody>` +
      data.users
        .map(
          (u) =>
            `<tr><td>${esc(u.name)}</td><td>${esc(u.role)}</td><td>${new Date(u.createdAt).toLocaleString("ro-RO")}</td><td>${u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("ro-RO") : "—"}</td><td class="${u.disabled ? "bad" : "ok"}">${u.disabled ? "dezactivat" : "activ"}</td>` +
            `<td><button class="btn small" data-pin="${esc(u.id)}">PIN NOU</button> <button class="btn small" data-toggle="${esc(u.id)}" data-disabled="${u.disabled ? "1" : "0"}">${u.disabled ? "ACTIVEAZĂ" : "DEZACTIVEAZĂ"}</button> <button class="btn small danger" data-del="${esc(u.id)}">ȘTERGE</button></td></tr>`,
        )
        .join("") +
      `</tbody></table>`;
  } catch (err) {
    el.textContent = String(err);
  }
}

document.addEventListener("click", async (e) => {
  const t = e.target as HTMLElement;
  const btn = t.closest("button") as HTMLButtonElement | null;
  if (!btn) return;
  const msg = $("user-msg");
  try {
    if (btn.dataset.close) {
      await api(`/api/debug/clients/${encodeURIComponent(btn.dataset.close)}/close`, { method: "POST" });
      await refresh();
    } else if (btn.dataset.del) {
      if (!confirm("Ștergi utilizatorul?")) return;
      await api(`/api/users/${btn.dataset.del}`, { method: "DELETE" });
      await loadUsers();
    } else if (btn.dataset.pin) {
      const pin = prompt("PIN nou (4–8 cifre):");
      if (!pin) return;
      await api(`/api/users/${btn.dataset.pin}/pin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
      msg.textContent = "PIN schimbat.";
      await loadUsers();
    } else if (btn.dataset.toggle) {
      await api(`/api/users/${btn.dataset.toggle}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ disabled: btn.dataset.disabled !== "1" }) });
      await loadUsers();
    }
  } catch (err) {
    msg.textContent = String(err);
  }
});

$("user-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("user-msg");
  try {
    const res = await fetch("/api/users", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: ($("u-name") as HTMLInputElement).value, role: ($("u-role") as HTMLSelectElement).value, pin: ($("u-pin") as HTMLInputElement).value }),
    });
    const data = (await res.json()) as { ok: boolean; reason?: string };
    msg.textContent = data.ok ? "Utilizator creat." : data.reason ?? `eroare ${res.status}`;
    if (data.ok) {
      ($("u-name") as HTMLInputElement).value = "";
      ($("u-pin") as HTMLInputElement).value = "";
      await loadUsers();
    }
  } catch (err) {
    msg.textContent = String(err);
  }
});

$("run-preflight").addEventListener("click", async () => {
  ($("run-preflight") as HTMLButtonElement).disabled = true;
  try {
    await api("/api/debug/preflight", { method: "POST" });
    await refresh();
  } finally {
    ($("run-preflight") as HTMLButtonElement).disabled = false;
  }
});
$("rotate").addEventListener("click", async () => {
  await api("/api/debug/rotate-runs", { method: "POST" });
  await refresh();
});
$("refresh").addEventListener("click", () => void refresh());
$("logout").addEventListener("click", async (e) => {
  e.preventDefault();
  await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
  location.assign("/login/?next=%2Fdebug%2F");
});
($("auto") as HTMLInputElement).addEventListener("change", (e) => {
  const on = (e.target as HTMLInputElement).checked;
  if (timer) window.clearInterval(timer);
  timer = on ? window.setInterval(() => void refresh(), 2000) : null;
});

(async () => {
  try {
    const m = await api<{ authenticated: boolean; user?: { name: string; role: string } }>("/api/auth/me");
    me = m.user ?? null;
    $("who").textContent = me ? `${me.name} · ${me.role}` : "—";
  } catch {
    return;
  }
  await refresh();
  await loadUsers();
  timer = window.setInterval(() => void refresh(), 2000);
})();

// Theme remains live even when the technical summary auto-refresh is paused.
window.setInterval(() => {
  void api<{ theme?: string }>("/api/state").then(state => applyTheme(state.theme)).catch(() => undefined);
}, 500);
