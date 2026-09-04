/**
 * Player: owns the <video>, the PlaybackState machine and the phase clock, applies Commands
 * (always received via the server's `applyCmd`, on every screen) and drives the Timeline.
 *
 *   idle -> preshow -> playing <-> paused -> ended -> epilogue -> (restart) idle
 *
 * phaseTime: preshow/epilogue and the negative launch lead-in use a pausable timer;
 * once launch reaches zero, play time is video.currentTime.
 * On video `ended`, `ShowFile.epilogueOnVideoEnd` selects automatic epilogue or a final-frame hold.
 */

import type { AvatarController, VoiceEngine } from "../shared/contracts";
import type { Command } from "../shared/protocol";
import type { AppConfig, Cue, Lang, Phase, PlaybackState, ScreenConfig, ShowFile, ShowState } from "../shared/types";
import { describeError, type Logger } from "./log";
import { Timeline, type FireMode } from "./timeline";
import type { Countdown } from "./ui/countdown";
import type { Entities } from "./ui/entities";
import type { Osd } from "./ui/osd";
import type { Subtitles } from "./ui/subtitles";
import type { ThemeController } from "./ui/theme";

export interface PlayerDeps {
  video: HTMLVideoElement;
  show: ShowFile;
  config: AppConfig;
  screen: ScreenConfig;
  voice: VoiceEngine;
  avatar: AvatarController;
  subtitles: Subtitles;
  countdown: Countdown;
  entities: Entities;
  theme: ThemeController;
  osd: Osd;
  log: Logger;
  /** Re-reads show.json (cmd reloadShow). If it rejects, the current show is kept. */
  loadShow?: () => Promise<ShowFile>;
  onCueFired?: (cue: Cue, mode: FireMode) => void;
  /** Autoplay refused by the browser: the boot code shows the "click to start" veil. */
  onAutoplayBlocked?: () => void;
  onStateChange?: (state: PlaybackState) => void;
}

/** Pausable timer for the preshow / epilogue phases. */
class PhaseClock {
  private base = 0;
  private anchor = 0;
  private running = false;

  now(): number {
    return this.running ? this.base + (performance.now() - this.anchor) / 1000 : this.base;
  }
  set(t: number): void {
    this.base = t;
    this.anchor = performance.now();
  }
  start(at?: number): void {
    this.base = at !== undefined ? at : this.now();
    this.anchor = performance.now();
    this.running = true;
  }
  pause(): void {
    this.base = this.now();
    this.running = false;
  }
  isRunning(): boolean {
    return this.running;
  }
}

const TEST_LINE_RO = "Sistemele navei sunt online. Vă aud și vă văd, exploratori.";
/** Follower jumps larger than this use seek semantics (skip cues) instead of catching up. */
const BIG_JUMP_SEC = 2.0;
const RATE_DEADBAND_SEC = 0.02;

export class Player {
  readonly timeline: Timeline;
  private readonly video: HTMLVideoElement;
  private state: PlaybackState = "idle";
  private readonly clock = new PhaseClock();
  private lang: Lang;
  private sfxVolume: number;
  /** True while play phaseTime is negative and the video is frozen on frame zero. */
  private playLeadIn = false;
  private avatarVisible = false;
  private videoReady = false;
  private videoError: string | null = null;
  private buffering = false;
  private pendingSeek: number | null = null;
  private autoplayBlocked = false;
  private autoEpilogueTimer: ReturnType<typeof setTimeout> | null = null;
  private raf = 0;
  private lastOsd = 0;
  private remoteCounts = { screens: 0, tablets: 0 };
  private disposed = false;
  private readonly videoUrlLabel: string;

