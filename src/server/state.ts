/**
 * Authoritative show state + clock (the server is the authority; screens apply commands).
 *
 * Clock model: a single anchor { phaseTime, serverTimeMs, rate }. `now()` extrapolates from it
 * while the state advances (preshow / playing / epilogue). The clock-source screen re-anchors it
 * with `report` messages (~4 Hz); when no clock source is connected the anchor simply keeps
 * extrapolating (virtual clock) so followers / tablets / console still progress.
 *
 * Phase time can be NEGATIVE in the `play` phase: `start` enters at -launchLeadInSec (video frozen
 * on frame 0, countdown), the video starts at 0 (see ShowFile.launchLeadInSec).
 *
 * Commands mutate the state, are broadcast to ALL screens as `applyCmd`, and the cue tracker is
 * updated so console/tablets see fired cues, theme, subtitle and interaction.
 *
 * R4 additions (HANDOFF-LIVE.md §2, D-01/D-02/D-09):
 *  - Readiness gate: `preshowAutoStart` and the operator-absent `autoRun` mode only fire `start`
 *    when the required screens are connected, the reference video is loaded and the voice preflight
 *    did not fail. A manual `start` is always allowed (the readiness reasons are logged).
 *  - New commands: rehearse/setRate (nominal clock rate), autoRun, lights, ambient, say,
 *    setVariant, photo, preflight. Side effects that are not screen commands go through optional
 *    hooks (onDynamicVoice / onPhoto / onLights / onPreflightRequest) so index.ts can route them.
 *  - Cue side effects: `dynamic-voice` -> text built by the injected builder + `dynamicVoice`;
 *    `lights` and `theme` -> onLights; `photo` -> countdown/capture schedule; `ambient` -> nothing
 *    (the renderer's own timeline fires it, like sfx/countdown/entity).
 *  - Everything is testable without I/O: the clock (`now`) and the scheduler are injectable.
 */

import type {
  AppConfig,
  AutoRunConfig,
  Cue,
  DynamicVoiceCue,
  Lang,
  LightsConfig,
  Phase,
  PlaybackState,
  Readiness,
  Scene,
  SceneTheme,
  ShowFile,
  ShowState,
  Speaker,
} from "../shared/types";
import { CONFIG_DEFAULTS_R4, SPEAKERS } from "../shared/types";
import type { ClockMsg, Command, DynamicVoiceMsg, PhotoCapturedMsg, PhotoMsg, ReportMsg } from "../shared/protocol";
import { CueTracker } from "./cues";
import { SCENE_THEMES } from "./features/show-validate";

export interface DirectorHooks {
  /** Broadcast `applyCmd` to all screens. */
  onApplyCmd(cmd: Command): void;
  /** The ShowState changed (state / scene / theme / lang / counts / readiness ...) — broadcast `state`. */
  onStateChange(state: ShowState, reason: string): void;
  /** A cue fired (auto or manual). */
  onCueFired(cue: Cue, manual: boolean): void;
  /** Something for the run log. */
  onLog(kind: string, data?: unknown): void;
  /** A new run started (`start` command). */
  onRunStart(): void;
  // --- R4 (optional) -------------------------------------------------------------
  /** A runtime-built line to speak (cue `dynamic-voice`, command `say`) — broadcast to screens (+ console). */
  onDynamicVoice?(msg: DynamicVoiceMsg): void;
  /** Crew photo flow (countdown / capture / show / hide) — broadcast to screens + tablets (+ console). */
  onPhoto?(msg: PhotoMsg): void;
  /** Room lights scene (cue `lights`, cue `theme`, command `lights`) — hand to the lights adapter. */
  onLights?(theme: SceneTheme, fadeSec: number | undefined, source: "cue" | "theme" | "command"): void;
  /** Operator asked for a preflight re-check; run it and then call `director.notifyPreflight()`. */
  onPreflightRequest?(): void;
}

export interface DispatchResult {
  ok: boolean;
  reason?: string;
}

/** `() => boolean | null` — null = preflight not run yet. Supplied by the orchestrator (src/server/preflight.ts). */
export type PreflightProvider = () => boolean | null;

/** Builds the spoken text for a `dynamic-voice` cue (src/server/features/dynamic-voice.ts). */
export type DynamicVoiceBuilder = (cue: DynamicVoiceCue, lang: Lang) => DynamicVoiceMsg;

export interface DirectorOptions {
  /** Clock (ms epoch). Default Date.now — inject a virtual clock in tests. */
  now?: () => number;
  /** Delayed callbacks (photo countdown → capture, show → hide). Default setTimeout. */
  schedule?: (fn: () => void, ms: number) => void;
  preflight?: PreflightProvider;
  dynamicVoice?: DynamicVoiceBuilder;
}

interface ApplyResult extends DispatchResult {
  /** false = do not echo the command to screens as `applyCmd` (server-side or message-driven effects). */
  broadcast?: boolean;
}

