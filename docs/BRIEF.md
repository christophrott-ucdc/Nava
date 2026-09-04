# BRIEF DE LUCRU — „A Patra Lume" · Nava (player + server + avatar)

> Sursa unică de adevăr pentru toți agenții care lucrează în paralel la acest repo.
> Citește integral înainte de a scrie cod. Contractele din `src/shared/*.ts` sunt obligatorii.
> Limba documentației: română. Limba codului și a comentariilor: engleză (scurt și clar).
>
> **Actualizare V3 (2026-09-04):** pentru scenariu, timing și operare, secțiunile istorice de mai jos sunt înlocuite de `docs/SCENARIU-REGIZORAL-10-MIN.md`, `assets/show/show.json`, `docs/OPERARE.md` și ultima secțiune din `HANDOFF.md`. Configurația actuală are cinci tablete pentru cinci perechi, Căpitan digital exclusiv în fereastra GLB `center`, fără personaj fizic/Unitree și fără capsulă VR. Masterul video este tăiat determinist la 465 s, apoi urmează epilogul continuu până la durata publică totală de 10:00. Toate cele 51 de asset-uri V3 sunt pre-generate (49 redate într-o rulare, fiindcă una dintre trei ramuri adaptive este aleasă); cue-urile de producție nu folosesc TTS Windows/browser.

---

## 0. Ce construim, în două fraze

Un **singur executabil Windows** (Electron + Node) care redă un film 4K de călătorie prin spațiu (randat în SpaceEngine) sincronizat pe **5 televizoare 4K**, cu un **avatar 3D (GLB) vorbitor cu lip-sync** suprapus în colțul din stânga-jos, care rostește replicile scenariului „A Patra Lume" la momentele exacte din film. Același executabil este și **server Node** pentru **consola operatorului** și pentru **tabletele interactive** ale celor 10 copii.

