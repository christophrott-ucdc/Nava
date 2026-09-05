/**
 * /api/debug/* — everything an operator or engineer needs to see why a show misbehaves, in one place:
 * health, state, connected clients, cue statuses, preflight, per-screen performance, TTS cache stats,
 * run-log tail, redacted config, environment flags, versions. Plus actions: preflight, rotate runs,
 * disconnect a client. Also hosts the perf store and the video frame extractor used by the cue editor.
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import type { AppConfig, PerfSample, ShowState } from "../shared/types";
import type { AuthEnv, Auth } from "./auth";
import type { PreflightResult } from "./preflight";
import type { RotateResult } from "./maintenance";
import type { LogFn, RunLogEvent } from "./runlog";
import type { TtsStats } from "./tts";

// ---------------------------------------------------------------------------
// Perf store

export class PerfStore {
  private latest = new Map<string, PerfSample>();
  private history = new Map<string, PerfSample[]>();
  private readonly keep: number;

  constructor(keep = 120) {
    this.keep = keep;
  }

  record(sample: PerfSample): void {
    this.latest.set(sample.screenId, sample);
    const h = this.history.get(sample.screenId) ?? [];
    h.push(sample);
    if (h.length > this.keep) h.splice(0, h.length - this.keep);
    this.history.set(sample.screenId, h);
  }

  forget(screenId: string): void {
    this.latest.delete(screenId);
  }

  snapshot(): PerfSample[] {
    return [...this.latest.values()].sort((a, b) => a.screenId.localeCompare(b.screenId));
  }

  series(screenId: string, n = 60): PerfSample[] {
    return (this.history.get(screenId) ?? []).slice(-n);
  }

  /** Per-screen summary for the debug page: dropped ratio over the history window, worst drift. */
  summary(): Array<{
    screenId: string;
    samples: number;
    lastSeenMs: number;
    droppedPct: number | null;
    videoFps: number | null;
    avatarFps: number | null;
    lipsyncLatencyMs: number | null;
    worstDriftSec: number | null;
    roomLevel: number | null;
    heapMb: number | null;
    audioOutput: string | null;
  }> {
    const out = [];
    for (const [screenId, h] of this.history) {
      const last = h[h.length - 1];
      const first = h[0];
      const dTotal = last.videoTotal - first.videoTotal;
      const dDropped = last.videoDropped - first.videoDropped;
      let worst: number | null = null;
      for (const s of h) if (s.driftSec !== null && (worst === null || Math.abs(s.driftSec) > Math.abs(worst))) worst = s.driftSec;
      out.push({
        screenId,
        samples: h.length,
        lastSeenMs: last.atMs,
        droppedPct: dTotal > 0 ? Math.round((dDropped / dTotal) * 10000) / 100 : null,
        videoFps: last.videoFps,
        avatarFps: last.avatarFps,
        lipsyncLatencyMs: last.lipsyncLatencyMs,
        worstDriftSec: worst,
        roomLevel: last.roomLevel,
        heapMb: last.heapMb,
        audioOutput: last.audioOutput,
      });
    }
    return out.sort((a, b) => a.screenId.localeCompare(b.screenId));
  }
}

// ---------------------------------------------------------------------------
// Frame extraction (ffmpeg) for the cue editor preview

export interface FrameExtractor {
  frameAt(tSec: number, width: number): Promise<Buffer | null>;
  available(): Promise<boolean>;
}