  constructor(private readonly deps: PlayerDeps) {
    this.video = deps.video;
    this.lang = deps.config.lang;
    this.sfxVolume = deps.config.audio.sfxVolume;
    this.videoUrlLabel = deps.config.video.path;
    this.timeline = new Timeline(
      {
        voice: deps.voice,
        avatar: deps.avatar,
        subtitles: deps.subtitles,
        countdown: deps.countdown,
        entities: deps.entities,
        theme: deps.theme,
        log: deps.log,
        getLang: () => this.lang,
        getSfxGain: () => this.sfxVolume,
        now: () => this.phaseTime(),
        ensureAvatarVisible: () => this.ensureAvatarVisible(),
        onCueFired: (cue, mode) => {
          if (mode !== "skipped") deps.log("info", `cue ${cue.id} (${cue.kind}) ${mode} @${this.phaseTime().toFixed(2)}`);
          if (cue.kind === "marker" && mode === "auto") deps.osd.note(`▸ ${cue.label}`);
          deps.onCueFired?.(cue, mode);
        },
      },
      deps.show,
    );
    this.wireVideo();
    this.deps.theme.apply(this.defaultTheme(), { fast: true });
    this.raf = requestAnimationFrame(this.tick);
  }

  // ---------------------------------------------------------------- lifecycle

  /** Set the video source (file:// URL) and start loading. */
  attach(videoUrl: string): void {
    this.video.style.objectFit = this.deps.config.video.fit;
    this.video.muted = true; // the film has no audio track
    this.video.loop = false;
    this.video.src = videoUrl;
    this.video.load();
    this.deps.log("info", `video src = ${videoUrl}`);
  }

  dispose(): void {
    this.disposed = true;
    this.clearAutoEpilogue();
    if (this.raf) cancelAnimationFrame(this.raf);
    this.timeline.reset();
  }

  setShow(show: ShowFile): void {
    this.timeline.setShow(show);
  }
  getShow(): ShowFile {
    return this.timeline.getShow();
  }
  setRemoteCounts(screens: number, tablets: number): void {
    this.remoteCounts = { screens, tablets };
  }

  // ---------------------------------------------------------------- snapshot

  getPlaybackState(): PlaybackState {
    return this.state;
  }

  phase(): Phase | null {
    switch (this.state) {
      case "preshow":
        return "preshow";
      case "playing":
      case "paused":
      case "ended":
        return "play";
      case "epilogue":
        return "epilogue";
      default:
        return null;
    }
  }

  phaseTime(): number {
    switch (this.state) {
      case "preshow":
      case "epilogue":
        return this.clock.now();
      case "playing":
      case "paused":
      case "ended":
        return this.playLeadIn ? this.clock.now() : (this.pendingSeek ?? this.video.currentTime);
      default:
        return 0;
    }
  }

  rate(): number {
    switch (this.state) {
      case "playing":
        return this.playLeadIn ? (this.clock.isRunning() ? 1 : 0) : this.video.paused ? 0 : this.video.playbackRate;
      case "preshow":
      case "epilogue":
        return this.clock.isRunning() ? 1 : 0;
      default:
        return 0;
    }
  }

  isClockAdvancing(): boolean {
    return this.rate() > 0;
  }

  duration(): number {
    const d = this.video.duration;
    return Number.isFinite(d) && d > 0 ? d : this.getShow().videoDurationSec;
  }

  sceneId(): string | null {
    return this.timeline.sceneAt(this.phaseTime())?.id ?? null;
  }

  isVideoReady(): boolean {
    return this.videoReady && !this.videoError;
  }
  isBuffering(): boolean {
    return this.buffering;
  }
  getLang(): Lang {
    return this.lang;
  }

  getState(): ShowState {
    return {
      state: this.state,
      phaseTime: this.phaseTime(),
      serverTimeMs: Date.now(),
      rate: this.rate(),
      sceneId: this.sceneId(),
      theme: this.deps.theme.current(),
      lang: this.lang,
      lastVoiceCueId: this.timeline.lastVoiceCueId(),
      screensConnected: this.remoteCounts.screens,
      tabletsConnected: this.remoteCounts.tablets,
      videoPath: this.videoUrlLabel,
      videoReady: this.isVideoReady(),
    };
  }

  // ---------------------------------------------------------------- commands

