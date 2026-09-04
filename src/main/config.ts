/**
 * CLI arguments + config.json: locate, create-from-example, parse, merge with defaults, validate, apply CLI overrides.
 */
import fs from "node:fs";
import path from "node:path";
import type { AppConfig, ScreenConfig } from "../shared/types";
import type { LogFn } from "./logger";

export interface CliArgs {
  /** --config <path>  (absolute, or relative to appRoot). Default: <appRoot>/config.json */
  configPath?: string;
  /** --dev  : open DevTools, isDev=true in the boot object. */
  dev: boolean;
  /** --role master|follower  (overrides config.role). */
  role?: AppConfig["role"];
  /** --screen <id>  : open only this screen from config.screens. */
  screen?: string;
  /** --windowed  : never kiosk/fullscreen (also sets config.dev.windowed = true for the renderers). */
  windowed: boolean;
}

/** Accepts `--key value` and `--key=value`; unknown args (Electron/Chromium switches) are ignored. */
export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { dev: false, windowed: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    const key = eq > 0 ? arg.slice(0, eq) : arg;
    const inlineValue = eq > 0 ? arg.slice(eq + 1) : undefined;
    const takeValue = (): string | undefined => {
      if (inlineValue !== undefined) return inlineValue;
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        i++;
        return next;
      }
      return undefined;
    };
    switch (key) {
      case "--config":
        args.configPath = takeValue();
        break;
      case "--dev":
        args.dev = true;
        break;
      case "--windowed":
        args.windowed = true;
        break;
      case "--screen":
        args.screen = takeValue();
        break;
      case "--role": {
        const v = takeValue();
        if (v === "master" || v === "follower") args.role = v;
        else if (v !== undefined) console.warn(`[config] ignoring --role "${v}" (expected master|follower)`);
        break;
      }
      default:
        break;
    }
  }
  return args;
}

export const DEFAULT_SCREEN: ScreenConfig = {
  id: "center",
  displayIndex: 0,
  roleLabel: "FEREASTRA FRONTALA",
  showAvatar: true,
  showSubtitles: true,
  showEntities: true,
  playAudio: true,
  kiosk: true,
};

/** Mirrors config.example.json; used to fill in missing sections and as a last-resort config. */
export const DEFAULT_CONFIG: AppConfig = {
  role: "master",
  masterUrl: "ws://192.168.1.10:4321/ws",
  server: { port: 4321, bindHost: "0.0.0.0" },
  lang: "ro",
  show: "assets/show/show.json",
  video: { path: "media/cinema_4k_h264.mp4", fit: "cover", preloadPoster: true },
  avatar: { glb: "assets/avatar/avatar-ai.glb", corner: "bottom-left", widthPercent: 22, marginPx: 40 },
  audio: { voiceVolume: 1, sfxVolume: 0.8, outputDeviceId: "default" },
  screens: [DEFAULT_SCREEN],
  sync: { clockHz: 4, seekThresholdSec: 0.25, rateNudge: 0.03 },
  dev: { openDevTools: false, windowed: false },
};

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

function finiteNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function nonEmptyString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function validWebSocketUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    return (url.protocol === "ws:" || url.protocol === "wss:") && !!url.hostname ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** Per-section merge: each top-level section of DEFAULT_CONFIG is completed from the user's file. */
function mergeConfig(user: Json): AppConfig {
  const out: Json = {};
  for (const [key, def] of Object.entries(DEFAULT_CONFIG)) {
    const val = user[key];
    if (isObj(def)) out[key] = { ...def, ...(isObj(val) ? val : {}) };
    else out[key] = val !== undefined ? val : def;
  }
  return out as unknown as AppConfig;
}

function sanitizeScreens(raw: unknown, log: LogFn): ScreenConfig[] {
  const list: unknown[] = Array.isArray(raw) ? raw : [];
  const screens: ScreenConfig[] = [];
  const seen = new Set<string>();
  const bool = (v: unknown, d: boolean): boolean => (typeof v === "boolean" ? v : d);
  list.forEach((item, i) => {
    if (!isObj(item) || typeof item.id !== "string" || !item.id) {
      log("warn", `config.screens[${i}] ignored: missing "id"`);
      return;
    }
    if (seen.has(item.id)) {
      log("warn", `config.screens[${i}] ignored: duplicate id "${item.id}"`);
      return;
    }
    seen.add(item.id);
    const sc: ScreenConfig = {
      id: item.id,
      displayIndex:
        typeof item.displayIndex === "number" && Number.isInteger(item.displayIndex) && item.displayIndex >= 0
          ? item.displayIndex
          : i,
      showAvatar: bool(item.showAvatar, true),
      showSubtitles: bool(item.showSubtitles, true),
      showEntities: bool(item.showEntities, true),
      playAudio: bool(item.playAudio, screens.length === 0),
      kiosk: bool(item.kiosk, true),
    };
    if (typeof item.roleLabel === "string") sc.roleLabel = item.roleLabel;
    screens.push(sc);
  });
  if (screens.length === 0) {
    log("warn", "config.screens is empty or invalid; using the default single screen");
    screens.push({ ...DEFAULT_SCREEN });
  }
  return screens;
}

export interface LoadedConfig {
  config: AppConfig;
  configPath: string;
  /** true when config.json did not exist and was created (from config.example.json or built-in defaults). */
  created: boolean;
}

