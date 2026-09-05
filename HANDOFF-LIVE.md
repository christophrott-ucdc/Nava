# HANDOFF-LIVE — jurnal de lucru în timp real (append-only)

> **Pentru Codex sau orice AI care preia lucrul dacă sesiunea Claude se oprește la mijloc.**
> Acest fișier spune ce se lucrează ACUM, de către cine, ce s-a terminat și ce a rămas.
> Se completează prin **append** (niciodată rescris). Mecanic, `scripts/heartbeat.ps1` scrie la fiecare
> 60 s în `HEARTBEAT.log` (rădăcină, negit-uit): fișierele modificate în ultimul minut, numărul de
> fișiere necomise și ultima linie de aici. Dacă `HEARTBEAT.log` nu mai primește linii, sesiunea a murit.
>
> Cum continui: 1) citește `HANDOFF.md` §0 și acest fișier de la coadă la cap; 2) rulează `npm run check`;
> 3) uită-te în `git status` ce e necomis; 4) ia pachetele marcate `[ ]` din §2 de mai jos, în ordinea lor;
> 5) după fiecare pas, adaugă o linie în §3.

## 1. Contextul rundei (2026-09-04, seara)

Cererea lui Christoph: „Repară tot și implementează tot (schelet unde nu se poate). PIN 4078, utilizatori,
pagină de depanare. Agenți în paralel. Heartbeat la 1 minut. Claude face partea grea."

Punctul de plecare: commit `5af8383` pe `board/nava-player` — build/typecheck curate, 51 voci V3
ElevenLabs în `assets/voice/ro`, exe portabil în `dist-app/`. Auditul Claude a găsit 15 probleme și a
propus 15 funcționalități (vezi §2). Contractele noi sunt în `src/shared/types.ts` și `src/shared/protocol.ts`
(secțiunile marcate `R4` = runda 4).

## 2. Pachete de lucru și proprietari

Legendă: `[ ]` neînceput · `[~]` în lucru · `[x]` gata · `[s]` doar schelet. Fișierele din paranteză sunt
singurele pe care pachetul are voie să le modifice. `src/server/index.ts` se integrează DOAR de orchestrator.

### Orchestrator (Claude) — securitate, utilizatori, depanare, integrare
- [x] P-01 Autentificare: PIN operator (implicit **4078**), sesiuni, cookie, middleware pe `/api/cmd`, `/api/show/*` scriere, `/api/users`, `/api/tablets/clear`, `/api/debug/*`, `/api/tts`; WS `hello` cu `token` pentru `control`, `screenToken` pentru `screen` (`src/server/auth.ts`, `src/server/users.ts`)
- [x] P-02 Utilizatori: `data/users.json` (scrypt), roluri `admin|operator|viewer`, CRUD, admin implicit cu PIN 4078 (`src/server/users.ts`, `src/web/login/**`)
- [x] P-03 Pagina de depanare `/debug`: stare, clienți, cue-uri, preflight voci, perf ecrane, drift, loguri, config redactat, acțiuni (`src/server/debug.ts`, `src/web/debug/**`)
- [x] P-04 Preflight active: verifică cele 51 de clipuri (există + dimensiune + durată) la pornire și la cerere; semnal roșu în consolă/debug (`src/server/preflight.ts`)
- [x] P-05 Rotația jurnalelor `runs/` (păstrează ultimele 20 rulări, mută PNG în `runs/debug/`) (`src/server/runlog.ts` — coordonat cu D)
- [~] P-06 Integrare `src/server/index.ts`, `npm run check`, commit pe `board/nava-player`

### Agent A — main/Electron: producție kiosk, span-mode, autostart
- [ ] A-01 `powerSaveBlocker`, watchdog (repornire renderer + relansare app la eroare fatală), `config.autostart` → `setLoginItemSettings`, `scripts/install-autostart.ps1` (Task Scheduler) (`src/main/**`, `scripts/install-autostart.ps1`)
- [x] A-02 `displayMode: "span"` — o singură fereastră peste toate ecranele; renderer-ul primește lista de viewport-uri per ecran în boot (`src/main/windows.ts`, `src/main/ipc.ts`, `src/preload`)
- [x] A-03 Boot: `screenToken`, `serverHttpUrl`, `security`, `displayMode`, `viewports` în `getBoot()` (`src/main/ipc.ts`, `src/preload/preload.ts`)
- [x] A-04 Config loader: câmpuri noi cu valori implicite (`security`, `ambient`, `lights`, `autoRun`, `displayMode`, `screens[].yawOffsetDeg`, `variant`) (`src/main/config.ts`, `config.example.json`, `config.5screens.example.json`, `config.follower.example.json`)
- [ ] A-05 Rotația jurnalelor `app-*.jsonl` în main (`src/main/logger.ts`)