const LANGS: readonly Lang[] = ["ro", "en", "fr"];
/** Reports arriving this soon after a time-changing command are ignored (they predate the command). */
const REPORT_GRACE_MS = 600;
const DEFAULT_LEAD_IN_SEC = 10;
const MIN_RATE = 0.25;
const MAX_RATE = 8;
const MAX_SAY_CHARS = 600;
const DEFAULT_PHOTO_COUNTDOWN_SEC = 3;
const DEFAULT_PHOTO_SHOW_SEC = 8;
const VARIANT_RE = /^[\w.+-]{1,40}$/;

export function emptyShow(): ShowFile {
  return {
    title: "(show lipsă)",
    version: "0",
    videoDurationSec: 0,
    timingStatus: "provisional",
    preshowAutoStart: false,
    launchLeadInSec: DEFAULT_LEAD_IN_SEC,
    epilogueOnVideoEnd: true,
    scenes: [],
    cues: [],
  };
}

/** Phase a playback state lives in (idle has none; `ended` depends on history — see ShowDirector.phase). */
export function phaseOf(state: PlaybackState): Phase | null {
  switch (state) {
    case "preshow":
      return "preshow";
    case "playing":
    case "paused":
      return "play";
    case "epilogue":
    case "ended":
      return "epilogue";
    default:
      return null;
  }
}

/** Small stable hash (base36) for cache ids of runtime-built lines. */
export function shortHash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function isTheme(v: unknown): v is SceneTheme {
  return typeof v === "string" && (SCENE_THEMES as readonly string[]).includes(v);
}

function validRate(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= MIN_RATE && v <= MAX_RATE;
}

/** Runtime validation of a command coming from the network. Returns null if malformed. */
export function validateCommand(x: unknown): Command | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const a = o.action;
  switch (a) {
    case "preshow":
    case "start":
    case "play":
    case "pause":
    case "restart":
    case "epilogue":
    case "stopVoice":
    case "reloadShow":
    case "testAvatar":
    case "identifyScreens":
    case "photo":
    case "preflight":
      return { action: a };
    case "seek":
      return typeof o.time === "number" && Number.isFinite(o.time) ? { action: "seek", time: o.time } : null;
    case "skipToScene":
      return typeof o.sceneId === "string" && o.sceneId ? { action: "skipToScene", sceneId: o.sceneId } : null;
    case "fireCue":
      return typeof o.cueId === "string" && o.cueId ? { action: "fireCue", cueId: o.cueId } : null;
    case "setVolume": {
      const voice = typeof o.voice === "number" && Number.isFinite(o.voice) ? Math.min(1, Math.max(0, o.voice)) : undefined;
      const sfx = typeof o.sfx === "number" && Number.isFinite(o.sfx) ? Math.min(1, Math.max(0, o.sfx)) : undefined;
      if (voice === undefined && sfx === undefined) return null;
      const cmd: Command = { action: "setVolume" };
      if (voice !== undefined) cmd.voice = voice;
      if (sfx !== undefined) cmd.sfx = sfx;
      return cmd;
    }
    case "setLang":
      return typeof o.lang === "string" && (LANGS as readonly string[]).includes(o.lang)
        ? { action: "setLang", lang: o.lang as Lang }
        : null;
    // --- R4 ---------------------------------------------------------------------
    case "rehearse":
    case "setRate":
      return validRate(o.rate) ? { action: a, rate: Math.round(o.rate * 100) / 100 } : null;
    case "autoRun":
    case "ambient":
      return typeof o.enabled === "boolean" ? { action: a, enabled: o.enabled } : null;
    case "lights":
      return isTheme(o.theme) ? { action: "lights", theme: o.theme } : null;
    case "say": {
      if (typeof o.speaker !== "string" || !(o.speaker in SPEAKERS)) return null;
      if (typeof o.text !== "string") return null;
      const text = o.text.replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_SAY_CHARS);
      if (!text) return null;
      return { action: "say", speaker: o.speaker as Speaker, text };
    }
    case "setVariant":
      if (o.variant === null) return { action: "setVariant", variant: null };
      return typeof o.variant === "string" && VARIANT_RE.test(o.variant) ? { action: "setVariant", variant: o.variant } : null;
    default:
      return null;
  }
}

