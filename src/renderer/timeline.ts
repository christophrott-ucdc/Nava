/**
 * Cue engine (BRIEF §4). The scheduling decisions (what fires, what re-arms, what is skipped,
 * derived theme/entity/ambient state) live in the pure module `cue-scheduler.ts` (unit-tested);
 * this class executes them against the voice engine, avatar, subtitles, countdown, entities,
 * theme and ambient bed. One voice at a time: a new voice preempts the previous one.
 * The timeline does not know about the video: the Player feeds it `phaseTime`.
 *
 * R4 cue kinds:
 *   dynamic-voice  -> log only; the SERVER composes the text and sends `dynamicVoice` (Player.speakDynamic)
 *   ambient        -> start/stop/crossfade of the procedural bed (voice/ambient.ts)
 *   lights         -> no-op on screens (server-side Art-Net/Hue adaptor), log only
 *   photo          -> log + remember the cue id; the SERVER drives the webcam via `photo` messages (photo.ts)
 */

import type { AvatarController, PlaybackHandle, VoiceClip, VoiceEngine } from "../shared/contracts";
import { SPEAKERS, type Cue, type CountdownCue, type Lang, type Phase, type PhotoCue, type SceneTheme, type ShowFile, type Speaker, type VoiceCue } from "../shared/types";
import { derivedState, dueCues, enterPhase, entityActions, explicitAmbientBeds, planSeek, retainOnReload, sceneAt, sortCues } from "./cue-scheduler";
import { estimateSpeechMs } from "./fallbacks";
import { describeError, type Logger } from "./log";
import type { Countdown } from "./ui/countdown";
import { isEntityId, type Entities } from "./ui/entities";
import type { Subtitles } from "./ui/subtitles";
import type { ThemeController } from "./ui/theme";
import type { AmbientEngine } from "./voice/ambient";

export type FireMode = "auto" | "manual" | "skipped";

export interface TimelineDeps {
  voice: VoiceEngine;
  avatar: AvatarController;
  subtitles: Subtitles;
  countdown: Countdown;
  entities: Entities;
  theme: ThemeController;
  /** R4 — procedural ambient bed; optional (screens with playAudio=false get a silent engine). */
  ambient?: AmbientEngine;
  log: Logger;
  getLang: () => Lang;
  /** Multiplier applied to sfx cue gains (config.audio.sfxVolume, adjustable via setVolume). */
  getSfxGain: () => number;
  /** R4 — playback rate (rehearse); scales subtitle holds. Default 1. */
  getRate?: () => number;
  /** Current phaseTime (drives the countdown so it pauses with the show). */
  now: () => number;
  /** Called before CAPITANUL speaks: the player reveals the GLB on the first lip-synced line. */
  ensureAvatarVisible: () => void;
  onCueFired?: (cue: Cue, mode: FireMode) => void;
  /** R4 — a `photo` cue fired (the server drives the actual capture through `photo` messages). */
  onPhotoCue?: (cue: PhotoCue) => void;
}

export interface SpeakRequest {
  id: string;
  speaker: Speaker;
  text: string;
  subtitle: boolean;
  /** Hold after audio end (ms). Default 800. */
  holdMs?: number;
  /** Production cues can refuse browser TTS and fall back to timed silence. */
  fallback?: VoiceCue["fallback"];
  /** R4 — language of the text (dynamicVoice carries its own); default: current show language. */
  lang?: Lang;
}

const SUBTITLE_HOLD_MS = 800;

export class Timeline {
  private show: ShowFile;
  private phase: Phase | null = null;
  private phaseCues: Cue[] = [];
  private readonly fired = new Set<string>();
  private lastTime = 0;
  private voiceSeq = 0;
  private current: { handle: PlaybackHandle; id: string } | null = null;
  private lastCue: string | null = null;
  private lastVoice: string | null = null;

  constructor(
    private readonly deps: TimelineDeps,
    show: ShowFile,
  ) {
    this.show = show;
    this.deps.ambient?.setExplicitBeds(explicitAmbientBeds(show));
  }

