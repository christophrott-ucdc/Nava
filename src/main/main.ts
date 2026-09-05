/**
 * NavaPlayer — Electron main process entry (bundled to dist/main/main.js by scripts/build.mjs).
 *
 * Boot order: CLI args -> Chromium switches -> single-instance lock -> app ready -> logger (runs/*.jsonl, rotation)
 *   -> powerSaveBlocker -> .env -> config.json -> autostart registration -> resolve assets
 *   -> server (master) | master link (follower) -> IPC -> windows (one per screen, or one spanning window).
 * Shutdown (before-quit): stop server, close master link, destroy windows, release power blocker, flush log.
 *
 * Production hardening (A-01):
 *   - powerSaveBlocker("prevent-display-sleep") for the whole run (TVs never blank during a show).
 *   - renderer watchdog: a crashed renderer is re-created (src/main/windows.ts); 3 crashes within 60 s ->
 *     fatal log + app.relaunch() + exit (Task Scheduler / login item starts nothing, the app restarts itself).
 *   - GPU process gone -> logged (Chromium restarts it); uncaught exceptions in main -> logged, app keeps running.
 *   - config.autostart -> app.setLoginItemSettings (packaged only, with --kiosk); Task Scheduler alternative in
 *     scripts/install-autostart.ps1.
 *
 * CLI:  --config <path>  --dev  --role master|follower  --screen <id>  --windowed  --kiosk
 */
import { app, dialog, Menu, powerSaveBlocker } from "electron";
import path from "node:path";
import type { Command } from "../shared/protocol";
import { startServer, type ServerHandle } from "../server/index";
import { loadConfig, parseArgs } from "./config";
import { loadDotEnv } from "./env";
import { registerIpc, type BootInfo } from "./ipc";
import { closeLogger, initLogger, KEEP_APP_LOGS, log, rotateRunLogs } from "./logger";
import { createMasterLink, type MasterLink } from "./master-link";
import { computePaths, resolveConfigPath, toDirFileUrl, toFileUrl } from "./paths";
import { WindowManager } from "./windows";
import { DisplayInventoryManager } from "./display-inventory";

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

/** ws://host:port/ws -> http://host:port (wss -> https). A trailing "/ws" is stripped; any other prefix is kept. */
function httpFromWs(wsUrl: string): string | null {
  try {
    const u = new URL(wsUrl);
    const proto = u.protocol === "wss:" ? "https:" : u.protocol === "ws:" ? "http:" : null;
    if (!proto || !u.host) return null;
    const base = u.pathname.replace(/\/ws\/?$/, "").replace(/\/+$/, "");
    return `${proto}//${u.host}${base}`;
  } catch {
    return null;
  }
}

/**
 * config.autostart -> HKCU "Run" entry via setLoginItemSettings, packaged builds only (in development the exe is
 * electron.exe). For the portable build process.execPath is the payload extracted to %TEMP%; the launcher exe
 * the operator double-clicks is in PORTABLE_EXECUTABLE_FILE (set by electron-builder). Registered with --kiosk.
 * autostart=false removes a previously registered entry. Task Scheduler alternative: scripts/install-autostart.ps1.
 */
function applyAutostart(enabled: boolean): void {
  if (!app.isPackaged) {
    if (enabled) log("info", "config.autostart=true ignored in development (not packaged); use scripts/install-autostart.ps1 with the exe");
    return;
  }
  const exe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  const target = { path: exe, args: ["--kiosk"] };
  try {
    const current = app.getLoginItemSettings(target);
    if (enabled && !current.openAtLogin) {
      app.setLoginItemSettings({ openAtLogin: true, ...target });
      log("info", `autostart registered at logon: "${exe}" --kiosk`);
    } else if (!enabled && current.openAtLogin) {
      app.setLoginItemSettings({ openAtLogin: false, ...target });
      log("info", "autostart login item removed (config.autostart=false)");
    } else {
      log("info", `autostart login item ${enabled ? "already registered" : "not registered"} (${exe})`);
    }
  } catch (err) {
    log("warn", "setLoginItemSettings failed", err);
  }
}

