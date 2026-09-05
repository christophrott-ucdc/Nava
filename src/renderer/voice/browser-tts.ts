/**
 * Browser speechSynthesis fallback (no API keys, no pre-generated audio).
 * Windows ships ro-RO voices "Microsoft Andrei" (male) and "Microsoft Ioana"
 * (female); we pick by language + speaker gender, else fall back to English.
 * No audio graph here, so amplitude is synthesized for the entity animation.
 */
import type { PlaybackHandle } from "../../shared/contracts";
import type { Lang, Speaker } from "../../shared/types";

type Gender = "female" | "male";

const SPEAKER_GENDER: Record<Speaker, Gender> = {
  AVATAR_AI: "female",
  CAPITANUL: "male",
  LUMINA: "female",
  NATURA: "male",
  TEHNOLOGIC: "male",
};

const SPEAKER_PROSODY: Record<Speaker, { rate: number; pitch: number }> = {
  AVATAR_AI: { rate: 1.0, pitch: 1.05 },
  CAPITANUL: { rate: 0.9, pitch: 0.8 },
  LUMINA: { rate: 0.9, pitch: 1.15 },
  NATURA: { rate: 0.85, pitch: 0.85 },
  TEHNOLOGIC: { rate: 1.05, pitch: 1.0 },
};

const LANG_TAG: Record<Lang, string> = { ro: "ro-RO", en: "en-US", fr: "fr-FR" };

/** ~75 ms per character, at least 900 ms (Exodus heuristic). */
export function estimateSpeechMs(text: string): number {
  return Math.max(900, text.length * 75);
}

function looksFemale(v: SpeechSynthesisVoice): boolean {
  return /female|woman|ioana|zira|hazel|aria|jenny|sara|hortense|julie|denise|eva|elsa|paulina/i.test(v.name);
}
function looksMale(v: SpeechSynthesisVoice): boolean {
  return /male|man\b|andrei|david|mark|george|ryan|guy|henri|claude|paul|pablo/i.test(v.name);
}

export function pickBrowserVoice(voices: SpeechSynthesisVoice[], lang: Lang, speaker: Speaker): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  const want = SPEAKER_GENDER[speaker];
  const prefix = lang.toLowerCase();
  const sameLang = voices.filter((v) => v.lang.toLowerCase().replace("_", "-").startsWith(prefix));
  const pool = sameLang.length ? sameLang : voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const candidates = pool.length ? pool : voices;
  const ranked = candidates
    .map((v) => {
      let score = 0;
      if (want === "female" && looksFemale(v)) score += 5;
      if (want === "male" && looksMale(v)) score += 5;
      if (want === "female" && looksMale(v)) score -= 3;
      if (want === "male" && looksFemale(v)) score -= 3;
      if (v.localService) score += 1;
      if (/natural|neural/i.test(v.name)) score += 1;
      return { v, score };
    })
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.v ?? null;
}

function synth(): SpeechSynthesis | null {
  return typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
}

/** Voices load asynchronously; wait briefly for `voiceschanged`. */
export function waitForVoices(timeoutMs = 600): Promise<SpeechSynthesisVoice[]> {
  const s = synth();
  if (!s) return Promise.resolve([]);
  const now = s.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      s.removeEventListener("voiceschanged", finish);
      resolve(s.getVoices());
    };
    s.addEventListener("voiceschanged", finish);
    window.setTimeout(finish, timeoutMs);
  });
}

let speaking = false;
let warnedNoLangVoice = false;

export function isBrowserSpeaking(): boolean {
  return speaking;
}

export function cancelBrowserSpeech(): void {
  speaking = false;
  const s = synth();
  if (!s) return;
  try {
    s.cancel();
  } catch {
    /* ignore */
  }
}

export interface BrowserSpeakOptions {
  /** 0..1; 0 mutes (follower screens still get the timing). */
  volume: number;
  /** R4 — rehearse multiplier on the speaker's prosody rate (1 = normal; SpeechSynthesis caps at 10). */
  rate?: number;
}

/**
 * Speak with the browser engine. Returns immediately with an estimated
 * duration; `done` resolves at the utterance's `end` (or a safety timer).
 */
export function speakWithBrowser(text: string, speaker: Speaker, lang: Lang, opts: BrowserSpeakOptions): PlaybackHandle {
  const rateMul = Number.isFinite(opts.rate) && (opts.rate as number) > 0 ? (opts.rate as number) : 1;
  const estimated = Math.round(estimateSpeechMs(text) / rateMul);
  const s = synth();
  let resolveDone: () => void = () => undefined;
  const done = new Promise<void>((r) => {
    resolveDone = r;
  });
  if (!s) {
    console.warn("[voice] speechSynthesis unavailable; silent fallback");
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      resolveDone();
    };
    const timer = window.setTimeout(finish, estimated);
    return { done, durationMs: estimated, stop: finish };
  }

  let finished = false;
  let safety: number | null = null;
  const finish = () => {
    if (finished) return;
    finished = true;
    speaking = false;
    if (safety !== null) window.clearTimeout(safety);
    resolveDone();
  };

  cancelBrowserSpeech();
  if (s.paused) s.resume();
  speaking = true;

  void waitForVoices().then((voices) => {
    if (finished) return;
    const u = new SpeechSynthesisUtterance(text);
    const picked = pickBrowserVoice(voices, lang, speaker);
    if (picked) {
      u.voice = picked;
      u.lang = picked.lang;
      if (!picked.lang.toLowerCase().startsWith(lang) && !warnedNoLangVoice) {
        warnedNoLangVoice = true;
        console.warn(`[voice] no ${LANG_TAG[lang]} browser voice installed; using "${picked.name}" (${picked.lang})`);
      }
    } else {
      u.lang = LANG_TAG[lang];
    }
    const pros = SPEAKER_PROSODY[speaker];
    u.rate = Math.min(10, Math.max(0.1, pros.rate * rateMul));
    u.pitch = pros.pitch;
    u.volume = Math.max(0, Math.min(1, opts.volume));
    u.onend = finish;
    u.onerror = (e) => {
      if (e.error !== "interrupted" && e.error !== "canceled") console.warn("[voice] utterance error:", e.error);
      finish();
    };
    try {
      s.speak(u);
    } catch (err) {
      console.warn("[voice] speechSynthesis.speak failed:", err);
      finish();
      return;
    }
    // Chrome occasionally drops `end`; never hang the timeline.
    safety = window.setTimeout(finish, estimated * 1.6 + 1500);
  });

  return {
    done,
    durationMs: estimated,
    stop() {
      if (finished) return;
      cancelBrowserSpeech();
      finish();
    },
  };
}

// Synthetic amplitude for entities while the browser voice speaks
let synthAmp = 0;
let synthTarget = 0;
let synthNext = 0;

export function syntheticAmplitude(): number {
  const now = performance.now();
  if (!speaking) {
    synthAmp *= 0.9;
    return synthAmp < 0.01 ? 0 : synthAmp;
  }
  if (now > synthNext) {
    // New "syllable": random level, 80-220 ms
    synthTarget = Math.random() < 0.15 ? 0.05 : 0.35 + Math.random() * 0.6;
    synthNext = now + 80 + Math.random() * 140;
  }
  synthAmp += (synthTarget - synthAmp) * 0.25;
  return synthAmp;
}
