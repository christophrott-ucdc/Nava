/**
 * TalkingHead construction for the Nava avatar.
 *
 * Bundler notes (esbuild IIFE):
 *  - The library loads lipsync modules through `import('./lipsync-<lang>.mjs')`
 *    which cannot be resolved once bundled, so `lipsyncModules: []` and we
 *    register the processors ourselves (EN as a fallback, RO ours).
 *  - talkinghead.mjs evaluates `new URL('./playback-worklet.js', import.meta.url)`
 *    at module load. Under IIFE output `import.meta` is `{}` and that line throws
 *    "Invalid URL" — the build script must `define` import.meta.url (see report).
 */
import { TalkingHead } from "@met4citizen/talkinghead";
import type { TalkingHeadOptions } from "@met4citizen/talkinghead";
import { LipsyncEn } from "@met4citizen/talkinghead/modules/lipsync-en.mjs";
import { LipsyncRo, OCULUS_VISEMES } from "./lipsync-ro";

export interface HeadFraming {
  cameraView: "full" | "mid" | "upper" | "head";
  /** Added to the view's base camera distance (negative = closer). */
  cameraDistance: number;
  /** Vertical framing offset; negative raises the framed point. */
  cameraY: number;
  cameraX: number;
  /** Small yaw (radians) for a 3/4 look toward the room centre. */
  cameraRotateY: number;
}

/**
 * Chest-up framing for a bottom-left box with a ~0.8 (w/h) aspect.
 * With TalkingHead's 10 deg vertical FOV, view "upper" sits the camera 4.5 m
 * out; -0.9 brings it to 3.6 m (visible height ~0.63 m) and cameraY -0.25
 * raises the frame so it spans ~chest (1.21 m) to above the head (1.84 m).
 */
export const DEFAULT_FRAMING: HeadFraming = {
  cameraView: "upper",
  cameraDistance: -0.9,
  cameraY: -0.25,
  cameraX: 0,
  cameraRotateY: 0,
};

/** Aspect ratio (width / height) of the avatar box. */
export const AVATAR_ASPECT = 0.8;

export interface CreateHeadOptions {
  mount: HTMLElement;
  glbUrl: string;
  body: "F" | "M";
  lipsyncLang: string;
  framing?: Partial<HeadFraming>;
  /** Cap on the effective canvas pixel ratio (default 1.5). */
  maxPixelRatio?: number;
  onProgress?: (ev: ProgressEvent) => void;
}

export interface CreatedHead {
  head: TalkingHead;
  canvas: HTMLCanvasElement | null;
  visemesPresent: string[];
  visemesMissing: string[];
}

/**
 * TalkingHead multiplies `modelPixelRatio` by window.devicePixelRatio, so to
 * obtain an effective ratio of min(dpr, cap) we pass min(dpr, cap) / dpr.
 */
export function pixelRatioOption(cap = 1.5): number {
  const dpr = typeof window !== "undefined" && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
  return Math.min(dpr, cap) / dpr;
}

export function buildHeadOptions(opts: CreateHeadOptions): TalkingHeadOptions {
  const framing: HeadFraming = { ...DEFAULT_FRAMING, ...(opts.framing ?? {}) };
  return {
    // The audible voice is played by the VoiceEngine (with per-speaker FX);
    // TalkingHead only needs the buffer for viseme timing.
    mixerGainSpeech: 0,
    mixerGainBackground: 0,
    cameraView: framing.cameraView,
    cameraDistance: framing.cameraDistance,
    cameraX: framing.cameraX,
    cameraY: framing.cameraY,
    cameraRotateY: framing.cameraRotateY,
    cameraRotateEnable: false,
    cameraPanEnable: false,
    cameraZoomEnable: false,
    lipsyncModules: [],
    lipsyncLang: opts.lipsyncLang,
    modelFPS: 30,
    modelPixelRatio: pixelRatioOption(opts.maxPixelRatio ?? 1.5),
    lightAmbientIntensity: 1.6,
    lightDirectIntensity: 18,
    // Slightly warmer key light than the library default (0x8888aa).
    lightDirectColor: 0x9fa8c8,
    avatarMood: "neutral",
    // She addresses the children: hold eye contact often while speaking,
    // wander a little while idle (setAttention("idle") lowers this further).
    avatarIdleEyeContact: 0.35,
    avatarIdleHeadMove: 0.4,
    avatarSpeakingEyeContact: 0.75,
    avatarSpeakingHeadMove: 0.45,
  };
}

/** Register lipsync processors on an instance (idempotent). */
export function registerLipsyncModules(head: TalkingHead): void {
  if (!head.lipsync.en) head.lipsync.en = new LipsyncEn();
  if (!head.lipsync.ro) head.lipsync.ro = new LipsyncRo();
}

/** Which Oculus visemes the loaded avatar actually exposes as morph targets. */
export function diagnoseVisemes(head: TalkingHead): { present: string[]; missing: string[] } {
  const names = OCULUS_VISEMES.filter((v) => v !== "sil");
  const present = names.filter((v) => Object.prototype.hasOwnProperty.call(head.mtAvatar, "viseme_" + v));
  const missing = names.filter((v) => !present.includes(v));
  return { present, missing };
}

export async function createHead(opts: CreateHeadOptions): Promise<CreatedHead> {
  const head = new TalkingHead(opts.mount, buildHeadOptions(opts));
  registerLipsyncModules(head);
  try {
    await head.showAvatar(
      {
        url: opts.glbUrl,
        body: opts.body,
        lipsyncLang: opts.lipsyncLang,
        avatarMood: "neutral",
      },
      opts.onProgress ?? null,
    );
  } catch (err) {
    safeDispose(head);
    throw err;
  }
  // Belt and braces: the option is honoured in initAudioGraph, but make sure
  // no sound ever leaks from the library's own context.
  try {
    head.setMixerGain(0, 0);
  } catch {
    /* ignore */
  }
  const { present, missing } = diagnoseVisemes(head);
  const canvas = opts.mount.querySelector("canvas");
  return { head, canvas, visemesPresent: present, visemesMissing: missing };
}

/** dispose() + close the library's private AudioContext (dispose leaves it open). */
export function safeDispose(head: TalkingHead): void {
  try {
    head.stopSpeaking();
  } catch {
    /* ignore */
  }
  try {
    head.dispose();
  } catch {
    /* ignore */
  }
  try {
    const ctx = head.audioCtx;
    if (ctx && ctx.state !== "closed") void ctx.close();
  } catch {
    /* ignore */
  }
}