export class ShowDirector {
  private show: ShowFile;
  private state: PlaybackState = "idle";
  /** Phase we are in (kept through `paused` and `ended`); null in idle. */
  private phase: Phase | null = null;
  private anchor: { phaseTime: number; serverTimeMs: number; rate: number };
  /** Rate used while advancing (1 = normal; `rehearse`/`setRate` change it). */
  private nominalRate = 1;
  private lang: Lang;
  private videoPath: string;
  private videoReady = false;
  private clockSourceConnected = false;
  private screens = 0;
  private tablets = 0;
  /** Ids of connected screens (null = only the count is known — legacy setCounts). */
  private screenIds: Set<string> | null = null;
  private lastCmdAtMs = 0;
  private lastSnapshotKey = "";
  // --- R4 -----------------------------------------------------------------------
  private readonly role: AppConfig["role"];
  private readonly configuredScreenIds: string[];
  private readonly autoRunCfg: AutoRunConfig;
  private autoRunEnabled: boolean;
  private startRequested: { source: string; atMs: number } | null = null;
  private endedAtMs: number | null = null;
  private blockedReasonsKey = "";
  private variant: string | null;
  private ambientEnabled: boolean;
  private readonly lightsDriver: LightsConfig["driver"];
  private preflight: PreflightProvider | null;
  private dynamicVoiceBuilder: DynamicVoiceBuilder | null;
  private pendingPhoto: { cueId: string | null; showSec: number } | null = null;
  /** Last captured crew photo (dataURL) — for the debug page / late-joining tablets. */
  lastPhoto: { cueId: string | null; dataUrl: string; atMs: number } | null = null;
  private readonly clock: () => number;
  private readonly schedule: (fn: () => void, ms: number) => void;
  volumes: { voice: number; sfx: number };
  readonly cues: CueTracker;

  constructor(
    show: ShowFile,
    config: AppConfig,
    private readonly hooks: DirectorHooks,
    opts: DirectorOptions = {},
  ) {
    this.clock = opts.now ?? (() => Date.now());
    this.schedule = opts.schedule ?? ((fn, ms) => void setTimeout(fn, ms));
    this.show = show;
    this.lang = config.lang;
    this.videoPath = config.video.path;
    this.volumes = { voice: config.audio.voiceVolume, sfx: config.audio.sfxVolume };
    this.anchor = { phaseTime: 0, serverTimeMs: this.clock(), rate: 1 };
    this.role = config.role;
    this.configuredScreenIds = (config.screens ?? []).map((s) => s.id);
    this.autoRunCfg = { ...CONFIG_DEFAULTS_R4.autoRun, ...(config.autoRun ?? {}) };
    this.autoRunEnabled = !!this.autoRunCfg.enabled;
    this.variant = typeof config.variant === "string" && config.variant ? config.variant : null;
    this.ambientEnabled = config.ambient?.enabled ?? CONFIG_DEFAULTS_R4.ambient.enabled;
    this.lightsDriver = config.lights?.driver ?? "none";
    this.preflight = opts.preflight ?? null;
    this.dynamicVoiceBuilder = opts.dynamicVoice ?? null;
    this.cues = new CueTracker(
      show,
      {
        onFired: (cue, manual) => {
          this.applyCueSideEffects(cue);
          this.hooks.onCueFired(cue, manual);
        },
      },
      this.clock,
    );
  }

  // ---------------------------------------------------------------------------
  // Read side

  getShow(): ShowFile {
    return this.show;
  }

  get playbackState(): PlaybackState {
    return this.state;
  }

  get currentPhase(): Phase | null {
    return this.phase;
  }

  get language(): Lang {
    return this.lang;
  }

  get isClockSourceConnected(): boolean {
    return this.clockSourceConnected;
  }

  get isVideoReady(): boolean {
    return this.videoReady;
  }

  /** Rate applied while advancing (1 normal, 4 = rehearsal ×4). */
  get rate(): number {
    return this.nominalRate;
  }

  get autoRunConfig(): AutoRunConfig {
    return { ...this.autoRunCfg, enabled: this.autoRunEnabled };
  }

  get isAutoRunEnabled(): boolean {
    return this.autoRunEnabled;
  }

  get currentVariant(): string | null {
    return this.variant;
  }

  get isAmbientEnabled(): boolean {
    return this.ambientEnabled;
  }

  get leadInSec(): number {
    const v = this.show.launchLeadInSec;
    return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : DEFAULT_LEAD_IN_SEC;
  }

  private advancing(): boolean {
    return this.state === "playing" || this.state === "preshow" || this.state === "epilogue";
  }

  /** Extrapolated phase time (seconds; negative during the launch lead-in). */
  now(atMs = this.clock()): number {
    if (!this.advancing()) return this.anchor.phaseTime;
    return this.anchor.phaseTime + ((atMs - this.anchor.serverTimeMs) / 1000) * this.anchor.rate;
  }

  currentRate(): number {
    return this.advancing() ? this.anchor.rate : 0;
  }

  currentScene(t = this.now()): Scene | null {
    if (!this.phase) return null;
    let best: Scene | null = null;
    for (const s of this.show.scenes) {
      if (s.phase !== this.phase) continue;
      if (s.start <= t && (best === null || s.start >= best.start)) best = s;
    }
    if (!best) {
      // Before the first scene of the phase (should not happen with a well-formed show): use the first one.
      for (const s of this.show.scenes) if (s.phase === this.phase && (best === null || s.start < best.start)) best = s;
    }
    return best;
  }

