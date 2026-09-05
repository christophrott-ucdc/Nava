/**
 * Protocolul WebSocket (JSON) intre:
 *   server (in procesul main al executabilului master)
 *   <-> renderer-e (ecranele; local sau pe alte PC-uri "follower")
 *   <-> consola operatorului (/control)
 *   <-> tabletele copiilor (/tablet)
 *
 * Toate mesajele au un camp `type`. Un singur endpoint: ws://<host>:<port>/ws
 * Clientul se identifica imediat dupa conectare cu un mesaj `hello`.
 */

import type {
  Lang,
  PlaybackState,
  SceneTheme,
  ShowState,
  Cue,
  TabletCue,
  TabletPost,
  TabletZone,
  PerfSample,
  EntityParams,
  Speaker,
  SpanViewport,
  SecurityConfig,
} from "./types";

export type ClientKind = "screen" | "control" | "tablet";

// ---------------------------------------------------------------------------
// client -> server
// ---------------------------------------------------------------------------

export interface HelloMsg {
  type: "hello";
  client: ClientKind;
  /** screen: id-ul ecranului din config; tablet: id persistent (localStorage); control: "control". */
  id: string;
  name?: string;
  /** Tabletă: postul fizic presetat prin URL/configurația locală. */
  post?: TabletPost;
  /** screen: daca acest ecran este ceasul de referinta (ecranul "center" al masterului). */
  isClockSource?: boolean;
  /**
   * R4 — autentificare: control -> tokenul de sesiune (cookie `nava_session`, obtinut prin POST /api/auth/login);
   * screen -> `security.screenToken` din boot. Tabletele nu trimit token. Serverul raspunde `error` + close (4401)
   * cand tokenul lipseste sau este invalid.
   */
  token?: string;
}

/** R4 — masuratori de performanta, trimise de FIECARE ecran la ~1 Hz. */
export interface PerfMsg {
  type: "perf";
  sample: PerfSample;
}

/** R4 — fotografia de echipaj capturata de ecranul `center` (JPEG dataURL, max ~1 MB). */
export interface PhotoCapturedMsg {
  runId?:string;
  photoRequestId?:string;
  type: "photoCaptured";
  cueId: string | null;
  dataUrl: string;
}

/** Ecranul-sursa de ceas raporteaza pozitia video (4 Hz). */
export interface ReportMsg {
  runId?:string;
  serverEpoch?:string;
  timelineEpoch?:number;
  type: "report";
  state: PlaybackState;
  phaseTime: number;
  rate: number;
  videoReady: boolean;
  sceneId: string | null;
}

/** Comenzi de la consola operatorului (sau de la tastatura ecranului master). */
export type Command =
  | { action: "preshow" } // intra in faza preshow (video pe cadrul 0, porneste timerul cue-urilor preshow)
  | { action: "start" } // porneste video-ul (faza play) de la 0
  | { action: "play" }
  | { action: "pause" }
  | { action: "seek"; time: number } // secunde
  | { action: "skipToScene"; sceneId: string }
  | { action: "restart" } // inapoi la idle (video pe 0, fara cue-uri)
  | { action: "epilogue" } // intra manual in epilog
  | { action: "fireCue"; cueId: string } // declanseaza un cue acum (indiferent de `at`)
  | { action: "stopVoice" }
  | { action: "setVolume"; voice?: number; sfx?: number }
  | { action: "setLang"; lang: Lang }
  | { action: "reloadShow" } // reincarca assets/show/show.json fara restart
  | { action: "testAvatar" } // avatarul spune o replica de test
  | { action: "identifyScreens" } // fiecare ecran isi afiseaza id-ul 3 s
  // R4
  | { action: "rehearse"; rate: number } // repetitie accelerata: video + voci la `rate` (ex. 4), cue-urile se declanseaza normal
  | { action: "setRate"; rate: number } // 1 = normal; folosit si pentru a iesi din rehearse
  | { action: "autoRun"; enabled: boolean } // mod operator absent on/off
  | { action: "lights"; theme: SceneTheme } // scena de lumina manuala
  | { action: "ambient"; enabled: boolean } // pat sonor on/off
  | { action: "tabletSfx"; enabled: boolean } // R5: local tablet sounds only
  | { action: "say"; speaker: Speaker; text: string } // un personaj rosteste textul acum (TTS live prin /api/tts)
  | { action: "setVariant"; variant: string | null } // varianta de scenariu (grupa de varsta)
  | { action: "photo" } // fotografie de echipaj acum
  | { action: "preflight" }; // reverifica asset-ele vocale

