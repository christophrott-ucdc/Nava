/**
 * D-05 — analitica rularilor, din jurnalele `runs/show-*.jsonl` scrise de RunLog (o linie JSON per eveniment:
 * `{ t, kind, data }`). Fara dependinte; parsarea este pura (`summarizeRun`, `aggregateRuns`) ca sa poata fi
 * testata fara I/O, iar routerul Hono citeste fisierele la cerere (cache pe mtime + dimensiune).
 *
 * Evenimente citite (src/server/state.ts, index.ts, tablets.ts):
 *   run.open {reason}                         · state {from,to,reason,phaseTime}
 *   cmd {cmd:{action,...},source}             · cue {id,kind,phase,at,manual}
 *   tablet.choice {tabletId,post,event:{cueId,zone,value}} · tablet.post · tablet.startRequest
 *   video.ended · dynamicVoice · entityParams · photo.* · preflight
 *
 * Router (montat de orchestrator, ex. `app.route("/api/analytics", createAnalyticsRouter({ runsDir, log }))`):
 *   GET /summary        → { generatedAt, aggregate, runs: RunSummary[] (fara `states`/`timeline`) }
 *   GET /runs           → { runs: RunSummary[] } (la fel, cel mai nou primul)
 *   GET /run/:id        → RunSummary complet + `timeline` (primele 2000 evenimente relevante)
 * Vezi INTEGRATION.md pentru garduri (viewer) si cache.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import type { LogFn } from "../runlog";

export interface AnalyticsDeps {
  runsDir: string;
  log: LogFn;
  /** Cate fisiere se citesc maxim (implicit 200, cele mai noi). */
  maxRuns?: number;
}

export interface RunEvent {
  t: string;
  kind: string;
  data?: unknown;
}

export interface ChoiceStats {
  /** Modul interactiunii daca a fost inregistrat (color/pulse/perspective) — necunoscut in jurnal → null. */
  total: number;
  /** Raspunsuri "observe" (Doar privesc). */
  observed: number;
  byValue: Record<string, number>;
  byZone: Record<string, Record<string, number>>;
  /** Cate posturi distincte au raspuns. */
  posts: number[];
}

export interface RunSummary {
  id: string;
  file: string;
  /** Primul eveniment din fisier. */
  startedAt: string | null;
  /** Prima tranzitie in `playing` (misiunea a pornit) — null pentru fisiere doar de server. */
  playStartedAt: string | null;
  /** Ultimul eveniment din fisier. */
  endedAt: string | null;
  durationSec: number | null;
  /** Durata de la pornirea misiunii pana la ultimul eveniment. */
  missionDurationSec: number | null;
  started: boolean;
  reachedEpilogue: boolean;
  /** A ajuns in `ended` sau in epilog (misiune dusa la capat). */
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
  states: Array<{ t: string; from: string; to: string; reason?: string }>;
}

export interface MostChosen {
  cueId: string;
  value: string;
  count: number;
  total: number;
  share: number;
}

export interface Aggregate {
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
  mostChosenPerInteraction: Record<string, MostChosen>;
  firstRunAt: string | null;
  lastRunAt: string | null;
}

const RUN_FILE_RE = /^show-\d{8}-\d{6}(-\d+)?\.jsonl$/;
const ID_RE = /^show-\d{8}-\d{6}(-\d+)?$/;
const TIMELINE_KINDS = new Set(["run.open", "state", "cmd", "cue", "tablet.choice", "tablet.post", "tablet.startRequest", "video.ended", "photo.captured", "dynamicVoice", "autostart.blocked", "start.readiness"]);
const MAX_TIMELINE = 2000;
const DEFAULT_MAX_RUNS = 200;

const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function ms(t: string | null): number | null {
  if (!t) return null;
  const v = Date.parse(t);
  return Number.isFinite(v) ? v : null;
}

function secondsBetween(a: string | null, b: string | null): number | null {
  const x = ms(a);
  const y = ms(b);
  if (x === null || y === null || y < x) return null;
  return Math.round((y - x) / 100) / 10;
}

/** Parse JSONL text into events (malformed lines are skipped). */
export function parseRunLines(text: string): RunEvent[] {
  const out: RunEvent[] = [];
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (!s) continue;
    try {
      const e = JSON.parse(s) as unknown;
      if (isRec(e) && typeof e.t === "string" && typeof e.kind === "string") out.push({ t: e.t, kind: e.kind, data: e.data });
    } catch {
      /* skip */
    }
  }
  return out;
}