  // ------------------------------------------------------------------ state

  currentPhase(): Phase | null {
    return this.phase;
  }
  lastCueId(): string | null {
    return this.lastCue;
  }
  lastVoiceCueId(): string | null {
    return this.lastVoice;
  }
  getShow(): ShowFile {
    return this.show;
  }
  isCueFired(id: string): boolean {
    return this.fired.has(id);
  }

  /** Replace the show without retro-firing: cues already in the past become "fired". */
  setShow(show: ShowFile): void {
    this.show = show;
    this.deps.ambient?.setExplicitBeds(explicitAmbientBeds(show));
    if (this.phase === null) return;
    this.phaseCues = sortCues(show.cues, this.phase);
    const keep = retainOnReload(this.phaseCues, this.fired, this.lastTime);
    this.fired.clear();
    for (const id of keep) this.fired.add(id);
    this.deps.log("info", `show reloaded: ${show.cues.length} cues, ${show.scenes.length} scenes`);
  }

  /** Enter a phase at `phaseTime`. Cues strictly before `phaseTime` are skipped (derived state applied). */
  setPhase(phase: Phase | null, phaseTime: number): void {
    this.stopVoice();
    this.deps.countdown.cancel();
    this.phase = phase;
    this.fired.clear();
    this.lastTime = phaseTime;
    if (phase === null) {
      this.phaseCues = [];
      return;
    }
    this.phaseCues = sortCues(this.show.cues, phase);
    for (const c of enterPhase(this.phaseCues, phaseTime).skipped) {
      this.fired.add(c.id);
      this.deps.onCueFired?.(c, "skipped");
    }
    this.applyDerivedState(phaseTime);
  }

  /** Stop everything and leave the phase (idle). */
  reset(): void {
    this.setPhase(null, 0);
    this.deps.entities.hideAll();
    this.lastCue = null;
    this.lastVoice = null;
  }

  // ------------------------------------------------------------------ clock

  /** Fire due cues. Call only while the phase clock is advancing. */
  update(phaseTime: number): void {
    if (this.phase === null) return;
    for (const c of dueCues(this.phaseCues, this.fired, phaseTime)) {
      this.fired.add(c.id);
      this.execute(c, "auto");
    }
    this.lastTime = phaseTime;
  }

  /** Operator seek (any direction) inside the current phase. */
  seek(phaseTime: number): void {
    if (this.phase === null) return;
    const plan = planSeek(this.phaseCues, this.fired, this.lastTime, phaseTime);
    for (const id of plan.rearm) this.fired.delete(id);
    for (const c of plan.skipped) {
      this.fired.add(c.id);
      this.deps.onCueFired?.(c, "skipped");
    }
    this.stopVoice();
    this.deps.countdown.cancel();
    this.applyDerivedState(phaseTime);
    this.lastTime = phaseTime;
  }

  // ------------------------------------------------------------------ firing

  /** Manual fire by id (any phase). Marks it fired only if it belongs to the current phase. */
  fireById(cueId: string): boolean {
    const cue = this.show.cues.find((c) => c.id === cueId);
    if (!cue) {
      this.deps.log("warn", `fireCue: cue necunoscut "${cueId}"`);
      return false;
    }
    if (cue.phase === this.phase) this.fired.add(cue.id);
    this.execute(cue, "manual");
    return true;
  }

