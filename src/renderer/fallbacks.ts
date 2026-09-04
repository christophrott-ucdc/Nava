/**
 * Null implementations of the Agent C contracts. Used when:
 *   - the screen is configured without avatar (screen.showAvatar = false),
 *   - the real factory throws at construction (missing WebGL, missing module),
 * so the player keeps running (timing, subtitles, entities) without a voice/avatar.
 * The null voice engine still "times" speech so subtitles and synthetic lip-sync work.
 */

import type { AvatarController, PlaybackHandle, VoiceClip, VoiceEngine } from "../shared/contracts";
import type { Lang, Speaker } from "../shared/types";

/** Rough Romanian speech duration estimate (~14 chars/s) with a floor. */
export function estimateSpeechMs(text: string): number {
  const chars = text.trim().length;
  return Math.max(900, Math.round(chars * 72 + 350));
}

function timedHandle(durationMs: number, onEnd?: () => void): PlaybackHandle {
  let resolve!: () => void;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const done = new Promise<void>((r) => {
    resolve = r;
  });
  const finish = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
      onEnd?.();
      resolve();
    }
  };
  timer = setTimeout(finish, durationMs);
  return { done, durationMs, stop: finish };
}

export function createNullVoiceEngine(): VoiceEngine {
  let speakingUntil = 0;
  let volume = 1;
  const handles = new Set<PlaybackHandle>();
  const track = (h: PlaybackHandle): PlaybackHandle => {
    handles.add(h);
    void h.done.then(() => handles.delete(h));
    return h;
  };
  return {
    async prepare(_lang: Lang) {
      /* nothing to load */
    },
    async getClip(_cueId: string, _speaker: Speaker, _text: string, _lang: Lang): Promise<VoiceClip | null> {
      return null;
    },
    play(clip: VoiceClip, _speaker: Speaker): PlaybackHandle {
      speakingUntil = performance.now() + clip.durationMs;
      return track(timedHandle(clip.durationMs, () => (speakingUntil = 0)));
    },
    speakFallback(text: string, _speaker: Speaker, _lang: Lang): PlaybackHandle {
      const ms = estimateSpeechMs(text);
      speakingUntil = performance.now() + ms;
      return track(timedHandle(ms, () => (speakingUntil = 0)));
    },
    stopAll() {
      for (const h of [...handles]) h.stop();
      speakingUntil = 0;
    },
    setVolume(v: number) {
      volume = v;
    },
    getAmplitude(): number {
      // Synthetic "speech" envelope so entities still breathe without audio.
      if (performance.now() > speakingUntil) return 0;
      const t = performance.now() / 1000;
      const a = 0.45 + 0.35 * Math.sin(t * 9.1) * Math.sin(t * 2.3) + 0.2 * Math.sin(t * 17.7);
      return Math.max(0, Math.min(1, a)) * Math.min(1, volume + 0.5);
    },
    playSfx(_name, opts): PlaybackHandle {
      return track(timedHandle(Math.round((opts?.durationSec ?? 2) * 1000)));
    },
    async unlock() {
      /* no audio context */
    },
  };
}

export function createNullAvatar(): AvatarController {
  return {
    async load() {
      /* nothing */
    },
    lipsync(_clip: VoiceClip, _startAtMs: number) {},
    lipsyncSynthetic(_durationMs: number) {},
    stopSpeaking() {},
    setVisible(_visible: boolean, _animate?: boolean) {},
    setMood(_mood: string) {},
    setAttention(_mode: "camera" | "idle") {},
    resize(_widthPx: number) {},
    isSpeaking() {
      return false;
    },
    dispose() {},
  };
}
