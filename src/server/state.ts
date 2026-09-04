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
 */

import type { AppConfig, Cue, Lang, Phase, PlaybackState, Scene, SceneTheme, ShowFile, ShowState } from "../shared/types";
import type { ClockMsg, Command, ReportMsg } from "../shared/protocol";
import { CueTracker } from "./cues";

export interface DirectorHooks {
  /** Broadcast `applyCmd` to all screens. */
  onApplyCmd(cmd: Command): void;
  /** The ShowState changed (state / scene / theme / lang / counts ...) — broadcast `state`. */
  onStateChange(state: ShowState, reason: string): void;
  /** A cue fired (auto or manual). */
  onCueFired(cue: Cue, manual: boolean): void;
  /** Something for the run log. */
  onLog(kind: string, data?: unknown): void;
  /** A new run started (`start` command). */
  onRunStart(): void;
}

export interface DispatchResult {
  ok: boolean;
  reason?: string;
}

const LANGS: readonly Lang[] = ["ro", "en", "fr"];
/** Reports arriving this soon after a time-changing command are ignored (they predate the command). */
const REPORT_GRACE_MS = 600;
const DEFAULT_LEAD_IN_SEC = 10;

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
    default:
      return null;
  }
}

export class ShowDirector {
  private show: ShowFile;
  private state: PlaybackState = "idle";
  /** Phase we are in (kept through `paused` and `ended`); null in idle. */
  private phase: Phase | null = null;
  private anchor = { phaseTime: 0, serverTimeMs: Date.now(), rate: 1 };
  private lang: Lang;
  private videoPath: string;
  private videoReady = false;
  private clockSourceConnected = false;
  private screens = 0;
  private tablets = 0;
  private lastCmdAtMs = 0;
  private lastSnapshotKey = "";
  volumes: { voice: number; sfx: number };
  readonly cues: CueTracker;

