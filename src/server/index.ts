/**
 * Nava server: Hono HTTP API + static web apps + one WebSocket hub (/ws) for screens, the operator
 * console and the kids' tablets. Started by the Electron main process when role = master
 * (`startServer(opts)` — signature fixed in docs/BRIEF.md §9). Runs equally well without Electron
 * (see src/server/__tests__/smoke.mjs).
 */

import type { AddressInfo } from "node:net";
import { createServer as createHttpServer, type IncomingMessage, type Server } from "node:http";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createAdaptorServer } from "@hono/node-server";
import { WebSocketServer, WebSocket } from "ws";
import QRCode from "qrcode";

import type { AppConfig, Cue, ShowFile } from "../shared/types";
import { SPEAKERS } from "../shared/types";
import type {
  ClientKind,
  ClientMessage,
  Command,
  HelloMsg,
  ServerMessage,
  TabletEventMsg,
  TabletViewMsg,
  WelcomeMsg,
} from "../shared/protocol";
import { ShowDirector, emptyShow, validateCommand, type DispatchResult } from "./state";
import { TabletRegistry } from "./tablets";
import { RunLog, type LogFn } from "./runlog";
import { createStaticHandler } from "./static";
import { createTtsRouter } from "./tts";

export interface ServerHandle {
  port: number;
  urls: { control: string; tablet: string; ws: string; lanIp: string };
  stop(): Promise<void>;
  /** Command coming from the master screen's keyboard (via IPC) — treated like a console command. */
  dispatchCommand(cmd: Command): void;
}

export interface StartServerOptions {
  config: AppConfig;
  /** Folder with assets/ and media/ (dev: repo root; packaged: dirname(exe) or resourcesPath). */
  appRoot: string;
  /** dist/web (contains control/ and tablet/). */
  webDir: string;
  /** Absolute path to show.json. */
  showPath: string;
  /** cache/ (tts). */
  cacheDir: string;
  /** runs/ (JSONL journals). */
  runsDir: string;
  log: LogFn;
}

interface Client {
  ws: WebSocket;
  kind: ClientKind | null;
  id: string;
  name?: string;
  isClockSource: boolean;
  alive: boolean;
  connectedAt: number;
  remote: string;
}

const HELLO_TIMEOUT_MS = 5000;
const HEARTBEAT_MS = 15_000;
const MAX_WS_PAYLOAD = 64 * 1024;
const MAX_WS_CLIENTS = 128;
const WS_SHUTDOWN_GRACE_MS = 500;
const PLAYBACK_STATES = new Set(["idle", "preshow", "playing", "paused", "epilogue", "ended"]);
const PHASES = new Set(["preshow", "play", "epilogue"]);
const THEMES = new Set(["prologue", "launch", "light", "nature", "tech", "void", "home", "white"]);
const SFX = new Set(["liftoff-rumble", "low-swell", "wormhole-whoosh", "arrival-chime", "rain", "white-fade"]);
const ENTITIES = new Set(["LUMINA", "NATURA", "TEHNOLOGIC"]);

// ---------------------------------------------------------------------------
// Helpers

/** First non-internal IPv4 address, preferring private LAN ranges and real adapters. */
export function detectLanIp(): string {
  const candidates: Array<{ ip: string; score: number }> = [];
  const ifaces = os.networkInterfaces();
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const a of addrs ?? []) {
      if (a.internal) continue;
      if (a.family !== "IPv4" && (a.family as unknown) !== 4) continue;
      let score = 0;
      if (/^192\.168\./.test(a.address)) score += 3;
      else if (/^10\./.test(a.address)) score += 2;
      else if (/^172\.(1[6-9]|2\d|3[01])\./.test(a.address)) score += 2;
      if (/^169\.254\./.test(a.address)) score -= 5; // APIPA
      if (/virtual|vethernet|wsl|docker|vmware|vbox|hyper-v|loopback|tailscale|zerotier/i.test(name)) score -= 4;
      if (/wi-?fi|wlan|ethernet|eth|en\d/i.test(name)) score += 1;
      candidates.push({ ip: a.address, score });
    }
  }
  candidates.sort((x, y) => y.score - x.score);
  return candidates[0]?.ip ?? "127.0.0.1";
}

