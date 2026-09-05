/**
 * CLI arguments + config.json: locate, create-from-example, parse, deep-merge with defaults (base sections +
 * the R4 sections from CONFIG_DEFAULTS_R4), validate every field, generate + persist `security.screenToken`
 * (master only), apply CLI overrides.
 *
 * Backward compatibility: a config.json written before R4 (no displayMode/security/ambient/lights/autoRun/
 * variant, no screens[].yawOffsetDeg) loads unchanged; every missing field takes its default. The only write
 * back into config.json is the generated screenToken (so followers can copy it) — nothing else is rewritten.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  CONFIG_DEFAULTS_R4,
  SPEAKERS,
  type AmbientConfig,
  type AppConfig,
  type AutoRunConfig,
  type LightsConfig,
  type ScreenConfig,
  type SecurityConfig,
  type Speaker,
} from "../shared/types";
import type { LogFn } from "./logger";

export interface CliArgs {
  /** --config <path>  (absolute, or relative to appRoot). Default: <appRoot>/config.json */
  configPath?: string;
  /** --dev  : open DevTools, isDev=true in the boot object. */
  dev: boolean;
  /** --role master|follower  (overrides config.role). */
  role?: AppConfig["role"];
  /** --screen <id>  : open only this screen from config.screens (windows mode; in span mode the window shrinks to it). */
  screen?: string;
  /** --windowed  : never kiosk/fullscreen (also sets config.dev.windowed = true for the renderers). */
  windowed: boolean;
  /**
   * --kiosk : force kiosk/fullscreen regardless of config.dev.windowed (Task Scheduler autostart, RUN.bat --kiosk).
   * Wins over --windowed when both are present.
   */
  kiosk: boolean;
}

/** Accepts `--key value` and `--key=value`; unknown args (Electron/Chromium switches) are ignored. */
export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { dev: false, windowed: false, kiosk: false };
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
      case "--kiosk":
        args.kiosk = true;
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

/** Mutable copies of the R4 defaults (CONFIG_DEFAULTS_R4 is `as const`). */
function r4Defaults(): Required<Pick<AppConfig, "displayMode" | "autostart" | "security" | "ambient" | "lights" | "autoRun">> {
  return {
    displayMode: CONFIG_DEFAULTS_R4.displayMode,
    autostart: CONFIG_DEFAULTS_R4.autostart,
    security: { ...CONFIG_DEFAULTS_R4.security },
    ambient: { ...CONFIG_DEFAULTS_R4.ambient },
    lights: { ...CONFIG_DEFAULTS_R4.lights },
    autoRun: { ...CONFIG_DEFAULTS_R4.autoRun, requireScreens: [...CONFIG_DEFAULTS_R4.autoRun.requireScreens] },
  };
}

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
  ...r4Defaults(),
};

/** security.screenToken accepted shape (the generated one is 32 hex chars). Placeholders like "<copiaza...>" fail. */
const SCREEN_TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

function finiteNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function nonEmptyString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
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

/** Drops `$comment`-style keys (any key starting with "$") at every level; the examples document themselves with them. */
function stripDollarKeys(obj: Json): Json {
  const out: Json = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith("$")) continue;
    out[k] = isObj(v) ? stripDollarKeys(v) : v;
  }
  return out;
}

/**
 * Deep merge: every key of `def` is completed from `user` (objects recurse; a non-object user value where an
 * object is expected is replaced by the default). Extra user keys (avatar.body, avatar.glbBySpeaker, variant,
 * screens[].yawOffsetDeg, ...) are carried over and validated afterwards.
 */
function deepMerge(def: Json, user: Json): Json {
  const out: Json = {};
  for (const [k, v] of Object.entries(user)) {
    if (k.startsWith("$")) continue;
    out[k] = isObj(v) ? stripDollarKeys(v) : v;
  }
  for (const [k, d] of Object.entries(def)) {
    const u = user[k];
    if (isObj(d)) out[k] = deepMerge(d, isObj(u) ? u : {});
    else if (u === undefined) out[k] = Array.isArray(d) ? [...d] : d;
  }
  return out;
}

function mergeConfig(user: Json): AppConfig {
  return deepMerge(DEFAULT_CONFIG as unknown as Json, user) as unknown as AppConfig;
}