  currentTheme(t = this.now()): SceneTheme {
    if (this.cues.theme) return this.cues.theme;
    const scene = this.currentScene(t);
    if (scene) return scene.theme;
    return this.phase === "epilogue" ? "white" : "prologue";
  }

  /**
   * R4 — readiness gate. Required screens = autoRun.requireScreens ∪ (master: every configured screen id).
   * When only a count is known (legacy setCounts without ids) the count is compared to the number required.
   */
  readiness(): Readiness {
    const required: string[] = [];
    for (const id of [...this.autoRunCfg.requireScreens, ...(this.role === "master" ? this.configuredScreenIds : [])]) {
      if (id && !required.includes(id)) required.push(id);
    }
    let screensConnected: string[];
    let screensMissing: string[];
    if (this.screenIds) {
      screensConnected = [...this.screenIds].sort();
      screensMissing = required.filter((id) => !this.screenIds!.has(id));
    } else {
      screensConnected = [];
      screensMissing = this.screens >= required.length ? [] : required.slice(this.screens);
    }
    const tabletsRequired = Math.max(0, this.autoRunCfg.requireTablets | 0);
    const videoRequired = required.length > 0;
    const videoReady = this.videoReady;
    let assetsOk: boolean | null = null;
    if (this.preflight) {
      try {
        assetsOk = this.preflight();
      } catch {
        assetsOk = false;
      }
    }
    const reasons: string[] = [];
    if (screensMissing.length) reasons.push(`Ecrane lipsă: ${screensMissing.join(", ")}`);
    if (this.tablets < tabletsRequired) reasons.push(`Tablete conectate: ${this.tablets}/${tabletsRequired}`);
    if (videoRequired && !videoReady) reasons.push("Video neîncărcat pe ecranul de referință");
    if (assetsOk === false) reasons.push("Preflight voci: asset-e lipsă sau corupte");
    return {
      ready: reasons.length === 0,
      screensConnected,
      screensMissing,
      tabletsConnected: this.tablets,
      tabletsRequired,
      videoReady,
      assetsOk,
      reasons,
    };
  }

  getState(atMs = this.clock()): ShowState {
    const t = this.now(atMs);
    return {
      state: this.state,
      phaseTime: t,
      serverTimeMs: atMs,
      rate: this.currentRate(),
      sceneId: this.currentScene(t)?.id ?? null,
      theme: this.currentTheme(t),
      lang: this.lang,
      lastVoiceCueId: this.cues.voice?.cue.id ?? null,
      screensConnected: this.screens,
      tabletsConnected: this.tablets,
      videoPath: this.videoPath,
      videoReady: this.videoReady,
      readiness: this.readiness(),
      autoRun: this.autoRunEnabled,
      variant: this.variant,
      ambientEnabled: this.ambientEnabled,
      lightsDriver: this.lightsDriver,
    };
  }

  getClock(atMs = this.clock()): ClockMsg {
    return { type: "clock", state: this.state, phaseTime: this.now(atMs), serverTimeMs: atMs, rate: this.currentRate() };
  }

  // ---------------------------------------------------------------------------
  // Inputs

  /**
   * Connected screens/tablets. Pass `screenIds` so the readiness gate can name the missing screens;
   * without ids only the count is compared (see readiness()).
   */
  setCounts(screens: number, tablets: number, screenIds?: readonly string[]): void {
    const nextIds = screenIds ? new Set(screenIds) : null;
    const sameIds =
      (nextIds === null && this.screenIds === null) ||
      (nextIds !== null && this.screenIds !== null && nextIds.size === this.screenIds.size && [...nextIds].every((id) => this.screenIds!.has(id)));
    if (screens === this.screens && tablets === this.tablets && sameIds) return;
    this.screens = screens;
    this.tablets = tablets;
    this.screenIds = nextIds;
    this.emitStateIfChanged("counts");
  }

  /** R4 — preferred over setCounts: ids of connected screens + number of connected tablets. */
  setConnectedScreens(ids: readonly string[], tablets = this.tablets): void {
    this.setCounts(ids.length, tablets, ids);
  }

  setClockSourceConnected(connected: boolean): void {
    if (this.clockSourceConnected === connected) return;
    this.clockSourceConnected = connected;
    if (!connected) {
      // Keep extrapolating from the last known anchor; nobody can vouch for the video any more.
      this.anchor = { phaseTime: this.now(), serverTimeMs: this.clock(), rate: this.anchor.rate || this.nominalRate };
      this.videoReady = false;
    }
    this.hooks.onLog("clock.source", { connected });
    this.emitStateIfChanged("clockSource");
  }

  /** R4 — the orchestrator supplies the (cached, synchronous) result of the voice preflight. */
  setPreflightProvider(fn: PreflightProvider | null): void {
    this.preflight = fn;
    this.emitStateIfChanged("preflight");
  }

  /** R4 — call after an asynchronous preflight finished so the readiness snapshot is re-emitted. */
  notifyPreflight(): void {
    this.emitStateIfChanged("preflight");
  }