async function loadShowFile(showPath: string): Promise<ShowFile> {
  const raw = await fs.readFile(showPath, "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("show.json trebuie să fie un obiect");
  const json = parsed as Record<string, unknown>;
  if (!Array.isArray(json.scenes) || !Array.isArray(json.cues)) {
    throw new Error("show.json invalid: lipsesc `scenes` sau `cues`");
  }

  const sceneIds = new Set<string>();
  for (const value of json.scenes) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("show.json invalid: scenă malformată");
    const scene = value as Record<string, unknown>;
    if (typeof scene.id !== "string" || !scene.id.trim() || sceneIds.has(scene.id)) {
      throw new Error(`show.json invalid: id de scenă lipsă sau duplicat "${String(scene.id)}"`);
    }
    if (
      typeof scene.label !== "string" ||
      !PHASES.has(String(scene.phase)) ||
      typeof scene.start !== "number" ||
      !Number.isFinite(scene.start) ||
      typeof scene.end !== "number" ||
      !Number.isFinite(scene.end) ||
      scene.end < scene.start ||
      !THEMES.has(String(scene.theme))
    ) {
      throw new Error(`show.json invalid: scena "${scene.id}" are câmpuri invalide`);
    }
    sceneIds.add(scene.id);
  }

  const ids = new Set<string>();
  for (const value of json.cues) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("show.json invalid: cue malformat");
    const cue = value as Record<string, unknown>;
    if (
      typeof cue.id !== "string" ||
      !cue.id.trim() ||
      cue.id.length > 128 ||
      typeof cue.at !== "number" ||
      !Number.isFinite(cue.at) ||
      !PHASES.has(String(cue.phase)) ||
      typeof cue.kind !== "string" ||
      (cue.manual !== undefined && typeof cue.manual !== "boolean")
    ) {
      throw new Error(`show.json invalid: cue malformat ${JSON.stringify(cue).slice(0, 100)}`);
    }
    if (ids.has(cue.id)) throw new Error(`show.json invalid: id duplicat "${cue.id}"`);
    ids.add(cue.id);

    switch (cue.kind) {
      case "voice": {
        const text = cue.text;
        if (
          typeof cue.speaker !== "string" ||
          !(cue.speaker in SPEAKERS) ||
          !text ||
          typeof text !== "object" ||
          Array.isArray(text) ||
          typeof (text as Record<string, unknown>).ro !== "string" ||
          !(text as Record<string, string>).ro.trim()
        ) {
          throw new Error(`show.json invalid: cue vocal "${cue.id}"`);
        }
        break;
      }
      case "countdown":
        if (typeof cue.from !== "number" || !Number.isFinite(cue.from) || typeof cue.to !== "number" || !Number.isFinite(cue.to)) {
          throw new Error(`show.json invalid: countdown "${cue.id}"`);
        }
        break;
      case "sfx":
        if (!SFX.has(String(cue.sfx))) throw new Error(`show.json invalid: sfx "${cue.id}"`);
        break;
      case "entity":
        if (!ENTITIES.has(String(cue.entity)) || (cue.action !== "show" && cue.action !== "hide")) {
          throw new Error(`show.json invalid: entitate "${cue.id}"`);
        }
        break;
      case "tablet": {
        const interaction = cue.interaction;
        if (!interaction || typeof interaction !== "object" || Array.isArray(interaction)) {
          throw new Error(`show.json invalid: interacțiune tabletă "${cue.id}"`);
        }
        const inter = interaction as Record<string, unknown>;
        const type = inter.type;
        const simple = type === "waiting" || type === "thanks";
        const prompted =
          (type === "question" || type === "message") && typeof inter.prompt === "string" && inter.prompt.trim().length > 0;
        const rolePick = type === "role-pick" && Array.isArray(inter.roles) && inter.roles.length > 0 && inter.roles.every((x) => typeof x === "string" && x.trim());
        const vote =
          type === "vote" &&
          typeof inter.prompt === "string" &&
          inter.prompt.trim().length > 0 &&
          Array.isArray(inter.options) &&
          inter.options.length > 0 &&
          inter.options.every((x) => typeof x === "string" && x.trim());
        const postAssign =
          type === "post-assign" &&
          Array.isArray(inter.posts) &&
          inter.posts.length === 5 &&
          inter.posts.every((x) => typeof x === "string" && x.trim());
        const optionValid = (option: unknown): boolean =>
          (typeof option === "string" && !!option.trim()) ||
          (!!option &&
            typeof option === "object" &&
            !Array.isArray(option) &&
            typeof (option as Record<string, unknown>).value === "string" &&
            !!String((option as Record<string, unknown>).value).trim() &&
            typeof (option as Record<string, unknown>).label === "string" &&
            !!String((option as Record<string, unknown>).label).trim());
        const pairedChoice =
          type === "paired-choice" &&
          typeof inter.prompt === "string" &&
          inter.prompt.trim().length > 0 &&
          Array.isArray(inter.options) &&
          inter.options.length > 0 &&
          inter.options.every(optionValid) &&
          inter.allowObserve === true &&
          (inter.mode === "color" || inter.mode === "pulse" || inter.mode === "perspective") &&
          (inter.timeoutSec === undefined ||
            (typeof inter.timeoutSec === "number" && Number.isFinite(inter.timeoutSec) && inter.timeoutSec > 0));
        if (!simple && !prompted && !rolePick && !vote && !postAssign && !pairedChoice) {
          throw new Error(`show.json invalid: interacțiune tabletă "${cue.id}"`);
        }
        break;
      }
      case "theme":
        if (!THEMES.has(String(cue.theme))) throw new Error(`show.json invalid: temă "${cue.id}"`);
        break;
      case "marker":
        if (typeof cue.label !== "string" || !cue.label.trim()) throw new Error(`show.json invalid: marker "${cue.id}"`);
        break;
      default:
        throw new Error(`show.json invalid: tip de cue necunoscut "${String(cue.kind)}"`);
    }
  }
  return {
    title: typeof json.title === "string" ? json.title : "(fără titlu)",
    version: typeof json.version === "string" ? json.version : "0",
    videoDurationSec:
      typeof json.videoDurationSec === "number" && Number.isFinite(json.videoDurationSec) && json.videoDurationSec >= 0
        ? json.videoDurationSec
        : 0,
    timingStatus: json.timingStatus === "aligned" ? "aligned" : "provisional",
    preshowAutoStart: !!json.preshowAutoStart,
    launchLeadInSec: typeof json.launchLeadInSec === "number" && json.launchLeadInSec >= 0 ? json.launchLeadInSec : 10,
    epilogueOnVideoEnd: json.epilogueOnVideoEnd !== false,
    scenes: json.scenes as ShowFile["scenes"],
    cues: json.cues as Cue[],
    ...(typeof json.$schema === "string" && json.$schema ? { $schema: json.$schema } : {}),
  };
}

