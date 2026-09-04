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

import type { Lang, PlaybackState, SceneTheme, ShowState, Cue, TabletCue, TabletPost, TabletZone } from "./types";

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
}

/** Ecranul-sursa de ceas raporteaza pozitia video (4 Hz). */
export interface ReportMsg {
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
  | { action: "identifyScreens" }; // fiecare ecran isi afiseaza id-ul 3 s

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

export type ClientMessage = HelloMsg | ReportMsg | CmdMsg | TabletEventMsg;

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
}

export type ServerMessage =
  | WelcomeMsg
  | ClockMsg
  | ApplyCmdMsg
  | StateMsg
  | CueFiredMsg
  | TabletViewMsg
  | TabletsMsg
  | ErrorMsg;

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
