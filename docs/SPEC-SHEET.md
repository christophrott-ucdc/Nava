# Fișă tehnică și criterii de acceptanță — NavaPlayer

> Actualizat 2026-09-05 (agentul E, E-02). Sursa de adevăr pentru tipuri: `src/shared/types.ts`, `src/shared/protocol.ts`, `src/shared/contracts.ts`; pentru gărzile HTTP: `src/server/index.ts` + `src/server/auth.ts`. Rândurile marcate **R4** sunt runda 4; starea lor de implementare este în `HANDOFF-LIVE.md` §2.

## Scop

NavaPlayer orchestrează experiența „A Patra Lume" pe unul sau mai multe PC-uri Windows. Masterul rulează serverul și sursa de ceas; follower-ele redau aceeași cronologie prin WebSocket. Ecranul `center` al masterului este sursa de ceas, iar filmul nu conține audio.

## Cerințe funcționale

| ID | Cerință | Verificare |
|---|---|---|
| FR-01 | Player H.264 3840×2052/60 fps prin `file://`, cu `cover` sau `contain` | video pornește și permite seek |
| FR-02 | State machine `idle → preshow → playing ↔ paused → epilogue → ended` | consola și API-ul indică aceeași stare |
| FR-03 | Lead-in de lansare la T−10, film înghețat pe cadrul zero | countdown-ul se termină înainte să se miște Pământul |
| FR-04 | Cue-uri pentru voce, countdown, SFX, entități, tablete, teme și markere | `show.json` trece validarea |
| FR-05 | Avatar GLB cu transporter și lip-sync pentru `CAPITANUL` | comanda `testAvatar` nu blochează playerul |
| FR-06 | Cele 51 de asset-uri V3 (49 redate per rulare) rulează din manifestul local cu `fallback: silent`; TTS live/browser rămâne numai pentru teste explicite și `say`/`dynamic-voice` | lipsa unui MP3 produce subtitrare + tăcere, niciodată voce Windows în show |
| FR-07 | Consolă web cu stare, comenzi, scene, cue-uri, tablete și QR | operabilă pe desktop și telefon |
| FR-08 | Tabletă web cu post fix, două zone A/B, `paired-choice`, **DOAR PRIVESC** și reconectare | alegerea ajunge în consolă și run-log |
| FR-09 | Sincronizare follower: seek pentru drift mare, rate nudge pentru drift mic | comenzile se reflectă în sub 0,3 s pe LAN |
| FR-10 | Jurnal JSONL și erori explicite pentru fișiere lipsă | lipsa video/GLB nu produce crash |
| FR-11 **R4** | Autentificare cu PIN: sesiuni, cookie `nava_session`, roluri `viewer < operator < admin`, WS `hello.token`; PIN admin implicit `4078` | `npm run smoke:auth` (30 verificări) verde |
| FR-12 **R4** | Utilizatori în `data/users.json` (scrypt), CRUD admin, PIN unic 4–8 cifre, sesiunile utilizatorului invalidate la schimbarea PIN-ului | `smoke:auth`; `/debug/` panoul UTILIZATORI |
| FR-13 **R4** | Ecranele se autentifică cu `security.screenToken` (generat pe master la prima pornire, persistat în `config.json`) | follower cu token greșit primește `error 4401` și close |
| FR-14 **R4** | Pagina `/debug/`: stare, readiness, sănătate, preflight, perf per ecran, clienți, cue-uri, TTS, mediu, config redactat, utilizatori | `GET /api/debug/summary` ca `viewer` returnează toate secțiunile; `operatorPin` apare `****` |
| FR-15 **R4** | Preflight al asset-elor (51 clipuri: clip + fișier + ≥ 1 KiB + durată + `words`; film; GLB) la pornire, la reload și la cerere | `preflight.ok` în `/debug/`; run-log `preflight` |
| FR-16 **R4** | Readiness server-autoritar: pornirea automată (`preshowAutoStart`, `autoRun`) doar cu ecranele cerute conectate, `videoReady`, preflight nepicat; pornirea manuală mereu permisă | `ShowState.readiness.reasons` gol când totul e conectat |
| FR-17 **R4** | `displayMode: "span"`: o singură fereastră peste toate ecranele, `viewports[]` în boot; un singur `<video>` decodat și copiat pe câte un canvas per viewport (schelet: overlay-uri nescalate per viewport, testat cu un viewport) | fereastra acoperă uniunea display-urilor; `viewports` logate la boot; `mode=span(N)` în log-ul rendererului |
| FR-18 **R4** | Autostart (Task Scheduler prin `scripts/install-autostart.ps1` sau `config.autostart`), `powerSaveBlocker`, watchdog renderer (3 crash-uri/60 s → relaunch) | taskul `NavaPlayer` există; display-ul nu intră în sleep în show |
| FR-19 **R4** | Comenzi noi acceptate și validate de server: `rehearse`, `setRate`, `autoRun`, `lights`, `ambient`, `say`, `setVariant`, `photo`, `preflight` | `POST /api/cmd` răspunde `ok` / `409` cu motiv |
| FR-20 **R4** | Patru tipuri noi de cue în contract: `dynamic-voice`, `ambient`, `lights`, `photo` | validatorul editorului (`features/show-validate.ts`) le acceptă — vezi nota de mai jos |
| FR-21 **R4** | Ambianță procedurală per temă cu ducking sub voce, urmărește `theme` | `ambient.enabled` în `ShowState`; motorul silențios pe `playAudio: false` |
| FR-22 **R4** | Viseme precalculate în manifest (`visemes/vtimes/vdurations`), preferate la runtime | `node scripts/precompute-visemes.mjs --check` iese 0; preflight raportează `withVisemes = 51` |
| FR-23 **R4** | Perf la 1 Hz de la fiecare ecran (`PerfSample`) și agregat `perfSummary` pentru consolă/debug | tabelul PERFORMANȚĂ ECRANE din `/debug/` se umple cu un rând per ecran conectat |
| FR-24 **R4** | Rotația jurnalelor: `runs/` păstrează ultimele 20 `show-*.jsonl` și 20 `app-*.jsonl` | `POST /api/debug/rotate-runs` |