function inc(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

/** Summarize one run (pure). */
export function summarizeRun(id: string, events: readonly RunEvent[], file = `${id}.jsonl`): RunSummary {
  const run: RunSummary = {
    id,
    file,
    startedAt: events[0]?.t ?? null,
    playStartedAt: null,
    endedAt: events.length ? events[events.length - 1].t : null,
    durationSec: null,
    missionDurationSec: null,
    started: false,
    reachedEpilogue: false,
    completed: false,
    events: events.length,
    cuesFired: 0,
    cuesManual: 0,
    cuesByKind: {},
    commands: {},
    commandsTotal: 0,
    tabletAnswers: 0,
    tabletChoices: {},
    tabletsSeen: 0,
    photos: 0,
    dynamicVoices: 0,
    lastState: null,
    states: [],
  };
  const tablets = new Set<string>();
  for (const e of events) {
    const d = isRec(e.data) ? e.data : {};
    switch (e.kind) {
      case "state": {
        const from = typeof d.from === "string" ? d.from : "?";
        const to = typeof d.to === "string" ? d.to : "?";
        run.states.push({ t: e.t, from, to, ...(typeof d.reason === "string" ? { reason: d.reason } : {}) });
        run.lastState = to;
        if (to === "playing" && !run.playStartedAt) run.playStartedAt = e.t;
        if (to === "playing") run.started = true;
        if (to === "epilogue") run.reachedEpilogue = true;
        if (to === "epilogue" || to === "ended") run.completed = true;
        break;
      }
      case "cmd": {
        const cmd = isRec(d.cmd) ? d.cmd : null;
        const action = cmd && typeof cmd.action === "string" ? cmd.action : "?";
        inc(run.commands, action);
        run.commandsTotal += 1;
        if (action === "start") run.started = true;
        break;
      }
      case "cue": {
        run.cuesFired += 1;
        if (d.manual === true) run.cuesManual += 1;
        inc(run.cuesByKind, typeof d.kind === "string" ? d.kind : "?");
        break;
      }
      case "tablet.choice": {
        const ev = isRec(d.event) ? d.event : {};
        const cueId = typeof ev.cueId === "string" ? ev.cueId : null;
        const value = typeof ev.value === "string" ? ev.value : null;
        const zone = typeof ev.zone === "string" ? ev.zone : "?";
        if (typeof d.tabletId === "string") tablets.add(d.tabletId);
        if (!cueId || !value) break;
        run.tabletAnswers += 1;
        const stats = (run.tabletChoices[cueId] ??= { total: 0, observed: 0, byValue: {}, byZone: {}, posts: [] });
        stats.total += 1;
        if (value === "observe") stats.observed += 1;
        inc(stats.byValue, value);
        inc((stats.byZone[zone] ??= {}), value);
        if (typeof d.post === "number" && !stats.posts.includes(d.post)) stats.posts.push(d.post);
        break;
      }
      case "tablet.post":
      case "tablet.start-request":
      case "tablet.startRequest":
        if (typeof d.tabletId === "string") tablets.add(d.tabletId);
        break;
      case "photo.captured":
        run.photos += 1;
        break;
      case "dynamicVoice":
        run.dynamicVoices += 1;
        break;
      case "video.ended":
        run.completed = true;
        break;
      default:
        break;
    }
  }
  for (const s of Object.values(run.tabletChoices)) s.posts.sort((a, b) => a - b);
  run.tabletsSeen = tablets.size;
  run.durationSec = secondsBetween(run.startedAt, run.endedAt);
  run.missionDurationSec = secondsBetween(run.playStartedAt, run.endedAt);
  return run;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round(((s[mid - 1] + s[mid]) / 2) * 10) / 10;
}

function avg(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

/** Aggregate many run summaries (pure). Only runs that actually started count for durations/completion. */
export function aggregateRuns(runs: readonly RunSummary[]): Aggregate {
  const started = runs.filter((r) => r.started);
  const completed = started.filter((r) => r.completed);
  const durations = started.map((r) => r.missionDurationSec ?? r.durationSec).filter((v): v is number => typeof v === "number" && v > 0);
  const commands: Record<string, number> = {};
  const choiceTotals: Record<string, Record<string, number>> = {};
  for (const r of runs) {
    for (const [k, v] of Object.entries(r.commands)) commands[k] = (commands[k] ?? 0) + v;
    for (const [cueId, stats] of Object.entries(r.tabletChoices)) {
      const bucket = (choiceTotals[cueId] ??= {});
      for (const [value, n] of Object.entries(stats.byValue)) bucket[value] = (bucket[value] ?? 0) + n;
    }
  }
  const mostChosenPerInteraction: Record<string, MostChosen> = {};
  for (const [cueId, byValue] of Object.entries(choiceTotals)) {
    const total = Object.values(byValue).reduce((a, b) => a + b, 0);
    let best: MostChosen | null = null;
    for (const [value, count] of Object.entries(byValue)) {
      if (value === "observe") continue;
      if (!best || count > best.count) best = { cueId, value, count, total, share: total ? Math.round((count / total) * 1000) / 10 : 0 };
    }
    if (best) mostChosenPerInteraction[cueId] = best;
  }
  const times = runs.map((r) => r.startedAt).filter((t): t is string => !!t).sort();
  return {
    runs: runs.length,
    runsStarted: started.length,
    runsCompleted: completed.length,
    completionRate: started.length ? Math.round((completed.length / started.length) * 1000) / 10 : null,
    avgDurationSec: avg(durations),
    medianDurationSec: median(durations),
    avgCuesFired: avg(started.map((r) => r.cuesFired)),
    avgTabletAnswers: avg(started.map((r) => r.tabletAnswers)),
    commands,
    choiceTotals,
    mostChosenPerInteraction,
    firstRunAt: times[0] ?? null,
    lastRunAt: times[times.length - 1] ?? null,
  };
}

/** Strip the per-transition list for list endpoints (kept in GET /run/:id). */
function light(run: RunSummary): Omit<RunSummary, "states"> & { transitions: number } {
  const { states, ...rest } = run;
  return { ...rest, transitions: states.length };
}

export function createAnalyticsRouter(deps: AnalyticsDeps): Hono {
  const maxRuns = deps.maxRuns ?? DEFAULT_MAX_RUNS;
  const cache = new Map<string, { key: string; summary: RunSummary; events: RunEvent[] }>();

  const listFiles = async (): Promise<string[]> => {
    try {
      const names = (await fs.readdir(deps.runsDir)).filter((n) => RUN_FILE_RE.test(n));
      return names.sort().reverse().slice(0, maxRuns);
    } catch {
      return [];
    }
  };

  const loadRun = async (file: string): Promise<{ summary: RunSummary; events: RunEvent[] } | null> => {
    const full = path.join(deps.runsDir, file);
    let st;
    try {
      st = await fs.stat(full);
    } catch {
      return null;
    }
    const key = `${st.size}:${st.mtimeMs}`;
    const hit = cache.get(file);
    if (hit && hit.key === key) return { summary: hit.summary, events: hit.events };
    let text: string;
    try {
      text = await fs.readFile(full, "utf8");
    } catch (err) {
      deps.log("warn", "analytics: cannot read run", { file, err: String(err) });
      return null;
    }
    const events = parseRunLines(text);
    const summary = summarizeRun(file.replace(/\.jsonl$/, ""), events, file);
    cache.set(file, { key, summary, events });
    return { summary, events };
  };

  const loadAll = async (): Promise<RunSummary[]> => {
    const files = await listFiles();
    for (const stale of [...cache.keys()]) if (!files.includes(stale)) cache.delete(stale);
    const out: RunSummary[] = [];
    for (const f of files) {
      const r = await loadRun(f);
      if (r) out.push(r.summary);
    }
    return out;
  };

  const router = new Hono();

  router.get("/summary", async (c) => {
    const runs = await loadAll();
    return c.json({ generatedAt: new Date().toISOString(), runsDir: deps.runsDir, aggregate: aggregateRuns(runs), runs: runs.map(light) });
  });

  router.get("/runs", async (c) => {
    const runs = await loadAll();
    return c.json({ runs: runs.map(light) });
  });

  router.get("/run/:id", async (c) => {
    const id = c.req.param("id");
    if (!ID_RE.test(id)) return c.json({ ok: false, reason: "Id de rulare invalid" }, 400);
    const r = await loadRun(`${id}.jsonl`);
    if (!r) return c.json({ ok: false, reason: "Rulare inexistentă" }, 404);
    const timeline = r.events.filter((e) => TIMELINE_KINDS.has(e.kind)).slice(0, MAX_TIMELINE);
    return c.json({ ...r.summary, timeline });
  });

  return router;
}