  apply(cmd: Command): void {
    this.deps.log("info", `apply ${cmd.action}`, cmd);
    try {
      switch (cmd.action) {
        case "preshow":
          this.enterPreshow(0, true);
          break;
        case "start":
          this.enterPlay(-this.launchLeadInSec(), true);
          break;
        case "play":
          this.cmdPlay();
          break;
        case "pause":
          this.cmdPause();
          break;
        case "seek":
          this.cmdSeek(cmd.time);
          break;
        case "skipToScene":
          this.cmdSkipToScene(cmd.sceneId);
          break;
        case "restart":
          this.enterIdle();
          break;
        case "epilogue":
          this.enterEpilogue(0, true);
          break;
        case "fireCue":
          this.timeline.fireById(cmd.cueId);
          break;
        case "stopVoice":
          this.timeline.stopVoice({ all: true });
          break;
        case "setVolume":
          if (typeof cmd.voice === "number") this.deps.voice.setVolume(clamp01(cmd.voice));
          if (typeof cmd.sfx === "number") this.sfxVolume = clamp01(cmd.sfx);
          break;
        case "setLang":
          this.setLang(cmd.lang);
          break;
        case "reloadShow":
          this.reloadShow();
          break;
        case "testAvatar":
          this.ensureAvatarVisible();
          void this.timeline.speak({ id: "test-avatar", speaker: "AVATAR_AI", text: TEST_LINE_RO, subtitle: true });
          break;
        case "identifyScreens":
          this.deps.osd.identify(3000);
          break;
        default: {
          const never: never = cmd;
          this.deps.log("warn", "comandă necunoscută", never);
        }
      }
    } catch (err) {
      this.deps.log("error", `apply(${cmd.action}) failed: ${describeError(err)}`);
    }
  }

  setLang(lang: Lang): void {
    this.lang = lang;
    this.deps.voice.prepare(lang).catch((err) => this.deps.log("warn", `voice.prepare(${lang}) failed: ${describeError(err)}`));
  }

  private reloadShow(): void {
    if (!this.deps.loadShow) return;
    this.deps.loadShow().then(
      (show) => this.setShow(show),
      (err) => this.deps.log("warn", `reloadShow failed (păstrez show-ul curent): ${describeError(err)}`),
    );
  }

  private cmdPlay(): void {
    switch (this.state) {
      case "idle":
        this.enterPlay(-this.launchLeadInSec(), true);
        break;
      case "preshow":
      case "epilogue":
        if (!this.clock.isRunning()) this.clock.start();
        break;
      case "paused":
        if (this.playLeadIn) {
          this.clock.start();
          this.setState("playing");
        } else {
          this.tryPlay();
        }
        break;
      case "ended":
        this.deps.log("info", "play ignorat: filmul s-a terminat (folosiți epilog / seek / restart)");
        break;
      case "playing":
        break;
    }
  }

  private cmdPause(): void {
    switch (this.state) {
      case "playing":
        if (this.playLeadIn) this.clock.pause();
        else {
          this.video.pause();
          this.video.playbackRate = 1;
        }
        this.setState("paused");
        break;
      case "preshow":
      case "epilogue":
        this.clock.pause();
        break;
      default:
        break;
    }
  }

  private cmdSeek(time: number): void {
    if (!Number.isFinite(time)) return;
    switch (this.phase()) {
      case "play": {
        const t = this.clampPhasePlayTime(time);
        const resume = this.state === "ended";
        if (t < 0) this.setLeadIn(t, this.state === "playing");
        else {
          this.playLeadIn = false;
          this.clock.pause();
          this.seekVideo(t);
        }
        this.timeline.seek(t);
        if (resume && this.playLeadIn) {
          this.clock.start();
          this.setState("playing");
        } else if (resume) {
          this.tryPlay();
        }
        break;
      }
      case "preshow":
      case "epilogue": {
        const t = Math.max(0, time);
        this.clock.set(t);
        this.timeline.seek(t);
        break;
      }
      default:
        this.deps.log("info", "seek ignorat în idle");
    }
  }

  private cmdSkipToScene(sceneId: string): void {
    const scene = this.getShow().scenes.find((s) => s.id === sceneId);
    if (!scene) {
      this.deps.log("warn", `skipToScene: scenă necunoscută "${sceneId}"`);
      return;
    }
    if (scene.phase === this.phase()) {
      this.cmdSeek(scene.start);
      return;
    }
    switch (scene.phase) {
      case "preshow":
        this.enterPreshow(scene.start, true);
        break;
      case "play":
        this.enterPlay(scene.start, true);
        break;
      case "epilogue":
        this.enterEpilogue(scene.start, true);
        break;
    }
  }

  // ---------------------------------------------------------------- transitions