**Notă la FR-20:** la data actualizării, încărcarea show-ului la pornirea serverului (`loadShowFile`, `src/server/index.ts`) și `scripts/validate-show.mjs` acceptă doar cele 7 tipuri istorice; un `show.json` cu `dynamic-voice`/`ambient`/`lights`/`photo` este acceptat de editor (`PUT /api/show`) dar respins la următoarea pornire cu „tip de cue necunoscut". Show-ul V3.3 livrat nu conține cue-uri de tip nou, deci nu este afectat. (Semnalat în raportul E; fixul aparține orchestratorului.)

## Cerințe nefuncționale

- TypeScript strict, UI vanilla, fără servicii de rețea obligatorii; esbuild (`main`/`preload` CJS, `renderer`/`web/*` IIFE).
- Un singur executabil Windows; media mare rămâne externă.
- `contextIsolation: true`, `nodeIntegration: false`, ferestre fără navigare externă.
- Cheile API rămân numai în `.env`; valorile nu se loghează și nu se expun rendererului; `/debug/` arată doar prezența lor (da/nu).
- O singură ieșire audio activă implicit; ecranele follower pot calcula lip-sync fără sunet.
- Serverul limitează dimensiunea mesajelor WS (64 KiB), numărul de clienți (128), validează comenzile și închide clienții fără `hello` în 5 s.
- **R4:** PIN-urile se stochează doar ca `scrypt(pin, salt)` (N=16384, r=8, p=1); comparații în timp constant; rate limit login 8/5 min per IP; sesiunile expiră după `sessionTtlMin`.
- **R4:** un `config.json` scris înainte de R4 se încarcă neschimbat; fiecare câmp lipsă primește valoarea implicită; singura rescriere este `security.screenToken` pe master.
- **R4:** teste unitare `src/**/*.test.ts` rulate cu `npm test` (`scripts/test.mjs`); `npm run check` = typecheck + validate:show + validate:voices + build + test + smoke core/auth/platform/media.

