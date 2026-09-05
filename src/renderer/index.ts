/**
 * Renderer boot (Agent B). Loaded via file://dist/renderer/index.html?screen=<id>.
 *   1. window.nava.getBoot()  -> config, this screen, wsUrl, videoUrl, avatarUrl, voiceBaseUrl, showUrl
 *   2. fetch show.json (a follower prefers the copy carried by the server's `welcome`)
 *   3. build UI modules, voice engine + avatar (Agent C factories), Player, SyncClient
 *   4. keyboard shortcuts (BRIEF §7) on the master's clock-source screen -> window.nava.sendCommand
 */

import type { AvatarController, VoiceEngine } from "../shared/contracts";
import type { Command, NavaBridge } from "../shared/protocol";
import type { AppConfig, ScreenConfig, ShowFile } from "../shared/types";
import { createAvatarController } from "./avatar/index";
import { createVoiceEngine } from "./voice/index";
import { createNullAvatar, createNullVoiceEngine } from "./fallbacks";
import { createLogger, describeError } from "./log";
import { Player } from "./player";
import { SyncClient, type SyncStatus } from "./sync";
import { createCountdown } from "./ui/countdown";
import { createEntities } from "./ui/entities";
import { createOsd } from "./ui/osd";
import { createSubtitles } from "./ui/subtitles";
import { createTheme } from "./ui/theme";

type Boot = Awaited<ReturnType<NavaBridge["getBoot"]>>;

const log = createLogger("renderer");

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`element #${id} lipsește din index.html`);
  return el as T;
}

const EMPTY_SHOW: ShowFile = {
  title: "(show lipsă)",
  version: "0",
  videoDurationSec: 0,
  timingStatus: "provisional",
  preshowAutoStart: false,
  launchLeadInSec: 10,
  epilogueOnVideoEnd: false,
  scenes: [],
  cues: [],
};

function isShowFile(v: unknown): v is ShowFile {
  return !!v && typeof v === "object" && Array.isArray((v as ShowFile).cues) && Array.isArray((v as ShowFile).scenes);
}

