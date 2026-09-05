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
  AVATAR_AI: { id: "AVATAR_AI", label: "VOCEA NAVEI", color: "#7dd3fc", lipsyncAvatar: false, fx: "hologram" },
  CAPITANUL: { id: "CAPITANUL", label: "CĂPITANUL", color: "#e2e8f0", lipsyncAvatar: true, fx: "clean" },
  LUMINA: { id: "LUMINA", label: "AVATAR LUMINĂ", color: "#fcd34d", lipsyncAvatar: false, fx: "choir" },
  NATURA: { id: "NATURA", label: "AVATAR NATURĂ", color: "#86efac", lipsyncAvatar: false, fx: "forest" },
  TEHNOLOGIC: { id: "TEHNOLOGIC", label: "TEHNOLOGICA", color: "#a5f3fc", lipsyncAvatar: false, fx: "crystal" },
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
  | "marker" // doar informativ (afisat in consola operatorului)
  // R4 (runda 4) — vezi HANDOFF-LIVE.md §2
  | "dynamic-voice" // text compus la runtime de server (mesajele copiilor, rezumatul alegerilor, dialog live) -> /api/tts
  | "ambient" // pat sonor procedural per tema (start/stop/crossfade) cu ducking sub voce
  | "lights" // scena de lumina a salii (adaptor Art-Net / Hue; no-op daca lights.driver = none)
  | "photo"; // fotografie de echipaj cu webcam (numaratoare + captura + afisare)

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
  /**
   * R4 — variante de text pe grupe de varsta (cheile din ShowFile.variants, ex. "7-9", "10-12", "13+").
   * Fisierul audio al unei variante: assets/voice/<lang>/<id>.<variant>.mp3 (manifest: clips["<id>.<variant>"]).
   * Daca varianta activa lipseste, se foloseste textul/clipul de baza.
   */
  variants?: Record<string, Partial<Record<Lang, string>>>;
}

/** R4 — replica al carei text este compus de server la runtime (nu exista audio pre-generat). */
export interface DynamicVoiceCue extends CueBase {
  kind: "dynamic-voice";
  speaker: Speaker;
  /** De unde vine textul: mesajele trimise de pe tablete, rezumatul alegerilor, sau dialogul live. */
  source: "tablet-messages" | "tablet-choices-summary" | "live-dialog";
  /** Sablon cu {{items}} / {{count}} / {{posts}}; ex. "Am primit mesajele voastre pentru Pamant: {{items}}." */
  template?: { ro: string };
  /** Cate elemente maxim intra in text (mesaje). */
  maxItems?: number;
  /** Textul rostit daca nu exista date (ex. nimeni nu a scris). */
  fallbackText?: { ro: string };
}

/** R4 — pat sonor procedural (Web Audio) legat de tema scenei. */
export interface AmbientCue extends CueBase {
  kind: "ambient";
  action: "start" | "stop" | "crossfade";
  /** Tema al carei pat sonor se porneste (implicit tema curenta). */
  bed?: SceneTheme;
  gain?: number;
  fadeSec?: number;
}

/** R4 — schimbare de lumina in sala (adaptor in src/server/features/lights.ts). */
export interface LightsCue extends CueBase {
  kind: "lights";
  theme: SceneTheme;
  fadeSec?: number;
}