  private execute(cue: Cue, mode: FireMode): void {
    this.lastCue = cue.id;
    try {
      switch (cue.kind) {
        case "voice":
          this.lastVoice = cue.id;
          void this.speak({
            id: cue.id,
            speaker: cue.speaker,
            text: this.textOf(cue),
            subtitle: true,
            holdMs: cue.subtitleHoldMs ?? SUBTITLE_HOLD_MS,
            fallback: cue.fallback,
          });
          break;
        case "countdown":
          this.runCountdown(cue, mode);
          break;
        case "sfx": {
          const gain = (cue.gain ?? 1) * this.deps.getSfxGain();
          this.deps.voice.playSfx(cue.sfx, { durationSec: cue.durationSec, gain });
          break;
        }
        case "entity":
          if (cue.action === "show") this.deps.entities.show(cue.entity);
          else this.deps.entities.hide(cue.entity);
          break;
        case "theme":
          this.deps.theme.apply(cue.theme);
          break;
        case "tablet":
          this.deps.log("info", `tablet cue ${cue.id} (${cue.interaction.type}) — handled by server`);
          break;
        case "marker":
          this.deps.log("info", `marker ${cue.id}: ${cue.label}`);
          break;
        // ---- R4
        case "dynamic-voice":
          // The server composes the text (tablet messages / choices / live dialog) and sends a
          // `dynamicVoice` message that Player.speakDynamic() plays; the screen does nothing here.
          this.lastVoice = cue.id;
          this.deps.log("info", `dynamic-voice cue ${cue.id} (${cue.source}, ${cue.speaker}) — text comes from the server as dynamicVoice`);
          break;
        case "ambient": {
          const ambient = this.deps.ambient;
          if (!ambient) break;
          const bed: SceneTheme = cue.bed ?? this.deps.theme.current();
          if (cue.action === "stop") ambient.stop({ fadeSec: cue.fadeSec });
          else if (cue.action === "crossfade") ambient.crossfade(bed, { gain: cue.gain, fadeSec: cue.fadeSec });
          else ambient.start(bed, { gain: cue.gain, fadeSec: cue.fadeSec });
          break;
        }
        case "lights":
          // Room lighting is driven server-side (src/server/features/lights.ts); screens only log.
          this.deps.log("info", `lights cue ${cue.id} (${cue.theme}${cue.fadeSec ? `, ${cue.fadeSec}s` : ""}) — server-side adaptor, no-op on screens`);
          break;
        case "photo":
          this.deps.log("info", `photo cue ${cue.id} (countdown ${cue.countdownSec ?? 3}s, show ${cue.showSec ?? 8}s) — server drives the capture via photo messages`);
          this.deps.onPhotoCue?.(cue);
          break;
        default: {
          const never: never = cue;
          this.deps.log("warn", "cue kind necunoscut", never);
        }
      }
    } catch (err) {
      this.deps.log("error", `cue ${cue.id} failed: ${describeError(err)}`);
    }
    this.deps.onCueFired?.(cue, mode);
  }

  private textOf(cue: VoiceCue): string {
    const lang = this.deps.getLang();
    return cue.text[lang] ?? cue.text.ro;
  }

  private runCountdown(cue: CountdownCue, mode: FireMode): void {
    const startAt = mode === "manual" ? this.deps.now() : cue.at;
    const durationSec = cue.durationSec ?? Math.abs(cue.from - cue.to);
    void this.deps.countdown.run({
      from: cue.from,
      to: cue.to,
      durationSec,
      startAt,
      now: this.deps.now,
      onTick: cue.spoken
        ? (n) => {
            void this.speak({ id: `count-${n}`, speaker: "AVATAR_AI", text: String(n), subtitle: false });
          }
        : undefined,
    });
  }

  // ------------------------------------------------------------------ voice