### Agent B — renderer: perf, audio routing, ambianță, entități reactive, perspectivă laterală, rehearse, span
- [ ] B-01 `setSinkId(config.audio.outputDeviceId)` + listă dispozitive raportată în `perf`/debug (`src/renderer/voice/context.ts`, `src/renderer/index.ts`)
- [ ] B-02 Mesaj `perf` la 1 Hz de la fiecare ecran: cadre pierdute, fps video, fps avatar, latență lip-sync, drift, heap (`src/renderer/perf.ts`, `src/renderer/sync.ts`)
- [ ] B-03 Ambianță procedurală per temă cu ducking sub voce; cue `ambient`; comandă `ambient` (`src/renderer/voice/ambient.ts`, `timeline.ts`)
- [ ] B-04 Entități reactive la alegerile tabletelor: mesaj `entityParams` (culoare / puls / perspectivă) (`src/renderer/ui/entities.ts`, `sync.ts`)
- [ ] B-05 Perspectivă laterală: `screens[].yawOffsetDeg` → crop/shift orizontal al filmului pe ecranele laterale (`src/renderer/player.ts`)
- [ ] B-06 `rehearse`/`setRate`: redare accelerată (video rate + voci comprimate `playbackRate`) (`player.ts`, `voice/playback.ts`)
- [ ] B-07 Span-mode: un `<video>` decodat o singură dată, desenat pe N canvas-uri per viewport (`src/renderer/span.ts`)
- [ ] B-08 Cue `dynamic-voice` / mesaj `dynamicVoice`: redare text live prin `/api/tts` (`timeline.ts`)
- [ ] B-09 Schelet: cue `photo` (webcam → dataURL → server), detector zgomot sală (`roomLevel` în `perf`) (`src/renderer/photo.ts`, `src/renderer/room-mic.ts`)
- [ ] B-10 Teste `src/renderer/**/*.test.ts` pentru timeline (seek înainte/înapoi, lead-in negativ) — rulate cu `npm test`

### Agent C — avatar & voce: casting, viseme precalculate, limbi, dialog live (schelet), variante
- [ ] C-01 Casting: `config.avatar.body`, `avatar.glbBySpeaker`, mesaj clar în debug când vocea și corpul nu se potrivesc; ghid de obținere GLB Căpitan (Avaturn/RPM) în `docs/AVATAR.md` (`src/renderer/avatar/**`)
- [ ] C-02 `scripts/precompute-visemes.mjs`: `words` → `visemes/vtimes/vdurations` cu `lipsync-ro` în manifest; renderer preferă viseme (`src/renderer/avatar/**`, `assets/voice/ro/manifest.json`)
- [ ] C-03 Limbi: `setLang` acceptă doar limbi cu manifest complet; EN/FR marcate indisponibile în consolă; `scripts/tts-generate.mjs --lang en|fr` documentat (`src/renderer/voice/manifest.ts`)
- [ ] C-04 Măsurarea latenței lip-sync (audio start vs primul visem) raportată în `perf` (`src/renderer/avatar/index.ts`)
- [ ] C-05 Schelet dialog live: Web Speech API (STT ro-RO) → `POST /api/dialog` (Gemini, personaj Căpitan) → `say` (`src/renderer/voice/live-dialog.ts`, `src/server/features/dialog.ts`)
- [ ] C-06 Variante pe vârstă: `VoiceCue.variants`, `ShowFile.variants`, `--variant` în `tts-generate.mjs`; schelet cu o variantă „7-9" pentru 3 replici (`scripts/tts-generate.mjs`, `assets/show/show.json` doar câmpuri noi)
- [ ] C-07 Teste `lipsync-ro` (`src/renderer/avatar/lipsync-ro.test.ts`)

### Agent D — server (fără index.ts) + consolă + tablete: readiness, editor cue, analitică, certificate, telemetrie, lumini, auto-run
- [ ] D-01 Readiness gate în `state.ts`: `preshowAutoStart`/`autoRun` pornesc doar când ecranele cerute sunt conectate, video gata, preflight ok; `ShowState.readiness` (`src/server/state.ts`)
- [ ] D-02 Comenzi noi: `rehearse`, `setRate`, `autoRun`, `lights`, `ambient`, `say`, `setVariant`, `photo`; difuzare `entityParams` din alegerile tabletelor (`state.ts`, `cues.ts`, `tablets.ts`)
- [ ] D-03 Mesajele copiilor citite de Căpitan: colectare → `dynamicVoice` la cue `dynamic-voice` (`src/server/features/dynamic-voice.ts`)
- [ ] D-04 Editor de cue-uri în consolă: drag pe timeline, `POST /api/show` (salvare + backup + reload) (`src/server/features/show-editor.ts`, `src/web/control/**`)
- [ ] D-05 Analitică: `/analytics` din `runs/show-*.jsonl` (`src/server/features/analytics.ts`, `src/web/analytics/**`)
- [ ] D-06 Certificat de misiune pe tabletă (canvas → PNG, descărcare + QR) (`src/web/tablet/**`)
- [ ] D-07 Telemetrie fictivă pe tablete sincronă cu timpul (`src/web/tablet/**`)
- [ ] D-08 Schelet lumini: adaptor `artnet` (UDP) și `hue` (REST) pe cue `lights`/`theme` (`src/server/features/lights.ts`)
- [ ] D-09 Mod operator absent (`autoRun`) + buton fizic/tabletă de start (`state.ts`, `src/web/tablet/**`)
- [ ] D-10 Consola: login cu PIN (cookie), `token` în `hello`, butoane noi (rehearse, ambient, lumini, say, variant), panou readiness/preflight (`src/web/control/**`)
- [ ] D-11 Teste `state.ts` (`src/server/state.test.ts`)