  /** R4 — the text builder for `dynamic-voice` cues (features/dynamic-voice.ts). */
  setDynamicVoiceBuilder(fn: DynamicVoiceBuilder | null): void {
    this.dynamicVoiceBuilder = fn;
  }

  /**
   * R4 (D-09) — a tablet asked to start the mission (`{kind:"choice", cueId:"__start__", zone:"A", value:"start"}`).
   * Honoured only in autoRun mode with startTrigger "tablet", from idle, when readiness is green.
   */
  requestStart(source: string): DispatchResult {
    if (!this.autoRunEnabled || this.autoRunCfg.startTrigger !== "tablet") {
      return { ok: false, reason: "Pornirea se face de la consola operatorului." };
    }
    if (this.state !== "idle") return { ok: false, reason: "Misiunea este deja în desfășurare." };
    const r = this.readiness();
    if (!r.ready) {
      this.hooks.onLog("start.request.blocked", { source, reasons: r.reasons });
      return { ok: false, reason: `Nava nu este pregătită: ${r.reasons.join("; ")}` };
    }
    this.startRequested = { source, atMs: this.clock() };
    this.hooks.onLog("start.request", { source });
    this.tick();
    return { ok: true };
  }

  /** R4 — the `center` screen captured the crew photo (`photoCaptured`): show it, then hide it. */
  onPhotoCaptured(msg: PhotoCapturedMsg): void {
    if (typeof msg.dataUrl !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(msg.dataUrl)) {
      this.hooks.onLog("photo.rejected", { reason: "dataUrl invalid" });
      return;
    }
    const nowMs = this.clock();
    this.lastPhoto = { cueId: msg.cueId ?? this.pendingPhoto?.cueId ?? null, dataUrl: msg.dataUrl, atMs: nowMs };
    const showSec = this.pendingPhoto?.showSec ?? DEFAULT_PHOTO_SHOW_SEC;
    this.pendingPhoto = null;
    this.hooks.onLog("photo.captured", { cueId: this.lastPhoto.cueId, bytes: msg.dataUrl.length, showSec });
    this.hooks.onPhoto?.({ type: "photo", action: "show", dataUrl: msg.dataUrl, showSec });
    if (showSec > 0) this.schedule(() => this.hooks.onPhoto?.({ type: "photo", action: "hide" }), showSec * 1000);
  }

  /** Report from the clock-source screen (~4 Hz). */
  onReport(r: ReportMsg): void {
    const nowMs = this.clock();
    const prevReady = this.videoReady;
    this.videoReady = !!r.videoReady;
    if (nowMs - this.lastCmdAtMs < REPORT_GRACE_MS) {
      // The screen has not applied the last command yet; do not let its stale time win.
      if (prevReady !== this.videoReady) this.emitStateIfChanged("videoReady");
      return;
    }
    if (this.advancing() && typeof r.phaseTime === "number" && Number.isFinite(r.phaseTime)) {
      const rate = typeof r.rate === "number" && Number.isFinite(r.rate) ? r.rate : this.nominalRate;
      // rate 0 from the screen (buffering stall) legitimately freezes the extrapolation.
      this.anchor = { phaseTime: r.phaseTime, serverTimeMs: nowMs, rate: Math.max(0, rate) };
    }
    // Video reached its end on the reference screen.
    if (r.state === "ended" && this.state === "playing") {
      this.videoEnded(false);
      return;
    }
    this.tick(nowMs);
  }

  /** Periodic tick (clockHz): advance cues, auto transitions, autoRun, state change detection. */
  tick(nowMs = this.clock()): void {
    if (!this.advancing()) {
      if (this.autoRunIdleOrEnded(nowMs)) return;
      this.emitStateIfChanged("tick");
      return;
    }
    const t = this.now(nowMs);
    this.cues.advance(t);
    if (this.state === "playing" && !this.clockSourceConnected && this.show.videoDurationSec > 0 && t >= this.show.videoDurationSec) {
      this.videoEnded(true);
      return;
    }
    if (this.state === "epilogue") {
      const end = this.phaseEnd("epilogue");
      if (end > 0 && t >= end) {
        this.anchor = { phaseTime: end, serverTimeMs: nowMs, rate: 0 };
        this.setState("ended", "epilogue finished");
      }
    }
    if (this.state === "preshow" && (this.show.preshowAutoStart || this.autoRunEnabled)) {
      const end = this.phaseEnd("preshow");
      if (end > 0 && t >= end && this.gatedStart(this.show.preshowAutoStart ? "preshowAutoStart" : "autoRun")) return;
    }
    this.emitStateIfChanged("tick");
  }

  /** Replace the show (reloadShow): statuses are recomputed for the current time. */
  setShow(show: ShowFile): void {
    this.show = show;
    this.cues.setShow(show);
    if (this.variant && !(show.variants && this.variant in show.variants)) {
      this.hooks.onLog("variant.reset", { variant: this.variant, reason: "varianta nu există în show-ul reîncărcat" });
      this.variant = null;
    }
    this.emitStateIfChanged("reloadShow");
  }