export function createFrameExtractor(videoPath: string, cacheDir: string, log: LogFn): FrameExtractor {
  let ffmpegOk: boolean | null = null;
  const dir = path.join(cacheDir, "frames");
  const inflight = new Map<string, Promise<Buffer | null>>();

  const probe = (): Promise<boolean> =>
    new Promise((resolve) => {
      if (ffmpegOk !== null) return resolve(ffmpegOk);
      const p = spawn("ffmpeg", ["-version"], { windowsHide: true });
      p.on("error", () => resolve((ffmpegOk = false)));
      p.on("exit", (code) => resolve((ffmpegOk = code === 0)));
    });

  const extract = async (tSec: number, width: number): Promise<Buffer | null> => {
    if (!(await probe())) return null;
    const key = `${createHash("sha1").update(videoPath).digest("hex").slice(0, 10)}-${tSec.toFixed(1)}-${width}.jpg`;
    const file = path.join(dir, key);
    try {
      return await fs.readFile(file);
    } catch {
      /* miss */
    }
    await fs.mkdir(dir, { recursive: true });
    const buf = await new Promise<Buffer | null>((resolve) => {
      const args = ["-hide_banner", "-loglevel", "error", "-ss", tSec.toFixed(3), "-i", videoPath, "-frames:v", "1", "-vf", `scale=${width}:-2`, "-q:v", "4", "-f", "image2pipe", "-vcodec", "mjpeg", "pipe:1"];
      const p = spawn("ffmpeg", args, { windowsHide: true });
      const chunks: Buffer[] = [];
      const timer = setTimeout(() => p.kill(), 8000);
      p.stdout.on("data", (d: Buffer) => chunks.push(d));
      p.on("error", () => {
        clearTimeout(timer);
        resolve(null);
      });
      p.on("exit", (code) => {
        clearTimeout(timer);
        resolve(code === 0 && chunks.length ? Buffer.concat(chunks) : null);
      });
    });
    if (buf) {
      fs.writeFile(file, buf).catch((err) => log("warn", "frame cache write failed", { err: String(err) }));
    }
    return buf;
  };

  return {
    available: probe,
    frameAt(tSec, width) {
      const k = `${tSec.toFixed(1)}:${width}`;
      const existing = inflight.get(k);
      if (existing) return existing;
      const p = extract(tSec, width).finally(() => inflight.delete(k));
      inflight.set(k, p);
      return p;
    },
  };
}

// ---------------------------------------------------------------------------
// Router

export interface DebugDeps {
  auth: Auth;
  config: AppConfig;
  appRoot: string;
  runsDir: string;
  cacheDir: string;
  version: string;
  startedAt: number;
  log: LogFn;
  perf: PerfStore;
  frames: FrameExtractor;
  getState(): ShowState;
  getHealth(): Record<string, unknown>;
  getClients(): Array<{ kind: string | null; id: string; name?: string; remote: string; connectedAt: number; isClockSource: boolean }>;
  getCueStatuses(): unknown;
  getPreflight(): PreflightResult | null;
  runPreflight(): Promise<PreflightResult>;
  rotateRuns(): Promise<RotateResult>;
  ttsStats(): Promise<TtsStats>;
  runlogPath(): string | null;
  runlogTail(n: number): RunLogEvent[];
  closeClient(id: string): boolean;
  showError(): string | null;
}

function redactConfig(config: AppConfig): unknown {
  const clone = JSON.parse(JSON.stringify(config)) as AppConfig;
  if (clone.security) {
    clone.security = {
      ...clone.security,
      operatorPin: "****",
      screenToken: clone.security.screenToken ? `${clone.security.screenToken.slice(0, 4)}…(${clone.security.screenToken.length})` : "(gol)",
    };
  }
  if (clone.lights?.hueUser) clone.lights = { ...clone.lights, hueUser: "****" };
  return clone;
}

function envFlags(): Record<string, boolean | string> {
  return {
    ELEVENLABS_API_KEY: !!process.env.ELEVENLABS_API_KEY,
    GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
    TTS_PROVIDER: process.env.TTS_PROVIDER ?? "(implicit elevenlabs)",
    NODE_ENV: process.env.NODE_ENV ?? "",
  };
}

