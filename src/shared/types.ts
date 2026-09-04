/**
 * Contracte comune (tipuri) pentru intregul executabil:
 *   - main (Electron), server (Node/Hono/ws), renderer (player), web (control + tablete).
 * ACEST FISIER ESTE SURSA DE ADEVAR. Orice modificare se anunta in docs/HANDOFF.md.
 */

// ---------------------------------------------------------------------------
// Personaje / vorbitori
// ---------------------------------------------------------------------------

/** Vorbitorii din scenariul "A Patra Lume" (docs/reference/scenariu.txt). */
export type Speaker =
  | "AVATAR_AI" // Vocea/interfata navei — HUD fara corp umanoid
  | "CAPITANUL" // Personajul GLB de pe ecranul dedicat, cu lip-sync; fara prezenta fizica in sala
  | "LUMINA" // Avatarul Planetei Luminii — entitate procedurala aurie in centru
  | "NATURA" // Avatarul Planetei Naturii — entitate procedurala verde (ramuri, ploaie)
  | "TEHNOLOGIC"; // Avatarul Planetei Tehnologiei — entitate procedurala de cristal cyan

export type Lang = "ro" | "en" | "fr";

export interface SpeakerProfile {
  id: Speaker;
  /** Eticheta afisata deasupra subtitrarii. */
  label: string;
  /** Culoare OKLCH/hex folosita pentru subtitrare, entitate si tema tabletelor. */
  color: string;
  /** Daca personajul GLB al Capitanului face lip-sync la aceasta voce. */
  lipsyncAvatar: boolean;
  /** Efect audio aplicat la redare (vezi src/renderer/voice). */
  fx: "clean" | "hologram" | "choir" | "forest" | "crystal";
}

export const SPEAKERS: Record<Speaker, SpeakerProfile> = {
  AVATAR_AI: { id: "AVATAR_AI", label: "AVATARUL NAVEI", color: "#7dd3fc", lipsyncAvatar: false, fx: "hologram" },
  CAPITANUL: { id: "CAPITANUL", label: "CĂPITANUL", color: "#e2e8f0", lipsyncAvatar: true, fx: "clean" },
  LUMINA: { id: "LUMINA", label: "AVATAR LUMINĂ", color: "#fcd34d", lipsyncAvatar: false, fx: "choir" },
  NATURA: { id: "NATURA", label: "AVATAR NATURĂ", color: "#86efac", lipsyncAvatar: false, fx: "forest" },
  TEHNOLOGIC: { id: "TEHNOLOGIC", label: "AVATAR TEHNOLOGIC", color: "#a5f3fc", lipsyncAvatar: false, fx: "crystal" },
};

// ---------------------------------------------------------------------------
// Show (assets/show/show.json)
// ---------------------------------------------------------------------------

/**
 * Faza in care traieste un cue:
 *  - preshow : sala, video oprit pe primul cadru; cue-urile se declanseaza pe un timer
 *              pornit de operator (butonul "PRE-SHOW") sau manual, unul cate unul.
 *  - play    : video ruleaza; `at` = secunde in timeline-ul video (video.currentTime).
 *  - epilogue: dupa taietura determinista a filmului; continuitate pe aceleasi ecrane/posturi,
 *              cu ultimul cadru, HUD si vocile finale.
 */
export type Phase = "preshow" | "play" | "epilogue";

export type CueKind =
  | "voice" // replica vorbita (audio pre-generat sau TTS) + subtitrare
  | "countdown" // numaratoare inversa vizuala 10..0 in centrul ecranului
  | "sfx" // efect sonor sintetizat (rumble, val sonor, whoosh)
  | "entity" // arata/ascunde entitatea unei civilizatii (LUMINA/NATURA/TEHNOLOGIC)
  | "tablet" // trimite tabletelor o interactiune (intrebare, vot, rol)
  | "theme" // schimba tema de culoare (sala/tablete/subtitrari)
  | "marker"; // doar informativ (afisat in consola operatorului)

export interface CueBase {
  /** Identificator unic, stabil (folosit ca nume de fisier audio: assets/voice/<lang>/<id>.mp3). */
  id: string;
  phase: Phase;
  /** Secunde de la inceputul fazei (pentru play = video.currentTime). */
  at: number;
  kind: CueKind;
  /** Nota pentru operator / regizor. */
  note?: string;
  /** Daca true, cue-ul NU se declanseaza automat; operatorul il lanseaza din consola. */
  manual?: boolean;
}

