# NavaPlayer — „A Patra Lume · Protocolul Acasă"

NavaPlayer este playerul și serverul local al experienței imersive „A Patra Lume" de la UCDC HUB AI: un singur executabil Windows (Electron + Node) redă filmul 4K sincronizat pe cinci ecrane, suprapune Căpitanul 3D cu lip-sync și subtitrările, rulează scenariul V3.3 pe cue-uri (600 s: pre-show 50 s + lead-in 10 s + film 465 s + epilog 75 s) și servește consola operatorului, pagina de depanare și cele cinci tablete ale celor zece copii.

**Citiți întâi:** [HANDOFF.md](HANDOFF.md) (imaginea proiectului) și [HANDOFF-LIVE.md](HANDOFF-LIVE.md) (starea live a rundei 4 — ce este gata și ce este schelet). Arhitectura ratificată: [docs/BRIEF.md](docs/BRIEF.md).

## Pornire în dezvoltare

Cerințe: Windows 11, Node.js 22+, npm și filmul H.264 4:2:0 la `media/cinema_4k_h264.mp4` (2,5 GB, nu este în Git și nu este în installer).

```powershell
npm install
Copy-Item config.example.json config.json
npm run check                  # tipuri + show + voci + build + teste + smoke (core, auth, platform, media)
npm run dev -- --windowed
```

Sau dublu-click pe `RUN.bat` (`--kiosk`, `--no-control`, `--check`, `--help`).

După pornire în rolul `master`:

| Adresă | Ce este | Acces |
|---|---|---|
| `http://localhost:4321/control/` | consola operatorului | login cu PIN (implicit **4078** — schimbați-l înainte de public) |
| `http://localhost:4321/debug/` | stare, readiness, preflight, perf, clienți, config redactat, utilizatori | login cu PIN |
| `http://<ip-lan>:4321/tablet/?post=1..5` | aplicația copiilor | public |
| `http://localhost:4321/api/health` | stare scurtă | public |

Pe ecranul master: click / **PORNEȘTE EXPERIENȚA** / `Space` pornește fluxul complet; `S` sare direct la lansare; `Space` pauză/reluare în film; `E` epilog; `R` restart; `I` identifică ecranele. Consola din browser este doar regie; filmul și Căpitanul sunt în fereastra Electron **A Patra Lume — Nava** (**ARATĂ PLAYERUL** o readuce în față).

## Configurare

`config.json` este ignorat de Git; porniți de la `config.example.json` (un ecran), `config.5screens.example.json` (5 TV-uri pe un PC) sau `config.follower.example.json` (PC secundar; copiați `security.screenToken` din `config.json` al masterului, generat la prima pornire). Referința completă a câmpurilor, rutelor și rolurilor: [docs/SPEC-SHEET.md](docs/SPEC-SHEET.md). Procedura de show: [docs/OPERARE.md](docs/OPERARE.md). Securitate pe LAN: [docs/SECURITATE.md](docs/SECURITATE.md). Avatarul Căpitanului (GLB, viseme, casting): [docs/AVATAR.md](docs/AVATAR.md). Decizii: [docs/DECIZII.md](docs/DECIZII.md).

## Voci

Pista V3.3 (51 clipuri ElevenLabs, 49 redate per rulare) este pre-generată în `assets/voice/ro/` cu manifest de cuvinte **și viseme precalculate**; toate cue-urile de producție au `fallback: "silent"` (niciodată voce Windows în show). Regenerare (cere `ELEVENLABS_API_KEY` în `.env`, niciodată în Git):

```powershell
npm run tts -- --source assets/show/voice-script-v3.json --provider elevenlabs [--cue <id>]
node scripts/precompute-visemes.mjs        # visemes/vtimes/vdurations în manifest
npm run voice:reels && npm run qa:voices && npm run sync:voices && npm run check
```

Textele se schimbă numai în `assets/show/voice-script-v3.json`; `assets/show/show.json` este singura sursă executabilă; `npm run docs:cues` regenerează `docs/CUE-SHEET.md`.

## Distribuție

```powershell
npm run dist                                       # dist-app/NavaPlayer-0.1.0-x64-{portable,setup}.exe (nesemnate)
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-autostart.ps1   # Task Scheduler "NavaPlayer", --kiosk la logon
```

Copiați `media/cinema_4k_h264.mp4` lângă executabil. Pentru verificarea vizuală a compositorului: `electron --remote-debugging-port=19191 . --config config.json --windowed` apoi `npm run smoke:renderer`.

## Structură

- `src/main`, `src/preload`: Electron, ferestre (`windows` / `span`), config + `screenToken`, watchdog, autostart, IPC;
- `src/renderer`: player, timeline, sincronizare, overlay-uri, `avatar/` (TalkingHead, lipsync-ro, casting), `voice/` (manifest, redare, ambianță);
- `src/server`: Hono + WebSocket, mașina de stări + readiness, auth/utilizatori, preflight, debug, `features/` (lumini, dialog, dynamic-voice, editor show, certificate);
- `src/web/control`, `tablet`, `login`, `debug`: aplicațiile web;
- `src/shared`: contractele TypeScript obligatorii;
- `assets/show/show.json`: scenariul executabil; `assets/voice/ro/`: vocile; `assets/avatar/`: GLB-ul;
- `scripts`: build, verificări, TTS, viseme, autostart, heartbeat, utilitare media.

Proiect privat, fără licență de redistribuire (`UNLICENSED`).
