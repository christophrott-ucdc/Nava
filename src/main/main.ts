/**
 * NavaPlayer — Electron main process entry (bundled to dist/main/main.js by scripts/build.mjs).
 *
 * Boot order: CLI args -> Chromium switches -> single-instance lock -> app ready -> logger (runs/*.jsonl)
 *   -> .env -> config.json -> resolve assets -> server (master) | master link (follower) -> IPC -> windows.
 * Shutdown (before-quit): stop server, close master link, destroy windows, flush log.
 *
 * CLI:  --config <path>  --dev  --role master|follower  --screen <id>  --windowed
 */
import { app, dialog, Menu } from "electron";
import path from "node:path";
import type { Command } from "../shared/protocol";
import { startServer, type ServerHandle } from "../server/index";
import { loadConfig, parseArgs } from "./config";
import { loadDotEnv } from "./env";
import { registerIpc, type BootInfo } from "./ipc";
import { closeLogger, initLogger, log } from "./logger";
import { createMasterLink, type MasterLink } from "./master-link";
import { computePaths, resolveConfigPath, toDirFileUrl, toFileUrl } from "./paths";
import { WindowManager } from "./windows";

/** Chromium switches — must be appended before `ready`. */
const CHROMIUM_SWITCHES: Array<[name: string, value?: string]> = [
  ["autoplay-policy", "no-user-gesture-required"],
  ["ignore-gpu-blocklist"],
  ["enable-gpu-rasterization"],
  ["disable-renderer-backgrounding"],
  ["force_high_performance_gpu"],
];

const cli = parseArgs(process.argv.slice(1));

for (const [name, value] of CHROMIUM_SWITCHES) {
  if (value === undefined) app.commandLine.appendSwitch(name);
  else app.commandLine.appendSwitch(name, value);
}

if (!app.requestSingleInstanceLock()) {
  console.log("[nava] another NavaPlayer instance is already running - exiting.");
  app.quit();
} else {
  Menu.setApplicationMenu(null);
  void main().catch((err: unknown) => fatal("NavaPlayer failed to start", err));
}