export interface VoiceCue extends CueBase {
  kind: "voice";
  speaker: Speaker;
  /** Textul pe limbi. `ro` este obligatoriu. */
  text: Partial<Record<Lang, string>> & { ro: string };
  /** Indicatie de interpretare pentru TTS (din scenariu, ex. "voce grava, linistita"). */
  direction?: string;
  /** Daca lipseste, subtitrarea se afiseaza cat dureaza audio-ul. */
  subtitleHoldMs?: number;
  /** `silent` interzice vocea Windows/browser când asset-ul de producție lipsește. */
  fallback?: "browser" | "silent";
}

export interface CountdownCue extends CueBase {
  kind: "countdown";
  from: number; // ex. 10
  to: number; // ex. 0
  /** Durata totala in secunde (implicit from-to). */
  durationSec?: number;
  /** Daca true, AVATAR_AI numara cu voce (necesita audio pentru "10".."1" in assets/voice). */
  spoken?: boolean;
}

export interface SfxCue extends CueBase {
  kind: "sfx";
  sfx: "liftoff-rumble" | "low-swell" | "wormhole-whoosh" | "arrival-chime" | "rain" | "white-fade";
  durationSec?: number;
  gain?: number;
}

export interface EntityCue extends CueBase {
  kind: "entity";
  entity: Exclude<Speaker, "AVATAR_AI" | "CAPITANUL">;
  action: "show" | "hide";
}

/** Cele cinci posturi fizice. O tabletă aparține unui singur post, nu unui copil. */
export type TabletPost = 1 | 2 | 3 | 4 | 5;

/** Cele două jumătăți egale ale unei tablete, câte una pentru fiecare copil din pereche. */
export type TabletZone = "A" | "B";

/** Valoare stabilă pentru participarea prin observație, independentă de textul afișat. */
export const TABLET_OBSERVE_VALUE = "observe" as const;

export const TABLET_POSTS: Record<TabletPost, { label: string; lens: string }> = {
  1: { label: "POSTUL 1", lens: "NAVIGAȚIE" },
  2: { label: "POSTUL 2", lens: "PROPULSIE" },
  3: { label: "POSTUL 3", lens: "COMUNICAȚII" },
  4: { label: "POSTUL 4", lens: "BIOSEMNALE" },
  5: { label: "POSTUL 5", lens: "MEMORIE" },
};

/**
 * Opțiunile V3 pot fi compacte (doar textul) sau pot include un simbol/o culoare.
 * `value` este valoarea stabilă trimisă serverului; `label` este textul pentru copii.
 */
export type TabletOption =
  | string
  | { value: string; label: string; symbol?: string; color?: string };

export type TabletV3Interaction =
  | { type: "post-assign"; posts: string[] }
  | {
      type: "paired-choice";
      prompt: string;
      options: TabletOption[];
      allowObserve: true;
      mode: "color" | "pulse" | "perspective";
      timeoutSec?: number;
    };

export interface TabletCue extends CueBase {
  kind: "tablet";
  interaction:
    | { type: "waiting" }
    | { type: "role-pick"; roles: string[] }
    | { type: "question"; prompt: string; maxLen?: number }
    | { type: "vote"; prompt: string; options: string[] }
    | { type: "message"; prompt: string; maxLen?: number }
    | { type: "thanks" }
    | TabletV3Interaction;
}

export interface ThemeCue extends CueBase {
  kind: "theme";
  theme: SceneTheme;
}

export interface MarkerCue extends CueBase {
  kind: "marker";
  label: string;
}

export type Cue = VoiceCue | CountdownCue | SfxCue | EntityCue | TabletCue | ThemeCue | MarkerCue;

export type SceneTheme =
  | "prologue" // albastru adanc, stea pulsand
  | "launch" // albastru + alb, energie
  | "light" // auriu cald
  | "nature" // verde-umed
  | "tech" // albastru-otel, cristal
  | "void" // Gargantua / wormhole: negru + violet
  | "home" // Saturn / Pamant: albastru casa
  | "white"; // epilog: alb cald

export interface Scene {
  id: string;
  label: string;
  phase: Phase;
  /** Secunde (in faza respectiva) la care incepe scena. */
  start: number;
  /** Secunde la care se termina (exclusiv). Pentru ultima scena "play" = durata video. */
  end: number;
  theme: SceneTheme;
  /** Corespondenta cu scriptul SpaceEngine (docs/reference/spaceengine-script.txt). */
  spaceEngineBeat?: string;
}