## Configurație (`config.json`; implicite în `src/main/config.ts` și `CONFIG_DEFAULTS_R4`)

Cheile care încep cu `$` sunt comentarii și sunt ignorate. Căile relative sunt față de folderul executabilului (appRoot).

| Câmp | Sens | Implicit |
|---|---|---|
| `role` | `master` pornește serverul; `follower` se conectează la master | `master` |
| `masterUrl` | WebSocket-ul masterului în rol follower (`ws://` sau `wss://`) | `ws://192.168.1.10:4321/ws` (exemplu) |
| `server.port`, `server.bindHost` | server LAN | `4321`, `0.0.0.0` |
| `lang` | `ro`, `en` sau `fr` (doar limbile cu manifest populat sunt redabile) | `ro` |
| `show` | calea scenariului executabil | `assets/show/show.json` |
| `video.path`, `video.fit`, `video.preloadPoster` | filmul, încadrarea, posterul | `media/cinema_4k_h264.mp4`, `cover`, `true` |
| `avatar.glb`, `avatar.corner`, `avatar.widthPercent`, `avatar.marginPx` | aspectul avatarului | `assets/avatar/avatar-ai.glb`, `bottom-left`, `22` (5–60), `40` (0–500) |
| `avatar.body` **R4** | `"M"` / `"F"` — corpul pentru animațiile idle TalkingHead; trebuie să se potrivească vocii | lipsă → rendererul folosește `"M"` (vocea Căpitanului e masculină) |
| `avatar.glbBySpeaker` **R4** | GLB per vorbitor, ex. `{ "CAPITANUL": "assets/avatar/capitan.glb" }`; cheile necunoscute sunt ignorate cu avertisment | lipsă → `avatar.glb` |
| `audio.voiceVolume`, `audio.sfxVolume`, `audio.outputDeviceId` | ieșirea audio (0–1; `setSinkId` după id exact sau etichetă) | `1`, `0.8`, `default` |
| `screens[]` | `id`, `displayIndex`, `roleLabel?`, `showAvatar`, `showSubtitles`, `showEntities`, `playAudio`, `kiosk` | un ecran `center`; `playAudio` implicit `true` doar pe primul |
| `screens[].yawOffsetDeg` **R4** | unghiul ecranului față de axa frontală (°), −90…90; shift orizontal al filmului pe laterale | lipsă (0) |
| `sync.clockHz`, `sync.seekThresholdSec`, `sync.rateNudge` | sincronizarea | `4` (1–30), `0.25` (0,01–10), `0.03` (0–0,2) |
| `dev.openDevTools`, `dev.windowed` | diagnostic local | `false`, `false` |
| `displayMode` **R4** | `"windows"` = o fereastră kiosk per ecran; `"span"` = o fereastră peste toate ecranele | `windows` |
| `autostart` **R4** | executabilul împachetat se înregistrează la logon (HKCU Run, `--kiosk`) | `false` |
| `security.operatorPin` **R4** | PIN-ul adminului creat când lipsește `data/users.json` | `"4078"` |
| `security.screenToken` **R4** | tokenul comun al ecranelor (`[A-Za-z0-9_-]{16,128}`); gol pe master → generat (32 hex) și scris înapoi; gol/placeholder pe follower → eroare, ecranele vor fi refuzate | `""` |
| `security.sessionTtlMin` **R4** | durata sesiunii de consolă (minute, 1…525 600) | `720` |
| `security.usersFile` **R4** | fișierul utilizatorilor, relativ la appRoot; `sessions.json` stă lângă el | `data/users.json` |
| `security.publicState` **R4** | `true` = `/api/state` public; `false` = cere rol `viewer` | `true` |
| `ambient.enabled`, `ambient.volume`, `ambient.duck` **R4** | pat sonor procedural; volum relativ la `sfxVolume`; nivel sub voce | `true`, `0.5`, `0.25` |
| `lights.driver`, `lights.host`, `lights.universe`, `lights.hueUser`, `lights.groupId` **R4** | `none` / `artnet` (UDP 6454, univers 0–32767) / `hue` (REST) | `none` |
| `autoRun.enabled`, `autoRun.requireScreens[]`, `autoRun.requireTablets`, `autoRun.startTrigger`, `autoRun.resetAfterSec` **R4** | mod operator absent; `startTrigger`: `operator` / `tablet` / `immediate` | `false`, `["center"]`, `0`, `operator`, `0` |
| `variant` **R4** | varianta de scenariu activă (cheie din `show.json > variants`) | lipsă = textul de bază |