  // ---------------------------------------------------------------------------
  // Commands

  dispatchCommand(cmd: Command, source = "control"): DispatchResult {
    const res = this.apply(cmd, source);
    if (!res.ok) {
      this.hooks.onLog("cmd.rejected", { cmd, source, reason: res.reason });
      return { ok: false, reason: res.reason };
    }
    this.hooks.onLog("cmd", { cmd: this.loggableCommand(cmd), source, state: this.state, phaseTime: this.now() });
    if (res.broadcast !== false) this.hooks.onApplyCmd(cmd);
    // Cues at exactly the new time fire right away (e.g. `at: -10` on start, `at: 0` on preshow).
    this.tick();
    this.emitStateIfChanged(`cmd:${cmd.action}`);
    return { ok: true };
  }

  private loggableCommand(cmd: Command): Command {
    return cmd.action === "say" ? { ...cmd, text: cmd.text.slice(0, 200) } : cmd;
  }

  private apply(cmd: Command, source: string): ApplyResult {
    switch (cmd.action) {
      case "preshow":
        this.enter("preshow", "preshow", 0, "cmd preshow");
        return { ok: true };
      case "start":
        this.logReadinessForManualStart(source);
        this.hooks.onRunStart();
        this.enter("playing", "play", -this.leadInSec, "cmd start");
        return { ok: true };
      case "play":
        if (this.state === "idle") {
          this.logReadinessForManualStart(source);
          this.hooks.onRunStart();
          this.enter("playing", "play", -this.leadInSec, "cmd play from idle");
          return { ok: true };
        }
        if (this.state !== "paused") return { ok: false, reason: "PLAY funcționează doar din PAUZĂ (folosește START)." };
        this.reanchor(this.now(), this.nominalRate);
        this.setState("playing", "cmd play");
        return { ok: true };
      case "pause":
        if (this.state !== "playing") return { ok: false, reason: "PAUZĂ funcționează doar în timpul redării." };
        this.reanchor(this.now(), 0);
        this.setState("paused", "cmd pause");
        return { ok: true };
      case "seek": {
        if (!this.phase || this.state === "ended") return { ok: false, reason: "Nu se poate căuta în această stare." };
        const t = this.clampToPhase(this.phase, cmd.time);
        this.reanchor(t, this.state === "paused" ? 0 : this.nominalRate);
        this.cues.seekTo(t);
        return { ok: true };
      }
      case "skipToScene": {
        const scene = this.show.scenes.find((s) => s.id === cmd.sceneId);
        if (!scene) return { ok: false, reason: `Scenă necunoscută: ${cmd.sceneId}` };
        if (scene.phase === this.phase && this.state !== "ended") {
          // Same phase: a seek.
          this.reanchor(scene.start, this.state === "paused" ? 0 : this.nominalRate);
          this.cues.seekTo(scene.start);
          return { ok: true };
        }
        const target: PlaybackState = scene.phase === "preshow" ? "preshow" : scene.phase === "play" ? "playing" : "epilogue";
        if (target === "playing") this.hooks.onRunStart();
        this.enter(target, scene.phase, scene.start, `skipToScene ${scene.id}`);
        return { ok: true };
      }
      case "restart":
        this.lastCmdAtMs = this.clock();
        this.cues.reset();
        this.phase = null;
        this.anchor = { phaseTime: 0, serverTimeMs: this.clock(), rate: 1 };
        this.startRequested = null;
        this.pendingPhoto = null;
        this.setState("idle", "cmd restart");
        return { ok: true };
      case "epilogue":
        this.enter("epilogue", "epilogue", 0, "cmd epilogue");
        return { ok: true };
      case "fireCue": {
        const cue = this.cues.fireManual(cmd.cueId);
        if (!cue) return { ok: false, reason: `Cue necunoscut: ${cmd.cueId}` };
        return { ok: true };
      }
      case "stopVoice":
        this.cues.clearVoice();
        return { ok: true };
      case "setVolume":
        if (cmd.voice !== undefined) this.volumes.voice = cmd.voice;
        if (cmd.sfx !== undefined) this.volumes.sfx = cmd.sfx;
        return { ok: true };
      case "setLang":
        this.lang = cmd.lang;
        return { ok: true };
      case "reloadShow":
      case "testAvatar":
      case "identifyScreens":
        // Passthrough (reloadShow is performed by the server hub, which owns the file path).
        return { ok: true };
      // --- R4 -------------------------------------------------------------------
      case "rehearse":
      case "setRate": {
        if (!validRate(cmd.rate)) return { ok: false, reason: `Rata trebuie să fie între ${MIN_RATE} și ${MAX_RATE}.` };
        this.nominalRate = cmd.rate;
        if (this.advancing()) this.reanchor(this.now(), cmd.rate);
        return { ok: true };
      }
      case "autoRun":
        this.autoRunEnabled = cmd.enabled;
        if (!cmd.enabled) this.startRequested = null;
        this.blockedReasonsKey = "";
        return { ok: true, broadcast: false };
      case "lights":
        if (!isTheme(cmd.theme)) return { ok: false, reason: "Temă de lumini necunoscută." };
        this.hooks.onLights?.(cmd.theme, undefined, "command");
        return { ok: true, broadcast: false };
      case "ambient":
        this.ambientEnabled = cmd.enabled;
        return { ok: true };
      case "say": {
        const text = cmd.text.trim();
        if (!text || !(cmd.speaker in SPEAKERS)) return { ok: false, reason: "Text sau vorbitor invalid." };
        const cueId = `say-${shortHash(`${cmd.speaker}|${this.lang}|${text}`)}`;
        this.cues.setLiveVoice(cueId, cmd.speaker, text, this.phase ?? "play");
        this.hooks.onDynamicVoice?.({ type: "dynamicVoice", cueId, speaker: cmd.speaker, text, lang: this.lang, subtitle: true });
        return { ok: true, broadcast: false };
      }
      case "setVariant": {
        if (cmd.variant !== null && !(this.show.variants && cmd.variant in this.show.variants)) {
          return { ok: false, reason: `Variantă necunoscută: ${cmd.variant}` };
        }
        this.variant = cmd.variant;
        return { ok: true };
      }
      case "photo":
        this.startPhoto(DEFAULT_PHOTO_COUNTDOWN_SEC, DEFAULT_PHOTO_SHOW_SEC, null);
        return { ok: true, broadcast: false };
      case "preflight":
        this.hooks.onPreflightRequest?.();
        return { ok: true, broadcast: false };
      default:
        return { ok: false, reason: "Comandă necunoscută." };
    }
  }