export interface CmdMsg {
  type: "cmd";
  cmd: Command;
}

/** Evenimente de la tablete. */
export interface TabletEventMsg {
  type: "tablet";
  tabletId: string;
  event:
    | { kind: "set-post"; post: TabletPost }
    | { kind: "choice"; cueId: string; zone: TabletZone; value: string }
    // Evenimentele vechi rămân în contract până la eliminarea show-ului V2.
    | { kind: "join"; name: string }
    | { kind: "role"; role: string }
    | { kind: "answer"; cueId: string; text: string }
    | { kind: "vote"; cueId: string; option: string }
    | { kind: "message"; cueId: string; text: string }
    | { kind: "ping" };
}

export type ClientMessage = HelloMsg | ReportMsg | CmdMsg | TabletEventMsg | PerfMsg | PhotoCapturedMsg | import('./mission').MissionEvent | {type:'packageReady';contentHash:string;ok:boolean} | {type:'experienceAudio';instance:string;status:'ended'|'error'};

// ---------------------------------------------------------------------------
// server -> client
// ---------------------------------------------------------------------------

/** Confirmare hello + snapshot complet. */
export interface WelcomeMsg {
  type: "welcome";
  serverTimeMs: number;
  state: ShowState;
  /** Show-ul curent (cue-uri + scene), ca renderer-ele/follower-ii sa nu depinda de fisiere locale. */
  show: import("./types").ShowFile;
  config: {
    lang: Lang;
    sync: { clockHz: number; seekThresholdSec: number; rateNudge: number };
  };
}

/** Ceas de sincronizare difuzat la clockHz catre ecrane (si consola). */
export interface ClockMsg {
  type: "clock";
  state: PlaybackState;
  phaseTime: number;
  serverTimeMs: number;
  rate: number;
}

/** Comanda retransmisa tuturor ecranelor (serverul este autoritatea). */
export interface ApplyCmdMsg {
  type: "applyCmd";
  cmd: Command;
  serverTimeMs: number;
}

/** Snapshot de stare pentru consola si tablete (la orice schimbare + 1 Hz). */
export interface StateMsg {
  type: "state";
  state: ShowState;
}

/** Un cue tocmai a fost declansat (informativ: consola, tablete). */
export interface CueFiredMsg {
  type: "cueFired";
  cue: Cue;
  serverTimeMs: number;
}

/** Mesaj pentru tablete: ce sa afiseze acum. */
export interface TabletViewMsg {
  type: "tabletView";
  theme: SceneTheme;
  sceneLabel: string;
  subtitle: { speaker: string; text: string; color: string } | null;
  /** Cue-ul este transmis explicit; clientul nu îl mai deduce din timp/text. */
  cueId: string | null;
  interaction: TabletCue["interaction"] | null;
  post: TabletPost | null;
  lens: string | null;
  /** Alegerile confirmate de server pentru tableta curentă. Nu conține date despre alte posturi. */
  zoneChoices: Partial<Record<TabletZone, { value: string; observed: boolean }>>;
  /** Compatibilitate V2 pentru consola existentă; interfața V3 nu afișează agregate. */
  aggregate?: Record<string, number>;
}

/** Lista tabletelor + raspunsurile lor (pentru consola). */
export interface TabletsMsg {
  type: "tablets";
  tablets: Array<{ id: string; name: string; role?: string; post?: TabletPost; connected: boolean; lastSeenMs: number }>;
  answers: Array<{
    tabletId: string;
    name: string;
    cueId: string;
    kind: "answer" | "vote" | "message" | "choice";
    text: string;
    atMs: number;
    post?: TabletPost;
    zone?: TabletZone;
    interactionType?: "color" | "pulse" | "perspective";
  }>;
}