  /** Speak a line (voice cue, spoken countdown digit, avatar test, dynamic voice). Preempts the current voice. */
  async speak(req: SpeakRequest): Promise<void> {
    const { voice, avatar, subtitles, entities, ambient, log } = this.deps;
    const lang = req.lang ?? this.deps.getLang();
    const profile = SPEAKERS[req.speaker];
    const lipsync = profile?.lipsyncAvatar ?? false;

    this.stopVoice();
    const token = ++this.voiceSeq;

    if (lipsync) this.deps.ensureAvatarVisible();
    else avatar.setAttention("idle");
    entities.setSpeaking(isEntityId(req.speaker) ? req.speaker : null);
    if (req.subtitle) subtitles.show(req.speaker, req.text);

    let clip: VoiceClip | null = null;
    try {
      clip = await voice.getClip(req.id, req.speaker, req.text, lang);
    } catch (err) {
      log("warn", `getClip(${req.id}) failed: ${describeError(err)}`);
    }
    if (token !== this.voiceSeq) return; // preempted while loading

    let handle: PlaybackHandle;
    try {
      if (clip) {
        handle = voice.play(clip, req.speaker);
        if (lipsync) avatar.lipsync(clip, performance.now());
      } else if (req.fallback === "silent") {
        const ms = estimateSpeechMs(req.text);
        log("error", `asset vocal de producție lipsă pentru ${req.id}; fallback browser blocat`);
        handle = silentHandle(ms);
      } else {
        handle = voice.speakFallback(req.text, req.speaker, lang);
        if (lipsync) avatar.lipsyncSynthetic(handle.durationMs);
      }
    } catch (err) {
      log("error", `voice playback failed for ${req.id}: ${describeError(err)}`);
      const ms = estimateSpeechMs(req.text);
      handle = silentHandle(ms);
      if (lipsync) avatar.lipsyncSynthetic(ms);
    }
    this.current = { handle, id: req.id };
    ambient?.setDucked(true);

    try {
      await handle.done;
    } catch {
      /* ignore */
    }
    if (token !== this.voiceSeq) return; // stopped or preempted
    this.current = null;
    ambient?.setDucked(false);
    entities.setSpeaking(null);
    if (!lipsync) avatar.setAttention("camera");
    if (req.subtitle) subtitles.hideAfter((req.holdMs ?? SUBTITLE_HOLD_MS) / this.rate());
  }

  /** Stop the current voice (and, with `all`, every sound including sfx). */
  stopVoice(opts?: { all?: boolean }): void {
    this.voiceSeq++;
    const cur = this.current;
    this.current = null;
    if (cur) {
      try {
        cur.handle.stop();
      } catch {
        /* ignore */
      }
    }
    if (opts?.all) {
      try {
        this.deps.voice.stopAll();
      } catch {
        /* ignore */
      }
    }
    try {
      this.deps.avatar.stopSpeaking();
      this.deps.avatar.setAttention("camera");
    } catch {
      /* ignore */
    }
    this.deps.ambient?.setDucked(false);
    this.deps.entities.setSpeaking(null);
    this.deps.subtitles.hide();
  }

  isSpeaking(): boolean {
    return this.current !== null;
  }

  private rate(): number {
    const r = this.deps.getRate?.() ?? 1;
    return Number.isFinite(r) && r > 0 ? r : 1;
  }

  // ------------------------------------------------------------------ derived state

  /** Theme + entity visibility + ambient bed implied by all cues up to `phaseTime` (after seeks / phase entry). */
  private applyDerivedState(phaseTime: number): void {
    if (this.phase === null) return;
    const st = derivedState(this.phaseCues, this.fired, phaseTime, this.show.scenes, this.phase);
    if (st.theme !== null && st.theme !== this.deps.theme.current()) this.deps.theme.apply(st.theme, { fast: true });
    for (const [id, action] of entityActions(st)) {
      if (action === "show") this.deps.entities.show(id);
      else this.deps.entities.hide(id);
    }
    const ambient = this.deps.ambient;
    if (ambient) {
      if (st.ambient === null) {
        if (st.theme !== null) ambient.followTheme(st.theme);
      } else if (st.ambient.action === "stop") ambient.stop({ fadeSec: st.ambient.fadeSec });
      else {
        const bed = st.ambient.bed ?? st.theme ?? this.deps.theme.current();
        ambient.crossfade(bed, { gain: st.ambient.gain, fadeSec: st.ambient.fadeSec });
      }
    }
  }

  sceneAt(phaseTime: number, phase: Phase | null = this.phase): ShowFile["scenes"][number] | null {
    return sceneAt(this.show.scenes, phase, phaseTime);
  }
}

/** A handle that resolves after `ms` (timed silence when no audio can be played). */
function silentHandle(ms: number): PlaybackHandle {
  let stopFn = () => {};
  const done = new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    stopFn = () => {
      clearTimeout(timer);
      resolve();
    };
  });
  return { done, durationMs: ms, stop: () => stopFn() };
}