function sanitizeScreens(raw: unknown, log: LogFn): ScreenConfig[] {
  const list: unknown[] = Array.isArray(raw) ? raw : [];
  const screens: ScreenConfig[] = [];
  const seen = new Set<string>();
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
    // R4: side-window yaw. 0 = frontal; clamped to +/-90 (beyond that the film would face backwards).
    if (item.yawOffsetDeg !== undefined) {
      if (typeof item.yawOffsetDeg === "number" && Number.isFinite(item.yawOffsetDeg)) {
        sc.yawOffsetDeg = Math.min(90, Math.max(-90, item.yawOffsetDeg));
      } else {
        log("warn", `config.screens[${i}].yawOffsetDeg "${String(item.yawOffsetDeg)}" invalid -> omitted (0)`);
      }
    }
    screens.push(sc);
  });
  if (screens.length === 0) {
    log("warn", "config.screens is empty or invalid; using the default single screen");
    screens.push({ ...DEFAULT_SCREEN });
  }
  return screens;
}

// ---------------------------------------------------------------------------------------------------------
// R4 sections
// ---------------------------------------------------------------------------------------------------------

function normalizeSecurity(raw: unknown, log: LogFn): SecurityConfig {
  const d = CONFIG_DEFAULTS_R4.security;
  const s = isObj(raw) ? raw : {};
  const operatorPin = typeof s.operatorPin === "string" || typeof s.operatorPin === "number" ? String(s.operatorPin).trim() : "";
  if (s.operatorPin !== undefined && !operatorPin) log("warn", `config.security.operatorPin invalid -> "${d.operatorPin}"`);
  const screenToken = typeof s.screenToken === "string" ? s.screenToken.trim() : "";
  return {
    operatorPin: operatorPin || d.operatorPin,
    // Validated (and generated/persisted) separately in loadConfig, because it depends on the role.
    screenToken,
    sessionTtlMin: Math.round(finiteNumber(s.sessionTtlMin, d.sessionTtlMin, 1, 60 * 24 * 365)),
    usersFile: nonEmptyString(s.usersFile, d.usersFile),
    publicState: bool(s.publicState, d.publicState),
  };
}

function normalizeAmbient(raw: unknown): AmbientConfig {
  const d = CONFIG_DEFAULTS_R4.ambient;
  const a = isObj(raw) ? raw : {};
  return {
    enabled: bool(a.enabled, d.enabled),
    volume: finiteNumber(a.volume, d.volume, 0, 1),
    duck: finiteNumber(a.duck, d.duck, 0, 1),
  };
}

function normalizeLights(raw: unknown, log: LogFn): LightsConfig {
  const l = isObj(raw) ? raw : {};
  const driver = oneOf(l.driver, ["none", "artnet", "hue"] as const, CONFIG_DEFAULTS_R4.lights.driver);
  if (l.driver !== undefined && driver !== l.driver) log("warn", `config.lights.driver "${String(l.driver)}" invalid -> "none"`);
  const out: LightsConfig = { driver };
  if (typeof l.host === "string" && l.host.trim()) out.host = l.host.trim();
  if (typeof l.universe === "number" && Number.isInteger(l.universe) && l.universe >= 0 && l.universe <= 32767) out.universe = l.universe;
  else if (l.universe !== undefined) log("warn", `config.lights.universe "${String(l.universe)}" invalid -> omitted (0..32767)`);
  if (typeof l.hueUser === "string" && l.hueUser.trim()) out.hueUser = l.hueUser.trim();
  if (typeof l.groupId === "string" || typeof l.groupId === "number") out.groupId = String(l.groupId);
  if (driver !== "none" && !out.host) log("warn", `config.lights.driver "${driver}" needs lights.host (IP of the node/bridge)`);
  return out;
}

function normalizeAutoRun(raw: unknown, log: LogFn): AutoRunConfig {
  const d = CONFIG_DEFAULTS_R4.autoRun;
  const a = isObj(raw) ? raw : {};
  let requireScreens: string[] = [...d.requireScreens];
  if (Array.isArray(a.requireScreens)) {
    requireScreens = a.requireScreens.filter((v): v is string => typeof v === "string" && v.trim() !== "").map((v) => v.trim());
  } else if (a.requireScreens !== undefined) {
    log("warn", `config.autoRun.requireScreens must be an array of screen ids -> ${JSON.stringify(requireScreens)}`);
  }
  const startTrigger = oneOf(a.startTrigger, ["operator", "tablet", "immediate"] as const, d.startTrigger);
  if (a.startTrigger !== undefined && startTrigger !== a.startTrigger) {
    log("warn", `config.autoRun.startTrigger "${String(a.startTrigger)}" invalid -> "${d.startTrigger}"`);
  }
  return {
    enabled: bool(a.enabled, d.enabled),
    requireScreens,
    requireTablets: Math.round(finiteNumber(a.requireTablets, d.requireTablets, 0, 100)),
    startTrigger,
    resetAfterSec: finiteNumber(a.resetAfterSec, d.resetAfterSec, 0, 24 * 3600),
  };
}