Exemple: `config.example.json` (un ecran, toate secțiunile comentate), `config.5screens.example.json` (5 TV-uri pe un PC, `yawOffsetDeg` −30…+30, `requireScreens` toate cinci), `config.follower.example.json` (un TV lateral pe alt PC).

Argumente CLI: `--config <cale>`, `--dev`, `--role master|follower`, `--screen <id>`, `--windowed`, `--kiosk`.

## Schema show-ului: cele 4 tipuri noi de cue (R4, `src/shared/types.ts`)

Toate extind `CueBase { id, phase, at, kind, note?, manual? }`.

```jsonc
// dynamic-voice — textul e compus de SERVER la runtime și trimis ecranelor ca `dynamicVoice` (redare prin /api/tts)
{ "id": "epi-kids-messages", "phase": "epilogue", "at": 20, "kind": "dynamic-voice",
  "speaker": "CAPITANUL",
  "source": "tablet-messages",            // | "tablet-choices-summary" | "live-dialog"
  "template": { "ro": "Am primit mesajele voastre pentru Pământ: {{items}}." },   // {{items}} {{count}} {{posts}}
  "maxItems": 5,
  "fallbackText": { "ro": "Nu am primit niciun mesaj, dar v-am auzit." } }

// ambient — pat sonor procedural (Web Audio), pe ecranele cu playAudio
{ "id": "amb-light", "phase": "play", "at": 60, "kind": "ambient",
  "action": "crossfade",                   // "start" | "stop" | "crossfade"
  "bed": "light",                          // SceneTheme; implicit tema curentă
  "gain": 1, "fadeSec": 4 }

// lights — scenă de lumină a sălii, aplicată de server prin adaptorul Art-Net / Hue (no-op la driver none)
{ "id": "lx-tech", "phase": "play", "at": 246, "kind": "lights", "theme": "tech", "fadeSec": 3 }

// photo — fotografie de echipaj cu webcam-ul ecranului center (schelet)
{ "id": "photo-crew", "phase": "epilogue", "at": 60, "kind": "photo", "countdownSec": 5, "showSec": 12 }
```

Câmpuri noi pe tipurile existente: `VoiceCue.variants` — `{ "7-9": { "ro": "…" } }`; audio-ul variantei: `assets/voice/<lang>/<id>.<variant>.mp3` = `manifest.clips["<id>.<variant>"]`. `ShowFile.variants` — `{ "7-9": { "label", "ageRange", "description?" } }`. Show-ul V3.3 declară `7-9`, `10-12`, `13+` și are text `7-9` pe 3 replici.

## Interfețe HTTP (`src/server/index.ts`; roluri: `public` · `viewer` · `operator` · `admin` · `screen|operator` = token de ecran sau operator)