  private setState(s: PlaybackState): void {
    if (this.state === s) return;
    this.state = s;
    this.deps.onStateChange?.(s);
  }

  private defaultTheme() {
    const first = this.getShow().scenes.find((s) => s.phase === "preshow") ?? this.getShow().scenes[0];
    return first?.theme ?? "prologue";
  }

  private enterIdle(): void {
    this.clearAutoEpilogue();
    this.playLeadIn = false;
    this.timeline.reset();
    this.deps.countdown.cancel();
    this.deps.entities.hideAll();
    this.clock.pause();
    this.clock.set(0);
    this.video.pause();
    this.video.playbackRate = 1;
    this.seekVideo(0);
    this.setState("idle");
    this.deps.theme.apply(this.defaultTheme(), { fast: true });
    if (this.avatarVisible) {
      this.avatarVisible = false;
      this.deps.avatar.setVisible(false, true);
    }
  }

  private enterPreshow(at: number, running: boolean): void {
    this.clearAutoEpilogue();
    this.playLeadIn = false;
    this.video.pause();
    this.video.playbackRate = 1;
    this.seekVideo(0);
    if (running) this.clock.start(at);
    else {
      this.clock.pause();
      this.clock.set(at);
    }
    this.setState("preshow");
    this.timeline.setPhase("preshow", at);
  }

  private enterPlay(at: number, play: boolean): void {
    this.clearAutoEpilogue();
    const t = this.clampPhasePlayTime(at);
    this.playLeadIn = t < 0;
    if (this.playLeadIn) this.setLeadIn(t, play);
    else {
      this.clock.pause();
      this.seekVideo(t);
    }
    this.setState("paused");
    this.timeline.setPhase("play", t);
    const d = this.video.duration;
    if (Number.isFinite(d) && t >= d - 0.05) {
      this.handleEnded();
      return;
    }
    if (play && this.playLeadIn) this.setState("playing");
    else if (play) this.tryPlay();
    else this.video.pause();
  }

  private enterEpilogue(at: number, running: boolean): void {
    this.clearAutoEpilogue();
    this.playLeadIn = false;
    this.video.pause();
    this.video.playbackRate = 1;
    if (running) this.clock.start(at);
    else {
      this.clock.pause();
      this.clock.set(at);
    }
    this.setState("epilogue");
    this.timeline.setPhase("epilogue", at);
  }

  private handleEnded(): void {
    if (this.phase() !== "play") return;
    this.video.playbackRate = 1;
    this.setState("ended");
    this.deps.log("info", "video ended — hold pe ultimul cadru, aștept operatorul (epilog)");
    if (this.getShow().epilogueOnVideoEnd) {
      // Leave enough time for the clock source's next report to tell the authoritative server
      // that the video ended. The server then broadcasts `epilogue` to every screen. In a
      // disconnected/offline run this local fallback still advances the show.
      this.autoEpilogueTimer = setTimeout(() => {
        this.autoEpilogueTimer = null;
        if (this.state === "ended") this.enterEpilogue(0, true);
      }, 750);
    }
  }

  private clearAutoEpilogue(): void {
    if (this.autoEpilogueTimer !== null) {
      clearTimeout(this.autoEpilogueTimer);
      this.autoEpilogueTimer = null;
    }
  }

  private ensureAvatarVisible(): void {
    if (this.avatarVisible || !this.deps.screen.showAvatar) return;
    this.avatarVisible = true;
    try {
      this.deps.avatar.setVisible(true, true);
    } catch (err) {
      this.deps.log("warn", `avatar.setVisible failed: ${describeError(err)}`);
    }
  }

  // ---------------------------------------------------------------- video helpers

  private clampPlayTime(t: number): number {
    const d = this.video.duration;
    const max = Number.isFinite(d) && d > 0 ? d : Number.POSITIVE_INFINITY;
    return Math.min(Math.max(0, t), max);
  }

  private launchLeadInSec(): number {
    const lead = this.getShow().launchLeadInSec;
    return Number.isFinite(lead) && lead >= 0 ? lead : 10;
  }

  private clampPhasePlayTime(t: number): number {
    return t < 0 ? Math.max(-this.launchLeadInSec(), t) : this.clampPlayTime(t);
  }