  constructor(
    show: ShowFile,
    config: AppConfig,
    private readonly hooks: DirectorHooks,
  ) {
    this.show = show;
    this.lang = config.lang;
    this.videoPath = config.video.path;
    this.volumes = { voice: config.audio.voiceVolume, sfx: config.audio.sfxVolume };
    this.cues = new CueTracker(show, {
      onFired: (cue, manual) => this.hooks.onCueFired(cue, manual),
    });
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

  get leadInSec(): number {
    const v = this.show.launchLeadInSec;
    return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : DEFAULT_LEAD_IN_SEC;
  }

  private advancing(): boolean {
    return this.state === "playing" || this.state === "preshow" || this.state === "epilogue";
  }

  /** Extrapolated phase time (seconds; negative during the launch lead-in). */
  now(atMs = Date.now()): number {
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

  getState(atMs = Date.now()): ShowState {
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
    };
  }

  getClock(atMs = Date.now()): ClockMsg {
    return { type: "clock", state: this.state, phaseTime: this.now(atMs), serverTimeMs: atMs, rate: this.currentRate() };
  }

  // ---------------------------------------------------------------------------
  // Inputs

  setCounts(screens: number, tablets: number): void {
    if (screens === this.screens && tablets === this.tablets) return;
    this.screens = screens;
    this.tablets = tablets;
    this.emitStateIfChanged("counts");
  }

  setClockSourceConnected(connected: boolean): void {
    if (this.clockSourceConnected === connected) return;
    this.clockSourceConnected = connected;
    if (!connected) {
      // Keep extrapolating from the last known anchor; nobody can vouch for the video any more.
      this.anchor = { phaseTime: this.now(), serverTimeMs: Date.now(), rate: this.anchor.rate || 1 };
      this.videoReady = false;
    }
    this.hooks.onLog("clock.source", { connected });
    this.emitStateIfChanged("clockSource");
  }

  /** Report from the clock-source screen (~4 Hz). */
  onReport(r: ReportMsg): void {
    const nowMs = Date.now();
    const prevReady = this.videoReady;
    this.videoReady = !!r.videoReady;
    if (nowMs - this.lastCmdAtMs < REPORT_GRACE_MS) {
      // The screen has not applied the last command yet; do not let its stale time win.
      if (prevReady !== this.videoReady) this.emitStateIfChanged("videoReady");
      return;
    }
    if (this.advancing() && typeof r.phaseTime === "number" && Number.isFinite(r.phaseTime)) {
      const rate = typeof r.rate === "number" && Number.isFinite(r.rate) ? r.rate : 1;
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

  /** Periodic tick (clockHz): advance cues, auto transitions, state change detection. */
  tick(nowMs = Date.now()): void {
    if (!this.advancing()) {
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
    if (this.state === "preshow" && this.show.preshowAutoStart) {
      const end = this.phaseEnd("preshow");
      if (end > 0 && t >= end) {
        this.dispatchCommand({ action: "start" }, "preshowAutoStart");
        return;
      }
    }
    this.emitStateIfChanged("tick");
  }

  /** Replace the show (reloadShow): statuses are recomputed for the current time. */
  setShow(show: ShowFile): void {
    this.show = show;
    this.cues.setShow(show);
    this.emitStateIfChanged("reloadShow");
  }

  // ---------------------------------------------------------------------------
  // Commands

  dispatchCommand(cmd: Command, source = "control"): DispatchResult {
    const res = this.apply(cmd);
    if (!res.ok) {
      this.hooks.onLog("cmd.rejected", { cmd, source, reason: res.reason });
      return res;
    }
    this.hooks.onLog("cmd", { cmd, source, state: this.state, phaseTime: this.now() });
    this.hooks.onApplyCmd(cmd);
    // Cues at exactly the new time fire right away (e.g. `at: -10` on start, `at: 0` on preshow).
    this.tick();
    this.emitStateIfChanged(`cmd:${cmd.action}`);
    return res;
  }

  private apply(cmd: Command): DispatchResult {
    switch (cmd.action) {
      case "preshow":
        this.enter("preshow", "preshow", 0, "cmd preshow");
        return { ok: true };
      case "start":
        this.hooks.onRunStart();
        this.enter("playing", "play", -this.leadInSec, "cmd start");
        return { ok: true };
      case "play":
        if (this.state === "idle") {
          this.hooks.onRunStart();
          this.enter("playing", "play", -this.leadInSec, "cmd play from idle");
          return { ok: true };
        }
        if (this.state !== "paused") return { ok: false, reason: "PLAY funcționează doar din PAUZĂ (folosește START)." };
        this.reanchor(this.now(), 1);
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
        this.reanchor(t, this.state === "paused" ? 0 : 1);
        this.cues.seekTo(t);
        return { ok: true };
      }
      case "skipToScene": {
        const scene = this.show.scenes.find((s) => s.id === cmd.sceneId);
        if (!scene) return { ok: false, reason: `Scenă necunoscută: ${cmd.sceneId}` };
        if (scene.phase === this.phase && this.state !== "ended") {
          // Same phase: a seek.
          this.reanchor(scene.start, this.state === "paused" ? 0 : 1);
          this.cues.seekTo(scene.start);
          return { ok: true };
        }
        const target: PlaybackState = scene.phase === "preshow" ? "preshow" : scene.phase === "play" ? "playing" : "epilogue";
        if (target === "playing") this.hooks.onRunStart();
        this.enter(target, scene.phase, scene.start, `skipToScene ${scene.id}`);
        return { ok: true };
      }
      case "restart":
        this.lastCmdAtMs = Date.now();
        this.cues.reset();
        this.phase = null;
        this.anchor = { phaseTime: 0, serverTimeMs: Date.now(), rate: 1 };
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
      default:
        return { ok: false, reason: "Comandă necunoscută." };
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
      this.lastCmdAtMs = Date.now();
      this.anchor = { phaseTime: end, serverTimeMs: Date.now(), rate: 0 };
      this.setState("ended", "video ended — waiting for operator (epilogueOnVideoEnd=false)");
    }
    this.emitStateIfChanged("videoEnded");
  }

  /** Enter a state/phase at phase time `t` (resets the cue tracker for the phase). */
  private enter(state: "preshow" | "playing" | "epilogue", phase: Phase, t: number, reason: string): void {
    this.phase = phase;
    this.reanchor(t, 1);
    this.cues.enterPhase(phase, t);
    this.setState(state, reason);
  }

  private reanchor(t: number, rate: number): void {
    this.lastCmdAtMs = Date.now();
    this.anchor = { phaseTime: t, serverTimeMs: this.lastCmdAtMs, rate };
  }

  private setState(next: PlaybackState, reason: string): void {
    if (next === this.state) return;
    const prev = this.state;
    this.state = next;
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
    const key = [s.state, s.sceneId, s.theme, s.lang, s.lastVoiceCueId, s.screensConnected, s.tabletsConnected, s.videoReady, s.rate].join("|");
    if (key === this.lastSnapshotKey) return;
    this.lastSnapshotKey = key;
    this.hooks.onStateChange(s, reason);
  }
}