async function readAppVersion(appRoot: string): Promise<string> {
  const candidates = [
    path.join(appRoot, "package.json"),
    ...(typeof process.resourcesPath === "string"
      ? [path.join(process.resourcesPath, "app.asar", "package.json"), path.join(process.resourcesPath, "app", "package.json")]
      : []),
  ];
  for (const candidate of candidates) {
    try {
      const pkg = JSON.parse(await fs.readFile(candidate, "utf8")) as { version?: string };
      if (typeof pkg.version === "string" && pkg.version) return pkg.version;
    } catch {
      /* try the next development/packaged location */
    }
  }
  return "0.0.0";
}

// ---------------------------------------------------------------------------

export async function startServer(opts: StartServerOptions): Promise<ServerHandle> {
  const { config, log } = opts;
  const startedAt = Date.now();
  const version = await readAppVersion(opts.appRoot);
  let stopped = false;

  // --- show ------------------------------------------------------------------
  let show: ShowFile;
  let showError: string | null = null;
  try {
    show = await loadShowFile(opts.showPath);
  } catch (err) {
    showError = String(err instanceof Error ? err.message : err);
    log("error", "show.json could not be loaded — running with an empty show", { showPath: opts.showPath, err: showError });
    show = emptyShow();
  }

  // --- run log ---------------------------------------------------------------
  const runlog = new RunLog(opts.runsDir, log);
  runlog.startRun("server start");

  // --- clients ---------------------------------------------------------------
  const clients = new Set<Client>();
  let clockSource: Client | null = null;

  const send = (client: Client, msg: ServerMessage): void => {
    if (client.ws.readyState !== WebSocket.OPEN) return;
    try {
      client.ws.send(JSON.stringify(msg));
    } catch (err) {
      log("warn", "ws send failed", { id: client.id, err: String(err) });
    }
  };
  const broadcast = (kinds: ClientKind[], msg: ServerMessage): void => {
    const json = JSON.stringify(msg);
    for (const c of clients) {
      if (c.kind && kinds.includes(c.kind) && c.ws.readyState === WebSocket.OPEN) {
        try {
          c.ws.send(json);
        } catch {
          /* ignore */
        }
      }
    }
  };
  const countScreens = (): number => {
    let n = 0;
    for (const c of clients) if (c.kind === "screen") n += 1;
    return n;
  };

  // --- tablets ---------------------------------------------------------------
  const tablets = new TabletRegistry();
  let tabletsTimer: ReturnType<typeof setTimeout> | null = null;
  const broadcastTablets = (): void => {
    if (tabletsTimer) return;
    tabletsTimer = setTimeout(() => {
      tabletsTimer = null;
      broadcast(["control"], tablets.toMsg());
    }, 100);
  };

  // --- director --------------------------------------------------------------
  const director = new ShowDirector(show, config, {
    onApplyCmd: (cmd) => broadcast(["screen"], { type: "applyCmd", cmd, serverTimeMs: Date.now() }),
    onStateChange: (state) => {
      broadcast(["control", "tablet"], { type: "state", state });
      pushTabletView();
    },
    onCueFired: (cue, manual) => {
      runlog.write("cue", { id: cue.id, kind: cue.kind, phase: cue.phase, at: cue.at, manual });
      broadcast(["control"], { type: "cueFired", cue, serverTimeMs: Date.now() });
      pushTabletView();
      if (cue.id === "tech-adaptive-select" && !manual) {
        const branch = tablets.perspectiveBranch("tech-tablet-perspectives");
        const cueId = `v3-tech-0635-${branch}`;
        runlog.write("tablet.adaptive", { sourceCueId: "tech-tablet-perspectives", branch, cueId });
        queueMicrotask(() => {
          const result = director.dispatchCommand({ action: "fireCue", cueId }, "tablet.adaptive");
          if (!result.ok) log("error", "adaptive voice dispatch failed", { branch, cueId, reason: result.reason });
        });
      }
    },
    onLog: (kind, data) => runlog.write(kind, data),
    onRunStart: () => {
      const file = runlog.startRun("start");
      log("info", "new run", { file });
    },
  });

  const computeTabletView = (): TabletViewMsg => {
    const t = director.now();
    const scene = director.currentScene(t);
    const st = director.playbackState;
    const sceneLabel = scene?.label ?? (st === "idle" ? "În așteptare" : st === "ended" ? "Sfârșit" : "");
    return tablets.buildView({
      theme: director.currentTheme(t),
      sceneLabel,
      subtitle: director.cues.currentSubtitle(Date.now(), director.language),
      tabletCue: director.cues.tablet,
    });
  };
  const pushTabletView = (force = false): void => {
    tablets.pushView(computeTabletView(), force);
  };
  const updateCounts = (): void => director.setCounts(countScreens(), tablets.connectedCount());

  const makeWelcome = (): WelcomeMsg => ({
    type: "welcome",
    serverTimeMs: Date.now(),
    state: director.getState(),
    show: director.getShow(),
    config: { lang: director.language, sync: config.sync },
  });

  const reloadShow = async (): Promise<DispatchResult> => {
    try {
      const next = await loadShowFile(opts.showPath);
      director.setShow(next);
      showError = null;
      runlog.write("show.reload", { version: next.version, cues: next.cues.length });
      log("info", "show reloaded", { version: next.version, cues: next.cues.length });
      const welcome = makeWelcome();
      for (const c of clients) if (c.kind) send(c, welcome);
      pushTabletView(true);
      return { ok: true };
    } catch (err) {
      const reason = String(err instanceof Error ? err.message : err);
      showError = reason;
      log("error", "show reload failed", { err: reason });
      return { ok: false, reason: `Reîncărcarea show-ului a eșuat: ${reason}` };
    }
  };

  /** Single entry point for commands from console / keyboard / HTTP. */
  const handleCommand = async (cmd: Command, source: string): Promise<DispatchResult> => {
    if (stopped) return { ok: false, reason: "Serverul se oprește." };
    if (cmd.action === "reloadShow") {
      const r = await reloadShow();
      if (!r.ok) return r;
    }
    const res = director.dispatchCommand(cmd, source);
    if (cmd.action === "restart") {
      tablets.resetRoles();
      tablets.clearAnswers();
      broadcastTablets();
      pushTabletView(true);
    }
    return res;
  };

  // --- HTTP -------------------------------------------------------------------
  const app = new Hono();
  app.use("*", cors({ origin: "*", allowMethods: ["GET", "POST", "OPTIONS"], allowHeaders: ["Content-Type"] }));
  app.use("/api/*", async (c, next) => {
    const t0 = Date.now();
    await next();
    const p = c.req.path;
    if (p !== "/api/health" && p !== "/api/state") {
      log("info", `${c.req.method} ${p} -> ${c.res.status} ${Date.now() - t0}ms`);
    }
  });
  app.onError((err, c) => {
    log("error", "http error", { path: c.req.path, err: String(err) });
    return c.json({ ok: false, reason: "Eroare internă" }, 500);
  });
  app.notFound((c) => c.json({ ok: false, reason: "Nu există" }, 404));

  const lanIp = detectLanIp();
  let port = config.server.port;
  const urls = {
    control: `http://${lanIp}:${port}/control/`,
    tablet: `http://${lanIp}:${port}/tablet/`,
    ws: `ws://${lanIp}:${port}/ws`,
    lanIp,
  };

  app.get("/", (c) => c.redirect("/control/"));
  app.get("/control", (c) => c.redirect("/control/"));
  app.get("/tablet", (c) => c.redirect("/tablet/"));
  app.get("/control/*", createStaticHandler({ prefix: "/control", dir: path.join(opts.webDir, "control") }));
  app.get("/tablet/*", createStaticHandler({ prefix: "/tablet", dir: path.join(opts.webDir, "tablet") }));

  app.get("/api/health", (c) =>
    c.json({
      ok: true,
      version,
      role: config.role,
      uptime: Math.round((Date.now() - startedAt) / 1000),
      screens: countScreens(),
      tablets: tablets.connectedCount(),
      videoReady: director.isVideoReady,
      clockSource: clockSource ? clockSource.id : null,
      state: director.playbackState,
      showError,
    }),
  );
  app.get("/api/state", (c) => c.json(director.getState()));
  app.get("/api/show", (c) => c.json(director.getShow()));
  app.post("/api/show/reload", async (c) => {
    const r = await handleCommand({ action: "reloadShow" }, "http");
    return c.json({ ...r, show: director.getShow() }, r.ok ? 200 : 500);
  });
  app.get("/api/cues", (c) => c.json({ statuses: director.cues.statuses(), lastVoiceCueId: director.cues.voice?.cue.id ?? null }));
  app.get("/api/config", (c) =>
    c.json({
      lang: director.language,
      sync: config.sync,
      audio: { voiceVolume: director.volumes.voice, sfxVolume: director.volumes.sfx },
      screens: config.screens.map((s) => ({ id: s.id, roleLabel: s.roleLabel ?? null })),
      videoPath: config.video.path,
      showPath: opts.showPath,
    }),
  );
  app.post("/api/cmd", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, reason: "Corp JSON invalid" }, 400);
    }
    const raw = body && typeof body === "object" && "cmd" in (body as object) ? (body as { cmd: unknown }).cmd : body;
    const cmd = validateCommand(raw);
    if (!cmd) return c.json({ ok: false, reason: "Comandă invalidă" }, 400);
    const r = await handleCommand(cmd, "http");
    return c.json({ ...r, state: director.getState() }, r.ok ? 200 : 409);
  });
  app.get("/api/urls", (c) => c.json(urls));
  app.get("/api/qr", async (c) => {
    const url = c.req.query("url") ?? urls.tablet;
    if (url.length > 512 || !/^https?:\/\//i.test(url)) return c.json({ ok: false, reason: "URL invalid" }, 400);
    const size = Math.min(1024, Math.max(96, Number(c.req.query("size") ?? 320) || 320));
    const png = await QRCode.toBuffer(url, {
      type: "png",
      width: size,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#0b1220ff", light: "#e6fbffff" },
    });
    return c.body(new Uint8Array(png), 200, { "Content-Type": "image/png", "Cache-Control": "no-cache" });
  });
  app.get("/api/tablets", (c) => c.json(tablets.toMsg()));
  app.post("/api/tablets/clear", (c) => {
    tablets.clearAnswers();
    runlog.write("tablets.clear");
    broadcastTablets();
    pushTabletView(true);
    return c.json({ ok: true });
  });
  app.get("/api/run", (c) => {
    const n = Math.min(500, Math.max(1, Number(c.req.query("n") ?? 50) || 50));
    return c.json({ path: runlog.currentPath, events: runlog.tail(n) });
  });

  const tts = createTtsRouter({ cacheDir: opts.cacheDir, log });
  app.route("/api/tts", tts.router);

  // --- listen ------------------------------------------------------------------
  const server = createAdaptorServer({ fetch: app.fetch, createServer: createHttpServer }) as Server;
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_WS_PAYLOAD });
  server.on("upgrade", (req: IncomingMessage, socket, head) => {
    const url = (req.url ?? "").split("?")[0];
    if (stopped || url !== "/ws") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });
  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error) => {
      server.off("listening", onListening);
      reject(err);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, config.server.bindHost || "0.0.0.0");
  });
  const address = server.address() as AddressInfo | null;
  if (address && typeof address.port === "number") {
    port = address.port;
    urls.control = `http://${lanIp}:${port}/control/`;
    urls.tablet = `http://${lanIp}:${port}/tablet/`;
    urls.ws = `ws://${lanIp}:${port}/ws`;
  }

  // --- WebSocket hub -------------------------------------------------------------
  wss.on("error", (err) => log("error", "websocket server error", { err: String(err) }));

  const setClockSource = (client: Client | null): void => {
    if (clockSource === client) return;
    if (clockSource && client) log("warn", "clock source replaced", { from: clockSource.id, to: client.id });
    if (clockSource) clockSource.isClockSource = false;
    clockSource = client;
    director.setClockSourceConnected(client !== null);
  };

  const onHello = (client: Client, msg: HelloMsg): void => {
    if (client.kind !== null) {
      send(client, { type: "error", reason: "hello a fost deja trimis" });
      client.ws.close(1008, "duplicate hello");
      return;
    }
    if (msg.client !== "screen" && msg.client !== "control" && msg.client !== "tablet") {
      send(client, { type: "error", reason: "hello.client invalid" });
      client.ws.close(1008, "bad hello");
      return;
    }
    client.kind = msg.client;
    const rawId = typeof msg.id === "string" ? msg.id.replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 64) : "";
    client.id = rawId || `${msg.client}-${Math.random().toString(36).slice(2, 8)}`;
    client.name =
      msg.client !== "tablet" && typeof msg.name === "string"
        ? msg.name.replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, 32)
        : undefined;
    const expectedClockId = config.screens[0]?.id;
    client.isClockSource = msg.client === "screen" && !!msg.isClockSource && client.id === expectedClockId;
    if (msg.client === "screen" && msg.isClockSource && !client.isClockSource) {
      log("warn", "ws rejected unexpected clock-source claim", { id: client.id, expectedClockId, remote: client.remote });
    }
    if (client.isClockSource) setClockSource(client);
    if (client.kind === "tablet") tablets.connect(client.id, client.ws, msg.post);
    runlog.write("ws.hello", { kind: client.kind, id: client.id, name: client.name, clockSource: client.isClockSource, remote: client.remote });
    log("info", `ws hello ${client.kind} ${client.id}${client.isClockSource ? " (clock source)" : ""}`);
    updateCounts();
    send(client, makeWelcome());
    if (client.kind === "control") send(client, tablets.toMsg());
    if (client.kind === "tablet") {
      // connect() re-sends the last pushed view; make sure a fresh one exists for the first tablet.
      pushTabletView(true);
      broadcastTablets();
    }
  };

  const onTabletEvent = (client: Client, msg: TabletEventMsg): void => {
    if (client.kind !== "tablet") {
      send(client, { type: "error", reason: "doar tabletele trimit evenimente tablet" });
      return;
    }
    const fixed: TabletEventMsg = { ...msg, tabletId: client.id };
    const res = tablets.handleEvent(fixed, director.cues.tablet);
    if (res.error) send(client, { type: "error", reason: res.error });
    if (res.logKind) runlog.write(res.logKind, { tabletId: client.id, post: tablets.tablets.get(client.id)?.post, event: fixed.event });
    if (res.changed) {
      broadcastTablets();
      // Postul și răspunsurile A/B sunt personalizate; baza cue-ului poate rămâne identică.
      pushTabletView(true);
    }
  };

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    if (clients.size >= MAX_WS_CLIENTS) {
      ws.close(1013, "server busy");
      return;
    }
    const client: Client = {
      ws,
      kind: null,
      id: "",
      isClockSource: false,
      alive: true,
      connectedAt: Date.now(),
      remote: req.socket.remoteAddress ?? "?",
    };
    clients.add(client);
    const helloTimer = setTimeout(() => {
      if (!client.kind) {
        send(client, { type: "error", reason: "hello lipsă" });
        ws.close(1008, "no hello");
      }
    }, HELLO_TIMEOUT_MS);

    ws.on("pong", () => {
      client.alive = true;
    });
    ws.on("message", (data) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(data.toString()) as ClientMessage;
      } catch {
        send(client, { type: "error", reason: "JSON invalid" });
        return;
      }
      if (!msg || typeof msg !== "object" || typeof msg.type !== "string") {
        send(client, { type: "error", reason: "mesaj invalid" });
        return;
      }
      if (!client.kind) {
        if (msg.type !== "hello") {
          send(client, { type: "error", reason: "primul mesaj trebuie să fie hello" });
          return;
        }
        clearTimeout(helloTimer);
        onHello(client, msg);
        return;
      }
      switch (msg.type) {
        case "hello":
          onHello(client, msg);
          break;
        case "report": {
          if (
            client.kind === "screen" &&
            client === clockSource &&
            PLAYBACK_STATES.has(msg.state) &&
            typeof msg.phaseTime === "number" &&
            Number.isFinite(msg.phaseTime) &&
            typeof msg.rate === "number" &&
            Number.isFinite(msg.rate) &&
            msg.rate >= 0 &&
            msg.rate <= 2
          ) {
            director.onReport(msg);
          }
          break;
        }
        case "cmd": {
          if (client.kind !== "control") {
            send(client, { type: "error", reason: "doar consola trimite comenzi WebSocket" });
            break;
          }
          const cmd = validateCommand(msg.cmd);
          if (!cmd) {
            send(client, { type: "error", reason: "comandă invalidă" });
            break;
          }
          void handleCommand(cmd, `${client.kind}:${client.id}`).then((r) => {
            if (!r.ok) send(client, { type: "error", reason: r.reason ?? "comandă respinsă" });
          });
          break;
        }
        case "tablet":
          onTabletEvent(client, msg);
          break;
        default:
          send(client, { type: "error", reason: `tip necunoscut: ${String((msg as { type: unknown }).type)}` });
      }
    });
    ws.on("close", () => {
      clearTimeout(helloTimer);
      clients.delete(client);
      if (client.kind === "tablet") {
        tablets.disconnect(client.id, ws);
        broadcastTablets();
      }
      if (client === clockSource) setClockSource(null);
      if (client.kind) {
        runlog.write("ws.close", { kind: client.kind, id: client.id });
        log("info", `ws close ${client.kind} ${client.id}`);
      }
      updateCounts();
    });
    ws.on("error", (err) => log("warn", "ws client error", { id: client.id, err: String(err) }));
  });

  // --- timers --------------------------------------------------------------------
  const clockHz = Math.min(30, Math.max(1, config.sync.clockHz || 4));
  const clockTimer = setInterval(() => {
    director.tick();
    broadcast(["screen", "control"], director.getClock());
    pushTabletView();
  }, Math.round(1000 / clockHz));
  const stateTimer = setInterval(() => {
    broadcast(["control", "tablet"], { type: "state", state: director.getState() });
  }, 1000);
  const heartbeatTimer = setInterval(() => {
    for (const c of clients) {
      if (!c.alive) {
        log("warn", "ws heartbeat timeout — terminating", { id: c.id, kind: c.kind });
        c.ws.terminate();
        continue;
      }
      c.alive = false;
      try {
        c.ws.ping();
      } catch {
        /* ignore */
      }
    }
  }, HEARTBEAT_MS);

  log("info", `server listening on http://${config.server.bindHost || "0.0.0.0"}:${port} (LAN ${lanIp})`, urls);
  runlog.write("server.start", { version, urls, showError });

  // --- handle --------------------------------------------------------------------
  return {
    port,
    urls,
    dispatchCommand(cmd: Command): void {
      if (stopped) return;
      const valid = validateCommand(cmd);
      if (!valid) {
        log("warn", "dispatchCommand: invalid command", { cmd });
        return;
      }
      void handleCommand(valid, "keyboard").then((r) => {
        if (!r.ok) log("warn", `command rejected: ${r.reason}`, { cmd });
      });
    },
    async stop(): Promise<void> {
      if (stopped) return;
      stopped = true;
      clearInterval(clockTimer);
      clearInterval(stateTimer);
      clearInterval(heartbeatTimer);
      if (tabletsTimer) clearTimeout(tabletsTimer);

      // Stop accepting HTTP/upgrades first. Upgraded sockets are closed separately below.
      const httpClosed = new Promise<void>((resolve) => server.close(() => resolve()));
      server.closeIdleConnections?.();
      for (const c of clients) {
        try {
          c.ws.close(1001, "server stopping");
        } catch {
          /* ignore */
        }
      }
      const wssClosed = new Promise<void>((resolve) => wss.close(() => resolve()));
      const graceful = await Promise.race([
        wssClosed.then(() => true),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), WS_SHUTDOWN_GRACE_MS)),
      ]);
      if (!graceful) {
        for (const c of clients) {
          try {
            c.ws.terminate();
          } catch {
            /* already closed */
          }
        }
        await Promise.race([wssClosed, new Promise<void>((resolve) => setTimeout(resolve, WS_SHUTDOWN_GRACE_MS))]);
      }
      server.closeAllConnections?.();
      await Promise.race([httpClosed, new Promise<void>((resolve) => setTimeout(resolve, WS_SHUTDOWN_GRACE_MS))]);
      runlog.write("server.stop");
      await runlog.close();
      log("info", "server stopped");
    },
  };
}