  /** Freeze frame zero and use the phase clock until it reaches the video timeline at zero. */
  private setLeadIn(t: number, running: boolean): void {
    this.playLeadIn = true;
    this.video.pause();
    this.video.playbackRate = 1;
    this.seekVideo(0);
    if (running) this.clock.start(t);
    else {
      this.clock.pause();
      this.clock.set(t);
    }
  }

  private finishLeadIn(): void {
    if (!this.playLeadIn) return;
    this.playLeadIn = false;
    this.clock.pause();
    this.seekVideo(0);
    this.timeline.update(0);
    if (this.state === "playing") this.tryPlay();
  }

  private seekVideo(t: number): void {
    if (this.video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      this.pendingSeek = null;
      try {
        this.video.currentTime = t;
      } catch (err) {
        this.deps.log("warn", `seek(${t}) failed: ${describeError(err)}`);
      }
    } else {
      this.pendingSeek = t;
    }
  }

  private tryPlay(): void {
    this.setState("playing");
    let p: Promise<void> | undefined;
    try {
      p = this.video.play();
    } catch (err) {
      this.deps.log("error", `video.play() threw: ${describeError(err)}`);
      return;
    }
    p?.catch((err: unknown) => {
      const name = err instanceof Error ? err.name : "";
      if (name === "AbortError") return; // interrupted by pause()/load(): harmless
      if (name === "NotAllowedError") {
        this.autoplayBlocked = true;
        this.deps.log("warn", "autoplay refuzat — aștept un gest al utilizatorului");
        this.deps.onAutoplayBlocked?.();
        return;
      }
      this.deps.log("error", `video.play() rejected: ${describeError(err)}`);
    });
  }

  /** Called by the boot code after a user gesture (veil click) if autoplay was refused. */
  resumeAfterGesture(): void {
    if (!this.autoplayBlocked) return;
    this.autoplayBlocked = false;
    if (this.state === "playing") this.tryPlay();
  }

  private wireVideo(): void {
    const v = this.video;
    const on = <K extends keyof HTMLMediaElementEventMap>(ev: K, fn: (e: HTMLMediaElementEventMap[K]) => void) => v.addEventListener(ev, fn);

    on("loadedmetadata", () => {
      this.videoReady = true;
      this.videoError = null;
      this.deps.osd.setError(null);
      this.deps.log("info", `video metadata: ${v.videoWidth}x${v.videoHeight}, ${v.duration.toFixed(2)} s`);
      if (this.pendingSeek !== null) {
        const t = this.pendingSeek;
        this.pendingSeek = null;
        this.seekVideo(t);
      } else {
        // Show frame 0 as a poster while idle.
        this.seekVideo(0);
      }
    });
    on("error", () => {
      const me = v.error;
      const code = me ? me.code : 0;
      const names: Record<number, string> = {
        1: "MEDIA_ERR_ABORTED",
        2: "MEDIA_ERR_NETWORK",
        3: "MEDIA_ERR_DECODE (codec nesuportat — folosiți H.264 4:2:0)",
        4: "MEDIA_ERR_SRC_NOT_SUPPORTED (fișier lipsă sau format nesuportat)",
      };
      const detail = `${names[code] ?? "eroare necunoscută"}${me?.message ? " — " + me.message : ""}`;
      this.videoError = detail;
      this.videoReady = false;
      this.buffering = false;
      this.deps.osd.setSpinner(false);
      this.deps.osd.setError(
        "VIDEO LIPSĂ",
        `${this.videoUrlLabel}\n${detail}\n\nVerificați config.json → video.path (relativ la folderul executabilului) sau rulați npm run media:transcode.`,
      );
      this.deps.log("error", `video error: ${detail}`, { src: v.currentSrc });
    });
    on("waiting", () => this.setBuffering(true));
    on("stalled", () => this.setBuffering(true));
    on("playing", () => this.setBuffering(false));
    on("canplay", () => this.setBuffering(false));
    on("seeked", () => {
      if (!v.paused) this.setBuffering(false);
    });
    on("ended", () => this.handleEnded());
  }

  private setBuffering(on: boolean): void {
    if (this.buffering === on) return;
    this.buffering = on;
    this.deps.osd.setSpinner(on && this.state === "playing");
  }

  // ---------------------------------------------------------------- follower reconciliation

