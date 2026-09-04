/**
 * Cue engine (BRIEF §4):
 *   - every frame, all not-yet-fired cues of the current phase with `at <= phaseTime` fire, in order;
 *   - seek BACK  -> cues with `at >= phaseTime` re-arm;
 *   - seek FORWARD -> skipped cues are marked fired WITHOUT running, except that the latest `theme`
 *     and the final `entity` show/hide states are applied;
 *   - `manual` cues never auto-fire (operator fires them with `fireCue`);
 *   - one voice at a time: a new voice preempts the previous one.
 * The timeline does not know about the video: the Player feeds it `phaseTime`.
 */

import type { AvatarController, PlaybackHandle, VoiceClip, VoiceEngine } from "../shared/contracts";
import { SPEAKERS, type Cue, type CountdownCue, type Lang, type Phase, type SceneTheme, type ShowFile, type Speaker, type VoiceCue } from "../shared/types";
import { estimateSpeechMs } from "./fallbacks";
import { describeError, type Logger } from "./log";
import type { Countdown } from "./ui/countdown";
import { ENTITY_IDS, isEntityId, type Entities, type EntityId } from "./ui/entities";
import type { Subtitles } from "./ui/subtitles";
import type { ThemeController } from "./ui/theme";

export type FireMode = "auto" | "manual" | "skipped";

export interface TimelineDeps {
  voice: VoiceEngine;
  avatar: AvatarController;
  subtitles: Subtitles;
  countdown: Countdown;
  entities: Entities;
  theme: ThemeController;
  log: Logger;
  getLang: () => Lang;
  /** Multiplier applied to sfx cue gains (config.audio.sfxVolume, adjustable via setVolume). */
  getSfxGain: () => number;
  /** Current phaseTime (drives the countdown so it pauses with the show). */
  now: () => number;
  /** Called before CAPITANUL speaks: the player reveals the GLB on the first lip-synced line. */
  ensureAvatarVisible: () => void;
  onCueFired?: (cue: Cue, mode: FireMode) => void;
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
}

const SUBTITLE_HOLD_MS = 800;

function sortCues(cues: Cue[], phase: Phase): Cue[] {
  return cues
    .filter((c) => c.phase === phase)
    .map((c, i) => ({ c, i }))
    .sort((a, b) => a.c.at - b.c.at || a.i - b.i)
    .map((x) => x.c);
}

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
    if (this.phase === null) return;
    this.phaseCues = sortCues(show.cues, this.phase);
    const keep = new Set<string>();
    for (const c of this.phaseCues) {
      if (c.manual) {
        if (this.fired.has(c.id)) keep.add(c.id);
      } else if (c.at < this.lastTime || this.fired.has(c.id)) keep.add(c.id);
    }
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
    for (const c of this.phaseCues) {
      if (!c.manual && c.at < phaseTime) {
        this.fired.add(c.id);
        this.deps.onCueFired?.(c, "skipped");
      }
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
    for (const c of this.phaseCues) {
      if (c.at > phaseTime) break;
      if (c.manual || this.fired.has(c.id)) continue;
      this.fired.add(c.id);
      this.execute(c, "auto");
    }
    this.lastTime = phaseTime;
  }

  /** Operator seek (any direction) inside the current phase. */
  seek(phaseTime: number): void {
    if (this.phase === null) return;
    const forward = phaseTime > this.lastTime;
    for (const c of this.phaseCues) {
      if (c.at >= phaseTime) this.fired.delete(c.id);
    }
    if (forward) {
      for (const c of this.phaseCues) {
        if (!c.manual && c.at < phaseTime && !this.fired.has(c.id)) {
          this.fired.add(c.id);
          this.deps.onCueFired?.(c, "skipped");
        }
      }
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

  /** Speak a line (voice cue, spoken countdown digit, avatar test). Preempts the current voice. */
  async speak(req: SpeakRequest): Promise<void> {
    const { voice, avatar, subtitles, entities, log } = this.deps;
    const lang = this.deps.getLang();
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
        let stopFn = () => {};
        const done = new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, ms);
          stopFn = () => {
            clearTimeout(timer);
            resolve();
          };
        });
        handle = { done, durationMs: ms, stop: stopFn };
      } else {
        handle = voice.speakFallback(req.text, req.speaker, lang);
        if (lipsync) avatar.lipsyncSynthetic(handle.durationMs);
      }
    } catch (err) {
      log("error", `voice playback failed for ${req.id}: ${describeError(err)}`);
      const ms = estimateSpeechMs(req.text);
      let stopFn = () => {};
      const done = new Promise<void>((r) => {
        const t = setTimeout(r, ms);
        stopFn = () => {
          clearTimeout(t);
          r();
        };
      });
      handle = { done, durationMs: ms, stop: () => stopFn() };
      if (lipsync) avatar.lipsyncSynthetic(ms);
    }
    this.current = { handle, id: req.id };

    try {
      await handle.done;
    } catch {
      /* ignore */
    }
    if (token !== this.voiceSeq) return; // stopped or preempted
    this.current = null;
    entities.setSpeaking(null);
    if (!lipsync) avatar.setAttention("camera");
    if (req.subtitle) subtitles.hideAfter(req.holdMs ?? SUBTITLE_HOLD_MS);
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
    this.deps.entities.setSpeaking(null);
    this.deps.subtitles.hide();
  }

  isSpeaking(): boolean {
    return this.current !== null;
  }

  // ------------------------------------------------------------------ derived state

  /** Theme + entity visibility implied by all cues up to `phaseTime` (used after seeks / phase entry). */
  private applyDerivedState(phaseTime: number): void {
    if (this.phase === null) return;
    const counts = (c: Cue) => c.at <= phaseTime && (!c.manual || this.fired.has(c.id));

    let theme: SceneTheme | null = null;
    const entityState: Partial<Record<EntityId, "show" | "hide">> = {};
    for (const c of this.phaseCues) {
      if (c.at > phaseTime) break;
      if (!counts(c)) continue;
      if (c.kind === "theme") theme = c.theme;
      else if (c.kind === "entity") entityState[c.entity] = c.action;
    }
    if (theme === null) {
      const scene = this.sceneAt(phaseTime);
      theme = scene?.theme ?? null;
    }
    if (theme !== null && theme !== this.deps.theme.current()) this.deps.theme.apply(theme, { fast: true });
    for (const id of ENTITY_IDS) {
      if (entityState[id] === "show") this.deps.entities.show(id);
      else this.deps.entities.hide(id);
    }
  }

  sceneAt(phaseTime: number, phase: Phase | null = this.phase): ShowFile["scenes"][number] | null {
    if (phase === null) return null;
    const scenes = this.show.scenes.filter((s) => s.phase === phase);
    let best: ShowFile["scenes"][number] | null = null;
    for (const s of scenes) {
      if (phaseTime >= s.start && (best === null || s.start >= best.start)) best = s;
    }
    return best;
  }
}