  // ---------------------------------------------------------------------------
  // R4 internals

  /** Manual start is always allowed; the readiness reasons are written to the run log. */
  private logReadinessForManualStart(source: string): void {
    const r = this.readiness();
    this.hooks.onLog("start.readiness", { source, ready: r.ready, reasons: r.reasons, screensMissing: r.screensMissing, assetsOk: r.assetsOk });
  }

  /** Automatic `start` (preshowAutoStart / autoRun): only when readiness is green. Returns true if dispatched. */
  private gatedStart(source: string): boolean {
    const r = this.readiness();
    if (r.ready) {
      this.blockedReasonsKey = "";
      this.dispatchCommand({ action: "start" }, source);
      return true;
    }
    const key = r.reasons.join("|");
    if (key !== this.blockedReasonsKey) {
      this.blockedReasonsKey = key;
      this.hooks.onLog("autostart.blocked", { source, reasons: r.reasons });
    }
    return false;
  }

  /** Operator-absent mode: idle → preshow (immediate / tablet trigger), ended → idle after resetAfterSec. */
  private autoRunIdleOrEnded(nowMs: number): boolean {
    if (!this.autoRunEnabled) return false;
    if (this.state === "idle") {
      const trigger = this.autoRunCfg.startTrigger;
      const wanted = trigger === "immediate" || (trigger === "tablet" && this.startRequested !== null);
      if (!wanted) return false;
      const r = this.readiness();
      if (!r.ready) {
        const key = r.reasons.join("|");
        if (key !== this.blockedReasonsKey) {
          this.blockedReasonsKey = key;
          this.hooks.onLog("autostart.blocked", { source: "autoRun", reasons: r.reasons });
        }
        return false;
      }
      const source = this.startRequested ? `autoRun:${this.startRequested.source}` : "autoRun";
      this.startRequested = null;
      this.blockedReasonsKey = "";
      this.dispatchCommand({ action: "preshow" }, source);
      return true;
    }
    if (this.state === "ended" && this.autoRunCfg.resetAfterSec > 0 && this.endedAtMs !== null) {
      if (nowMs - this.endedAtMs >= this.autoRunCfg.resetAfterSec * 1000) {
        this.dispatchCommand({ action: "restart" }, "autoRun:reset");
        return true;
      }
    }
    return false;
  }

  private startPhoto(countdownSec: number, showSec: number, cueId: string | null): void {
    this.pendingPhoto = { cueId, showSec };
    this.hooks.onLog("photo.start", { cueId, countdownSec, showSec });
    this.hooks.onPhoto?.({ type: "photo", action: "countdown", countdownSec });
    const capture = () => this.hooks.onPhoto?.({ type: "photo", action: "capture" });
    if (countdownSec > 0) this.schedule(capture, countdownSec * 1000);
    else capture();
  }

