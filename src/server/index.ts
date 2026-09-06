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
import {createHmac,randomBytes,createHash} from "node:crypto";
import {freshExperience,validParticipants,tutorialSatisfied,narrate,stepVoice,narrationFinished} from './experience';
import type {NarratorManifest} from '../shared/experience';
import { MissionStore } from './mission-store';
import { MissionSession } from './mission-session';
import { loadScenario, type ScenarioPackage } from './scenario-catalog';
import {readScenarioDraft,editScenarioDraft} from './scenario-editor';
import {TechnicalRehearsal} from './technical-rehearsal';
import { SCENARIO_LABELS } from '../shared/mission';
import type {ScenarioId} from '../shared/scenario-engine';

import type { AppConfig, Cue, ShowFile } from "../shared/types";
import { SPEAKERS } from "../shared/types";
import { connectedWallScreens, samsungWallPreset, type WallRuntimeInfo } from "../shared/video-wall";
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
import { loadMusic, loadWaitingMusic } from './music';
import { createTtsRouter } from "./tts";
import { createAuth, type AuthEnv, type Principal } from "./auth";
import { createAdminRouter } from "./admin";
import { AuditLog } from "./audit";
import { PerfStore, createDebugRouter, createFrameExtractor, createFrameRouter } from "./debug";
import { runPreflight, type PreflightResult } from "./preflight";
import { rotateRuns } from "./maintenance";
import type { PerfSample } from "../shared/types";
import { TABLET_POSTS } from "../shared/types";
import { createDynamicVoiceBuilder } from "./features/dynamic-voice";
import { createLightsAdapter } from "./features/lights";
import { createShowEditor } from "./features/show-editor";
import { createCertificatesRouter } from "./features/certificates";
import { createDialogRouter } from "./features/dialog";
import { validateShowFile } from "./features/show-validate";
import { createAnalyticsRouter } from "./features/analytics";

const RUNS_KEEP = 20;
const MAX_PHOTO_BYTES = 1_500_000;

export interface ServerHandle {
  onDisplayTopologyChanged?(reason:string):void;
  port: number;
  urls: { control: string; tablet: string; ws: string; lanIp: string };
  stop(): Promise<void>;
  /** Command coming from the master screen's keyboard (via IPC) — treated like a console command. */
  dispatchCommand(cmd: Command): void;
}

export interface StartServerOptions {
  displayAutomation?: {inventory():Promise<unknown>;detect():Promise<unknown>;apply(optical?:unknown):Promise<unknown>};
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
  /** Bring the local audience/player window to the foreground (master only). */
  focusPlayer?: () => boolean;
  /** Local Electron evidence. Never trust a list of physical displays claimed by a WS client. */
  wallRuntime?: () => WallRuntimeInfo;
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
  /** R4 — user session (control) or screen token principal; null for tablets. */
  principal: Principal | null;
}

/** Resolve a config-relative asset path: appRoot first (user override), then the packaged resources dir. */
async function resolveAssetPath(appRoot: string, rel: string): Promise<string> {
  const candidates = [path.resolve(appRoot, rel)];
  if (typeof process.resourcesPath === "string") candidates.push(path.resolve(process.resourcesPath, rel));
  for (const p of candidates) {
    try {
      await fs.access(p);
      return p;
    } catch {
      /* next */
    }
  }
  return candidates[0];
}

function isPerfSample(x: unknown): x is Omit<PerfSample, "screenId"> & { screenId?: string } {
  if (!x || typeof x !== "object") return false;
  const s = x as Record<string, unknown>;
  const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  const numOrNull = (v: unknown) => v === null || num(v);
  return (
    num(s.videoDropped) &&
    num(s.videoTotal) &&
    numOrNull(s.videoFps) &&
    numOrNull(s.avatarFps) &&
    numOrNull(s.lipsyncLatencyMs) &&
    numOrNull(s.driftSec) &&
    numOrNull(s.roomLevel) &&
    numOrNull(s.heapMb) &&
    (s.audioOutput === null || typeof s.audioOutput === "string")
  );
}

const HELLO_TIMEOUT_MS = 5000;
const HEARTBEAT_MS = 15_000;
const MAX_WS_PAYLOAD = 64 * 1024;
const MAX_WS_PHOTO_PAYLOAD = Math.ceil(MAX_PHOTO_BYTES * 4 / 3) + 2048;
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

/**
 * Load + validate show.json through the single validator shared with the editor
 * (features/show-validate.ts) so every cue kind the editor can save is also accepted at startup.
 */
async function loadShowFile(showPath: string): Promise<ShowFile> {
  const raw = await fs.readFile(showPath, "utf8");
  const parsed: unknown = JSON.parse(raw);
  const v = validateShowFile(parsed);
  if (!v.ok || !v.show) throw new Error(`show.json invalid: ${v.errors.slice(0, 5).join("; ")}`);
  return v.show;
}