| Metodă și rută | Rol minim | Ce face |
|---|---|---|
| `GET /`, `/control/*`, `/tablet/*`, `/login/*`, `/debug/*`, `/analytics/*` | public (fișiere statice) | aplicațiile web; datele lor sunt protejate la nivel de API |
| `GET /api/health` | public | versiune, rol, uptime, ecrane, tablete, `videoReady`, sursa de ceas, `state`, `showError` |
| `GET /api/state` | public dacă `security.publicState` (implicit), altfel viewer | `ShowState` complet (inclusiv `readiness`) |
| `GET /api/urls`, `GET /api/qr?url=&size=` | public | adresele LAN; PNG cu QR (doar `http(s)://`, ≤ 512 caractere) |
| `POST /api/auth/login { pin }` | public (8/5 min per IP) | cookie `nava_session` + `{ token, user, expiresAt }`; `401` PIN greșit; `429` prea multe |
| `POST /api/auth/logout` | public | șterge sesiunea și cookie-ul |
| `GET /api/auth/me` | public (răspunde `401` neautentificat) | `{ kind: "user", token, user }` sau `{ kind: "screen" }` |
| `GET /api/auth/sessions` | admin | sesiunile active (token trunchiat) |
| `GET /api/show`, `GET /api/cues`, `GET /api/config`, `GET /api/tablets`, `GET /api/run?n=` | viewer | show-ul curent; statusurile cue-urilor; config public (limbă, sync, volume, ecrane, căi); tablete + răspunsuri; coada run-log-ului |
| `POST /api/cmd { cmd } | cmd` | operator | orice `Command` validat; `preflight` este tratat direct; răspuns `{ ok, reason?, state }` (`409` dacă respinsă) |
| `POST /api/show/reload` | operator | recitire `show.json` + `welcome` tuturor + preflight |
| `PUT|POST /api/show` · `PATCH /api/show/cue/:id` · `GET /api/show/backups` · `POST /api/show/restore/:file` | operator | editorul de cue-uri: validare → backup (30) → scriere atomică → reload |
| `POST /api/player/focus` | operator | aduce fereastra playerului în față (doar pe master local) |
| `POST /api/tablets/clear` | operator | șterge răspunsurile sesiunii |
| `POST /api/tts`, `GET /api/tts/stats` (și `/api/tts/*`) | screen \| operator | TTS live cu cache pe disc; fără `screenToken` configurat și fără `Authorization`, cererile sunt acceptate (compatibilitate, logată o dată) |
| `POST /api/dialog { text, speaker?, lang?, context? }` | screen \| operator | răspunsul Căpitanului (Gemini sau replici pre-scrise), 20/min |
| `POST /api/certificates { post, dataUrl }` · `GET /api/certificates` · `GET /api/certificates/:run/:file` | operator | certificatele de misiune PNG (`runs/certificates/`) |
| `GET /api/lights` | viewer | starea adaptorului de lumini |
| `GET /api/analytics`, `/api/analytics/*` | viewer | rezervat pentru D-05 (rutele încă nemontate) |
| `GET /api/debug/summary` · `/perf?screen=&n=` · `/logs?n=` · `/runs` | viewer | datele paginii `/debug/` (config redactat, chei doar ca prezență) |
| `POST /api/debug/preflight` · `/rotate-runs` · `/clients/:id/close` | operator | acțiuni de depanare |
| `POST /api/debug/gc` | admin | `global.gc()` dacă Node a pornit cu `--expose-gc` |
| `GET /api/frame?t=&w=` | screen \| viewer | un cadru JPEG din film prin `ffmpeg` (cache în `cache/frames/`); `404` fără ffmpeg |
| `GET|POST /api/users` · `PATCH|DELETE /api/users/:id` · `POST /api/users/:id/pin` | admin | administrarea utilizatorilor |

Refuzurile sunt `401 { ok:false, reason, code:4401 }` (neautentificat) sau `403 { …, code:4403 }` (rol insuficient). Autentificarea se face prin cookie `nava_session` sau `Authorization: Bearer <token de sesiune | screenToken>`. CORS este `origin: *`.

## WebSocket `/ws` (`src/shared/protocol.ts`)

Primul mesaj este `hello { client: screen|control|tablet, id, name?, post?, isClockSource?, token? }`. **R4:** `control` trebuie să trimită tokenul de sesiune; `screen` trimite `security.screenToken`; tabletele nu trimit token. Refuz: `error { reason, code: 4401 | 4403 }` urmat de close cu același cod. Alte închideri: `1008` fără/dublu `hello`, `1013` server ocupat (128 clienți), `1001` oprire.

