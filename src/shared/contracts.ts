/**
 * Interfete intre modulele renderer-ului, ca sa poata fi implementate in paralel:
 *   - src/renderer/avatar/  -> implementeaza AvatarController (TalkingHead + GLB)
 *   - src/renderer/voice/   -> implementeaza VoiceEngine (audio pre-generat / TTS / browser)
 *   - src/renderer/         -> playerul (video, timeline, subtitrari, entitati) le consuma.
 */

import type { Lang, Speaker, VoiceClipMeta } from "./types";

/** Un clip gata de redare: metadate + bytes (null daca se foloseste vocea browserului). */
export interface VoiceClip extends VoiceClipMeta {
  audio: ArrayBuffer | null;
}

export interface PlaybackHandle {
  /** Se rezolva la finalul redarii (sau la stop). */
  done: Promise<void>;
  stop(): void;
  durationMs: number;
}

export interface VoiceEngineOptions {
  /** file:///.../assets/voice/ (se adauga <lang>/manifest.json si <lang>/<file>). */
  voiceBaseUrl: string;
  /** URL HTTP al serverului master pentru TTS live optional: http://host:port (poate fi null la follower fara server). */
  serverHttpUrl: string | null;
  lang: Lang;
  /** Daca false, motorul nu emite sunet (ecran follower), dar tot raporteaza timpii pentru lip-sync/subtitrare. */
  audible: boolean;
  initialVolume: number;
}

export interface VoiceEngine {
  /** Incarca manifestul pentru limba curenta (nu arunca daca lipseste). */
  prepare(lang: Lang): Promise<void>;
  /**
   * Obtine clipul unui cue: 1) assets/voice/<lang>/manifest.json, 2) POST /api/tts pe server (cache pe disc),
   * 3) null -> apelantul foloseste vocea browserului (speechSynthesis) prin `speakFallback`.
   */
  getClip(cueId: string, speaker: Speaker, text: string, lang: Lang): Promise<VoiceClip | null>;
  /** Reda clipul cu efectul vorbitorului (hologram/choir/forest/crystal/clean). */
  play(clip: VoiceClip, speaker: Speaker): PlaybackHandle;
  /** Fallback: vocea browserului (Windows ro-RO). Returneaza handle cu durata estimata. */
  speakFallback(text: string, speaker: Speaker, lang: Lang): PlaybackHandle;
  stopAll(): void;
  setVolume(v: number): void;
  /** Amplitudine 0..1 a vocii curente (pentru animarea entitatilor). */
  getAmplitude(): number;
  /** SFX sintetizate (fara fisiere). */
  playSfx(name: "liftoff-rumble" | "low-swell" | "wormhole-whoosh" | "arrival-chime" | "rain" | "white-fade", opts?: { durationSec?: number; gain?: number }): PlaybackHandle;
  /** Trebuie apelat la primul gest al utilizatorului sau la boot in kiosk (autoplay policy dezactivata in Electron). */
  unlock(): Promise<void>;
}

export interface AvatarControllerOptions {
  container: HTMLElement;
  glbUrl: string;
  lang: Lang;
  /** Latimea dorita in px (inaltimea se deduce din aspect). */
  widthPx: number;
  onReady?: () => void;
  onError?: (err: unknown) => void;
}

export interface AvatarController {
  load(): Promise<void>;
  /**
   * Lip-sync pe un clip (audio bytes + cuvinte/timpi sau viseme). Redarea AUDIBILA este facuta de VoiceEngine;
   * avatarul doar animeaza gura (mixerGainSpeech = 0), sincron cu `startAtMs` (performance.now()).
   */
  lipsync(clip: VoiceClip, startAtMs: number): void;
  /** Gura se misca sintetic (fara audio) pentru `durationMs` — fallback la vocea browserului. */
  lipsyncSynthetic(durationMs: number): void;
  stopSpeaking(): void;
  /** Beam-in / beam-out (efect transporter) — implicit vizibil permanent. */
  setVisible(visible: boolean, animate?: boolean): void;
  /** Dispozitie: neutral | happy | sad etc. (TalkingHead setMood). */
  setMood(mood: string): void;
  /** Privirea catre camera / usor in lateral, pentru "ascultare". */
  setAttention(mode: "camera" | "idle"): void;
  resize(widthPx: number): void;
  isSpeaking(): boolean;
  dispose(): void;
}

/** Fabrici exportate de fiecare modul (semnaturi fixe). */
export type CreateVoiceEngine = (opts: VoiceEngineOptions) => VoiceEngine;
export type CreateAvatarController = (opts: AvatarControllerOptions) => AvatarController;