/** Previous hand-written validator (kept for reference / diffing; superseded by show-validate.ts). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function loadShowFileLegacy(showPath: string): Promise<ShowFile> {
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

  let legacyShow=show;
  const artifactSecret=randomBytes(32);
  const artifactToken=(run:string,post:number,revision:number)=>createHmac("sha256",artifactSecret).update(`${run}:${post}:${revision}`).digest("hex");
  const mission=new MissionSession(new MissionStore(path.join(path.dirname(opts.runsDir),'data','nava.sqlite')));
  let narrator:NarratorManifest|null=null;
  const musicPack=await loadMusic(opts.appRoot);
  const waitingMusic=await loadWaitingMusic(opts.appRoot);
  if(!musicPack)log('warn','Music: complete verified pack unavailable; procedural ambience remains available.');
  let narratorDirectory='';
  let narratorEnded='';
  try{
    let root=path.join(opts.appRoot,'assets','experience','voice','ro');
    try{await fs.access(root);}catch{if(typeof process.resourcesPath==='string')root=path.join(process.resourcesPath,'assets','experience','voice','ro');}
    const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8')) as NarratorManifest;
    for(const id of new Set([...Object.keys(manifest.clips),'intro','touch','age-5-10-practice','age-10-15-practice','age-15-18-practice','adults-practice','legacy-v3-practice','cooperate','ready','handoff','finale'])){
      const clip=manifest.clips[id];
      if(!clip||!/^[-\w]+\.mp3$/.test(clip.file)||!Number.isFinite(clip.durationSec)||clip.durationSec<=0||clip.durationSec>45||typeof clip.text!=='string')throw Error('Narator incomplet');
      if(createHash('sha256').update(await fs.readFile(path.join(root,clip.file))).digest('hex')!==clip.sha256)throw Error('Narator modificat');
    }
    narrator=manifest;
    narratorDirectory=root;
  }catch{log('warn','Tutorial: pachetul naratorului nu este disponibil sau valid. Tutorialul vocal este blocat.');}
  let activePackage=await loadScenario(opts.appRoot,'legacy-v3',legacyShow);
  let preparingPackage=false;
  let rehearsal:TechnicalRehearsal|undefined;
  let topologyApplying=false;
  let recoveryIssue:string|null=null;
  let photoRequest:{runId:string;photoRequestId:string;expiresAt:number}|null=null;
  if(mission.recovery){
    try {
      const recovered=await loadScenario(opts.appRoot,mission.recovery.scenarioId,legacyShow);
      if(recovered.hash!==mission.recovery.contentHash||recovered.issues.length)throw new Error('Pachetul salvat diferă sau vocile nu sunt disponibile.');
      activePackage=recovered;show=recovered.show;mission.record=mission.recovery;
    }catch(error){recoveryIssue=String(error);}
  }

  if(!mission.recovery)mission.record.contentHash=activePackage.hash;

  // --- run log ---------------------------------------------------------------
  const runlog = new RunLog(opts.runsDir, log);
  runlog.startRun("server start");
  await rotateRuns(opts.runsDir, RUNS_KEEP, [runlog.currentPath], log).catch((err) => log("warn", "runs rotation failed", { err: String(err) }));

  // --- auth (PIN sessions for the console, shared token for screens) ------------
  // Audit log lives next to users.json / sessions.json (data/ by default).
  const usersFile = config.security?.usersFile ?? "data/users.json";
  const auditLog = new AuditLog(path.resolve(opts.appRoot, path.dirname(usersFile), "audit.jsonl"), log);
  const auth = createAuth({
    config,
    appRoot: opts.appRoot,
    log,
    audit: auditLog,
    // An open console keeps the principal from its `hello`; close it so the change applies immediately.
    // 4401 → the console goes back to /login; 4409 → it reconnects and re-reads its role from /api/auth/me.
    onSessionsRevoked: (tokens, info) => {
      for (const c of clients) {
        if (c.principal?.kind !== "user" || !tokens.includes(c.principal.token)) continue;
        send(c, { type: "error", reason: info.reason, code: info.code });
        try {
          c.ws.close(info.code, info.reason.slice(0, 120));
        } catch {
          /* already closing */
        }
      }
    },
  });
  await auth.load();

  // --- perf + preflight -------------------------------------------------------
  const perf = new PerfStore();
  let preflight: PreflightResult | null = null;

  // --- clients ---------------------------------------------------------------
  const clients = new Set<Client>();
  const packageReady=new WeakMap<Client,string>();
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
  const spanPrimaryId = ()=>(config.screens.find(s => s.playAudio) ?? config.screens[0])?.id;
  const connectedScreenIds = (): string[] => {
    const ids: string[] = [];
    for (const c of clients) if (c.kind === "screen") ids.push(c.id);
    return config.displayMode === "span"
      ? connectedWallScreens(ids, spanPrimaryId(), opts.wallRuntime?.().verifiedScreenIds ?? [])
      : [...new Set(ids)];
  };
  const countScreens = (): number => connectedScreenIds().length;

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

  // --- lights (R4, Art-Net / Hue / none) -----------------------------------------
  const lights = createLightsAdapter(config.lights, log);

  const crewReadiness=()=>{
    const e=mission.record.experience;if(!e?.crew||mission.record.mode==='diagnostic')return null;
    const posts=[...new Set(e.participants.map(seat=>Number(seat[0])))];
    const connected=new Set([...tablets.tablets.values()].filter(t=>t.connected&&t.post).map(t=>Number(t.post)));
    const missing=posts.filter(post=>!connected.has(post));
    return {required:posts.length,connected:posts.filter(post=>connected.has(post)).length,reasons:!posts.length?['Așteptăm cel puțin un personaj confirmat pe tabletă.']:missing.length?[`Posturi cu participanți de reconectat: ${missing.join(', ')}`]:[]};
  };
  // --- director --------------------------------------------------------------
  const director = new ShowDirector(show, config, {
    beforeCommand:(cmd,source)=>{
      if(source==='diagnostic')return;
      const e=mission.record.experience;
      if(['preshow','start'].includes(cmd.action)&&director.getState().state==='idle'){
        if(e?.crew?.open&&source.startsWith('autoRun'))return {ok:false,reason:'Operatorul confirmă încheierea îmbarcării înainte de plecare.'};
        const crew=crewReadiness();if(crew?.reasons.length)return {ok:false,reason:crew.reasons.join(' ')};
        if(e?.status==='pending'&&activePackage.id!=='legacy-v3'&&!narrator)return {ok:false,reason:'Vocile tutorialului lipsesc. Verifică pachetul sau omite explicit tutorialul din consolă.'};
        if(e?.crew?.open){e.crew.open=false;mission.record.progress.participants=[...e.participants];mission.store.save(mission.record);}
      }
      if(e?.status==='tutorial'&&!['restart','preflight','tabletSfx','setVolume','ambient','lights'].includes(cmd.action))return {ok:false,reason:'Tutorialul este activ. Folosește comenzile tutorialului sau pregătește un grup nou.'};
      if(['preshow','start'].includes(cmd.action)&&director.getState().state==='idle'&&e?.status==='pending'&&activePackage.id!=='legacy-v3'){
        if(!narrator)return {ok:false,reason:'Vocile tutorialului lipsesc. Verifică pachetul sau omite explicit tutorialul din consolă.'};
        e.status='tutorial';e.step='touch';e.epoch++;narrate(e,'intro',Date.now());mission.record.status='active';mission.record.revision++;mission.store.save(mission.record);
        queueMicrotask(()=>pushMission());return {ok:true};
      }
    },
    onApplyCmd: (cmd) => {
      if(cmd.action==='restart'){
        photoRequest=null;broadcast(['screen','tablet'],{type:'photo',action:'hide'});
        mission.reset(activePackage.id,activePackage.hash);
        director.bindMission({runId:mission.record.runId,serverEpoch:mission.serverEpoch,timelineEpoch:mission.record.timelineEpoch});
      }
      broadcast(["screen"], { type: "applyCmd", cmd, serverTimeMs: Date.now() });
    },
    onDynamicVoice: (msg) => {
      runlog.write("dynamicVoice", { cueId: msg.cueId, speaker: msg.speaker, chars: msg.text.length });
      broadcast(["screen", "control"], msg);
    },
    onPhoto: (msg) => {
      if(msg.action==='countdown')photoRequest={runId:mission.record.runId,photoRequestId:randomBytes(16).toString('hex'),expiresAt:Date.now()+20000};
      if(!photoRequest||photoRequest.runId!==mission.record.runId||Date.now()>photoRequest.expiresAt)return;
      broadcast(['screen','tablet','control'],{...msg,...photoRequest});
    },
    onLights: (theme, fadeSec, source) => lights.apply(theme, fadeSec, source),
    onPreflightRequest: () => void runPreflightNow().catch((err) => log("warn", "preflight failed", { err: String(err) })),
    onStateChange: (state) => {
      broadcast(["control", "tablet"], { type: "state", state });
      pushTabletView();
    },
    onCueFired: (cue, manual) => {
      runlog.write("cue", { id: cue.id, kind: cue.kind, phase: cue.phase, at: cue.at, manual });
      broadcast(["control"], { type: "cueFired", cue, serverTimeMs: Date.now() });
      pushTabletView();
      const branches=activePackage.branches[cue.id];
      if(branches&&!manual){
        const matches=branches.filter(b=>mission.conditions().has(b.condition));
        if(matches.length===1)queueMicrotask(()=>director.dispatchCommand({action:'fireCue',cueId:matches[0].id},'scenario.branch'));
        else log('error','Scenariu: ramură ambiguă',{cueId:cue.id});
      }
      if (activePackage.id==='legacy-v3' && cue.id === "tech-adaptive-select" && !manual) {
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
      const file = runlog.startRun(mission.record.mode==='diagnostic'?'diagnostic':'start');
      log("info", "new run", { file });
    },
  });

  director.setCrewReadinessProvider(crewReadiness);
  director.bindMission({runId:mission.record.runId,serverEpoch:mission.serverEpoch,timelineEpoch:mission.record.timelineEpoch});
  if(mission.recovery&&!recoveryIssue&&mission.record.checkpoint)director.restoreCheckpoint(mission.record.checkpoint);
  const pushMission=():void=>{
    director.notifyPreflight();
    const state=director.getState();
    for(const client of clients){
      if(!client.kind)continue;
      const post=client.kind==='tablet'?tablets.tablets.get(client.id)?.post??undefined:undefined;
      const snapshot=mission.snapshot(state,post);
      if(post)snapshot.certificateToken=artifactToken(snapshot.runId,post,snapshot.revision);
      if(post)snapshot.journalRetry=mission.record.journalRetries?.[String(post)]??0;
      send(client,{type:'mission',snapshot});
    }
  };

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
  const updateCounts = (): void => director.setCounts(countScreens(), tablets.connectedCount(), connectedScreenIds());

  // R4 wiring: readiness gets the preflight verdict; dynamic-voice cues read the tablets' answers.
  const voicesPrepared=()=>activePackage.id==='legacy-v3'||[...clients].filter(c=>c.kind==='screen').every(c=>packageReady.get(c)===activePackage.hash);
  director.setPreflightProvider(() => (preflight ? preflight.ok&&voicesPrepared()&&!recoveryIssue&&!(config.autoDisplays?.enabled&&opts.wallRuntime?.().issues.length) : null));
  director.setDynamicVoiceBuilder(
    createDynamicVoiceBuilder({
      getAnswers: () => tablets.toMsg().answers,
      getShow: () => director.getShow(),
      getPostLabels: () => ([1, 2, 3, 4, 5] as const).map((p) => TABLET_POSTS[p].lens),
    }),
  );

  const makeWelcome = (): WelcomeMsg => ({
    type: "welcome",
    serverTimeMs: Date.now(),
    state: director.getState(),
    show: director.getShow(),
    config: { lang: director.language, sync: config.sync },
  });

  // Preflight: verifies voice clips / film / avatar; feeds Readiness.assetsOk when the director supports it (D-01).
  const runPreflightNow = async (): Promise<PreflightResult> => {
    preflight = await runPreflight(director.getShow(), director.language, director.currentVariant, { appRoot: opts.appRoot, config, log });
    if (config.videoWall?.calibration) {
      preflight.ok = false;
      preflight.reasons.push("Calibrarea TV este activă: grila înlocuiește filmul. Dezactivează videoWall.calibration și repornește înainte de public.");
    }
    runlog.write("preflight", { ok: preflight.ok, voiceOk: preflight.voice.ok, voiceTotal: preflight.voice.total, reasons: preflight.reasons });
    director.notifyPreflight();
    broadcast(["control"], { type: "state", state: director.getState() });
    return preflight;
  };

  const reloadShow = async (): Promise<DispatchResult> => {
    try {
      const next = await loadShowFile(opts.showPath);
      legacyShow=next;activePackage=await loadScenario(opts.appRoot,'legacy-v3',next);mission.record.contentHash=activePackage.hash;
      director.setShow(next);
      showError = null;
      runlog.write("show.reload", { version: next.version, cues: next.cues.length });
      log("info", "show reloaded", { version: next.version, cues: next.cues.length });
      const welcome = makeWelcome();
      for (const c of clients) if (c.kind) send(c, welcome);
      pushTabletView(true);
      void runPreflightNow().catch((err) => log("warn", "preflight after reload failed", { err: String(err) }));
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
    if(rehearsal?.running)return {ok:false,reason:'Repetiția tehnică este în curs. Folosește Anulează repetiția.'};
    if(config.autoDisplays?.enabled&&['start','preshow','play','rehearse'].includes(cmd.action)){
      const issues=opts.wallRuntime?.().issues??[];if(issues.length)return {ok:false,reason:issues.join('; ')};
    }
    if(preparingPackage||topologyApplying)return {ok:false,reason:'Pregătirea este în curs.'};
    if(recoveryIssue&&cmd.action!=='restart'&&cmd.action!=='preflight')return {ok:false,reason:'Recuperarea necesită pregătirea unui grup nou: '+recoveryIssue};
    if(director.getState().suspended&&cmd.action!=='restart'&&cmd.action!=='preflight')return {ok:false,reason:'Reluați sau încheiați recuperarea din consolă.'};
    if(activePackage.id!=='legacy-v3'){
      if(['start','preshow','play','rehearse'].includes(cmd.action)&&!voicesPrepared())return {ok:false,reason:'Ecranele încă pregătesc vocile scenariului.'};
      if(['reloadShow','setVariant','setLang'].includes(cmd.action))return {ok:false,reason:'Profilul complet este fixat; editați pachetul pentru următoarea rulare.'};
      if(['start','preshow'].includes(cmd.action)&&activePackage.issues.length)return {ok:false,reason:activePackage.issues.join('; ')};
    }
    if(cmd.action==='restart'){
      if(mission.recovery&&mission.recovery.runId!==mission.record.runId){mission.store.save({...mission.recovery,status:'interrupted'});}
      director.resumeSuspended();mission.recovery=null;recoveryIssue=null;
    }
    if(cmd.action==='seek'||cmd.action==='skipToScene'){mission.seek();director.bindMission({runId:mission.record.runId,serverEpoch:mission.serverEpoch,timelineEpoch:mission.record.timelineEpoch});}
    if (cmd.action === "preflight") {
      const r = await runPreflightNow();
      return r.ok ? { ok: true } : { ok: false, reason: `Preflight cu probleme: ${r.reasons.join("; ")}` };
    }
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
    mission.checkpoint(director.getState());
    pushMission();
    return res;
  };

  // --- HTTP -------------------------------------------------------------------
  const app = new Hono<AuthEnv>();
  app.use("*", cors({ origin: "*", allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], allowHeaders: ["Content-Type", "Authorization"] }));
  app.use("*", auth.identify);
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
  app.get('/api/music/waiting',c=>waitingMusic?c.json(waitingMusic.metadata):c.json({ok:false},404));
  app.get('/api/music',c=>musicPack?c.json(musicPack.manifest):c.json({ok:false,reason:'Music pack unavailable'},503));
  app.get('/assets/music/:file',async c=>{
    if(waitingMusic&&c.req.param('file')===waitingMusic.metadata.file)return createStaticHandler({prefix:'/assets/music',dir:waitingMusic.directory})(c);
    if(!musicPack||!musicPack.manifest.tracks.some(t=>t.file===c.req.param('file')))return c.notFound();
    return createStaticHandler({prefix:'/assets/music',dir:musicPack.directory})(c);
  });
  app.get('/assets/experience/voice/ro/:file',async c=>{
    const file=c.req.param('file');
    if(!narrator||!Object.values(narrator.clips).some(clip=>clip.file===file))return c.notFound();
    return createStaticHandler({prefix:'/assets/experience/voice/ro',dir:narratorDirectory})(c);
  });
  for (const name of ["control", "tablet", "login", "debug", "analytics", "admin", "shared", "wall"] as const) {
    app.get(`/${name}`, (c) => c.redirect(`/${name}/`));
    app.get(`/${name}/*`, createStaticHandler({ prefix: `/${name}`, dir: path.join(opts.webDir, name) }));
  }

  // --- auth guards (R4) --------------------------------------------------------
  // public: /api/health, /api/urls, /api/qr, /api/auth/login|me, tablet WS, (/api/state when security.publicState)
  const viewer = auth.requireRole("viewer");
  const operator = auth.requireRole("operator");
  app.get('/api/scenarios/:id/draft',viewer,async c=>{
    try{return c.json(await readScenarioDraft(opts.appRoot,c.req.param('id') as ScenarioId));}catch{return c.json({ok:false,reason:'Pachet indisponibil'},404);}
  });
  app.patch('/api/scenarios/:id/draft',operator,async c=>{
    if(director.playbackState!=='idle'||director.getState().suspended||preparingPackage)return c.json({ok:false,reason:'Editarea cere o misiune în pregătire.'},409);
    preparingPackage=true;
    try{return c.json(await editScenarioDraft(opts.appRoot,c.req.param('id') as ScenarioId,await c.req.json()));}
    catch(error){return c.json({ok:false,reason:error instanceof Error?error.message:'Salvare nereușită'},409);}
    finally{preparingPackage=false;}
  });
  const diagnosticDir=path.join(path.dirname(opts.runsDir),'data','diagnostics');
  rehearsal=new TechnicalRehearsal({directory:diagnosticDir,scenario:()=>({id:activePackage.id,hash:activePackage.hash}),state:()=>({...director.getState(),readiness:director.readiness(false)}),samples:()=>perf.snapshot(),
    start:()=>{
      mission.reset(activePackage.id,activePackage.hash);mission.record.mode='diagnostic';
      delete mission.record.progress.participants;
      mission.record.experience={...freshExperience(),crew:undefined,participants:Array.from({length:10},(_,i)=>`${Math.floor(i/2)+1}${i%2?'B':'A'}`),status:'skipped'};
      director.bindMission({runId:mission.record.runId,serverEpoch:mission.serverEpoch,timelineEpoch:0});
      director.dispatchCommand({action:'setRate',rate:1},'diagnostic');director.dispatchCommand({action:'preshow'},'diagnostic');mission.checkpoint(director.getState());pushMission();
    },
    finish:()=>{mission.checkpoint(director.getState());director.dispatchCommand({action:'restart'},'diagnostic');pushMission();},
  });
  app.post('/api/diagnostics/cancel',operator,async c=>{await rehearsal?.cancel();return c.json({ok:true});});
  app.get('/api/diagnostics/latest',viewer,async c=>{
    try{return c.json(JSON.parse(await fs.readFile(path.join(diagnosticDir,'latest.json'),'utf8')));}catch{return c.json(null);}
  });
  app.post('/api/diagnostics/start',operator,async c=>{
    if(director.playbackState!=='idle'||preparingPackage||topologyApplying)return c.json({ok:false,reason:'Verificarea cere o misiune în pregătire.'},409);
    preparingPackage=true;
    try{
      const assets=await runPreflightNow(),readiness=director.readiness(),samples=perf.snapshot();
      const body=await c.req.json().catch(()=>({}));
      if(body?.mode==='rehearsal'){
        if(!assets.ok||!readiness.ready||!countScreens())return c.json({ok:false,reason:'Repetiția cere readiness complet și cel puțin un renderer real.'},409);
        return c.json(await rehearsal!.start(),202);
      }
      const inventory=await opts.displayAutomation?.inventory()??{available:false};
      const report={id:randomBytes(12).toString('hex'),at:new Date().toISOString(),kind:'preflight',scenario:activePackage.id,contentHash:activePackage.hash,
        softwareReady:assets.ok&&readiness.ready,assets,readiness,inventory,samples,
        physicalChecks:{panorama:'needs-hardware-verification',audibility:'needs-listening',touch:'needs-physical-tablets',opticalCalibration:'requires-real-reference-image'},
        note:'Preflight și telemetrie curentă. Acest raport nu certifică o repetiție completă cu filmul în redare.'};
      await fs.mkdir(diagnosticDir,{recursive:true});await fs.writeFile(path.join(diagnosticDir,report.id+'.json'),JSON.stringify(report,null,2),{flag:'wx'});
      await fs.writeFile(path.join(diagnosticDir,'latest.json'),JSON.stringify(report,null,2));return c.json(report);
    }finally{preparingPackage=false;}
  });
  app.get('/api/scenarios',viewer,async(c)=>{
    const catalog=await Promise.all((Object.keys(SCENARIO_LABELS) as ScenarioId[]).map(async id=>{
      try{const pack=await loadScenario(opts.appRoot,id,legacyShow);return {id,label:pack.label,ready:pack.issues.length===0,issues:pack.issues,revision:pack.hash.slice(0,12)};}
      catch{return {id,label:SCENARIO_LABELS[id],ready:false,issues:['Pachet indisponibil']};}
    }));
    return c.json({selected:activePackage.id,catalog});
  });
  app.post('/api/scenarios/select',operator,async(c)=>{
    const body=await c.req.json().catch(()=>null);
    if(!body||!(body.id in SCENARIO_LABELS))return c.json({ok:false,reason:'Scenariu invalid'},400);
    if(preparingPackage||topologyApplying||director.playbackState!=='idle'||director.getState().suspended)return c.json({ok:false,reason:'Selectarea se face înainte de show.'},409);
    preparingPackage=true;
    try{
      const next=await loadScenario(opts.appRoot,body.id,legacyShow);
      if(next.issues.length)return c.json({ok:false,reason:next.issues.join('; ')},409);
      const checked=await runPreflight(next.show,'ro',null,{appRoot:opts.appRoot,config,log});
      if(!checked.ok)return c.json({ok:false,reason:checked.reasons.join('; ')},409);
      activePackage=next;mission.reset(next.id,next.hash);director.setShow(next.show);
      director.bindMission({runId:mission.record.runId,serverEpoch:mission.serverEpoch,timelineEpoch:0});
      preflight=checked;tablets.clearAnswers();
      for(const client of clients)if(client.kind)send(client,makeWelcome());
      pushMission();return c.json({ok:true,selected:next.id});
    }catch{return c.json({ok:false,reason:'Pachetul nu a putut fi încărcat; selecția precedentă este păstrată.'},409);}
    finally{preparingPackage=false;}
  });
  app.get('/api/mission',viewer,c=>c.json(mission.snapshot(director.getState())));
  app.post('/api/mission/journal/retry',operator,async c=>{
    const body=await c.req.json().catch(()=>null),state=director.getState();
    if(!body||typeof body.runId!=='string'||!Number.isInteger(body.post)||body.post<1||body.post>5)return c.json({ok:false,reason:'Grup sau post invalid.'},400);
    if(body.runId!==mission.record.runId)return c.json({ok:false,reason:'Grupul s-a schimbat. Actualizează lista.'},409);
    if(preparingPackage||topologyApplying||recoveryIssue||rehearsal?.running||state.suspended||!['epilogue','ended'].includes(state.state))return c.json({ok:false,reason:'Jurnalul poate fi retrimis numai la finalul unei expediții nesuspendate.'},409);
    if(!mission.record.experience?.participants.some(seat=>Number(seat[0])===body.post))return c.json({ok:false,reason:'Acest post nu are participanți în expediție.'},409);
    const next=structuredClone(mission.record);next.journalRetries??={};next.journalRetries[String(body.post)]=(next.journalRetries[String(body.post)]??0)+1;next.revision++;
    try{mission.store.save(next);}catch{return c.json({ok:false,reason:'Cererea nu a putut fi păstrată. Încearcă din nou.'},503);}
    mission.record=next;pushMission();return c.json({ok:true});
  });
  app.get('/api/experience/voices',c=>narrator?c.json(narrator):c.json({ok:false,reason:'Pachetul naratorului lipsește.'},503));
  app.post('/api/experience/control',operator,async c=>{
    if(preparingPackage||topologyApplying||rehearsal?.running||recoveryIssue)return c.json({ok:false,reason:'Pregătirea sau verificarea instalației este în curs.'},409);
    const body=await c.req.json().catch(()=>null);
    if(!body||typeof body.action!=='string')return c.json({ok:false,reason:'Comandă invalidă.'},400);
    const state=director.getState();
    if(state.state!=='idle'||state.suspended)return c.json({ok:false,reason:'Tutorialul se controlează înainte de show. Încheie sau reia recuperarea mai întâi.'},409);
    if(body.runId&&body.runId!==mission.record.runId)return c.json({ok:false,reason:'Grupul s-a schimbat. Reîncarcă lista echipajului.'},409);
    const e=structuredClone(mission.record.experience??freshExperience()),now=Date.now();
    const fail=(reason:string)=>c.json({ok:false,reason},409);
    if(body.action==='releaseSeat'){
      if(!e.crew?.open||e.status!=='pending'||typeof body.seat!=='string'||! /^[1-5][AB]$/.test(body.seat))return fail('Redeschide alegerea personajelor înainte de a elibera un loc.');
      delete e.crew.characters[body.seat];e.participants=e.participants.filter(seat=>seat!==body.seat);
    }else if(body.action==='participants'){
      if(e.crew)return fail('Participanții își confirmă personajele pe tablete. Folosește Redeschide alegerea pentru modificări.');
      if(e.status==='tutorial'&&e.step!=='touch')return fail('Lista se fixează la recunoaștere. Repornește tutorialul pentru a adăuga participanți mai târziu.');
      if(!validParticipants(body.participants)||e.launchRequested)return fail('Selectează între unu și zece participanți, fără dubluri.');
      e.participants=[...body.participants];e.epoch++;
    }else if(body.action==='reopenCrew'){
      if(!e.crew)return fail('Pregătește un grup nou pentru selecția personajelor.');
      const crew={...e.crew,open:true},participants=[...e.participants];Object.assign(e,freshExperience(),{crew,participants,epoch:e.epoch+1});
      delete e.pausedAt;delete e.launchRequested;
    }else if(body.action==='start'){
      const ready=crewReadiness();if(ready?.reasons.length)return fail(ready.reasons.join(' '));
      if(!narrator)return fail('Pachetul vocal al naratorului nu este disponibil.');
      if(e.status==='tutorial')return fail('Tutorialul este deja activ.');
      const participants=e.participants,crew=e.crew?{...e.crew,open:false}:undefined;Object.assign(e,freshExperience(),{participants,crew,epoch:e.epoch+1,status:'tutorial'});delete e.pausedAt;delete e.launchRequested;narrate(e,'intro',now);
    }else if(body.action==='skip'){
      if(e.crew&&!e.participants.length)return fail('Confirmă cel puțin un personaj pe tabletă înainte de a omite tutorialul.');
      if(e.crew)e.crew.open=false;
      e.status='skipped';e.narration=null;e.launchRequested=false;delete e.pausedAt;e.epoch++;
    }else if(body.action==='launch'&&(e.status==='skipped'||e.status==='complete')){
      if(!director.readiness().ready||!voicesPrepared())return fail('Instalația și vocile nu sunt încă pregătite.');
      const result=await handleCommand({action:'preshow'},'tutorial.launch');return result.ok?c.json(result):fail(result.reason??'Pornire blocată.');
    }else if(e.status!=='tutorial')return fail('Pornește tutorialul mai întâi.');
    else if(body.action==='pause'){
      if(e.pausedAt===undefined)e.pausedAt=now;
    }else if(body.action==='resume'){
      if(e.pausedAt!==undefined){if(e.narration)e.narration.startedAt+=now-e.pausedAt;delete e.pausedAt;}
    }else if(body.action==='repeat'){
      if(e.launchRequested)return fail('Predarea către Căpitan este în curs.');
      narrate(e,stepVoice(e,mission.record.scenarioId),now);if(e.pausedAt!==undefined)e.pausedAt=now;
    }else if(body.action==='next'){
      if(!tutorialSatisfied(e)||!narrationFinished(e,narrator,now)||(e.narration&&narratorEnded!==e.narration.instance))return fail('Așteaptă explicația și răspunsurile participanților activi; poți ajusta lista sau omite tutorialul.');
      if(e.step==='ready')return fail('Echipajul este pregătit. Folosește Pornește călătoria.');
      e.step=e.step==='touch'?'practice':e.step==='practice'?'cooperate':'ready';e.epoch++;narrate(e,stepVoice(e,mission.record.scenarioId),now);
    }else if(body.action==='launch'){
      if(e.step!=='ready'||!tutorialSatisfied(e)||!narrationFinished(e,narrator,now)||(e.narration&&narratorEnded!==e.narration.instance)||e.launchRequested)return fail('Tutorialul nu este încă încheiat.');
      if(!director.readiness().ready||!voicesPrepared())return fail('Instalația și vocile misiunii trebuie să fie pregătite înainte de plecare.');
      e.launchRequested=true;narrate(e,'handoff',now);
    }else return c.json({ok:false,reason:'Comandă necunoscută.'},400);
    const next={...mission.record,experience:e,progress:{...mission.record.progress,...(e.crew?{participants:[...e.participants]}:{})},revision:mission.record.revision+1,status:e.status==='tutorial'?'active' as const:mission.record.status,checkpoint:state};
    mission.store.save(next);mission.record=next;pushMission();return c.json({ok:true,snapshot:mission.snapshot(state)});
  });
  app.get('/api/mission/accessibility',viewer,c=>c.json({posts:mission.record.accessibility}));
  app.get('/api/missions',viewer,c=>c.json({runs:mission.store.list().filter(r=>c.req.query('technical')==='1'||r.mode==='public').map(r=>({runId:r.runId,scenarioId:r.scenarioId,status:r.status,createdAt:r.createdAt,mode:r.mode}))}));
  app.get('/api/runs/:id/summary',viewer,c=>{
    const record=mission.store.get(c.req.param('id'));if(!record)return c.json({ok:false},404);
    return c.json({runId:record.runId,scenarioId:record.scenarioId,status:record.status,progress:record.progress});
  });
  app.post('/api/mission/accessibility',operator,async c=>{
    const body=await c.req.json().catch(()=>null);
    if(!body||![1,2,3,4,5].includes(body.post))return c.json({ok:false},400);
    try{mission.setAccessibility(body.post,body.settings);pushMission();return c.json({ok:true});}catch{return c.json({ok:false,reason:'Setări invalide'},400);}
  });
  app.get('/api/recovery',viewer,c=>c.json({pending:!!mission.recovery||!!director.getState().suspended,issue:recoveryIssue,mission:mission.snapshot(director.getState())}));
  app.post('/api/recovery/resume',operator,async c=>{
    if(recoveryIssue)return c.json({ok:false,reason:recoveryIssue},409);
    await runPreflightNow();if(!director.readiness().ready)return c.json({ok:false,reason:director.readiness().reasons.join('; ')},409);
    director.resumeSuspended();mission.recovery=null;
    if(mission.record.experience?.status==='tutorial'){
      const next=structuredClone(mission.record);delete next.experience!.pausedAt;
      narrate(next.experience!,stepVoice(next.experience!,next.scenarioId),Date.now());next.experience!.launchRequested=false;next.revision++;mission.store.save(next);mission.record=next;
    }
    pushMission();return c.json({ok:true});
  });
  app.get('/api/wall/inventory',viewer,async c=>c.json(await opts.displayAutomation?.inventory()??{available:false,reason:'Inventarul nativ cere Electron.'}));
  app.post('/api/wall/detect',operator,async c=>c.json(await opts.displayAutomation?.detect()??{available:false}));
  app.post('/api/wall/apply',auth.requireRole('admin'),async c=>{
    if(director.playbackState!=='idle'||topologyApplying||preparingPackage||!opts.displayAutomation)return c.json({ok:false,reason:'Aplicarea cere Electron și pregătire fără show activ.'},409);
    topologyApplying=true;
    try{const body=await c.req.json().catch(()=>({}));const result=await opts.displayAutomation.apply(body?.optical);director.updateRequiredScreens(config.screens.map(s=>s.id));updateCounts();return c.json({ok:true,result});}
    catch{return c.json({ok:false,reason:'Topologia nu a putut fi aplicată.'},409);}finally{topologyApplying=false;}
  });
  const protectLegacyEditor:import('hono').MiddlewareHandler<AuthEnv>=async(c,next)=>{
    if(activePackage.id!=='legacy-v3'&&c.req.method!=='GET')return c.json({ok:false,reason:'Show-ul activ este un pachet fixat. Selectați originalul pentru editorul legacy.'},409);
    await next();
  };
  app.use('/api/show',protectLegacyEditor);app.use('/api/show/*',protectLegacyEditor);
  if (!auth.security.publicState) app.use("/api/state", viewer);
  for (const p of ["/api/show", "/api/cues", "/api/config", "/api/wall", "/api/tablets", "/api/run", "/api/analytics", "/api/analytics/*", "/api/debug", "/api/debug/*"]) {
    app.use(p, viewer);
  }
  for (const p of ["/api/cmd", "/api/show/reload", "/api/show/*", "/api/player/focus", "/api/tablets/clear"]) {
    app.use(p, operator);
  }
  // Certificates: tablets (anonymous) POST their PNG; listing/downloading needs a logged-in viewer.
  app.on("GET", ["/api/certificates", "/api/certificates/*"], viewer);
  // writes on the show file (editor) need an operator even on the base path
  app.on(["PUT", "POST", "PATCH", "DELETE"], ["/api/show", "/api/show/*"], operator);
  app.use("/api/tts", auth.requireScreenOrRole("operator"));
  app.use("/api/tts/*", auth.requireScreenOrRole("operator"));
  app.use("/api/dialog", auth.requireScreenOrRole("operator"));
  app.use("/api/dialog/*", auth.requireScreenOrRole("operator"));
  app.route("/api/auth", auth.router);
  app.route("/api/users", auth.usersRouter);
  app.route("/api/admin", createAdminRouter(auth, auditLog));

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
  app.get("/api/wall", (c) => c.json({
    displayMode: config.displayMode ?? "windows",
    videoWall: config.videoWall ?? null,
    preset: samsungWallPreset(),
    screens: config.screens.map(s => ({id:s.id, displayIndex:s.displayIndex, roleLabel:s.roleLabel, showAvatar:s.showAvatar, playAudio:s.playAudio})),
    runtime: opts.wallRuntime?.() ?? {preview:true,displays:[],verifiedScreenIds:[],issues:["Diagnosticul ieșirilor Windows este disponibil în aplicația Electron."]},
  }));
  app.post("/api/player/focus", (c) => {
    const ok = opts.focusPlayer?.() ?? false;
    log(ok ? "info" : "warn", ok ? "player window focused from operator console" : "player focus requested but no local window is available");
    return c.json(ok ? { ok: true } : { ok: false, reason: "Fereastra playerului nu este disponibilă pe acest master." }, ok ? 200 : 503);
  });
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
    const who = auth.principalOf(c);
    const source = who?.kind === "user" ? `http:${who.name}` : "http";
    // `preflight` is handled here so it works even before state.ts learns the R4 commands.
    if (raw && typeof raw === "object" && (raw as { action?: unknown }).action === "preflight") {
      const r = await handleCommand({ action: "preflight" }, source);
      return c.json({ ...r, preflight, state: director.getState() }, r.ok ? 200 : 409);
    }
    const cmd = validateCommand(raw);
    if (!cmd) return c.json({ ok: false, reason: "Comandă invalidă" }, 400);
    const r = await handleCommand(cmd, source);
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

  // --- R4 features (Agent D / C) -------------------------------------------------
  const showEditor = createShowEditor({ showPath: opts.showPath, getShow: () => director.getShow(), reload: reloadShow, log });
  app.route("/api/show", showEditor.router); // PUT|POST / , PATCH /cue/:id, GET /backups, POST /restore/:file (GET / already served above)
  app.route(
    "/api/certificates",
    createCertificatesRouter({
      recordArtifact:(run,id,hash,file)=>{if(mission.store.artifact(run,id,hash,file)==='conflict')throw new Error('Artifact conflict');},
      authorizeUpload:body=>{
        if(!body.runId&&activePackage.id==='legacy-v3')return undefined;
        const r=typeof body.runId==='string'?mission.store.get(body.runId):null;
        if(!r||!['epilogue','ended'].includes(r.checkpoint?.state??''))return null;
        if(body.summaryRevision!==r.revision||body.certificateToken!==artifactToken(r.runId,Number(body.post),r.revision))return null;
        return r.runId;
      },
      runsDir: opts.runsDir,
      currentRunId: () => (runlog.currentPath ? path.basename(runlog.currentPath, ".jsonl") : null),
      log,
    }),
  );
  app.route("/api/dialog", createDialogRouter({ log, cacheDir: opts.cacheDir }));
  app.get("/api/lights", viewer, (c) => c.json(lights.status()));
  app.route("/api/analytics", createAnalyticsRouter({ runsDir: opts.runsDir, log })); // guarded viewer above

  // --- debug / frames (R4) -----------------------------------------------------
  const videoAbsPath = await resolveAssetPath(opts.appRoot, config.video.path);
  const frames = createFrameExtractor(videoAbsPath, opts.cacheDir, log);
  const clientById = (id: string): Client | undefined => {
    for (const c of clients) if (c.id === id) return c;
    return undefined;
  };
  app.route(
    "/api/debug",
    createDebugRouter({
      auth,
      config,
      appRoot: opts.appRoot,
      runsDir: opts.runsDir,
      cacheDir: opts.cacheDir,
      version,
      startedAt,
      log,
      perf,
      frames,
      getState: () => director.getState(),
      getHealth: () => ({
        ok: true,
        version,
        role: config.role,
        uptime: Math.round((Date.now() - startedAt) / 1000),
        screens: countScreens(),
        screenIds: connectedScreenIds(),
        tablets: tablets.connectedCount(),
        videoReady: director.isVideoReady,
        clockSource: clockSource ? clockSource.id : null,
        state: director.playbackState,
        port,
        urls,
        lights: lights.status(),
        readiness: director.readiness(),
      }),
      getClients: () =>
        [...clients].map((c) => ({ kind: c.kind, id: c.id, name: c.name, remote: c.remote, connectedAt: c.connectedAt, isClockSource: c.isClockSource })),
      getCueStatuses: () => ({ statuses: director.cues.statuses(), lastVoiceCueId: director.cues.voice?.cue.id ?? null }),
      getPreflight: () => preflight,
      runPreflight: runPreflightNow,
      rotateRuns: () => rotateRuns(opts.runsDir, RUNS_KEEP, [runlog.currentPath], log),
      ttsStats: () => tts.stats(),
      runlogPath: () => runlog.currentPath,
      runlogTail: (n) => runlog.tail(n),
      closeClient: (id) => {
        const c = clientById(id);
        if (!c) return false;
        try {
          c.ws.close(1000, "closed by operator");
        } catch {
          c.ws.terminate();
        }
        return true;
      },
      showError: () => showError,
    }),
  );
  app.route("/api/frame", createFrameRouter({ auth, frames, durationSec: () => director.getShow().videoDurationSec }));

  // --- listen ------------------------------------------------------------------
  const server = createAdaptorServer({ fetch: app.fetch, createServer: createHttpServer }) as Server;
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_WS_PHOTO_PAYLOAD });
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
    const authResult = auth.authenticateHello(msg);
    if (!authResult.ok) {
      log("warn", `ws hello rejected (${authResult.code}) for ${msg.client}`, { id: msg.id, remote: client.remote, reason: authResult.reason });
      send(client, { type: "error", reason: authResult.reason, code: authResult.code });
      client.ws.close(authResult.code, authResult.reason.slice(0, 120));
      return;
    }
    client.principal = authResult.principal;
    client.kind = msg.client;
    const rawId = typeof msg.id === "string" ? msg.id.replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 64) : "";
    client.id = rawId || `${msg.client}-${Math.random().toString(36).slice(2, 8)}`;
    client.name =
      msg.client !== "tablet" && typeof msg.name === "string"
        ? msg.name.replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, 32)
        : undefined;
    const expectedClockId = config.displayMode === "span" ? spanPrimaryId() : config.screens[0]?.id;
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
    pushMission();
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
    if(activePackage.id!=='legacy-v3'&&!['set-post','ping'].includes(msg.event.kind))return;
    if(msg.event.kind==='choice'&&mission.record.experience?.crew){
      const post=tablets.tablets.get(client.id)?.post,e=mission.record.experience;
      if(e.crew?.open||!post||!e.participants.includes(`${post}${msg.event.zone}`)){send(client,{type:'error',reason:'Acest loc nu are un personaj confirmat pentru misiune.'});return;}
    }
    const fixed: TabletEventMsg = { ...msg, tabletId: client.id };
    const res = tablets.handleEvent(fixed, director.cues.tablet);
    if (res.error) send(client, { type: "error", reason: res.error });
    if (res.logKind) runlog.write(res.logKind, { tabletId: client.id, post: tablets.tablets.get(client.id)?.post, event: fixed.event });
    if (res.entityParams) {
      runlog.write("entityParams", { entity: res.entityParams.entity, params: res.entityParams.params });
      broadcast(["screen", "control"], res.entityParams);
    }
    if (res.startRequest) {
      const r = director.requestStart(`tablet:${client.id}`);
      runlog.write("tablet.startRequest", { tabletId: client.id, ok: r.ok, reason: r.ok ? undefined : r.reason });
      if (!r.ok) send(client, { type: "error", reason: r.reason ?? "pornirea nu este permisă acum" });
    }
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
      principal: null,
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
      const byteLength = Array.isArray(data) ? data.reduce((n,b) => n+b.length,0) : data.byteLength;
      if (byteLength > MAX_WS_PAYLOAD && client.kind !== "screen") {
        ws.close(1009,"mesaj prea mare");
        return;
      }
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
      if (byteLength > MAX_WS_PAYLOAD && msg.type !== "photoCaptured") {
        ws.close(1009,"mesaj prea mare");
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
        case 'experienceAudio':{
          const n=mission.record.experience?.narration;
          if(client.kind==='screen'&&client===clockSource&&n&&msg.instance===n.instance){
            if(msg.status==='ended')narratorEnded=msg.instance;
            else if(msg.status==='error')log('warn','Narator: redare nereușită; repetă explicația după verificarea sunetului.');
          }break;
        }
        case 'packageReady':
          if(client.kind==='screen'&&msg.ok===true&&msg.contentHash===activePackage.hash){packageReady.set(client,msg.contentHash);director.notifyPreflight();}
          break;
        case "hello":
          onHello(client, msg);
          break;
        case "report": {
          if(activePackage.id!=='legacy-v3'&&(msg.runId!==mission.record.runId||msg.serverEpoch!==mission.serverEpoch||msg.timelineEpoch!==mission.record.timelineEpoch))break;
          if (
            client.kind === "screen" &&
            client === clockSource &&
            PLAYBACK_STATES.has(msg.state) &&
            typeof msg.phaseTime === "number" &&
            Number.isFinite(msg.phaseTime) &&
            typeof msg.rate === "number" &&
            Number.isFinite(msg.rate) &&
            msg.rate >= 0 &&
            msg.rate <= 8 // rehearse mode runs up to 8x
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
          if (client.principal?.kind === "user" && client.principal.role === "viewer") {
            send(client, { type: "error", reason: "rolul viewer nu poate trimite comenzi", code: 4403 });
            break;
          }
          const rawCmd = msg.cmd as { action?: unknown } | undefined;
          if (rawCmd && rawCmd.action === "preflight") {
            void handleCommand({ action: "preflight" }, `${client.kind}:${client.id}`).then((r) => {
              if (!r.ok) send(client, { type: "error", reason: r.reason ?? "preflight cu probleme" });
            });
            break;
          }
          const cmd = validateCommand(msg.cmd);
          if (!cmd) {
            send(client, { type: "error", reason: "comandă invalidă" });
            break;
          }
          const who = client.principal?.kind === "user" ? client.principal.name : client.id;
          void handleCommand(cmd, `${client.kind}:${who}`).then((r) => {
            if (!r.ok) send(client, { type: "error", reason: r.reason ?? "comandă respinsă" });
          });
          break;
        }
        case "missionAction": {
          if(client.kind!=='tablet')break;
          const post=tablets.tablets.get(client.id)?.post;
          if(!post)break;
          try{const response=mission.accept(msg,post,director.getState());send(client,{type:'missionAck',...response});pushMission();}
          catch{log('error','mission persistence failed');send(client,{type:'missionAck',eventId:msg.eventId,ok:false,status:'storage-error'});}break;
        }
        case "tablet":
          onTabletEvent(client, msg);
          break;
        case "perf": {
          if (client.kind !== "screen") break;
          const s = (msg as { sample?: unknown }).sample;
          if (!isPerfSample(s)) break;
          perf.record({ ...s, screenId: client.id, atMs: typeof s.atMs === "number" ? s.atMs : Date.now() });
          break;
        }
        case "photoCaptured": {
          if (client.kind !== "screen"||!client.isClockSource) break;
          if(!photoRequest||msg.runId!==photoRequest.runId||msg.photoRequestId!==photoRequest.photoRequestId||Date.now()>photoRequest.expiresAt)break;
          const acceptedPhoto=photoRequest;photoRequest=null;
          const dataUrl = (msg as { dataUrl?: unknown }).dataUrl;
          if (typeof dataUrl !== "string" || !/^data:image\/(jpeg|png);base64,/.test(dataUrl) || dataUrl.length > MAX_PHOTO_BYTES * 1.4) {
            send(client, { type: "error", reason: "fotografie invalidă sau prea mare" });
            break;
          }
          const stamp = new Date().toISOString().replace(/[:.]/g, "-");
          const ext = dataUrl.startsWith("data:image/png") ? "png" : "jpg";
          const photosDir = path.join(opts.runsDir, "photos");
          void fs
            .mkdir(photosDir, { recursive: true })
            .then(() => fs.writeFile(path.join(photosDir, `${acceptedPhoto.runId}-${stamp}.${ext}`), Buffer.from(dataUrl.split(",")[1] ?? "", "base64")))
            .then(() => runlog.write("photo.saved", { file: `${acceptedPhoto.runId}-${stamp}.${ext}` }))
            .catch((err) => log("warn", "photo save failed", { err: String(err) }));
          broadcast(["screen", "tablet", "control"], { type: "photo", action: "show", dataUrl, showSec: 12,...acceptedPhoto });
          break;
        }
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
      if (client.kind === "screen") perf.forget(client.id);
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
    if(director.getState().state==='ended'&&mission.record.experience&&!mission.record.experience.finaleNarrated&&narrator?.clips.finale){
      const record=structuredClone(mission.record);record.experience!.finaleNarrated=true;narrate(record.experience!,'finale',Date.now());record.revision++;
      try{mission.store.save(record);mission.record=record;}catch{log('error','Finale checkpoint failed; will retry.');}
    }
    const e=mission.record.experience;
    if(e?.status==='tutorial'&&!director.getState().suspended&&narrationFinished(e,narrator,Date.now())&&(!e.narration||narratorEnded===e.narration.instance)){
      const next=structuredClone(e);let changed=false,launch=false;
      if(e.launchRequested){
        if(director.readiness().ready&&voicesPrepared()) {next.status='complete';next.narration=null;next.launchRequested=false;changed=true;launch=true;}
        else {next.launchRequested=false;next.narration=null;changed=true;}
      }else if(e.narration?.id==='intro'){narrate(next,'touch',Date.now());changed=true;}
      else if(e.step!=='ready'&&tutorialSatisfied(e)){
        next.step=e.step==='touch'?'practice':e.step==='practice'?'cooperate':'ready';next.epoch++;narrate(next,stepVoice(next,mission.record.scenarioId),Date.now());changed=true;
      }
      if(changed){
        const record={...mission.record,experience:next,revision:mission.record.revision+1};
        try{mission.store.save(record);mission.record=record;if(launch)void handleCommand({action:'preshow'},'tutorial.handoff').then(result=>{if(!result.ok)log('warn','Tutorial handoff blocked',{reason:result.reason});});}
        catch{log('error','Tutorial checkpoint failed; progression retained for retry.');}
      }
    }
    director.tick();
    pushMission();
    broadcast(["screen", "control"], director.getClock());
    pushTabletView();
  }, Math.round(1000 / clockHz));
  const stateTimer = setInterval(() => {
    if(!recoveryIssue)mission.checkpoint(director.getState());
    if (config.displayMode === "span") updateCounts();
    broadcast(["control", "tablet"], { type: "state", state: director.getState() });
    const samples = perf.snapshot();
    if (samples.length) broadcast(["control"], { type: "perfSummary", samples });
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
  log("info", `auth: PIN login at http://${lanIp}:${port}/login/ · debug at /debug/ · users file ${auth.users.path}`);
  runlog.write("server.start", { version, urls, showError });
  void runPreflightNow().catch((err) => log("warn", "startup preflight failed", { err: String(err) }));

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
    onDisplayTopologyChanged(reason:string):void {
      if(director.playbackState!=='idle'&&director.playbackState!=='ended')director.suspend();
      director.updateRequiredScreens(config.screens.map(s=>s.id));updateCounts();
      log('warn','Topologie modificată',{reason});pushMission();
    },
    async stop(): Promise<void> {
      await rehearsal?.cancel('Serverul se oprește.');
      if (stopped) return;
      stopped = true;
      if(!recoveryIssue)mission.checkpoint(director.getState());
      mission.store.close();
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
      lights.close();
      runlog.write("server.stop");
      await runlog.close();
      log("info", "server stopped");
    },
  };
}
