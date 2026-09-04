# Fișă tehnică și criterii de acceptanță

## Scop

NavaPlayer orchestrează experiența „A Patra Lume” pe unul sau mai multe PC-uri Windows. Masterul rulează serverul și sursa de ceas; follower-ele redau aceeași cronologie prin WebSocket. Ecranul central al masterului este sursa de ceas, iar filmul nu conține audio.

## Cerințe funcționale

| ID | Cerință | Verificare |
|---|---|---|
| FR-01 | Player H.264 3840×2052/60 fps prin `file://`, cu `cover` sau `contain` | video pornește și permite seek |
| FR-02 | State machine `idle → preshow → playing ↔ paused → epilogue → ended` | consola și API-ul indică aceeași stare |
| FR-03 | Lead-in de lansare la T−10, film înghețat pe cadrul zero | countdown-ul se termină înainte să se miște Pământul |
| FR-04 | Cue-uri pentru voce, countdown, SFX, entități, tablete, teme și markere | `show.json` trece validarea |
| FR-05 | Avatar GLB cu transporter și lip-sync pentru `AVATAR_AI` | comanda `testAvatar` nu blochează playerul |
| FR-06 | Fallback audio: manifest → TTS live → `speechSynthesis` | lipsa cheilor nu oprește show-ul |
| FR-07 | Consolă web cu stare, comenzi, scene, cue-uri, tablete și QR | operabilă pe desktop și telefon |
| FR-08 | Tabletă web cu nume, rol, întrebare/vot/mesaj și reconectare | răspunsul ajunge în consolă și run-log |
| FR-09 | Sincronizare follower: seek pentru drift mare, rate nudge pentru drift mic | comenzile se reflectă în sub 0,3 s pe LAN |
| FR-10 | Jurnal JSONL și erori explicite pentru fișiere lipsă | lipsa video/GLB nu produce crash |

## Cerințe nefuncționale

- TypeScript strict, UI vanilla, fără servicii de rețea obligatorii.
- Un singur executabil Windows; media mare rămâne externă.
- `contextIsolation: true`, `nodeIntegration: false`, ferestre fără navigare externă.
- Cheile API rămân numai în `.env`; valorile nu se loghează și nu se expun rendererului.
- O singură ieșire audio activă implicit; ecranele follower pot calcula lip-sync fără sunet.
- Serverul limitează dimensiunea mesajelor, validează comenzile și închide clienții fără handshake.

## Configurație

| Câmp | Sens | Implicit |
|---|---|---|
| `role` | `master` pornește serverul; `follower` se conectează la master | `master` |
| `masterUrl` | WebSocket-ul masterului în rol follower | — |
| `server.port`, `bindHost` | server LAN | `4321`, `0.0.0.0` |
| `lang` | `ro`, `en` sau `fr` | `ro` |
| `show` | calea scenariului executabil | `assets/show/show.json` |
| `video.path`, `fit` | filmul și modul de încadrare | `media/cinema_4k_h264.mp4`, `cover` |
| `avatar.glb`, `corner`, `widthPercent`, `marginPx` | aspectul avatarului | GLB inclus, stânga-jos, 22%, 40 px |
| `audio.voiceVolume`, `sfxVolume`, `outputDeviceId` | ieșirea audio | `1`, `0.8`, `default` |
| `screens[]` | id, displayIndex, overlay-uri, audio și kiosk per fereastră | un ecran `center` |
| `sync.clockHz`, `seekThresholdSec`, `rateNudge` | sincronizarea | `4`, `0.25`, `0.03` |
| `dev.openDevTools`, `dev.windowed` | diagnostic local | `false`, `false` |

Argumente CLI: `--config <cale>`, `--dev`, `--role master|follower`, `--screen <id>`, `--windowed`.

## Interfețe

HTTP: `/api/health`, `/api/state`, `/api/show`, `/api/show/reload`, `/api/cues`, `/api/config`, `/api/cmd`, `/api/urls`, `/api/qr`, `/api/tablets`, `/api/tablets/clear`, `/api/run`, `/api/tts`, `/api/tts/stats`.

WebSocket: `/ws`. Primul mesaj este `hello`; contractele complete sunt în `src/shared/protocol.ts`. Tipurile scenei, configurației și vocii sunt în `src/shared/types.ts` și `src/shared/contracts.ts`.

## Acceptanță înainte de livrare

1. `npm run check` se termină fără erori.
2. `npm run dev -- --windowed` deschide playerul; `/api/health` răspunde și ambele pagini web se încarcă.
3. Pre-show-ul rulează cue-urile la 0/8/28/48 s.
4. Startul începe la T−10; filmul pornește la zero.
5. Pause, play, seek, scene jump, fire cue, stop voice, volume, language, identify, epilogue și restart funcționează.
6. O tabletă se reconectează cu același id și trimite rol/răspuns/mesaj.
7. Un follower primește show-ul, comenzile și ceasul masterului.
8. `npm run dist` produce executabilul portabil și installerul.
9. Pe PC-ul de show se face o repetiție completă cu ecranele, LAN-ul, sunetul și tabletele reale.