export function createDebugRouter(deps: DebugDeps): Hono<AuthEnv> {
  const r = new Hono<AuthEnv>();
  const { auth } = deps;

  r.get("/summary", auth.requireRole("viewer"), async (c) => {
    const mem = process.memoryUsage();
    const versions = process.versions as Record<string, string | undefined>;
    return c.json({
      now: new Date().toISOString(),
      version: deps.version,
      uptimeSec: Math.round((Date.now() - deps.startedAt) / 1000),
      versions: { node: versions.node, electron: versions.electron ?? null, chrome: versions.chrome ?? null, v8: versions.v8 },
      host: { hostname: os.hostname(), platform: `${os.platform()} ${os.release()}`, cpus: os.cpus().length, memTotalMb: Math.round(os.totalmem() / 1e6), memFreeMb: Math.round(os.freemem() / 1e6), loadavg: os.loadavg() },
      process: { rssMb: Math.round(mem.rss / 1e6), heapUsedMb: Math.round(mem.heapUsed / 1e6), pid: process.pid },
      health: deps.getHealth(),
      state: deps.getState(),
      showError: deps.showError(),
      clients: deps.getClients(),
      cues: deps.getCueStatuses(),
      preflight: deps.getPreflight(),
      perf: { latest: deps.perf.snapshot(), summary: deps.perf.summary() },
      tts: await deps.ttsStats().catch((err) => ({ error: String(err) })),
      runlog: { path: deps.runlogPath(), tail: deps.runlogTail(30) },
      config: redactConfig(deps.config),
      env: envFlags(),
      paths: { appRoot: deps.appRoot, runsDir: deps.runsDir, cacheDir: deps.cacheDir, resourcesPath: process.resourcesPath ?? null, usersFile: auth.users.path },
      sessions: auth.sessions().map((s) => ({ name: s.name, role: s.role, createdAt: s.createdAt, expiresAt: s.expiresAt })),
      ffmpeg: await deps.frames.available(),
    });
  });

  r.get("/perf", auth.requireRole("viewer"), (c) => {
    const id = c.req.query("screen");
    if (id) return c.json({ screenId: id, series: deps.perf.series(id, Math.min(600, Number(c.req.query("n") ?? 120) || 120)) });
    return c.json({ latest: deps.perf.snapshot(), summary: deps.perf.summary() });
  });

  r.get("/logs", auth.requireRole("viewer"), (c) => {
    const n = Math.min(1000, Math.max(1, Number(c.req.query("n") ?? 100) || 100));
    return c.json({ path: deps.runlogPath(), events: deps.runlogTail(n) });
  });

  r.get("/runs", auth.requireRole("viewer"), async (c) => {
    try {
      const names = (await fs.readdir(deps.runsDir)).filter((n) => n.endsWith(".jsonl"));
      const files = await Promise.all(
        names.map(async (n) => {
          const st = await fs.stat(path.join(deps.runsDir, n));
          return { name: n, bytes: st.size, mtime: st.mtime.toISOString() };
        }),
      );
      files.sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
      return c.json({ dir: deps.runsDir, files });
    } catch (err) {
      return c.json({ dir: deps.runsDir, files: [], error: String(err) });
    }
  });

  r.post("/preflight", auth.requireRole("operator"), async (c) => c.json(await deps.runPreflight()));
  r.post("/rotate-runs", auth.requireRole("operator"), async (c) => c.json({ ok: true, ...(await deps.rotateRuns()) }));
  r.post("/clients/:id/close", auth.requireRole("operator"), (c) => {
    const ok = deps.closeClient(c.req.param("id"));
    return c.json(ok ? { ok: true } : { ok: false, reason: "Client inexistent" }, ok ? 200 : 404);
  });
  r.post("/gc", auth.requireRole("admin"), (c) => {
    const g = (globalThis as { gc?: () => void }).gc;
    if (g) g();
    return c.json({ ok: !!g, reason: g ? undefined : "node nu a fost pornit cu --expose-gc" });
  });

  return r;
}

/** GET /api/frame?t=<sec>&w=<px> — JPEG frame from the film (cue editor preview). */
export function createFrameRouter(deps: { auth: Auth; frames: FrameExtractor; durationSec: () => number }): Hono<AuthEnv> {
  const r = new Hono<AuthEnv>();
  r.get("/", deps.auth.requireScreenOrRole("viewer"), async (c) => {
    const t = Number(c.req.query("t"));
    const w = Math.min(1280, Math.max(160, Number(c.req.query("w") ?? 480) || 480));
    if (!Number.isFinite(t) || t < 0) return c.json({ ok: false, reason: "t invalid" }, 400);
    const max = deps.durationSec();
    const clamped = max > 0 ? Math.min(t, Math.max(0, max - 0.1)) : t;
    const buf = await deps.frames.frameAt(clamped, w);
    if (!buf) return c.json({ ok: false, reason: "ffmpeg indisponibil sau extragere eșuată" }, 404);
    return c.body(new Uint8Array(buf), 200, { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" });
  });
  return r;
}