  private buildDynamicVoice(cue: DynamicVoiceCue): DynamicVoiceMsg {
    if (this.dynamicVoiceBuilder) {
      try {
        return this.dynamicVoiceBuilder(cue, this.lang);
      } catch (err) {
        this.hooks.onLog("dynamicVoice.error", { cueId: cue.id, err: String(err) });
      }
    }
    const text = cue.fallbackText?.ro ?? cue.template?.ro.replace(/\{\{\s*\w+\s*\}\}/g, "").replace(/\s+/g, " ").trim() ?? "";
    return { type: "dynamicVoice", cueId: `dyn-${cue.id}-${shortHash(text)}`, speaker: cue.speaker, text, lang: this.lang, subtitle: true };
  }

  /** Server-side effects of cues that are not (only) mirrored by the renderer's timeline. */
  private applyCueSideEffects(cue: Cue): void {
    switch (cue.kind) {
      case "dynamic-voice": {
        const msg = this.buildDynamicVoice(cue);
        this.cues.setDynamicVoiceText(cue.id, msg.text);
        this.hooks.onLog("dynamicVoice", { cueId: cue.id, speaker: msg.speaker, chars: msg.text.length, text: msg.text.slice(0, 200) });
        if (msg.text) this.hooks.onDynamicVoice?.(msg);
        break;
      }
      case "lights":
        this.hooks.onLights?.(cue.theme, cue.fadeSec, "cue");
        break;
      case "theme":
        this.hooks.onLights?.(cue.theme, undefined, "theme");
        break;
      case "photo":
        this.startPhoto(cue.countdownSec ?? DEFAULT_PHOTO_COUNTDOWN_SEC, cue.showSec ?? DEFAULT_PHOTO_SHOW_SEC, cue.id);
        break;
      case "ambient":
        // Fired by every renderer's own timeline (like sfx/countdown/entity); the operator's on/off switch
        // travels separately as the `ambient` command.
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Internals

  /** The video finished (report from the clock source, or virtual clock): epilogue or hold in `ended`. */
  private videoEnded(virtual: boolean): void {
    this.hooks.onLog("video.ended", { phaseTime: this.now(), virtual });
    if (this.show.epilogueOnVideoEnd !== false) {
      this.enter("epilogue", "epilogue", 0, virtual ? "video ended (virtual clock)" : "video ended");
      this.hooks.onApplyCmd({ action: "epilogue" });
      this.tick();
    } else {
      const end = this.show.videoDurationSec > 0 ? this.show.videoDurationSec : this.now();
      this.lastCmdAtMs = this.clock();
      this.anchor = { phaseTime: end, serverTimeMs: this.clock(), rate: 0 };
      this.setState("ended", "video ended — waiting for operator (epilogueOnVideoEnd=false)");
    }
    this.emitStateIfChanged("videoEnded");
  }

  /** Enter a state/phase at phase time `t` (resets the cue tracker for the phase). */
  private enter(state: "preshow" | "playing" | "epilogue", phase: Phase, t: number, reason: string): void {
    this.phase = phase;
    this.reanchor(t, this.nominalRate);
    this.cues.enterPhase(phase, t);
    this.setState(state, reason);
  }

  private reanchor(t: number, rate: number): void {
    this.lastCmdAtMs = this.clock();
    this.anchor = { phaseTime: t, serverTimeMs: this.lastCmdAtMs, rate };
  }

  private setState(next: PlaybackState, reason: string): void {
    if (next === this.state) return;
    const prev = this.state;
    this.state = next;
    this.endedAtMs = next === "ended" ? this.clock() : null;
    this.hooks.onLog("state", { from: prev, to: next, reason, phaseTime: this.now() });
  }

  /** Valid time range of a phase: [min, max]. */
  private clampToPhase(phase: Phase, t: number): number {
    const min = phase === "play" ? -this.leadInSec : 0;
    const max = this.phaseEnd(phase);
    let v = Math.max(min, t);
    if (max > min) v = Math.min(v, max);
    return v;
  }

  /** End (seconds) of a phase = max `end` of its scenes (0 if unknown). */
  private phaseEnd(phase: Phase): number {
    let end = 0;
    for (const s of this.show.scenes) if (s.phase === phase && s.end > end) end = s.end;
    if (phase === "play" && this.show.videoDurationSec > 0) end = Math.max(end, this.show.videoDurationSec);
    return end;
  }

  /** Emit `state` when anything other than phaseTime/serverTimeMs changed. */
  private emitStateIfChanged(reason: string): void {
    const s = this.getState();
    const r = s.readiness;
    const key = [
      s.state,
      s.sceneId,
      s.theme,
      s.lang,
      s.lastVoiceCueId,
      s.screensConnected,
      s.tabletsConnected,
      s.videoReady,
      s.rate,
      s.autoRun,
      s.variant,
      s.ambientEnabled,
      r ? `${r.ready}:${r.assetsOk}:${r.screensMissing.join(",")}:${r.screensConnected.join(",")}:${r.reasons.join("|")}` : "",
    ].join("|");
    if (key === this.lastSnapshotKey) return;
    this.lastSnapshotKey = key;
    this.hooks.onStateChange(s, reason);
  }
}