### Agent E — documentație consolidată
- [x] E-01 `HANDOFF.md` rescris într-o singură versiune curentă (V3 + runda 4); addendele mutate în `docs/history/HANDOFF-ISTORIC.md`
- [ ] E-02 `docs/BRIEF.md`, `docs/OPERARE.md`, `docs/SPEC-SHEET.md`, `docs/DECIZII.md`, `README.md` actualizate (PIN, utilizatori, debug, span, follower, autostart, heartbeat)
- [ ] E-03 `docs/SECURITATE.md` (model de amenințare LAN, PIN, token ecrane, ce NU este protejat)

## 3. Jurnal (append-only; format: `- [HH:MM] AGENT · pachet · ce s-a făcut · ce urmează`)

- [22:27] CLAUDE · setup · creat HANDOFF-LIVE.md, heartbeat.ps1, contracte R4 în types/protocol, runner de teste · urmează lansarea agenților A–E și P-01..P-06
- [22:38] A · A-04 · config.ts: deep-merge + validare R4 (displayMode/autostart/security/ambient/lights/autoRun/variant, screens[].yawOffsetDeg, avatar.body/glbBySpeaker), screenToken generat (32 hex) si scris inapoi in config.json pe master, placeholder respins pe follower, chei $comment ignorate, flag --kiosk; config.example.json + config.5screens.example.json + config.follower.example.json · urmeaza A-02/A-03 (span + boot R4)
- [22:42] CLAUDE · P-01..P-05 · auth.ts (PIN login, sesiuni persistente data/sessions.json, cookie nava_session, Bearer, roluri viewer<operator<admin, screenToken), users.ts (scrypt, admin implicit 4078, CRUD /api/users), preflight.ts (51 voci + film + GLB), maintenance.ts (rotație runs, păstrează 20), debug.ts (PerfStore, /api/debug/*, /api/frame cu ffmpeg), web/login + web/debug; integrate în src/server/index.ts (guards pe /api/cmd, /api/show/*, /api/tablets/clear, /api/tts, /api/dialog; WS hello autentificat; perf/photoCaptured; preflight la pornire) · urmează build.mjs (login/debug/analytics), smoke-auth, integrarea rapoartelor A–E
- [22:44] E · E-01 · HANDOFF.md rescris (17 secțiuni, V3 + R4, ~602 linii); addendele §16–§28 mutate verbatim în docs/history/HANDOFF-ISTORIC.md (diff verificat) · urmează E-02: OPERARE, SPEC-SHEET, DECIZII, README, CUE-SHEET
- [22:44] CLAUDE · P-06 (parțial) · scripts/smoke-auth.mjs (30 verificări: guards 401/403, login 4078, CRUD utilizatori, PIN unic, sesiuni invalidate la schimbare PIN, WS hello 4401, rate limit 429) = ALL OK; build.mjs bundlează web/login, web/debug, web/analytics; npm run check include smoke:auth · urmează: integrarea rapoartelor A–E (INTEGRATION.md de la D), npm run check complet, test Electron, commit
- [22:46] A · A-03 · getBoot() intoarce si serverHttpUrl (master http://127.0.0.1:<port>, null daca serverul a cazut; follower derivat din masterUrl ws->http fara /ws), screenToken, security{publicState}, displayMode, viewports (doar span), variant (null = baza); preload pass-through neschimbat · urmeaza A-01/A-05
- [22:46] A · A-02 · windows.ts: displayMode span = O fereastra frameless (fullscreenable false, alwaysOnTop+skipTaskbar in kiosk, F11 dezactivat) peste uniunea DIP a display-urilor din screens[] (screen.getAllDisplays sortate x,y); viewports = bounds display - origine uniune, scaleFactor per display; in --windowed uniunea e scalata pe primar; boot.screen = ecranul cu playAudio (center); --screen <id> ramane in windows mode; avertizari la DPI diferite / display-uri partajate. Verificat: boot windows + span pe 1 display (viewports logate) · urmeaza A-01/A-05