export interface ErrorMsg {
  type: "error";
  reason: string;
  /** R4 — 4401 = neautentificat, 4403 = rol insuficient. */
  code?: number;
}

/** R4 — parametrii vizuali ai unei entitati (derivati din alegerile tabletelor), catre ecrane. */
export interface EntityParamsMsg {
  type: "entityParams";
  entity: Exclude<Speaker, "AVATAR_AI" | "CAPITANUL">;
  params: EntityParams;
}

/** R4 — text compus la runtime pe care ecranele il rostesc prin /api/tts (cue `dynamic-voice` sau comanda `say`). */
export interface DynamicVoiceMsg {
  type: "dynamicVoice";
  /** id stabil pentru cache (ex. "dyn-<cueId>-<hash>") */
  cueId: string;
  speaker: Speaker;
  text: string;
  lang: Lang;
  /** Daca true, subtitrarea se afiseaza; implicit true. */
  subtitle?: boolean;
}

/** R4 — fotografia de echipaj, retransmisa ecranelor si tabletelor. */
export interface PhotoMsg {
  runId?:string;
  photoRequestId?:string;
  expiresAt?:number;
  type: "photo";
  action: "countdown" | "capture" | "show" | "hide";
  countdownSec?: number;
  dataUrl?: string;
  showSec?: number;
}

/** R4 — agregat de performanta pentru consola/debug (toate ecranele). */
export interface PerfSummaryMsg {
  type: "perfSummary";
  samples: PerfSample[];
}

export type ServerMessage =
  | {type:'mission'; snapshot:import('./mission').MissionSnapshot}
  | {type:'missionAck';eventId:string;ok:boolean;status:string;reason?:string}
  | WelcomeMsg
  | ClockMsg
  | ApplyCmdMsg
  | StateMsg
  | CueFiredMsg
  | TabletViewMsg
  | TabletsMsg
  | ErrorMsg
  | EntityParamsMsg
  | DynamicVoiceMsg
  | PhotoMsg
  | PerfSummaryMsg;

// ---------------------------------------------------------------------------
// IPC Electron (preload -> renderer), expus ca window.nava
// ---------------------------------------------------------------------------

export interface NavaBridge {
  /** Config-ul complet + ecranul pe care ruleaza aceasta fereastra + URL-ul WS de folosit. */
  getBoot(): Promise<{
    config: import("./types").AppConfig;
    screen: import("./types").ScreenConfig;
    wsUrl: string;
    /** file:// URL-uri absolute, gata de pus in <video src> / loader GLB. */
    videoUrl: string;
    avatarUrl: string;
    voiceBaseUrl: string; // file:///.../assets/voice/
    showUrl: string; // file:///.../assets/show/show.json
    isDev: boolean;
    appVersion: string;
    // R4 (optionale pana la integrarea completa a main-ului)
    /** http://host:port al serverului master (pentru /api/tts, /api/dialog); null la follower fara acces. */
    serverHttpUrl?: string | null;
    /** security.screenToken — trimis in `hello` de fiecare ecran. */
    screenToken?: string;
    security?: Pick<SecurityConfig, "publicState">;
    /** "windows" (implicit) sau "span"; in span, `viewports` descrie fiecare ecran in fereastra unica. */
    displayMode?: "windows" | "span";
    viewports?: SpanViewport[];
    /** Varianta de scenariu activa. */
    variant?: string | null;
  }>;
  /** Log catre procesul main (scris in runs/<run>.jsonl). */
  log(level: "info" | "warn" | "error", msg: string, data?: unknown): void;
  /** Comenzi locale din tastatura ecranului master (trimise serverului prin main). */
  sendCommand(cmd: Command): void;
  /** Cere inchiderea aplicatiei (Esc x2 pe ecranul master in modul dev). */
  quit(): void;
}

declare global {
  interface Window {
    nava: NavaBridge;
  }
}