| Direcție | Mesaj | Cine | Conținut |
|---|---|---|---|
| client → server | `report` | ecranul-sursă de ceas, ~4 Hz | `state, phaseTime, rate (≤ 8), videoReady, sceneId` |
| client → server | `cmd` | `control` cu rol ≥ operator (viewer primește `error 4403`) | `Command` (inclusiv cele 9 comenzi R4) |
| client → server | `tablet` | tablete | `set-post`, `choice { cueId, zone, value }` (+ evenimentele V2 păstrate); `choice` cu `cueId: "__start__"` = cerere de start în `autoRun` cu `startTrigger: "tablet"` |
| client → server **R4** | `perf` | fiecare ecran, ~1 Hz | `PerfSample { videoDropped, videoTotal, videoFps, avatarFps, lipsyncLatencyMs, driftSec, roomLevel, heapMb, audioOutput }` |
| client → server **R4** | `photoCaptured` | ecranul `center` | `{ cueId, dataUrl }` JPEG/PNG ≤ ~1,5 MB → salvat în `runs/photos/`, redifuzat ca `photo show` 12 s |
| server → client | `welcome` | toți | `serverTimeMs, state, show, config { lang, sync }` |
| server → client | `clock` | ecrane + consolă, la `clockHz` | ancora de ceas |
| server → client | `applyCmd` | ecrane | comanda retransmisă |
| server → client | `state` | consolă + tablete, la schimbare + 1 Hz | `ShowState` (+ `readiness`, `autoRun`, `variant`, `ambientEnabled`, `lightsDriver`) |
| server → client | `cueFired`, `tabletView`, `tablets` | consolă / tablete | ca înainte |
| server → client **R4** | `entityParams` | ecrane + consolă | `{ entity, params { color?, pulseBpm?, perspective?, intensity?, votes? } }` derivate din alegerile tabletelor |
| server → client **R4** | `dynamicVoice` | ecrane + consolă | `{ cueId, speaker, text, lang, subtitle? }` — de redat prin `/api/tts` |
| server → client **R4** | `photo` | ecrane + tablete + consolă | `{ action: countdown|capture|show|hide, countdownSec?, dataUrl?, showSec? }` |
| server → client **R4** | `perfSummary` | consolă, 1 Hz | `{ samples: PerfSample[] }` |
| server → client | `error` | oricine | `{ reason, code? }` |

## Acceptanță înainte de livrare

1. `npm run check` se termină fără erori (include `smoke:auth`).
2. `npm run dev -- --windowed` deschide playerul; `/api/health` răspunde; `/login/` acceptă PIN-ul, `/control/` și `/debug/` se încarcă autentificat, `/tablet/` fără autentificare.
3. `/debug/` arată preflight verde (51/51 voci, 51 cu viseme) și readiness `ready: true` cu ecranele configurate conectate.
4. Pre-show-ul rulează cue-urile vocale la 4/15/24/35/43 s și pornește automat lead-in-ul la 50 s (numai cu readiness verde).
5. Startul începe la T−10; filmul pornește la zero; tăietura la 465 s intră în epilog.
6. Pause, play, seek, scene jump, fire cue, stop voice, volume, language, identify, epilogue și restart funcționează; `rehearse 4` accelerează video + voci și `setRate 1` revine; `ambient` oprește/pornește patul sonor; `say` produce subtitrare (și voce dacă există cheie TTS).
7. O tabletă se reconectează cu același id și trimite post/alegere; un `viewer` nu poate trimite comenzi.
8. Un follower cu `screenToken` copiat primește show-ul, comenzile și ceasul; cu token greșit este refuzat cu `4401`.
9. `npm run dist` produce executabilul portabil și installerul; `scripts/install-autostart.ps1` înregistrează taskul.
10. Pe PC-ul de show: repetiție completă cu cinci ecrane, LAN, sunet și cinci tablete reale; PIN-ul `4078` schimbat.