function normalizeAvatarR4(avatar: AppConfig["avatar"], log: LogFn): void {
  const a = avatar as unknown as Json;
  if (a.body !== undefined) {
    if (a.body === "M" || a.body === "F") avatar.body = a.body;
    else {
      log("warn", `config.avatar.body "${String(a.body)}" invalid -> omitted (expected "M" or "F")`);
      delete avatar.body;
    }
  }
  if (a.glbBySpeaker !== undefined) {
    const out: Partial<Record<Speaker, string>> = {};
    if (isObj(a.glbBySpeaker)) {
      for (const [k, v] of Object.entries(a.glbBySpeaker)) {
        if (!(k in SPEAKERS)) log("warn", `config.avatar.glbBySpeaker: unknown speaker "${k}" ignored`);
        else if (typeof v !== "string" || !v.trim()) log("warn", `config.avatar.glbBySpeaker.${k} must be a GLB path -> ignored`);
        else out[k as Speaker] = v.trim();
      }
    } else {
      log("warn", "config.avatar.glbBySpeaker must be an object { SPEAKER: \"path.glb\" } -> ignored");
    }
    if (Object.keys(out).length > 0) avatar.glbBySpeaker = out;
    else delete avatar.glbBySpeaker;
  }
}

/** Writes only `security.screenToken` back into the user's file (everything else, `$comment` keys included, is kept). */
function persistScreenToken(configPath: string, raw: Json, token: string, log: LogFn): boolean {
  const security = isObj(raw.security) ? raw.security : {};
  const next: Json = { ...raw, security: { ...security, screenToken: token } };
  try {
    fs.writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`);
    return true;
  } catch (err) {
    log("error", `cannot persist security.screenToken into ${configPath} (read-only?) - the token is used for this run only`, err);
    return false;
  }
}

export interface LoadedConfig {
  config: AppConfig;
  configPath: string;
  /** true when config.json did not exist and was created (from config.example.json or built-in defaults). */
  created: boolean;
  /** true when security.screenToken was missing and a fresh one was generated (and, if possible, persisted). */
  screenTokenGenerated: boolean;
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

  // --- validation / normalization (base sections) -----------------------------------------------
  if (config.role !== "master" && config.role !== "follower") {
    log("warn", `config.role "${String(config.role)}" invalid -> "master"`);
    config.role = "master";
  }
  if (cli.role && cli.role !== config.role) {
    log("info", `--role ${cli.role} overrides config.role (${config.role})`);
    config.role = cli.role;
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
  config.video.preloadPoster = bool(config.video.preloadPoster, DEFAULT_CONFIG.video.preloadPoster);
  config.avatar.glb = nonEmptyString(config.avatar.glb, DEFAULT_CONFIG.avatar.glb);
  if (config.avatar.corner !== "bottom-left" && config.avatar.corner !== "bottom-right") config.avatar.corner = DEFAULT_CONFIG.avatar.corner;
  config.avatar.widthPercent = finiteNumber(config.avatar.widthPercent, DEFAULT_CONFIG.avatar.widthPercent, 5, 60);
  config.avatar.marginPx = finiteNumber(config.avatar.marginPx, DEFAULT_CONFIG.avatar.marginPx, 0, 500);
  normalizeAvatarR4(config.avatar, log);
  config.audio.voiceVolume = finiteNumber(config.audio.voiceVolume, DEFAULT_CONFIG.audio.voiceVolume, 0, 1);
  config.audio.sfxVolume = finiteNumber(config.audio.sfxVolume, DEFAULT_CONFIG.audio.sfxVolume, 0, 1);
  config.audio.outputDeviceId = nonEmptyString(config.audio.outputDeviceId, DEFAULT_CONFIG.audio.outputDeviceId);
  config.sync.clockHz = finiteNumber(config.sync.clockHz, DEFAULT_CONFIG.sync.clockHz, 1, 30);
  config.sync.seekThresholdSec = finiteNumber(config.sync.seekThresholdSec, DEFAULT_CONFIG.sync.seekThresholdSec, 0.01, 10);
  config.sync.rateNudge = finiteNumber(config.sync.rateNudge, DEFAULT_CONFIG.sync.rateNudge, 0, 0.2);
  config.dev.openDevTools = bool(config.dev.openDevTools, DEFAULT_CONFIG.dev.openDevTools);
  config.dev.windowed = bool(config.dev.windowed, DEFAULT_CONFIG.dev.windowed);
  const masterUrl = validWebSocketUrl(config.masterUrl);
  if (masterUrl) config.masterUrl = masterUrl;
  else if (config.masterUrl !== undefined) {
    log("warn", `config.masterUrl "${String(config.masterUrl)}" invalid -> removed (expected ws:// or wss:// URL)`);
    delete config.masterUrl;
  }
  config.screens = sanitizeScreens(raw.screens, log);

  // --- validation / normalization (R4 sections) ---------------------------------------------------
  const r4 = config as unknown as Json;
  const displayMode = oneOf(r4.displayMode, ["windows", "span"] as const, CONFIG_DEFAULTS_R4.displayMode);
  if (r4.displayMode !== undefined && displayMode !== r4.displayMode) {
    log("warn", `config.displayMode "${String(r4.displayMode)}" invalid -> "${displayMode}"`);
  }
  config.displayMode = displayMode;
  config.autostart = bool(r4.autostart, CONFIG_DEFAULTS_R4.autostart);
  config.security = normalizeSecurity(r4.security, log);
  config.ambient = normalizeAmbient(r4.ambient);
  config.lights = normalizeLights(r4.lights, log);
  config.autoRun = normalizeAutoRun(r4.autoRun, log);
  if (typeof r4.variant === "string" && r4.variant.trim()) config.variant = r4.variant.trim();
  else {
    if (r4.variant !== undefined && r4.variant !== null && r4.variant !== "") {
      log("warn", `config.variant "${String(r4.variant)}" invalid -> omitted (base script)`);
    }
    delete config.variant;
  }

  // --- security.screenToken: generate once on the master and persist it -----------------------------
  let screenTokenGenerated = false;
  if (!SCREEN_TOKEN_RE.test(config.security.screenToken)) {
    if (config.security.screenToken) {
      log("warn", `config.security.screenToken is not a valid token (16..128 chars [A-Za-z0-9_-]; placeholders do not count)`);
    }
    if (config.role === "master") {
      config.security.screenToken = crypto.randomBytes(16).toString("hex");
      screenTokenGenerated = true;
      const persisted = persistScreenToken(configPath, raw, config.security.screenToken, log);
      log(
        "warn",
        `security.screenToken generated (${config.security.screenToken.slice(0, 4)}...) and ${
          persisted ? `saved into ${configPath}` : "NOT saved"
        } -> copy the SAME value into "security.screenToken" of every follower's config.json, otherwise the master rejects their screens (4401)`,
      );
    } else {
      config.security.screenToken = "";
      log(
        "error",
        `role=follower but security.screenToken is empty/placeholder -> copy "security.screenToken" from the master's config.json into ${configPath}; until then the master rejects this PC's screens (4401)`,
      );
    }
  }

  // --- CLI overrides ---------------------------------------------------------------------------
  if (cli.kiosk) {
    if (cli.windowed) log("warn", "--kiosk and --windowed both given -> --kiosk wins");
    if (config.dev.windowed) log("info", "--kiosk overrides config.dev.windowed=true");
    config.dev.windowed = false;
  } else if (cli.windowed) {
    config.dev.windowed = true;
  }
  if (cli.screen) {
    const only = config.screens.filter((s) => s.id === cli.screen);
    if (only.length > 0) {
      config.screens = only;
      if (config.displayMode === "span") log("info", `--screen "${cli.screen}" in span mode -> the spanning window covers only that display`);
    } else {
      log(
        "warn",
        `--screen "${cli.screen}" not in config.screens (${config.screens.map((s) => s.id).join(", ")}) -> opening all screens`,
      );
    }
  }
  if (config.role === "follower" && !config.masterUrl) {
    log("error", "role=follower but config.masterUrl is missing: screens cannot sync and keyboard commands go nowhere");
  }
  if (config.autoRun.enabled) {
    const known = new Set(config.screens.map((s) => s.id));
    const remote = config.autoRun.requireScreens.filter((id) => !known.has(id));
    if (remote.length > 0) log("info", `autoRun.requireScreens waits for screens not on this PC (followers): ${remote.join(", ")}`);
  }

  return { config, configPath, created, screenTokenGenerated };
}
