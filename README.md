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
| `http://localhost:4321/analytics/` | rulări, grafice, răspunsuri și detalii de misiune | login cu PIN |
| `http://localhost:4321/wall/` | calibrare Samsung 98–98–115–98–98, preview din film și export profil | login cu PIN |
| `http://localhost:4321/shared/preview.html` | galeria Nava Glass, componente și opt teme | public, dezvoltare |
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
- `src/web/control`, `tablet`, `login`, `debug`, `analytics`: aplicațiile web; `src/web/shared`: sistemul Nava Glass și mascotele;
- `src/shared`: contractele TypeScript obligatorii;
- `assets/show/show.json`: scenariul executabil; `assets/voice/ro/`: vocile; `assets/avatar/`: GLB-ul;
- `scripts`: build, verificări, TTS, viseme, autostart, heartbeat, utilitare media.

Proiect privat, fără licență de redistribuire (`UNLICENSED`).

## Nava Glass R5

Toate suprafețele folosesc sistemul luminos Nava Glass: cinci tablete de post și o tabletă separată pentru operator, toate la **1920×1080 landscape**. Pe fiecare tabletă de copii, A este în stânga și B în dreapta, fără rotirea textului și fără scroll în show. În portret apare mesajul de rotire. Consolele de dezvoltare rămân responsive.

Cele opt teme urmăresc show-ul; loginul rămâne în prologue. Cele șase mascote PNG au alpha real și variante 1024/256. Rendererul TV folosește materiale statice fără backdrop blur, subtitrări la 48 px în 4K și spațiu rezervat GLB-ului existent. Căpitanul apare numai pe TV-ul configurat; integrarea Unitree H2 nu face parte din R5.

Cele cinci SFX locale ale tabletelor se activează după primul gest, la volum 35%. Câmpul opțional `tabletSfx` din config este implicit `true`; **Regie → Sunete tablete** permite operatorului să-l schimbe pentru sesiunea curentă. Schimbarea este difuzată prin starea existentă, fără rescrierea configurației. Reduced-motion oprește animațiile decorative și confetti.

Rezultatele software, capturile înainte/după și repetiția fizică rămasă sunt în [docs/DESIGN-REVIEW.md](docs/DESIGN-REVIEW.md). Filmul, GLB-ul, vocile, scenariul și timpii au fost păstrați.

## Peretele Samsung și consola de prezentare

Configurația 98–98–115–98–98 pe un singur PC are un profil separat: `config.samsung-wall.example.json`. `npm run wall:configure` derivă `config.wall.local.json` din configurația existentă, fără a suprascrie baza; `npm run wall:preview` arată cele cinci suprafețe într-o fereastră. Profilul local a fost creat în această sesiune.

Atelierul `/wall/` permite crop panoramic coordonat, cinema integral central cu ambient lateral, dimensiuni/goluri în mm, grilă, indexare și export. Filmul local este 3840×2052; panorama care umple peretele decupează puternic sursa. Presetul cinema îi păstrează compoziția. Căpitanul rămâne pe centrul de 115″.

Consola are **Înainte de show**, **În show** și **Instrumente**; toate comenzile existente sunt în Instrumente. Tabletele păstrează focusul separat A/B și reconciliază alegerile după reconectare. Procedură, geometrie, dovezi și limite hardware: [docs/VIDEO-WALL.md](docs/VIDEO-WALL.md). Galerie locală nouă: `runs/debug/final-wall/index.html`. Nu s-a creat un release sau installer nou.

## Scenarii pe vârste, SQLite și automatizare

Cele patru experiențe sunt acum implementate și selectabile în consolă: 5–10, 10–15, 15–18 și adulți. Au mecanici distincte, 163 clipuri ElevenLabs offline, finaluri bazate pe contribuții și certificate legate de rulare. SQLite păstrează alegerile și checkpoint-urile; recuperarea după repornire cere continuare explicită. Originalul V3 rămâne disponibil.

`npm run auto:configure` creează un profil local separat pentru cele cinci Samsung, apoi `npm run auto:start` activează inventarul și împărțirea automată. Modul generic acceptă 1–16 display-uri. Atelierul optic folosește o fotografie/video cu markere ArUco, validează observația și aplică proiecția comună. Captura sălii și validarea fizică nu sunt înlocuite de EDID.

Consola include confort pe post, editor de pachete, diagnostic și repetiție completă cu anulare; debug și analytics citesc misiunile persistente. [Implementare și operare](docs/IMPLEMENTARE-SCENARII-DISPLAY.md), [producție vocală](docs/scenarii/VOICE-PRODUCTION.md), [calibrare optică](docs/OPTICAL-CALIBRATION.md). Capturi noi: `runs/debug/scenarios-new/` și `runs/debug/scenario-upgrade-operator/index.html`. Acceptarea pe hardware și probele cu public rămân distincte de verificările software.

## Tutorial și final interactiv — 2026-09-05

Tutorialul vocal „Nava vă recunoaște” și finalul colectiv sunt implementate pentru cele patru categorii. În consolă: **Tutorial și echipaj** → locuri ocupate → începe → predă Căpitanului. Narator român separat, probe A/B fără punctaj, pauză/repetare, SQLite și constelație bazată pe contribuții reale. Detalii și comenzi QA: [docs/TUTORIAL-FINAL.md](docs/TUTORIAL-FINAL.md). Galerie: `runs/debug/tutorial-final/index.html`. Audiția și acceptanța celor cinci TV-uri și șase tablete se fac în sală.

## Coloana sonoră

Zece piese originale Eleven Music sunt integrate în magistrala ambientală, cu ducking sub voce și tăcere muzicală la232–246s. Detalii, limite și regenerare: [docs/MUZICA.md](docs/MUZICA.md). Audiții: `runs/debug/music/index.html`. Piesele sunt marcate pentru audiție artistică și verificare în sală; filmul și replicile existente sunt păstrate.