export function loadConfig(opts: { cli: CliArgs; appRoot: string; resourcesRoot: string; log: LogFn }): LoadedConfig {
  const { cli, appRoot, resourcesRoot, log } = opts;
  const configPath = cli.configPath ? path.resolve(appRoot, cli.configPath) : path.join(appRoot, "config.json");

  let created = false;
  if (!fs.existsSync(configPath)) {
    const example = [path.join(appRoot, "config.example.json"), path.join(resourcesRoot, "config.example.json")].find(
      (p) => fs.existsSync(p),
    );
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    if (example) {
      fs.copyFileSync(example, configPath);
      log("warn", `config not found -> created ${configPath} from ${example}`);
    } else {
      fs.writeFileSync(configPath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`);
      log("warn", `config not found and no config.example.json -> wrote built-in defaults to ${configPath}`);
    }
    created = true;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, "utf8").replace(/^﻿/, ""));
  } catch (err) {
    throw new Error(`Cannot parse config ${configPath}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!isObj(raw)) throw new Error(`Config ${configPath} must be a JSON object`);

  const config = mergeConfig(raw);

  // --- validation / normalization -------------------------------------------------------------
  if (config.role !== "master" && config.role !== "follower") {
    log("warn", `config.role "${String(config.role)}" invalid -> "master"`);
    config.role = "master";
  }
  if (!Number.isInteger(config.server.port) || config.server.port <= 0 || config.server.port > 65535) {
    log("warn", `config.server.port invalid -> ${DEFAULT_CONFIG.server.port}`);
    config.server.port = DEFAULT_CONFIG.server.port;
  }
  config.server.bindHost = nonEmptyString(config.server.bindHost, DEFAULT_CONFIG.server.bindHost);
  if (config.lang !== "ro" && config.lang !== "en" && config.lang !== "fr") {
    log("warn", `config.lang "${String(config.lang)}" invalid -> "ro"`);
    config.lang = "ro";
  }
  config.show = nonEmptyString(config.show, DEFAULT_CONFIG.show);
  config.video.path = nonEmptyString(config.video.path, DEFAULT_CONFIG.video.path);
  if (config.video.fit !== "cover" && config.video.fit !== "contain") config.video.fit = DEFAULT_CONFIG.video.fit;
  config.video.preloadPoster = typeof config.video.preloadPoster === "boolean" ? config.video.preloadPoster : DEFAULT_CONFIG.video.preloadPoster;
  config.avatar.glb = nonEmptyString(config.avatar.glb, DEFAULT_CONFIG.avatar.glb);
  if (config.avatar.corner !== "bottom-left" && config.avatar.corner !== "bottom-right") config.avatar.corner = DEFAULT_CONFIG.avatar.corner;
  config.avatar.widthPercent = finiteNumber(config.avatar.widthPercent, DEFAULT_CONFIG.avatar.widthPercent, 5, 60);
  config.avatar.marginPx = finiteNumber(config.avatar.marginPx, DEFAULT_CONFIG.avatar.marginPx, 0, 500);
  config.audio.voiceVolume = finiteNumber(config.audio.voiceVolume, DEFAULT_CONFIG.audio.voiceVolume, 0, 1);
  config.audio.sfxVolume = finiteNumber(config.audio.sfxVolume, DEFAULT_CONFIG.audio.sfxVolume, 0, 1);
  config.audio.outputDeviceId = nonEmptyString(config.audio.outputDeviceId, DEFAULT_CONFIG.audio.outputDeviceId);
  config.sync.clockHz = finiteNumber(config.sync.clockHz, DEFAULT_CONFIG.sync.clockHz, 1, 30);
  config.sync.seekThresholdSec = finiteNumber(config.sync.seekThresholdSec, DEFAULT_CONFIG.sync.seekThresholdSec, 0.01, 10);
  config.sync.rateNudge = finiteNumber(config.sync.rateNudge, DEFAULT_CONFIG.sync.rateNudge, 0, 0.2);
  config.dev.openDevTools = typeof config.dev.openDevTools === "boolean" ? config.dev.openDevTools : DEFAULT_CONFIG.dev.openDevTools;
  config.dev.windowed = typeof config.dev.windowed === "boolean" ? config.dev.windowed : DEFAULT_CONFIG.dev.windowed;
  const masterUrl = validWebSocketUrl(config.masterUrl);
  if (masterUrl) config.masterUrl = masterUrl;
  else if (config.masterUrl !== undefined) {
    log("warn", `config.masterUrl "${String(config.masterUrl)}" invalid -> removed (expected ws:// or wss:// URL)`);
    delete config.masterUrl;
  }
  config.screens = sanitizeScreens(raw.screens, log);

  // --- CLI overrides ---------------------------------------------------------------------------
  if (cli.role && cli.role !== config.role) {
    log("info", `--role ${cli.role} overrides config.role (${config.role})`);
    config.role = cli.role;
  }
  if (cli.windowed) config.dev.windowed = true;
  if (cli.screen) {
    const only = config.screens.filter((s) => s.id === cli.screen);
    if (only.length > 0) config.screens = only;
    else {
      log(
        "warn",
        `--screen "${cli.screen}" not in config.screens (${config.screens.map((s) => s.id).join(", ")}) -> opening all screens`,
      );
    }
  }
  if (config.role === "follower" && !config.masterUrl) {
    log("error", "role=follower but config.masterUrl is missing: screens cannot sync and keyboard commands go nowhere");
  }

  return { config, configPath, created };
}