  /**
   * Follower screens: align with the master clock. Returns the measured drift (expected - local)
   * in seconds for the OSD, or null when not applicable.
   */
  follow(master: PlaybackState, expected: number, masterRate: number, opts: { seekThresholdSec: number; rateNudge: number }): number | null {
    const thr = Math.max(0.05, opts.seekThresholdSec);
    switch (master) {
      case "idle":
        if (this.state !== "idle") this.enterIdle();
        return null;
      case "preshow":
      case "epilogue": {
        if (this.state !== master) {
          if (master === "preshow") this.enterPreshow(expected, masterRate > 0);
          else this.enterEpilogue(expected, masterRate > 0);
          return 0;
        }
        if (masterRate > 0 !== this.clock.isRunning()) {
          if (masterRate > 0) this.clock.start();
          else this.clock.pause();
        }
        const d = expected - this.clock.now();
        if (Math.abs(d) > thr) {
          this.clock.set(expected);
          this.timeline.seek(expected);
        }
        return d;
      }
      case "playing": {
        if (this.phase() !== "play") {
          this.enterPlay(expected, true);
          return 0;
        }
        if (expected < 0 || this.playLeadIn) {
          if (!this.playLeadIn) {
            this.setLeadIn(expected, true);
            this.timeline.seek(expected);
            this.setState("playing");
            return 0;
          }
          if (!this.clock.isRunning()) this.clock.start();
          const d = expected - this.clock.now();
          if (Math.abs(d) > thr) {
            this.clock.set(expected);
            this.timeline.seek(expected);
          }
          return d;
        }
        if (this.state !== "playing") this.tryPlay();
        return this.correctVideo(expected, thr, opts.rateNudge, true);
      }
      case "paused": {
        if (this.phase() !== "play") {
          this.enterPlay(expected, false);
          return 0;
        }
        if (expected < 0 || this.playLeadIn) {
          if (!this.playLeadIn) {
            this.setLeadIn(expected, false);
            this.timeline.seek(expected);
          } else {
            this.clock.pause();
            const d = expected - this.clock.now();
            if (Math.abs(d) > thr) {
              this.clock.set(expected);
              this.timeline.seek(expected);
            }
          }
          this.setState("paused");
          return expected - this.clock.now();
        }
        if (this.state === "playing") this.cmdPause();
        else this.setState("paused");
        return this.correctVideo(expected, thr, 0, false);
      }
      case "ended": {
        if (this.phase() !== "play") {
          this.enterPlay(this.duration(), false);
          return 0;
        }
        if (this.state === "ended") return 0;
        // Our video is still short of the end: only jump if clearly behind.
        const d = expected - this.video.currentTime;
        if (Math.abs(d) > Math.max(thr, 1.0)) this.seekVideo(this.clampPlayTime(expected));
        return d;
      }
    }
  }

  /** Drift correction in the play phase. Big jumps use timeline seek semantics (skip cues). */
  private correctVideo(expected: number, thr: number, nudge: number, playing: boolean): number {
    if (!this.videoReady) return 0;
    const cur = this.video.currentTime;
    const d = expected - cur;
    if (Math.abs(d) > thr) {
      const target = this.clampPlayTime(expected);
      if (Math.abs(d) > BIG_JUMP_SEC) this.timeline.seek(target);
      this.seekVideo(target);
      this.video.playbackRate = 1;
      return d;
    }
    if (playing && nudge > 0) {
      const want = Math.abs(d) < RATE_DEADBAND_SEC ? 1 : d > 0 ? 1 + nudge : 1 - nudge;
      if (this.video.playbackRate !== want) this.video.playbackRate = want;
    } else if (this.video.playbackRate !== 1) {
      this.video.playbackRate = 1;
    }
    return d;
  }

  // ---------------------------------------------------------------- frame loop

  private readonly tick = (now: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.tick);
    if (this.isClockAdvancing()) this.timeline.update(this.phaseTime());
    if (this.playLeadIn && this.state === "playing" && this.clock.now() >= 0) this.finishLeadIn();
    if (now - this.lastOsd > 120) {
      this.lastOsd = now;
      this.onOsd?.();
    }
  };

  /** Boot code hooks the OSD refresh here (needs sync status too). */
  onOsd: (() => void) | null = null;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