async function fetchShow(url: string): Promise<ShowFile> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} la ${url}`);
  const json: unknown = await res.json();
  if (!isShowFile(json)) throw new Error(`show.json invalid (${url})`);
  return json;
}

/** ws://host:port/ws -> http://host:port (for optional live TTS). */
function httpFromWs(wsUrl: string | undefined): string | null {
  if (!wsUrl) return null;
  try {
    const u = new URL(wsUrl);
    u.protocol = u.protocol === "wss:" ? "https:" : "http:";
    u.pathname = "";
    u.search = "";
    return u.origin;
  } catch {
    return null;
  }
}

/**
 * Plain-browser fallback (no Electron preload): lets the page run from a static server for
 * development: ?screen=center&video=<url>&show=<url>&ws=<url>&role=master|follower&dev=1
 */
function devBoot(): Boot {
  const q = new URLSearchParams(location.search);
  const screenId = q.get("screen") ?? "center";
  const screen: ScreenConfig = {
    id: screenId,
    displayIndex: 0,
    roleLabel: q.get("label") ?? undefined,
    showAvatar: q.get("avatar") !== "0",
    showSubtitles: true,
    showEntities: true,
    playAudio: q.get("audio") !== "0",
    kiosk: false,
  };
  const config: AppConfig = {
    role: q.get("role") === "follower" ? "follower" : "master",
    masterUrl: q.get("ws") ?? undefined,
    server: { port: 4321, bindHost: "0.0.0.0" },
    lang: "ro",
    show: q.get("show") ?? "../../assets/show/show.json",
    video: { path: q.get("video") ?? "", fit: (q.get("fit") as "cover" | "contain") ?? "cover", preloadPoster: true },
    avatar: { glb: q.get("glb") ?? "../../assets/avatar/avatar-ai.glb", corner: "bottom-left", widthPercent: 22, marginPx: 40 },
    audio: { voiceVolume: 1, sfxVolume: 0.8, outputDeviceId: "default" },
    screens: [screen],
    sync: { clockHz: 4, seekThresholdSec: 0.25, rateNudge: 0.03 },
    dev: { openDevTools: false, windowed: true },
  };
  return {
    config,
    screen,
    wsUrl: q.get("ws") ?? "ws://localhost:4321/ws",
    videoUrl: config.video.path,
    avatarUrl: config.avatar.glb,
    voiceBaseUrl: q.get("voice") ?? "../../assets/voice/",
    showUrl: config.show,
    isDev: q.get("dev") !== "0",
    appVersion: "dev",
  };
}

function installBridgeShim(): void {
  if (window.nava) return;
  const shim: NavaBridge = {
    getBoot: async () => devBoot(),
    log: () => {},
    sendCommand: () => {},
    quit: () => {},
  };
  (window as unknown as { nava: NavaBridge }).nava = shim;
  console.warn("[renderer] window.nava lipsește — rulez cu boot-ul de dezvoltare din URL");
}

async function main(): Promise<void> {
  const video = $<HTMLVideoElement>("video");
  const osd = createOsd(
    { panel: $("osd"), identify: $("identify"), spinner: $("spinner"), error: $("error-banner") },
    { screen: { id: new URLSearchParams(location.search).get("screen") ?? "?", displayIndex: 0, showAvatar: true, showSubtitles: true, showEntities: true, playAudio: true, kiosk: true }, alwaysVisible: false },
  );

  const hadBridge = !!window.nava;
  installBridgeShim();

  let boot: Boot;
  try {
    boot = await window.nava.getBoot();
  } catch (err) {
    log("error", `getBoot failed: ${describeError(err)}`);
    osd.setError("EROARE DE PORNIRE", `window.nava.getBoot() a eșuat:\n${describeError(err)}`);
    return;
  }
  const { config, screen } = boot;
  const isMaster = config.role === "master";
  const isClockSource = isMaster && (config.screens[0]?.id ?? screen.id) === screen.id;
  const showOsd = boot.isDev || config.dev.openDevTools;
  log("info", `boot: screen=${screen.id} role=${config.role} clockSource=${isClockSource} ws=${boot.wsUrl} v${boot.appVersion}`);

  // ---- OSD with the real screen
  const osdReal = createOsd(
    { panel: $("osd"), identify: $("identify"), spinner: $("spinner"), error: $("error-banner") },
    { screen, alwaysVisible: showOsd },
  );
  if (config.dev.windowed || !hadBridge) document.body.classList.add("show-cursor");

  // ---- UI modules
  const theme = createTheme(document.body, $("white-fade"));
  const subtitles = createSubtitles($("subtitles"), { enabled: screen.showSubtitles });
  const countdown = createCountdown($("countdown"), { enabled: true });
  const launchControls = $("launch-controls");

  // ---- Voice engine (Agent C) — never audible on screens with playAudio=false
  let voice: VoiceEngine;
  try {
    voice = createVoiceEngine({
      voiceBaseUrl: boot.voiceBaseUrl,
      serverHttpUrl: httpFromWs(boot.wsUrl),
      lang: config.lang,
      audible: screen.playAudio,
      initialVolume: config.audio.voiceVolume,
    });
  } catch (err) {
    log("error", `createVoiceEngine failed — folosesc motorul nul: ${describeError(err)}`);
    voice = createNullVoiceEngine();
  }
  // Do not expose the launch controls until every offline production line is fetched and decoded.
  // This removes per-cue I/O/decode latency from the tightly timed performance.
  await voice.prepare(config.lang).catch((err) => log("warn", `voice.prepare failed: ${describeError(err)}`));
  voice.unlock().catch(() => {});

  const entities = createEntities($<HTMLCanvasElement>("entities"), { enabled: screen.showEntities, getAmplitude: () => voice.getAmplitude() });

  // ---- Avatar (Agent C)
  const avatarEl = $("avatar");
  const root = document.documentElement.style;
  root.setProperty("--avatar-width", `${config.avatar.widthPercent}vw`);
  root.setProperty("--avatar-margin", `${config.avatar.marginPx}px`);
  avatarEl.classList.toggle("right", config.avatar.corner === "bottom-right");
  const avatarWidthPx = () => Math.round((window.innerWidth * config.avatar.widthPercent) / 100);

  let avatar: AvatarController = createNullAvatar();
  if (screen.showAvatar) {
    try {
      avatar = createAvatarController({
        container: avatarEl,
        glbUrl: boot.avatarUrl,
        lang: config.lang,
        widthPx: avatarWidthPx(),
        onReady: () => log("info", "avatar ready"),
        onError: (err) => {
          log("error", `avatar error: ${describeError(err)}`);
          osdReal.note(`Avatar indisponibil: ${describeError(err)}`, 8000);
        },
      });
      avatar.setVisible(false, false); // appears when the first CAPITANUL line requests GLB lip-sync
      avatar.load().catch((err) => {
        log("error", `avatar.load failed (${boot.avatarUrl}): ${describeError(err)}`);
        osdReal.note(`GLB lipsă sau invalid: ${config.avatar.glb}`, 8000);
      });
    } catch (err) {
      log("error", `createAvatarController failed — continui fără avatar: ${describeError(err)}`);
      avatar = createNullAvatar();
    }
  } else {
    avatarEl.hidden = true;
  }

  // ---- Show file (local; a follower's `welcome` may override it)
  let show: ShowFile = EMPTY_SHOW;
  try {
    show = await fetchShow(boot.showUrl);
    log("info", `show "${show.title}" v${show.version} (${show.timingStatus}): ${show.cues.length} cues`);
  } catch (err) {
    log("error", `show.json: ${describeError(err)}`);
    if (isMaster) osdReal.setError("SHOW LIPSĂ", `${boot.showUrl}\n${describeError(err)}\n\nVerificați config.json → show (assets/show/show.json).`);
    else osdReal.note("show.json local lipsă — aștept copia de la master", 8000);
  }

  // ---- Player
  const veil = $("veil");
  const player = new Player({
    video,
    show,
    config,
    screen,
    voice,
    avatar,
    subtitles,
    countdown,
    entities,
    theme,
    osd: osdReal,
    log,
    loadShow: () => fetchShow(boot.showUrl),
    onAutoplayBlocked: () => {
      veil.hidden = false;
    },
    onStateChange: (state) => {
      launchControls.hidden = !isClockSource || state !== "idle";
    },
    onConfiguredVideoEnd: () => {
      // The player has already entered epilogue locally without a visible hold. Tell the server at
      // once so followers/tablets adopt the same phase instead of waiting for the next 4 Hz report.
      if (isClockSource) window.nava.sendCommand({ action: "epilogue" });
    },
  });
  player.attach(boot.videoUrl);
  launchControls.hidden = !isClockSource || player.getPlaybackState() !== "idle";

  // ---- Sync (WS)
  let syncStatus: SyncStatus = { connected: false, reconnecting: true, driftSec: null, offsetMs: 0, attempts: 0 };
  const sync = new SyncClient({
    wsUrl: boot.wsUrl,
    screenId: screen.id,
    screenName: screen.roleLabel,
    screenToken: boot.screenToken,
    isClockSource,
    clockHz: config.sync.clockHz,
    seekThresholdSec: config.sync.seekThresholdSec,
    rateNudge: config.sync.rateNudge,
    player,
    log,
    onStatus: (s) => {
      syncStatus = s;
    },
    onWelcome: (msg) => {
      if (isShowFile(msg.show) && (!isMaster || show === EMPTY_SHOW)) {
        player.setShow(msg.show);
        osdReal.setError(null);
        log("info", `show preluat din welcome (${msg.show.cues.length} cues)`);
      }
      if (msg.config?.lang && msg.config.lang !== player.getLang()) player.setLang(msg.config.lang);
    },
  });
  if (boot.wsUrl) sync.connect();
  else log("warn", "wsUrl lipsă — fără sincronizare; comenzile de la tastatură se aplică local");

  // ---- OSD refresh
  player.onOsd = () => {
    osdReal.update({
      state: player.getPlaybackState(),
      phaseTime: player.phaseTime(),
      sceneId: player.sceneId(),
      sync: { connected: syncStatus.connected, driftSec: syncStatus.driftSec, isClockSource, reconnecting: syncStatus.reconnecting },
      video: { ready: player.isVideoReady(), rate: player.rate(), readyState: video.readyState, buffering: player.isBuffering() },
      lastCueId: player.timeline.lastCueId(),
    });
  };

  // ---- Autoplay veil (only if the browser refused to play)
  const gesture = () => {
    veil.hidden = true;
    voice.unlock().catch(() => {});
    player.resumeAfterGesture();
  };
  veil.addEventListener("click", gesture);
  veil.addEventListener("keydown", gesture);

  // ---- Keyboard (master's clock-source screen only, BRIEF §7)
  const dispatch = (cmd: Command) => {
    if (sync.isConnected()) window.nava.sendCommand(cmd);
    else {
      log("warn", `server indisponibil — aplic local: ${cmd.action}`);
      player.apply(cmd);
    }
  };
  launchControls.addEventListener("click", (ev) => {
    voice.unlock().catch(() => {});
    const target = ev.target instanceof Element ? ev.target : null;
    dispatch({ action: target?.closest("#launch-start") ? "start" : "preshow" });
  });
  let lastEsc = 0;
  window.addEventListener("keydown", (ev) => {
    if (!veil.hidden) {
      gesture();
      return;
    }
    if (ev.key === "o" || ev.key === "O") {
      // local: toggle the diagnostics panel on any screen
      const panel = $("osd");
      panel.hidden = !panel.hidden;
      osdReal.setVisible(!panel.hidden);
      return;
    }
    if (!isClockSource) return;
    if (ev.repeat) return;
    if (ev.target instanceof HTMLButtonElement && (ev.key === " " || ev.key === "Enter")) return;
    switch (ev.key) {
      case " ":
        ev.preventDefault();
        dispatch(player.getPlaybackState() === "idle" ? { action: "preshow" } : player.getPlaybackState() === "playing" || player.rate() > 0 ? { action: "pause" } : { action: "play" });
        break;
      case "Enter":
        ev.preventDefault();
        dispatch(player.getPlaybackState() === "idle" ? { action: "preshow" } : { action: "play" });
        break;
      case "s":
      case "S":
        dispatch({ action: "start" });
        break;
      case "p":
      case "P":
        dispatch({ action: "preshow" });
        break;
      case "r":
      case "R":
        dispatch({ action: "restart" });
        break;
      case "e":
      case "E":
        dispatch({ action: "epilogue" });
        break;
      case "ArrowLeft":
        ev.preventDefault();
        dispatch({ action: "seek", time: Math.max(0, player.phaseTime() - 5) });
        break;
      case "ArrowRight":
        ev.preventDefault();
        dispatch({ action: "seek", time: player.phaseTime() + 5 });
        break;
      case "i":
      case "I":
        dispatch({ action: "identifyScreens" });
        break;
      case "t":
      case "T":
        dispatch({ action: "testAvatar" });
        break;
      case "f":
      case "F":
        toggleFullscreen();
        break;
      case "Escape": {
        const now = performance.now();
        if (config.dev.windowed && now - lastEsc < 1000) {
          log("info", "Esc ×2 — ieșire");
          window.nava.quit();
        }
        lastEsc = now;
        break;
      }
      default:
        break;
    }
  });

  window.addEventListener("resize", () => {
    try {
      avatar.resize(avatarWidthPx());
    } catch {
      /* ignore */
    }
  });

  window.addEventListener("error", (ev) => log("error", `uncaught: ${ev.message}`, { file: ev.filename, line: ev.lineno }));
  window.addEventListener("unhandledrejection", (ev) => log("error", `unhandled rejection: ${describeError(ev.reason)}`));

  if (showOsd) osdReal.setVisible(true);
  log("info", "renderer ready");
}

function toggleFullscreen(): void {
  try {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  } catch (err) {
    log("warn", `fullscreen: ${describeError(err)}`);
  }
}

main().catch((err) => {
  log("error", `boot failed: ${describeError(err)}`);
  const banner = document.getElementById("error-banner");
  if (banner) {
    banner.hidden = false;
    const t = banner.querySelector(".title");
    const d = banner.querySelector(".detail");
    if (t) t.textContent = "EROARE DE PORNIRE";
    if (d) d.textContent = describeError(err);
  }
});
