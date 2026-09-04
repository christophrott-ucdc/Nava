/**
 * Ambient typings for @met4citizen/talkinghead (the package ships no .d.ts).
 * Only the surface used by src/renderer/avatar is declared. Anything else is
 * reachable through an explicit cast; keep this file honest with talkinghead.mjs.
 */
declare module "@met4citizen/talkinghead" {
  export interface TalkingHeadAvatar {
    url: string;
    body?: "M" | "F";
    lipsyncLang?: string;
    avatarMood?: string;
    avatarMute?: boolean;
    avatarIdleEyeContact?: number;
    avatarIdleHeadMove?: number;
    avatarSpeakingEyeContact?: number;
    avatarSpeakingHeadMove?: number;
    avatarIgnoreCamera?: boolean;
    baseline?: Record<string, number>;
    modelDynamicBones?: unknown[];
    [key: string]: unknown;
  }

  export interface TalkingHeadOptions {
    mixerGainSpeech?: number | null;
    mixerGainBackground?: number | null;
    lipsyncLang?: string;
    /** Modules the library tries to `import()` dynamically — pass [] under a bundler. */
    lipsyncModules?: string[];
    pcmSampleRate?: number;
    modelRoot?: string;
    /** Multiplied by window.devicePixelRatio inside the library. */
    modelPixelRatio?: number;
    modelFPS?: number;
    modelMovementFactor?: number;
    cameraView?: "full" | "mid" | "upper" | "head";
    cameraDistance?: number;
    cameraX?: number;
    cameraY?: number;
    cameraRotateX?: number;
    cameraRotateY?: number;
    cameraRotateEnable?: boolean;
    cameraPanEnable?: boolean;
    cameraZoomEnable?: boolean;
    lightAmbientColor?: number;
    lightAmbientIntensity?: number;
    lightDirectColor?: number;
    lightDirectIntensity?: number;
    lightDirectPhi?: number;
    lightDirectTheta?: number;
    lightSpotIntensity?: number;
    lightSpotColor?: number;
    lightSpotPhi?: number;
    lightSpotTheta?: number;
    lightSpotDispersion?: number;
    avatarMood?: string;
    avatarMute?: boolean;
    avatarIdleEyeContact?: number;
    avatarIdleHeadMove?: number;
    avatarSpeakingEyeContact?: number;
    avatarSpeakingHeadMove?: number;
    avatarIgnoreCamera?: boolean;
    dracoEnabled?: boolean;
    dracoDecoderPath?: string;
    statsNode?: HTMLElement | null;
    [key: string]: unknown;
  }

  /** Return value of a lipsync module's wordsToVisemes (relative units). */
  export interface LipsyncResult {
    words?: string;
    visemes: string[];
    times: number[];
    durations: number[];
  }

  export interface LipsyncProcessor {
    preProcessText(s: string): string;
    wordsToVisemes(w: string): LipsyncResult;
  }

  export interface SpeakAudioInput {
    audio?: AudioBuffer | ArrayBuffer[];
    words?: string[];
    wtimes?: number[];
    wdurations?: number[];
    visemes?: string[];
    vtimes?: number[];
    vdurations?: number[];
    markers?: Array<() => void>;
    mtimes?: number[];
    anim?: unknown;
  }

  export interface SpeakAudioOptions {
    lipsyncLang?: string;
    /** Skip the 300 ms trailing break, lookAtCamera, hand gestures and pre-roll delay. */
    isRaw?: boolean;
  }

  export class TalkingHead {
    constructor(node: HTMLElement, opt?: TalkingHeadOptions | null);
    opt: TalkingHeadOptions;
    avatar: TalkingHeadAvatar;
    audioCtx: AudioContext;
    audioSpeechGainNode: GainNode;
    isSpeaking: boolean;
    isRunning: boolean;
    stateName: string;
    animClock: number;
    lipsync: Record<string, LipsyncProcessor>;
    mtAvatar: Record<string, unknown>;
    visemeNames: string[];
    nodeAvatar: HTMLElement | null;
    renderer: { domElement: HTMLCanvasElement } | null;

    showAvatar(avatar: TalkingHeadAvatar, onprogress?: ((ev: ProgressEvent) => void) | null): Promise<void>;
    speakAudio(
      r: SpeakAudioInput,
      opt?: SpeakAudioOptions | null,
      onsubtitles?: ((node: HTMLElement) => void) | null,
    ): void;
    speakText(s: string, opt?: Record<string, unknown> | null): void;
    stopSpeaking(): void;
    pauseSpeaking(): void;
    setMood(mood: string): void;
    getMood(): string;
    getMoodNames(): string[];
    setValue(mt: string, val: number, ms?: number | null): void;
    getValue(mt: string): number | undefined;
    getMorphTargetNames(): string[];
    setView(view: "full" | "mid" | "upper" | "head", opt?: Record<string, number> | null): void;
    setLighting(opt: Record<string, unknown>): void;
    lookAtCamera(t: number): void;
    lookAhead(t: number): void;
    lookAt(x: number | null, y: number | null, t: number): void;
    makeEyeContact(t: number): void;
    playGesture(name: string, dur?: number, mirror?: boolean, ms?: number): void;
    stopGesture(ms?: number): void;
    setMixerGain(speech: number | null, background?: number | null, fadeSecs?: number): void;
    resetLips(): void;
    onResize(): void;
    start(): void;
    stop(): void;
    dispose(): void;
  }
}

declare module "@met4citizen/talkinghead/modules/lipsync-en.mjs" {
  import type { LipsyncProcessor, LipsyncResult } from "@met4citizen/talkinghead";
  export class LipsyncEn implements LipsyncProcessor {
    constructor();
    preProcessText(s: string): string;
    wordsToVisemes(w: string): LipsyncResult;
  }
}