Publicul: copii (10 per sesiune), în cinci perechi la cinci posturi și cinci tablete, într-o sală de 17×7 m amenajată ca navă spațială, la UCDC HUB AI (Universitatea Creștină „Dimitrie Cantemir", București). Durata experienței este exact 10 minute, într-un flux continuu în aceeași sală.

## 1. Context și proveniență

- **Scenariul actual**: `docs/SCENARIU-REGIZORAL-10-MIN.md`; `docs/reference/scenariu-docx.txt` rămâne numai sursă istorică. Cele 7 scene sunt Semnalul → Decolarea → Lumea Luminii → Lumea Naturii → Lumea Tehnologiei → A patra lume → Protocolul Acasă. **CĂPITANUL** este singurul humanoid GLB și apare exclusiv pe ecranul `center`; nu există robot/personaj fizic în sală. **AVATARUL NAVEI** este voce + HUD, iar LUMINA, NATURA și TEHNOLOGIC sunt forme non-umanoide.
- **Filmul**: `C:\Users\Chris\Documents\GitHub\Video\Cinema.mp4` — 7,09 GB, HEVC **Rext 4:4:4** (nedecodabil hardware, nu se redă în Chromium), **3840×2052** (raport 1,87:1, nu 16:9), **60 fps**, 76 Mbps, **741,77 s (12:21)**, **fără pistă audio**, keyframe la fiecare 1 s. Se transcodează cu NVENC în `media/cinema_4k_h264.mp4` (H.264 High 4:2:0, ~45 Mbps) — rulează în fundal; există `media/transcode_4k.log`.
- **Scriptul de cameră SpaceEngine**: `docs/reference/spaceengine-script.txt`. Ruta: Pământ → Siwarha (Lumea I, Lumina) → Kepler-186 d (Lumea II, Natura) → Mann (Lumea III, Tehnologia; sistemul Gargantua) → Gargantua → Wormhole → Saturn → Pământ. Suma `Wait`-urilor dă ~625 s, DAR video-ul real are 741,77 s și **structura reală diferă** (vezi §6). Wait-urile succesive marchează locurile unde erau replicile („NO_TEXT" = varianta fără text pe ecran).
- **Proiectul-sursă „Exodus"** (`C:\Users\Chris\Documents\GitHub\Exodus`, rezumat complet în `docs/reference/EXODUS_SUMMARY.md`): portalul de comandă al navei EXODUS 01 cu ofițerul AI ARIA-7. De acolo luăm **avatarul GLB** (`avatars/avatar.glb` = „BiologV2.glb", generat cu Avaturn; copiat aici ca `assets/avatar/avatar-ai.glb`; are toate cele 15 viseme Oculus + blendshape-uri ARKit + rig Mixamo, deci merge cu TalkingHead) și **cod de referință de portat**:
  - `src/components/ship/AvatarStage.tsx` + `src/lib/talkingHead.ts` — inițializarea TalkingHead (opțiuni, importul static al modulelor lipsync, `speakAudio` cu `words/wtimes/wdurations`, recuperare la pierderea contextului WebGL, diagnosticul viseme-lor).
  - `src/components/ship/Transporter.tsx` + `src/styles.css` (keyframes `aria-materialize`/`aria-dematerialize`, `.aria-transporter-fx`) — efectul de „teleportare" la apariția avatarului.
  - `src/lib/audio-synth.ts` — sunete sintetizate Web Audio (transporter, ambient, one-shots).
  - `backend/src/routes/tts.ts` + `src/utils/tts.functions.ts` — proxy TTS Gemini/ElevenLabs cu cache pe disc (sha256), rate-limit, wrap PCM→WAV.
  - `src/components/sound/useRadioTts.ts` — lanț de filtre Web Audio (nu folosim „radio" aici, dar structura de redare + ducking + `decodeAudioData` e utilă).
  - `src/lib/ariaStage.ts` — protocol BroadcastChannel (model pentru protocolul nostru WS).
  - `src/lib/showDirector.ts` — versiunea veche a scenariului (aceleași replici, cu diacritice), utilă pentru verificarea textelor.
- **Utilizatorul nu are** un GLB numit „Christoph"; s-a căutat pe tot discul. Folosim `avatar-ai.glb` și lăsăm calea configurabilă (`config.avatar.glb`).
- **Nu există chei API în repo** (Exodus nu are `.env`). Cele 51 de asset-uri V3 sunt deja pre-generate în `assets/voice/ro`; regenerarea se face cu `npm run tts` după configurarea locală a `.env`. Cue-urile V3 au `fallback: "silent"`: lipsa unui asset nu activează vocea browserului. **Nu citi și nu copia niciodată secrete.**

## 2. Mașina de dezvoltare / de show (ce știm)

Windows 11 Pro 26200, AMD Ryzen 9 5950X (16C/32T), 16 GB RAM, **NVIDIA RTX 4080** (driver 32.0.16.1074), monitor DELL S3225QS 3840×2160, Node **v24.19.0**, npm 11.17, ffmpeg/ffprobe 9.0.1 (winget Gyan), extensia HEVC Microsoft instalată. Pentru 5 TV-uri: un RTX 4080 are 4 ieșiri → fie un al doilea GPU/MST hub, fie **PC-uri „follower"** care rulează același executabil în rol de follower și se sincronizează prin rețea (suportăm ambele).

## 3. Arhitectură (decisă — nu se mai discută în această rundă)

```
NavaPlayer.exe (Electron 44)
├─ main (Node, src/main)         ferestre kiosk per ecran (screen.getAllDisplays), config, IPC, log, pornește serverul dacă role=master
├─ server (Node, src/server)     Hono + @hono/node-server + ws  ->  http://<ip>:4321
│    /control  consola operatorului (src/web/control, vanilla TS)
│    /tablet   aplicația tabletelor (src/web/tablet, vanilla TS)
│    /ws       WebSocket unic: ecrane (screen), consolă (control), tablete (tablet)   — vezi src/shared/protocol.ts
│    /api/*    state, show, cmd, qr, tts (live, cu cache pe disc), health
├─ renderer (Chromium, src/renderer)  PLAYER: <video> 4K + overlay-uri
│    ├─ timeline: citește show.json, declanșează cue-uri după video.currentTime (faza play) / timer (preshow, epilogue)
│    ├─ avatar (src/renderer/avatar):  TalkingHead + avatar-ai.glb, colț stânga-jos, lip-sync pe audio pre-generat
│    ├─ voice  (src/renderer/voice):   manifest local pentru V3; lipsa unui asset de producție → subtitrare + tăcere
│    ├─ subtitrări, numărătoare inversă, entități procedurale (LUMINĂ / NATURĂ / TEHNOLOGIC), teme de culoare
│    └─ sync: ecranul „center" al masterului = sursa de ceas; ceilalți corectează drift (seek > 0,25 s, altfel playbackRate ±3 %)
└─ preload (src/preload)          expune window.nava (contextBridge) — vezi NavaBridge în protocol.ts
```

**Reguli tehnice:**
- TypeScript strict peste tot; **fără framework UI** (vanilla TS + DOM) în renderer și web — kiosk simplu, zero dependențe în plus.
- Bundling cu **esbuild** (`scripts/build.mjs`): `main` și `preload` → CJS (`external: electron`), `renderer` și `web/*` → IIFE browser. HTML/CSS se copiază în `dist/`.
- Renderer-ul se încarcă cu `loadFile(dist/renderer/index.html)`; video-ul și assets-urile se referă prin **URL-uri `file://` absolute** (suport nativ de range requests → seek).
- Electron: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false` (TalkingHead are nevoie de WebGL, nu de Node). Switch-uri: `autoplay-policy=no-user-gesture-required`, `ignore-gpu-blocklist`.
- Dependențe deja declarate în `package.json` (NU adăuga altele; dacă chiar e nevoie, scrie în raport): `electron`, `electron-builder`, `esbuild`, `typescript`, `hono`, `@hono/node-server`, `ws`, `qrcode`, `three`, `@met4citizen/talkinghead`. **`npm install` rulează deja în fundal — NU rula tu `npm install`.** Dacă `node_modules` lipsește când testezi, așteaptă/încearcă din nou.
- Nu face commit și nu face push (le face orchestratorul). Nu modifica fișiere din afara folderelor tale (§5). Dacă un contract din `src/shared` trebuie schimbat, propune schimbarea în raport, nu o face unilateral.
- Fără secrete în cod. Cheile se citesc din `process.env` (încărcat din `.env` de un mic loader propriu în main, fără pachet `dotenv`).

## 4. Fluxul show-ului (state machine, vezi `PlaybackState` în types.ts)

`idle` → click oriunde / `Space` / `Enter` / cmd `preshow` → **`preshow`**: video afișat pe cadrul 0, cue-uri vocale V3 la 4/15/24/35/43 s și rolurile celor cinci posturi pe tablete. La 50 s pornește automat lansarea.
→ (cmd `start`) → **`playing`**: video de la 0; cue-urile `play` se declanșează după `video.currentTime`. Operatorul poate `pause`/`play`/`seek`/`skipToScene`/`fireCue`.
→ la tăietura configurată de 465 s sau (cmd `epilogue`) → **`epilogue`**: ultimul cadru persistă și trece continuu în alb cald; publicul rămâne la aceleași posturi.
→ (cmd `restart`) → `idle`.

Regulă de declanșare (renderer): la fiecare frame, toate cue-urile fazei curente cu `at <= phaseTime` și nedeclanșate se declanșează în ordine. La **seek înapoi**, cue-urile cu `at > phaseTime` redevin nedeclanșate. La **seek înainte**, cue-urile sărite se marchează declanșate FĂRĂ a rula, cu excepția `theme` (se aplică ultima temă) și `entity` (se aplică starea finală show/hide). O singură voce simultan: o voce nouă o oprește pe cea anterioară.

## 5. Împărțirea pe agenți și proprietatea fișierelor

| Agent | Foldere/fișiere pe care le DEȚINE | Livrabil |
|---|---|---|
| **A · Electron main + build + packaging** | `src/main/**`, `src/preload/**`, `scripts/build.mjs`, `scripts/media-transcode.mjs`, `scripts/media-contact-sheet.mjs`, `electron-builder.yml`, `build/` (icon) | executabilul pornește, deschide ferestrele kiosk per ecran, încarcă config, expune `window.nava`, pornește serverul (importă `startServer` din `src/server/index.ts`), `npm run build` / `npm run dist` funcționează |
| **B · Renderer player** | `src/renderer/**` EXCEPT `src/renderer/avatar/**` și `src/renderer/voice/**` | `index.html`, `styles.css`, `index.ts` (boot), `timeline.ts` (cue engine), `sync.ts` (client WS + corecție drift), `ui/subtitles.ts`, `ui/countdown.ts`, `ui/entities.ts` (Lumină/Natură/Tehnologic procedurale, animate cu `voice.getAmplitude()`), `ui/theme.ts`, `ui/osd.ts` (identify screen, mesaje de eroare, „video lipsă") |
| **C · Avatar + voce** | `src/renderer/avatar/**`, `src/renderer/voice/**`, `src/server/tts-providers.ts`, `scripts/tts-generate.mjs`, `assets/voice/**` | `createAvatarController` (TalkingHead + GLB + transporter + lip-sync din `words/wtimes/wdurations` sau viseme; modul **lipsync-ro** propriu: română → viseme Oculus), `createVoiceEngine` (manifest local; fallback controlat per cue), generatorul de voci cu **timestamps ElevenLabs** și cele trei montaje de audiție V3 |
| **D · Server + web (control + tablete)** | `src/server/**` EXCEPT `tts-providers.ts`, `src/web/control/**`, `src/web/tablet/**` | `startServer()` (Hono + ws), state machine + ceas, retransmitere comenzi, tablete (join/rol/răspuns/vot/mesaj), `/api/tts` cu cache pe disc (folosește `synthesize()` din `tts-providers.ts`), QR, run-log JSONL în `runs/`, consola operatorului, aplicația tabletelor |
| **F · Documentație / handoff** | `HANDOFF.md` (rădăcină), `README.md`, `docs/**` EXCEPT `docs/BRIEF.md` și `docs/reference/**` | `HANDOFF.md` = documentul pe care îl citește orice AI care preia proiectul (ce, de ce, cum, scenariu, decizii, stare, pași următori); `docs/SPEC-SHEET.md`, `docs/SCENARIU.md`, `docs/CUE-SHEET.md`, `docs/OPERARE.md`, `docs/DECIZII.md` |
| **Orchestrator (Claude principal)** | `src/shared/**`, `assets/show/show.json`, `package.json`, `config.example.json`, `.env.example`, `.gitignore`, `docs/BRIEF.md`, `media/**`, integrare finală, commit | alinierea cue-urilor pe video (din planșele de cadre), integrare, build, test, commit pe branch `board/nava-player` |

## 6. Structura REALĂ a video-ului (din `media/analysis/contact_sheet_10s.png`, 1 cadru / 10 s)

Aceasta înlocuiește cronologia din scriptul SpaceEngine. Orchestratorul rafinează la 2 s și actualizează `show.json` (`timingStatus: aligned`). Valorile de mai jos sunt ±5 s.

| Interval video | Conținut | Scenă / temă |
|---|---|---|
| 0:00–0:20 | Pământul cu Calea Lactee în fundal, se îndepărtează | `launch` — numărătoare inversă, „Inițiez secvența de lansare…", „Priviți…" |
| 0:20–1:05 | spațiu întunecat, o galaxie/nebuloasă îndepărtată crește | zbor interstelar spre Lumea I |
| 1:10–2:15 | **planetă cu inele uriașe într-o nebuloasă turcoaz** (Siwarha) — orbită | `light` — Planeta Luminii: Avatar AI + Avatar LUMINĂ ×2 + Căpitan „Mai departe" |
| 2:20–2:55 | câmp de stele, zbor | tranziție |
| 3:00–4:05 | **planetă albastră, oceanică, cu nori** (Kepler-186 d) — orbită | `nature` — Planeta Naturii: Avatar AI + Avatar NATURĂ ×2 + ploaie |
| 4:10–4:35 | dungi de stele (warp) | tranziție |
| 4:40–5:50 | **planetă întunecată cu inele în fața unei stele foarte strălucitoare și a discului de acreție cald (Mann + Gargantua)** | `tech` — Planeta Tehnologiei: Avatar AI + Avatar TEHNOLOGIC ×2 (întrebarea pivot), tăcere, Căpitan „pregătește întoarcerea", AI „Coordonate spre casă" |
| 5:50–6:35 | apropiere + traversare wormhole (dungi) | `void` |
| 6:40–7:45 | **Pământul**, semilună albastră | `revelation`; playerul oprește masterul la 465 s și trece automat în epilogul continuu |

Saturn nu apare distinct la eșantionarea de 10 s (posibil între 6:30 și 6:40 sau absent).

## 7. Convenții UI

- Estetică: HUD sci-fi întunecat, cyan/albastru (paleta din Exodus: `oklch(0.78 0.16 215)` cyan, `oklch(0.85 0.18 200)` glow, fundal `oklch(0.14 0.03 250)`), fonturi de sistem (Bahnschrift / Segoe UI), fără fonturi din rețea.
- Subtitrări: jos-centru, mari (≥ 2,2 % din înălțimea ecranului la 4K ≈ 48 px), etichetă vorbitor colorată (`SPEAKERS[].color`), fundal semitransparent, apar/dispar cu fade 250 ms, se țin 800 ms după terminarea audio.
- Avatar: colț stânga-jos, lățime `config.avatar.widthPercent` % din ecran (implicit 22 %), margine 40 px, canvas transparent peste video, beam-in la prima replică AVATAR_AI, permanent vizibil apoi, „ascultă" (privire uşor laterală) când vorbesc alții.
- Entități: centru-ecran, ≤ 40 % din înălțime, apar cu fade, animate de amplitudinea vocii; dispar la `entity hide`.
- Tema (`SceneTheme`) colorează marginile subtitrărilor, vignette-ul subtil și tabletele.
- Tastatură pe ecranul master: din idle, `Space`/`Enter` pornesc pre-show-ul complet și `S` sare direct la lansare; în timpul filmului, `Space` play/pause; `P` preshow, `R` restart, `E` epilog, `←/→` seek ±5 s, `I` identify screens, `F` fullscreen toggle, `Esc` ×2 în 1 s = ieșire (doar `dev.windowed`).

## 8. Definiția „gata" pentru fiecare agent

1. Codul compilează cu `npm run typecheck` (fără erori în folderele tale) și se bundle-uiește cu `npm run build` (după ce `node_modules` există).
2. Fără `any` nejustificat; erori tratate (fișier video lipsă, GLB lipsă, manifest lipsă, server indisponibil → UI-ul explică, nu crapă).
3. La final, scrie un raport (în răspunsul tău final) cu: fișierele create, API-urile exportate (semnături), ce s-a testat și cum, ce a rămas de făcut, orice abatere de la contracte. Orchestratorul integrează și rulează.
4. Pentru F: documentele trebuie să fie suficiente pentru ca un AI fără acces la această conversație să înțeleagă și să continue. Include o secțiune „STARE / UNDE AM RĂMAS" care va fi actualizată la final.

## 9. Semnături inter-agent (fixe)

```ts
// src/server/index.ts  (D)  — consumat de src/main (A)
export interface ServerHandle {
  port: number;
  urls: { control: string; tablet: string; ws: string; lanIp: string };
  stop(): Promise<void>;
  /** Comandă venită de la tastatura ecranului master (prin IPC) — serverul o tratează ca pe una din consolă. */
  dispatchCommand(cmd: import("../shared/protocol").Command): void;
}
export async function startServer(opts: {
  config: import("../shared/types").AppConfig;
  appRoot: string;       // folderul cu assets/ și media/ (dezvoltare: rădăcina repo; packaged: dirname(exe) sau resourcesPath)
  webDir: string;        // dist/web (conține control/ și tablet/)
  showPath: string;      // cale absolută la show.json
  cacheDir: string;      // cache/ (tts)
  runsDir: string;       // runs/ (jurnale JSONL)
  log: (level: "info" | "warn" | "error", msg: string, data?: unknown) => void;
}): Promise<ServerHandle>;

// src/server/tts-providers.ts  (C)  — consumat de src/server (D) și scripts/tts-generate.mjs (C)
export type TtsResult =
  | { ok: true; audio: Buffer; mime: "audio/mpeg" | "audio/wav"; durationMs: number;
      words: string[]; wtimes: number[]; wdurations: number[]; provider: "elevenlabs" | "gemini" }
  | { ok: false; reason: string };
export function resolveVoiceId(speaker: import("../shared/types").Speaker, provider: "elevenlabs" | "gemini"): string;
export async function synthesize(opts: {
  text: string; speaker: import("../shared/types").Speaker; lang: import("../shared/types").Lang;
  provider?: "elevenlabs" | "gemini";
}): Promise<TtsResult>;

// src/renderer/avatar/index.ts (C):  export const createAvatarController: CreateAvatarController
// src/renderer/voice/index.ts  (C):  export const createVoiceEngine: CreateVoiceEngine
//   (tipurile în src/shared/contracts.ts) — consumate de src/renderer/index.ts (B)
```

## 10. Cum se rulează (după integrare)

```bash
npm install                      # o singură dată (rulează deja)
cp config.example.json config.json
npm run build && npx electron . --config config.json --dev   # fereastră, DevTools la nevoie
# consola: http://localhost:4321/control   tablete: http://<ip-lan>:4321/tablet
npm run dist                     # dist-app/NavaPlayer-portable.exe + installer
```

---

## 11. Actualizări după alinierea pe cadre (orchestrator, 2026-09-04 18:10)

**Transcodarea s-a terminat**: `media/cinema_4k_h264.mp4` — H.264 High L5.2, 3840×2052, 60 fps, yuv420p, 741,78 s, 2,50 GB, ~27 Mbps (NVENC p5, cq 20; 10 min la 1,22× realtime). Se redă în Chromium cu decodare hardware.

**Structura reală a filmului** (planșe la 2 s: `media/analysis/sheet_a_000-216s.png`, `sheet_b_216-432s.png`; la 1 s: `sheet_c_385-415s_1s.png`):

| Secunde | Conținut |
|---|---|
| 0–20 | Pământul mare la 0 s, se îndepărtează, dispare la ~20 s; Calea Lactee în fundal |
| 20–72 | zbor; nebuloasa-țintă apare la 36 s și crește |
| 74–137 | **Siwarha** — planetă cu inele într-o nebuloasă turcoaz, orbită (Planeta Luminii); viraj de plecare 138–143 |
| 144–178 | zbor în câmp de stele |
| 180–244 | **Kepler-186 d** — planetă albastră oceanică, orbită (Planeta Naturii); iese din cadru 242–245 |
| 246–280 | dungi de stele (warp) |
| 282–352 | **Mann** în fața discului de acreție Gargantua (Planeta Tehnologiei); viraj 353–358 |
| 360–402 | wormhole / dungi de stele |
| 403–465 | **Pământul** (semilună albastră); revelația se încheie la tăietura deterministă, apoi epilog continuu |

Nu există un beat Saturn în render. Scriptul SpaceEngine (625 s) este doar referință de rută.

**Două câmpuri noi în `ShowFile` (src/shared/types.ts)** — `show.json` v0.2.0 le folosește:
- `launchLeadInSec: 10` — la comanda `start`, faza `play` începe la `phaseTime = -10` cu video-ul OPRIT pe cadrul 0 (Pământul mare); phaseTime crește pe timer, iar numărătoarea 10→0 se declanșează la −10; la `phaseTime = 0` video-ul pornește (`liftoff-rumble` la 0) și de atunci `phaseTime = video.currentTime`. `pause` în lead-in oprește timerul; `seek` la t<0 reintră în lead-in. Scena `launch` are `start: -10`. Slider-ul din consolă acoperă [−10, 465], afișând negativul ca `T-0:07`.
- `epilogueOnVideoEnd: true` — când playerul atinge `videoDurationSec: 465`, intră automat în epilogul continuu de 75 s. Operatorul poate declanșa epilogul mai devreme pentru repetiții.

**Notă de integrare**: agenții B și D au pornit înainte de aceste două câmpuri; orchestratorul aplică semantica lead-in-ului în `player.ts`/`state.ts` la integrare dacă lipsește.