function fatal(context: string, err: unknown): void {
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  log("error", context, err);
  try {
    dialog.showErrorBox("NavaPlayer", `${context}\n\n${message}`);
  } catch {
    /* no display */
  }
  void closeLogger().finally(() => app.exit(1));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | void> {
  return Promise.race([promise, new Promise<void>((resolve) => setTimeout(resolve, ms))]);
}

async function main(): Promise<void> {
  let windows: WindowManager | null = null;
  let server: ServerHandle | null = null;
  let link: MasterLink | null = null;
  let shuttingDown = false;

  const shutdown = async (): Promise<void> => {
    log("info", "shutting down");
    windows?.setQuitting();
    if (server) {
      try {
        await withTimeout(server.stop(), 3000);
        log("info", "server stopped");
      } catch (err) {
        log("warn", "server.stop() failed", err);
      }
    }
    if (link) await withTimeout(link.close(), 1500);
    windows?.closeAll();
    await closeLogger();
  };

  process.on("uncaughtException", (err) => log("error", "uncaughtException", err));
  process.on("unhandledRejection", (reason) => log("error", "unhandledRejection", reason));
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => {
      log("info", `${sig} received`);
      app.quit();
    });
  }

  app.on("second-instance", () => {
    log("info", "second instance blocked (single-instance lock); focusing existing window");
    windows?.focusFirst();
  });
  app.on("window-all-closed", () => app.quit());
  app.on("child-process-gone", (_event, details) => {
    log("error", `child process gone: ${details.type} (${details.reason})`, details);
  });
  app.on("before-quit", (event) => {
    if (shuttingDown) return;
    shuttingDown = true;
    event.preventDefault();
    void shutdown().finally(() => app.quit());
  });

  await app.whenReady();

  // --- paths + logging -------------------------------------------------------------------------
  const paths = computePaths();
  const logFile = initLogger(paths.runsDir);
  log("info", "NavaPlayer starting", {
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    packaged: paths.isPackaged,
    appRoot: paths.appRoot,
    resourcesRoot: paths.resourcesRoot,
    distRoot: paths.distRoot,
    logFile,
    argv: process.argv.slice(1),
  });

  // --- .env (API keys for TTS; values never logged) ---------------------------------------------
  const env = loadDotEnv(path.join(paths.appRoot, ".env"));
  if (env) log("info", `.env loaded (${env.loaded.length} keys)`, { loaded: env.loaded, alreadySet: env.skipped });
  else log("info", "no .env file - offline manifest remains active; production cues never use browser TTS fallback");

  // --- config ----------------------------------------------------------------------------------
  const { config, configPath, created } = loadConfig({
    cli,
    appRoot: paths.appRoot,
    resourcesRoot: paths.resourcesRoot,
    log,
  });
  log("info", `config ${created ? "created" : "loaded"}: ${configPath}`, {
    role: config.role,
    lang: config.lang,
    port: config.server.port,
    screens: config.screens.map((s) => `${s.id}@display${s.displayIndex}${s.kiosk ? "" : " (no kiosk)"}`),
  });

  const isDev = cli.dev;
  const windowed = cli.windowed || config.dev.windowed;
  const openDevTools = isDev || config.dev.openDevTools;

  // --- assets (appRoot first, then resourcesRoot) ----------------------------------------------
  const video = resolveConfigPath(config.video.path, paths);
  const avatar = resolveConfigPath(config.avatar.glb, paths);
  const show = resolveConfigPath(config.show, paths);
  const voiceDir = resolveConfigPath("assets/voice", paths);
  const assetReport: Array<[string, typeof video]> = [
    ["video", video],
    ["avatar GLB", avatar],
    ["show.json", show],
    ["voice dir", voiceDir],
  ];
  for (const [label, r] of assetReport) {
    log(
      r.exists ? "info" : "warn",
      `${label}: ${r.abs}${r.exists ? ` (${r.source})` : " (MISSING - the renderer will show an error)"}`,
    );
  }

  // --- server (master) / master link (follower) -------------------------------------------------
  let wsUrl: string;
  if (config.role === "master") {
    try {
      server = await startServer({
        config,
        appRoot: paths.appRoot,
        webDir: paths.webDir,
        showPath: show.abs,
        cacheDir: paths.cacheDir,
        runsDir: paths.runsDir,
        log: (level, msg, data) => log(level, msg, data, "server"),
      });
      wsUrl = `ws://127.0.0.1:${server.port}/ws`;
      log("info", `server listening on port ${server.port}`, server.urls);
      console.log(
        [
          "",
          `  Consola operatorului:  ${server.urls.control}`,
          `  Tablete:               ${server.urls.tablet}`,
          `  WebSocket:             ${server.urls.ws}   (LAN IP ${server.urls.lanIp})`,
          "",
        ].join("\n"),
      );
    } catch (err) {
      wsUrl = `ws://127.0.0.1:${config.server.port}/ws`;
      log(
        "error",
        "server failed to start - running WITHOUT server (no console, tablets or sync; keyboard commands are dropped)",
        err,
      );
    }
  } else {
    wsUrl = config.masterUrl ?? `ws://127.0.0.1:${config.server.port}/ws`;
    log("info", `follower mode: master at ${wsUrl}`);
    link = createMasterLink(wsUrl, log);
  }

  // --- windows + IPC ---------------------------------------------------------------------------
  const wm = new WindowManager({
    rendererHtml: paths.rendererHtml,
    preloadJs: paths.preloadJs,
    windowed,
    openDevTools,
    log,
  });
  windows = wm;

  const dispatchCommand = (cmd: Command): void => {
    if (server) server.dispatchCommand(cmd);
    else if (link) link.dispatch(cmd);
    else log("warn", `command "${cmd.action}" dropped: no server and no master link`);
  };

  registerIpc({
    getBoot: (webContentsId): BootInfo => {
      const screen = wm.screenFor(webContentsId);
      if (!screen) throw new Error(`getBoot from unknown webContents #${webContentsId}`);
      return {
        config,
        screen,
        wsUrl,
        videoUrl: toFileUrl(video.abs),
        avatarUrl: toFileUrl(avatar.abs),
        voiceBaseUrl: toDirFileUrl(voiceDir.abs),
        showUrl: toFileUrl(show.abs),
        isDev,
        appVersion: app.getVersion(),
      };
    },
    screenIdFor: (webContentsId) => wm.screenFor(webContentsId)?.id,
    log: (level, msg, data, src) => log(level, msg, data, src),
    dispatchCommand,
  });

  wm.open(config.screens);
  log(
    "info",
    `ready: ${config.screens.length} screen window(s), role=${config.role}, wsUrl=${wsUrl}, windowed=${windowed}, devtools=${openDevTools}`,
  );
}