async function main(): Promise<void> {
  let windows: WindowManager | null = null;
  let server: ServerHandle | null = null;
  let link: MasterLink | null = null;
  let shuttingDown = false;
  let relaunching = false;
  let powerBlockerId: number | null = null;
  let displayInventory: DisplayInventoryManager | null = null;

  const releasePowerBlocker = (): void => {
    if (powerBlockerId !== null && powerSaveBlocker.isStarted(powerBlockerId)) powerSaveBlocker.stop(powerBlockerId);
    powerBlockerId = null;
  };

  const shutdown = async (): Promise<void> => {
    log("info", "shutting down");
    windows?.setQuitting();
    displayInventory?.stop();
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
    releasePowerBlocker();
    await closeLogger();
  };

  /** Fatal watchdog exit: flush what we can, then relaunch the app with the same argv/cwd and exit. */
  const relaunch = (reason: string): void => {
    if (relaunching) return;
    relaunching = true;
    shuttingDown = true; // app.exit() skips before-quit anyway; make sure a racing quit does not double-shutdown
    log("error", `FATAL: ${reason} -> relaunching NavaPlayer`);
    windows?.setQuitting();
    const stopAll = async (): Promise<void> => {
      if (server) await server.stop();
      if (link) await link.close();
    };
    void withTimeout(stopAll().catch((err: unknown) => log("warn", "stop before relaunch failed", err)), 2000)
      .then(() => {
        releasePowerBlocker();
        return closeLogger();
      })
      .finally(() => {
        app.relaunch();
        app.exit(1);
      });
  };

  // Main-process exceptions must not take down a running show: log and keep going (Electron's default would exit).
  process.on("uncaughtException", (err) => {
    try {
      log("error", "uncaughtException in main (app keeps running)", err);
    } catch {
      console.error(err);
    }
  });
  process.on("unhandledRejection", (reason) => log("error", "unhandledRejection in main (app keeps running)", reason));
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
    if (details.type === "GPU") {
      log(
        "error",
        `GPU process gone (${details.reason}, exit code ${details.exitCode}) - Chromium restarts it; renderers may flicker or fall back to software`,
        details,
      );
    } else {
      log("warn", `child process gone: ${details.type} (${details.reason}, exit code ${details.exitCode})`, details);
    }
  });
  app.on("before-quit", (event) => {
    if (shuttingDown) return;
    shuttingDown = true;
    event.preventDefault();
    void shutdown().finally(() => app.quit());
  });

  await app.whenReady();

  // --- paths + logging (+ rotation of app-*.jsonl) -------------------------------------------------
  const paths = computePaths();
  const logFile = initLogger(paths.runsDir);
  const rotation = rotateRunLogs(paths.runsDir, KEEP_APP_LOGS);
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
  if (rotation.deleted.length > 0 || rotation.failed.length > 0) {
    log(
      rotation.failed.length > 0 ? "warn" : "info",
      `log rotation: deleted ${rotation.deleted.length} old app-*.jsonl, kept ${rotation.kept} (max ${KEEP_APP_LOGS})`,
      { deleted: rotation.deleted.map((f) => path.basename(f)), failed: rotation.failed },
    );
  }

  // --- keep the displays awake for the whole run ------------------------------------------------------
  try {
    powerBlockerId = powerSaveBlocker.start("prevent-display-sleep");
    log("info", `powerSaveBlocker active (#${powerBlockerId}, prevent-display-sleep)`);
  } catch (err) {
    log("warn", "powerSaveBlocker.start failed - displays may sleep during the show", err);
  }

  // --- .env (API keys for TTS; values never logged) ---------------------------------------------
  const env = loadDotEnv(path.join(paths.appRoot, ".env"));
  if (env) log("info", `.env loaded (${env.loaded.length} keys)`, { loaded: env.loaded, alreadySet: env.skipped });
  else log("info", "no .env file - offline manifest remains active; production cues never use browser TTS fallback");

  // --- config ----------------------------------------------------------------------------------
  const { config, configPath, created, screenTokenGenerated } = loadConfig({
    cli,
    appRoot: paths.appRoot,
    resourcesRoot: paths.resourcesRoot,
    log,
  });
  let displayMode = config.displayMode ?? "windows";
  log("info", `config ${created ? "created" : "loaded"}: ${configPath}`, {
    role: config.role,
    lang: config.lang,
    port: config.server.port,
    displayMode,
    autostart: config.autostart ?? false,
    variant: config.variant ?? null,
    screenTokenGenerated,
    screens: config.screens.map(
      (s) => `${s.id}@display${s.displayIndex}${s.kiosk ? "" : " (no kiosk)"}${s.yawOffsetDeg ? ` yaw ${s.yawOffsetDeg}deg` : ""}`,
    ),
  });

  const isDev = cli.dev;
  // --kiosk forces kiosk even when config.dev.windowed (or --windowed) says otherwise.
  const windowed = cli.kiosk ? false : cli.windowed || config.dev.windowed;
  const openDevTools = isDev || config.dev.openDevTools;
  if (cli.kiosk) log("info", "--kiosk: kiosk/fullscreen forced");

  if (config.autoDisplays && !cli.wallPreview && !cli.screen) {
    displayInventory = new DisplayInventoryManager({
      config:config.autoDisplays,appRoot:paths.appRoot,resourcesRoot:paths.resourcesRoot,log,
      onTopologyChanged:(reason)=>{
        if (server?.onDisplayTopologyChanged) server.onDisplayTopologyChanged(reason);
        else if (server) server.dispatchCommand({action:'pause'});
        else if (link) link.dispatch({action:'pause'});
      },
      apply:async(candidate)=>{
        const previous={screens:config.screens,videoWall:config.videoWall,displayMode,required:[...config.autoRun!.requireScreens]};
        const restore=async()=>{
          config.screens=previous.screens;config.videoWall=previous.videoWall;config.displayMode=previous.displayMode;displayMode=previous.displayMode;config.autoRun!.requireScreens=previous.required;
          if(windows)await windows.reconfigure(config.screens,displayMode,config.videoWall);
        };
        config.screens=candidate.screens;config.videoWall=candidate.videoWall;config.displayMode=candidate.displayMode;displayMode=candidate.displayMode;
        config.autoRun!.requireScreens=candidate.screens.map(s=>s.id);
        try{if(windows)await windows.reconfigure(config.screens,displayMode,config.videoWall);}catch(err){config.screens=previous.screens;config.videoWall=previous.videoWall;config.displayMode=previous.displayMode;displayMode=previous.displayMode;config.autoRun!.requireScreens=previous.required;throw err;}
        return restore;
      },
    });
    const detected=await displayInventory.initialize();
    if(config.autoDisplays.enabled&&detected.candidate?.canApply){
      try{await displayInventory.apply();}catch(err){log('warn','Automatic display configuration was not applied',String(err));}
    }
  }

  applyAutostart(config.autostart === true);

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
  /** http(s)://host:port of the master's server (for /api/tts, /api/dialog); null when unreachable by design. */
  let serverHttpUrl: string | null;
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
        focusPlayer: () => windows?.focusFirst() ?? false,
        wallRuntime: () => {
          const runtime=windows?.wallRuntime(config.screens)??{preview:true,displays:[],issues:["Player în curs de pornire."],verifiedScreenIds:[]};
          const issues=displayInventory?.readinessIssues()??[];
          return {...runtime,issues:[...runtime.issues,...issues],verifiedScreenIds:issues.length?[]:runtime.verifiedScreenIds};
        },
        displayAutomation:displayInventory?{inventory:()=>displayInventory!.inventory(),detect:()=>displayInventory!.detect(),apply:(optical?:unknown)=>displayInventory!.apply(optical)}:undefined,
      });
      wsUrl = `ws://127.0.0.1:${server.port}/ws`;
      serverHttpUrl = `http://127.0.0.1:${server.port}`;
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
      serverHttpUrl = null;
      log(
        "error",
        "server failed to start - running WITHOUT server (no console, tablets, sync or live TTS; keyboard commands are dropped)",
        err,
      );
    }
  } else {
    wsUrl = config.masterUrl ?? `ws://127.0.0.1:${config.server.port}/ws`;
    serverHttpUrl = config.masterUrl ? httpFromWs(config.masterUrl) : null;
    log("info", `follower mode: master at ${wsUrl} (http ${serverHttpUrl ?? "n/a"})`);
    link = createMasterLink(wsUrl, log);
  }

  // --- windows + IPC ---------------------------------------------------------------------------
  const wm = new WindowManager({
    rendererHtml: paths.rendererHtml,
    preloadJs: paths.preloadJs,
    windowed,
    openDevTools,
    displayMode,
    videoWall: config.videoWall,
    wallPreview: cli.wallPreview,
    log,
    onCrashLoop: (crashes, windowMs) => relaunch(`${crashes} renderer crashes within ${Math.round(windowMs / 1000)} s`),
  });
  windows = wm;

  const dispatchCommand = (cmd: Command): void => {
    if (server) server.dispatchCommand(cmd);
    else if (link) link.dispatch(cmd);
    else log("warn", `command "${cmd.action}" dropped: no server and no master link`);
  };

  const security = config.security;
  registerIpc({
    getBoot: (webContentsId): BootInfo => {
      const screen = wm.screenFor(webContentsId);
      if (!screen) throw new Error(`getBoot from unknown webContents #${webContentsId}`);
      const viewports = wm.viewports();
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
        // R4
        serverHttpUrl,
        screenToken: security?.screenToken ?? "",
        security: { publicState: security?.publicState ?? true },
        displayMode,
        ...(displayMode === "span" && viewports ? { viewports } : {}),
        variant: config.variant ?? null,
      };
    },
    screenIdFor: (webContentsId) => wm.screenFor(webContentsId)?.id,
    log: (level, msg, data, src) => log(level, msg, data, src),
    dispatchCommand,
  });

  wm.open(config.screens);
  log(
    "info",
    `ready: ${displayMode === "span" ? `1 spanning window over ${config.screens.length} screen(s)` : `${config.screens.length} screen window(s)`}, role=${config.role}, wsUrl=${wsUrl}, http=${serverHttpUrl ?? "n/a"}, windowed=${windowed}, devtools=${openDevTools}`,
  );
}