/** R4 — fotografie de echipaj cu webcam-ul ecranului `center` (schelet). */
export interface PhotoCue extends CueBase {
  kind: "photo";
  countdownSec?: number;
  /** Afiseaza fotografia pe ecrane/tablete N secunde dupa captura. */
  showSec?: number;
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

export const TABLET_POSTS: Record<TabletPost, { label: string; lens: string; perspectives: readonly [string, string] }> = {
  1: { label: "POSTUL 1", lens: "NAVIGAȚIE", perspectives: ["DIRECȚIE", "TRASEU"] },
  2: { label: "POSTUL 2", lens: "PROPULSIE", perspectives: ["ENERGIE", "STABILITATE"] },
  3: { label: "POSTUL 3", lens: "COMUNICAȚII", perspectives: ["CUVINTE", "SEMNAL"] },
  4: { label: "POSTUL 4", lens: "BIOSEMNALE", perspectives: ["PULS", "LEGĂTURĂ"] },
  5: { label: "POSTUL 5", lens: "MEMORIE", perspectives: ["AMINTIRE", "TIMP"] },
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

export type Cue =
  | VoiceCue
  | CountdownCue
  | SfxCue
  | EntityCue
  | TabletCue
  | ThemeCue
  | MarkerCue
  | DynamicVoiceCue
  | AmbientCue
  | LightsCue
  | PhotoCue;

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
  /** R4 — variante ale show-ului pe grupe de varsta; `default` este textul de baza din cue-uri. */
  variants?: Record<string, { label: string; ageRange: string; description?: string }>;
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
  /**
   * R4 — unghiul (grade) al ecranului fata de axa frontala a cockpitului; 0 = ecranul central.
   * Ecranele laterale primesc un decupaj/shift orizontal al filmului proportional cu unghiul (hublou).
   * Ex.: -30 babord exterior, -15 babord interior, +15 tribord interior, +30 tribord exterior.
   */
  yawOffsetDeg?: number;
}

// ---------------------------------------------------------------------------
// R4 — sectiuni noi de configurare (toate optionale; valorile implicite sunt in CONFIG_DEFAULTS_R4)
// ---------------------------------------------------------------------------

export interface SecurityConfig {
  /** PIN-ul administratorului implicit, folosit la crearea data/users.json daca lipseste. */
  operatorPin: string;
  /** Token partajat pe care ecranele (renderer-e) il trimit in `hello`; generat la prima pornire daca lipseste. */
  screenToken: string;
  /** Durata unei sesiuni de consola (minute). */
  sessionTtlMin: number;
  /** Cale relativa la appRoot pentru utilizatori (JSON, PIN-uri hash-uite cu scrypt). */
  usersFile: string;
  /** Daca false, tabletele au acces si la /api/state; altfel doar la WS-ul lor. */
  publicState: boolean;
}

export interface AmbientConfig {
  enabled: boolean;
  /** 0..1, relativ la audio.sfxVolume. */
  volume: number;
  /** Cat de mult scade patul sonor sub voce (0..1, 0.25 = -12 dB aprox.). */
  duck: number;
}

export interface LightsConfig {
  driver: "none" | "artnet" | "hue";
  /** Art-Net: IP-ul nodului; Hue: IP-ul bridge-ului. */
  host?: string;
  /** Art-Net: universul (0..32767). */
  universe?: number;
  /** Hue: username-ul aplicatiei pe bridge; groupId: grupul de lumini. */
  hueUser?: string;
  groupId?: string;
}

export interface AutoRunConfig {
  /** Mod operator absent: show-ul ruleaza singur cand conditiile de readiness sunt indeplinite. */
  enabled: boolean;
  /** Ecranele care trebuie conectate (id-uri din screens[] si de pe follower-e) inainte de pornire. */
  requireScreens: string[];
  /** Cate tablete trebuie conectate (0 = nu conteaza). */
  requireTablets: number;
  /** Ce declanseaza pornirea: operatorul, o tableta (butonul mare de la intrare) sau imediat cand e gata. */
  startTrigger: "operator" | "tablet" | "immediate";
  /** Dupa terminarea epilogului, revine automat in idle dupa N secunde (0 = ramane). */
  resetAfterSec: number;
}

export interface AppConfig {
  role: "master" | "follower";
  /** Folosit doar de follower: ws://<ip-master>:<port>/ws */
  masterUrl?: string;
  server: { port: number; bindHost: string };
  lang: Lang;
  show: string;
  video: { path: string; fit: "cover" | "contain"; preloadPoster: boolean };
  avatar: {
    glb: string;
    corner: "bottom-left" | "bottom-right";
    widthPercent: number;
    marginPx: number;
    /** R4 — sexul corpului pentru TalkingHead (animatii idle); trebuie sa se potriveasca cu vocea personajului. */
    body?: "M" | "F";
    /** R4 — GLB diferit per vorbitor (ex. Capitan barbat); cheia lipsa cade pe `glb`. */
    glbBySpeaker?: Partial<Record<Speaker, string>>;
  };
  audio: { voiceVolume: number; sfxVolume: number; outputDeviceId: string };
  screens: ScreenConfig[];
  sync: { clockHz: number; seekThresholdSec: number; rateNudge: number };
  dev: { openDevTools: boolean; windowed: boolean };
  /**
   * R4 — "windows": o fereastra kiosk per ecran (implicit); "span": o singura fereastra peste toate
   * ecranele, un singur <video> decodat si desenat pe cate un canvas per viewport (economie GPU).
   */
  displayMode?: "windows" | "span";
  /** R4 — porneste aplicatia la logon (Task Scheduler / setLoginItemSettings). */
  autostart?: boolean;
  security?: SecurityConfig;
  ambient?: AmbientConfig;
  lights?: LightsConfig;
  autoRun?: AutoRunConfig;
  /** R4 — varianta de scenariu activa (cheie din ShowFile.variants); lipsa = textul de baza. */
  variant?: string;
}

export const CONFIG_DEFAULTS_R4 = {
  displayMode: "windows" as const,
  autostart: false,
  security: {
    operatorPin: "4078",
    screenToken: "",
    sessionTtlMin: 720,
    usersFile: "data/users.json",
    publicState: true,
  } satisfies SecurityConfig,
  ambient: { enabled: true, volume: 0.5, duck: 0.25 } satisfies AmbientConfig,
  lights: { driver: "none" } satisfies LightsConfig,
  autoRun: {
    enabled: false,
    requireScreens: ["center"],
    requireTablets: 0,
    startTrigger: "operator",
    resetAfterSec: 0,
  } satisfies AutoRunConfig,
} as const;

/** Viewport-ul unui ecran in modul `span` (coordonate in fereastra unica). */
export interface SpanViewport {
  screenId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
}

// ---------------------------------------------------------------------------
// R4 — utilizatori / sesiuni (server)
// ---------------------------------------------------------------------------

export type UserRole = "admin" | "operator" | "viewer";

export interface UserRecord {
  id: string;
  name: string;
  role: UserRole;
  /** scrypt(pin, salt) hex. PIN-ul nu se stocheaza niciodata in clar. */
  pinHash: string;
  salt: string;
  createdAt: string;
  lastLoginAt?: string;
  disabled?: boolean;
}

export interface UsersFile {
  version: 1;
  users: UserRecord[];
}

export interface SessionInfo {
  token: string;
  userId: string;
  name: string;
  role: UserRole;
  createdAt: string;
  expiresAt: string;
}

// ---------------------------------------------------------------------------
// R4 — masuratori de performanta raportate de fiecare ecran (1 Hz)
// ---------------------------------------------------------------------------

export interface PerfSample {
  screenId: string;
  atMs: number;
  videoDropped: number;
  videoTotal: number;
  videoFps: number | null;
  avatarFps: number | null;
  /** Intarzierea intre pornirea audio-ului si primul visem (ms); null daca nu s-a masurat. */
  lipsyncLatencyMs: number | null;
  driftSec: number | null;
  /** Nivelul de zgomot al salii 0..1 (microfon), null daca dezactivat. */
  roomLevel: number | null;
  heapMb: number | null;
  audioOutput: string | null;
}

/** R4 — parametrii vizuali ai unei entitati, derivati din alegerile tabletelor. */
export interface EntityParams {
  /** Culoarea dominanta (hex) — LUMINA. */
  color?: string;
  /** Batai pe minut pentru pulsatie — NATURA. */
  pulseBpm?: number;
  /** Cheia perspectivei alese — TEHNOLOGIC. */
  perspective?: string;
  /** Intensitate generala 0..1. */
  intensity?: number;
  /** Cate perechi au ales (pentru cresterea densitatii). */
  votes?: number;
}

/** R4 — poarta de pregatire inainte de pornirea automata. */
export interface Readiness {
  ready: boolean;
  screensConnected: string[];
  screensMissing: string[];
  tabletsConnected: number;
  tabletsRequired: number;
  videoReady: boolean;
  /** null = preflight nerulat; true/false = rezultatul verificarii asset-elor vocale. */
  assetsOk: boolean | null;
  reasons: string[];
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
  /** R4 — optionale pana la integrarea completa. */
  readiness?: Readiness;
  autoRun?: boolean;
  variant?: string | null;
  ambientEnabled?: boolean;
  lightsDriver?: LightsConfig["driver"];
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