export interface ShowFile {
  $schema?: string;
  title: string;
  version: string;
  /** Durata video-ului in secunde (informativ; se citeste si din fisier). */
  videoDurationSec: number;
  /**
   * "provisional" = timings derivate din scriptul SpaceEngine (suma Wait-urilor), NEVERIFICATE pe video.
   * "aligned"     = verificate pe cadre reale (media/analysis/contact_sheet_*.png).
   */
  timingStatus: "provisional" | "aligned";
  preshowAutoStart: boolean;
  /**
   * Lead-in al fazei `play`, in secunde (implicit 10). La comanda `start`, faza `play` incepe la
   * phaseTime = -launchLeadInSec cu video-ul OPRIT pe cadrul 0 (Pamantul mare in fereastra);
   * phaseTime creste pe timer; cue-urile cu `at` negativ (numaratoarea inversa, „Initiez secventa
   * de lansare…") se declanseaza in acest interval; la phaseTime = 0 video-ul porneste (liftoff) si
   * de atunci phaseTime = video.currentTime. Astfel Pamantul se indeparteaza DUPA „zero", ca in scenariu.
   */
  launchLeadInSec: number;
  /** Daca true, la `ended` al video-ului se intra automat in faza `epilogue`; altfel se asteapta operatorul. */
  epilogueOnVideoEnd: boolean;
  scenes: Scene[];
  cues: Cue[];
}

// ---------------------------------------------------------------------------
// Configuratie (config.json)
// ---------------------------------------------------------------------------

export interface ScreenConfig {
  id: string;
  displayIndex: number;
  roleLabel?: string;
  showAvatar: boolean;
  showSubtitles: boolean;
  showEntities: boolean;
  playAudio: boolean;
  kiosk: boolean;
}

export interface AppConfig {
  role: "master" | "follower";
  /** Folosit doar de follower: ws://<ip-master>:<port>/ws */
  masterUrl?: string;
  server: { port: number; bindHost: string };
  lang: Lang;
  show: string;
  video: { path: string; fit: "cover" | "contain"; preloadPoster: boolean };
  avatar: { glb: string; corner: "bottom-left" | "bottom-right"; widthPercent: number; marginPx: number };
  audio: { voiceVolume: number; sfxVolume: number; outputDeviceId: string };
  screens: ScreenConfig[];
  sync: { clockHz: number; seekThresholdSec: number; rateNudge: number };
  dev: { openDevTools: boolean; windowed: boolean };
}

// ---------------------------------------------------------------------------
// Stare de redare (partajata master -> toti)
// ---------------------------------------------------------------------------

export type PlaybackState = "idle" | "preshow" | "playing" | "paused" | "epilogue" | "ended";

export interface ShowState {
  state: PlaybackState;
  /** Secunde in faza curenta (pentru playing/paused = video.currentTime). */
  phaseTime: number;
  /** Timpul serverului (ms epoch) la care a fost esantionat phaseTime. */
  serverTimeMs: number;
  rate: number;
  sceneId: string | null;
  theme: SceneTheme;
  lang: Lang;
  /** Ultimul cue vocal declansat (pentru subtitrare pe tablete / consola). */
  lastVoiceCueId: string | null;
  /** Numar de ecrane conectate (renderer-e) si tablete. */
  screensConnected: number;
  tabletsConnected: number;
  videoPath: string;
  videoReady: boolean;
}

// ---------------------------------------------------------------------------
// Voce (clipuri pre-generate / runtime)
// ---------------------------------------------------------------------------

export interface VoiceClipMeta {
  cueId: string;
  lang: Lang;
  speaker: Speaker;
  text: string;
  /** Cale relativa la assets/voice/<lang>/ */
  file: string;
  mime: "audio/mpeg" | "audio/wav";
  durationMs: number;
  /** Cuvinte + timpi (ms) + durate (ms), pentru lip-sync TalkingHead. */
  words: string[];
  wtimes: number[];
  wdurations: number[];
  /** Optional: viseme precalculate (Oculus: sil PP FF TH DD kk CH SS nn RR aa E I O U). */
  visemes?: string[];
  vtimes?: number[];
  vdurations?: number[];
  provider: "elevenlabs" | "gemini" | "browser";
  generatedAt: string;
}

export interface VoiceManifest {
  lang: Lang;
  generatedAt: string;
  clips: Record<string, VoiceClipMeta>;
}
