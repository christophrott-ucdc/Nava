# CODE REVIEW COMPLET — NavaPlayer / EXODUS-7 · 6 septembrie 2026

> Review integral al codului și al produsului, făcut de opt agenți de review independenți pe opt subsisteme, cu constatările critice reverificate manual de orchestrator (Claude) pe cod. Arborele era stabil: Codex oprit, ultimul commit `1f92d68`, 59 de fișiere necomise (inclusiv pagina de administrare).
> Criteriile cerute de Christoph: cod scris după documentația modernă, logică bună, mentenabilitate, plus o părere onestă despre întreaga experiență.

## 0. Starea de fapt

| Măsură | Valoare |
|---|---|
| Cod în `src/` | ~35.000 linii (server 8.462, renderer 11.465, tablete 4.116, consolă 2.678, shared 3.068, main 2.147, admin 1.110, restul web ~2.000) |
| Scripturi | 51 fișiere, 5.740 linii |
| Teste | 23 fișiere, 191 teste, **187 trec, 4 cad** (cauză unică, vezi §H) |
| Typecheck / build | curate |
| Validatoare show și voci | OK (8 scene, 87 cue-uri, 51 voci) |
| Documentație | 37 fișiere în `docs/`, trei handoff-uri paralele |
| Repo | **431 MB muzică comisă**, din care 20 fișiere WAV (mastere, QA „prepared”, răspunsuri brute `.api-pcm`); 64 MB scenarii; 45 MB imagini în `src/web` |
| Git | patru commit-uri uriașe („Codex work”, „CODEX done”, „added music”, „New animations and story”) = ~190.000 inserții; obiecte temporare orfane în `.git/objects` |

**Notele celor opt reviewers**

| Subsistem | Notă |
|---|---|
| A · server core | 6 |
| B · persistență, misiuni, auth, admin | 6,5 |
| C · contracte partajate | 6 |
| D · procesul principal Electron | 7 |
| E · renderer, player, audio, avatar | 7 |
| F · tabletele copiilor și Glass | 6 |
| G · consolă, login, depanare, analitică, admin, perete | 6 |
| H · scripturi, build, teste, proces | 5 |

**Constatări verificate manual de orchestrator** (citite pe cod, nu doar preluate): checkpoint SQLite neprotejat la 1 Hz (`index.ts:1441`, cu același apel protejat prin try/catch în temporizatorul de ceas de deasupra); `director.onPhotoCaptured` fără niciun apelant în afara testelor; regresia `progress.participants: []` introdusă în commit-ul `5395c92`; datele scriibile lângă executabil (`paths.ts:45`); scurtătura globală Space/Enter care pornește show-ul (`control/index.ts:1050-1059`); exact 43 de apariții de text sub 20 px în CSS-ul tabletei; calea de auto-intrare în epilog la 465 s (`player.ts:1004-1008`) combinată cu re-intrarea în `play` din `follow()` (`player.ts:886`).

---

## Review A — server core

**Verdict**
Nucleul de stare (`state.ts`/`cues.ts`) este solid, pur și bine testat, dar hub-ul `index.ts` (1532 linii) are două căi de crash necontrolate și o integrare foto ruptă între director și hub — **nota 6/10**.

**Puncte forte**
- `state.ts`: model de ceas clar (o singură ancoră, `REPORT_GRACE_MS` 600 ms, rate 0 la stall), fără I/O, cu `now`/`schedule` injectabile și 463 linii de teste.
- Igienă WS bună: hello timeout, limită payload diferențiată, heartbeat, sursa de ceas acceptată doar pentru ecranul așteptat (index.ts:1189-1194), oprire grațioasă în două trepte (1499-1525).
- `show-editor.ts`: validare → backup → scriere atomică (tmp+rename) → reload, serializat printr-un lanț de promisiuni; Hono 4 folosit idiomatic (`createAdaptorServer`, `app.on` cu liste, `c.body(Uint8Array)`).

**Constatări**
1. `index.ts:1441` (și 701, 1492) · **Critic** · bug — `mission.checkpoint()` → `store.save()` (SQLite, sincron) rulează la 1 Hz într-un `setInterval` fără try/catch. O eroare tranzitorie (disc plin, fișier blocat) devine `uncaughtException` și procesul Electron cade în timpul spectacolului. Același apel e protejat în `clockTimer` (1417), dar nu în `stateTimer`.
2. `index.ts:1348, 1337, 1479, 1431` · **Major** · bug — `void handleCommand(...).then(...)` fără `.catch`. `handleCommand` poate arunca (`runPreflightNow` pe fs, `mission.store.save` din `beforeCommand` la 521/526, `mission.seek` la 685). În Node 24 o respingere netratată oprește procesul.
3. `index.ts:1370-1388` vs `state.ts:552-564` · **Major** · logică — `director.onPhotoCaptured` nu este apelat nicăieri. Hub-ul difuzează direct `photo show` cu `showSec` fix 12, nu trimite niciodată `hide`, `lastPhoto` rămâne `null`, iar runlog primește `photo.saved` în timp ce `analytics.ts:221` numără `photo.captured` → coloana `photos` este mereu 0.
4. `index.ts:685` · **Minor** · logică — `mission.seek()` incrementează `timelineEpoch` înainte ca directorul să valideze comanda; un `seek` respins invalidează totuși rapoartele ecranelor până la următorul snapshot.
5. `debug.ts:41-43, 134` · **Minor** · bug/modern — `PerfStore.forget` șterge doar `latest`, `history` rămâne, deci ecranele deconectate apar la infinit în `summary()` și memoria crește. Extractorul ffmpeg rezolvă pe `exit`, nu pe `close`; stdout poate fi neflush-uit → JPEG trunchiat.
6. `maintenance.ts:40` + `runlog.ts:56` · **Minor** · bug — rotația păstrează doar familiile `show-`/`app-`; jurnalele `diagnostic-*.jsonl` nu sunt rotate niciodată.
7. `tts.ts:219`, `index.ts:973` · **Minor** · status — rate-limit TTS întoarce 502 în loc de 429; `/api/show/reload` întoarce 500 pentru refuzuri de gardă care sunt 409.
8. `index.ts:191-345, 148-152, 996-1000, 1336-1341` · **Minor** · design — 150 linii `loadShowFileLegacy` moarte plus patru seturi nefolosite; `preflight` tratat în trei locuri cu comentariu perimat, hook-ul `onPreflightRequest` (state.ts:772) nu mai e atins niciodată. Zonele noi de misiune (505-529, 755-918, 1414-1434) sunt scrise pe o singură linie, fără spații.

**Recomandări**
- Un singur punct de intrare `safeCommand(cmd, source)` cu `try/await/catch`, care înfășoară toate apelurile `store.save`/`checkpoint`; `process.on('unhandledRejection')` cu log în main ca plasă de siguranță.
- Rutează `photoCaptured` prin `director.onPhotoCaptured`, păstrând în hub doar salvarea pe disc și verificarea `photoRequest`.
- Extrage din `index.ts` module `ws-hub.ts`, `mission-routes.ts`, `experience-loop.ts`; șterge `loadShowFileLegacy`; verifică `tts-providers.ts:363` față de documentația curentă Gemini (`/v1beta/interactions` vs `models/:generateContent` în `dialog.ts:209`).

---

## Review B — persistență, misiuni, autentificare, administrare

**Verdict**
Nucleu solid (node:sqlite cu WAL + tranzacții, scrypt, sesiuni revocabile, audit JSONL), dar cu o regresie de logică a locurilor care rupe testele, un rate-limit ocolibil și căi de date nescriibile în varianta instalată — **nota 6,5/10**.

**Puncte forte**
- `mission-store.ts:12-17,37-43`: `node:sqlite` nativ, WAL + `synchronous=FULL` + `busy_timeout`, `BEGIN IMMEDIATE` care comite ledger-ul de evenimente și starea într-o singură tranzacție, cu ROLLBACK la eroare; dedup idempotent pe `(run_id,event_id)`.
- `auth.ts:139-191,396-431`: token 32 B random, `timingSafeEqual`, sesiuni persistate cu TTL, revocare la dezactivare/schimbare rol/PIN cu propagare la WS, listări care expun doar id-ul hash-uit.
- `users.ts:29-37,184-193` + `scenario-editor.ts:82-92`: scrypt cu salt per utilizator, scriere atomică tmp→rename, backup cu `wx`, optimistic locking pe hash.

**Constatări**
1. `mission-session.ts:14` · **Major** · logică — `fresh()` pune `progress.participants:[]`, iar `:78` și `scenario-engine.ts:206` tratează `[]` ca „niciun loc activ” (spre deosebire de `undefined` = toate). Orice sesiune fără înregistrare de echipaj răspunde `inactive-seat` la toate acțiunile până când `index.ts:521/769` rescrie câmpul.
2. `auth.ts:265,254-263` · **Critic** · securitate — `clientIp` preferă `X-Forwarded-For` fără proxy de încredere; un client LAN trimite un header aleator per cerere și ocolește complet limita de 8 încercări/5 min. PIN de 4 cifre ≈ minute de brute-force. `loginAttempts` crește nelimitat.
3. `paths.ts:45` + `index.ts:387,430` + `auth.ts:107-108` · **Major** · design — `appRoot` = directorul executabilului în build-ul instalat; `data/nava.sqlite`, `users.json`, `sessions.json`, `audit.jsonl`, `runs/` ajung în `Program Files` → scrierea eșuează la pornire (merge doar portabil). Ar trebui `app.getPath('userData')`.
4. `users.ts:90-97,112,176` · **Major** · design — login PIN-only scanează toți utilizatorii cu `scryptSync` (N=16384) pe thread-ul principal: 50 conturi ≈ secunde de blocare a buclei care sincronizează 5 TV-uri; `create()` face scanarea de două ori.
5. `index.ts:758-825` vs `auth.ts:353,232` · **Major** · securitate — `sameOrigin` e aplicat doar pe `/api/users` și `/api/admin`; rutele operator se bazează exclusiv pe `SameSite=Lax`. `/api/auth/me` returnează tokenul brut.
6. `mission-store.ts:22-47` · **Minor** · modern — `prepare()` reapelat la fiecare operație; `recoverable()` încarcă 100 de corpuri JSON în loc de `WHERE status='active'`; fără index pe `status`, fără migrații.
7. `audit.ts` · **Minor** · design — jurnal fail-open fără lanț de hash/număr de secvență; `admin.ts` citește toate fișierele doar pentru a număra intrările.
8. `technical-rehearsal.ts:144` · **Minor** · logică — `Math.floor(elapsedSec)%5===0` pe tick de ~1 s poate sări sau dubla salvarea.

**Testele care cad**
Comit-ul `5395c92` a introdus `progress.participants:[]` în `fresh()`, astfel încât `accept()` returnează `inactive-seat` înainte de verificările de instanță/stagiu. `mission-store.test.ts:69,100` așteaptă `accepted`/`expired`, iar `experience.test.ts:232` setează doar `experience.participants`. Reviewer B recomandă corectarea codului (`undefined` = deschis până la închiderea echipajului); reviewer H recomandă actualizarea fixture-urilor. Decizia aparține echipei, dar semantica `[]` ≠ `undefined` trebuie definită într-un singur loc și testată explicit.

**Recomandări**
- Mută toate datele scriibile în `userData` și separă strict `resourcesRoot` de `dataRoot`; adaugă în `MissionStore` migrații numerotate, statement-uri cache-uite și interogare pe `status`.
- Ignoră `X-Forwarded-For` (server LAN fără proxy), limitează pe `remoteAddress` + global, plafonează dimensiunea mapei; aplică `sameOrigin` pe toate rutele mutante și treci scrypt pe varianta async.
- Repară semantica participanților într-un singur loc și adaugă un test explicit pentru „sesiune fără echipaj”.

---

## Review C — contracte partajate

**Verdict**
Stratul partajat are validatoare solide pentru geometrie/instalație și motoare de joc deterministe și testate, dar contractul WS și modelul de domeniu au crescut prin acreție fără consolidare; un inginer nou va găsi 4–5 modele care se suprapun. **Notă: 6/10.**

**Puncte forte**
1. `video-wall.ts:42-70`, `display-topology.ts:66-82`, `optical-calibration.ts:76+` — validare completă a `unknown` la graniță, cu `schemaVersion`+`kind`, motive lizibile; teste dedicate.
2. `scenario-engine.ts:203-238` și `play-engine.ts:110-184` — funcții pure, `structuredClone`, rezultat `{ok, reason}`; validarea acțiunii făcută în motor.
3. `types.ts:55-247` — `Cue` este uniune discriminată pe `kind`, bine documentată; `admin.ts` este exemplul de contract curat.

**Constatări**
- `protocol.ts:130`, `:256-258` · medie · versionare · membri anonimi inline în `ClientMessage`/`ServerMessage`; niciun `protocolVersion` în `hello`/`welcome`; un follower cu build vechi ignoră tăcut mesaje.
- `src/server/index.ts:1273` · medie · validare · `JSON.parse(...) as ClientMessage` — tip afirmat, nu verificat; validarea reală e împrăștiată în 4 locuri; `packageReady`/`experienceAudio`/`hello.post` fără verificare de formă.
- `protocol.ts:121-127`, `types.ts:217-222` · medie · cod mort · evenimentele V2 (`join/role/answer/vote/message`) rămân în tipuri, dar serverul le respinge (`tablets.ts:278-283`).
- `types.ts:545-573` · medie · optional-sprawl · `ShowState` are 12 câmpuri opționale „până la integrarea completă” (R4 e demult integrat); la fel `MissionRecord`, `MissionSnapshot`.
- `scenario-engine.ts:22-34` · medie · design tip · `ZoneView.kind?: string` discriminant netipat cu 10 câmpuri opționale; UI-ul se ramifică pe șiruri fără exhaustivitate, spre deosebire de `PlayView`.
- `types.ts:179,182` vs `scenario-engine.ts:7-8` vs `mission.ts:49` · mică · duplicare · `TabletPost/TabletZone`, `Post/Zone` și `'A'|'B'` inline — același concept de trei ori.
- `music.ts:19` · mică · magie · `231.5/246/232` hard-codate; `MusicManifest.silence` există și nu e folosit.
- stil „minificat” în `mission.ts`, `experience.ts`, `crew.ts`, `music.ts`, `video-wall.ts`; zero teste pentru `protocol/types/mission/experience/crew/admin`.

**Harta modelelor**
Cinci straturi: (1) Show/Scene/Cue — coloana vertebrală a timeline-ului; (2) ScenarioProgress/ZoneView — mecanica pe „choices”; (3) PlayProgress/PlayView — a doua generație a aceleiași mecanici, cuibărită în prima; (4) Mission — sesiunea care împachetează progresul + `checkpoint: ShowState`; (5) Experience (tutorial/echipaj/final), cuibărită în `MissionRecord.experience?`. Compun prin cuibărire, dar concurează: `'legacy-v3'` e un `ScenarioId`-sentinelă care ramifică în 27 de locuri din server/web/renderer, iar ciclul de viață e exprimat de patru enumerări paralele (`Phase`, `PlaybackState`, `MissionRecord.status`, `ExperienceState.status`).

**Recomandări**
1. `protocolVersion` în `hello`/`welcome` și un modul unic `protocol-parse.ts`, înlocuind cast-ul din `index.ts:1273`; elimină V2.
2. `ZoneView` ca uniune discriminată (sau înlocuit cu `PlayView`); `ShowState`/`MissionSnapshot` cu câmpuri obligatorii; decide dacă `legacy-v3` e `ShowFile` sau scenariu.
3. Unifică `Post/Zone`, impune Prettier pe `src/shared`, mută constantele din `music.ts:19` în manifest, adaugă teste de contract round-trip.

---

## Review D — procesul principal Electron

**Verdict**
Bază solidă și conștientă de producție (watchdog renderer, crash-loop → relaunch, powerSaveBlocker, single-instance, navigare blocată), dar cu goluri pentru rulare nesupravegheată: renderer blocat (nu crăpat) nu e reînviat, GPU pierdut doar se loghează, hot-plug ignorat fără `autoDisplays`, sandbox dezactivat. **Nota: 7/10.**

**Puncte forte**
1. `windows.ts:486-498` — `render-process-gone` distruge și recreează fereastra cu același layout, cu prag de crash-loop care escaladează în `app.relaunch()` (`main.ts:146-165`).
2. `windows.ts:464-468` — `setWindowOpenHandler(deny)` + `will-navigate` cu `preventDefault`; preload-ul expune doar 4 funcții prin `contextBridge`, `contextIsolation: true`, `nodeIntegration: false`.
3. `main.ts:48-54, 199-204, 234` — lock single-instance, `before-quit` cu shutdown ordonat, `powerSaveBlocker("prevent-display-sleep")`.

**Constatări**
1. `windows.ts:484` · **Major** · reziliență — `unresponsive` doar loghează. Un renderer blocat de decodarea 4K lasă un TV înghețat până la sfârșitul spectacolului.
2. `main.ts:188-198` · **Major** · GPU — după `child-process-gone` de tip GPU, Chromium poate reveni cu fallback software; 4K60 pe 5 ferestre în software = frame drops. Nu există contor/escaladare.
3. `main.ts:56-65` · **Major** · pornire nesupravegheată — `dialog.showErrorBox` e modal-blocant: un `config.json` corupt lasă un dialog pe TV; autostart-ul nu reîncearcă.
4. `windows.ts:420` · **Major** · securitate — `sandbox: false`, contrar default-ului Electron ≥20, fără motiv (preload-ul folosește doar `contextBridge`).
5. `main.ts:272`, `display-inventory.ts:72` · **Major** · multi-display — `screen.on('display-added/removed/metrics-changed')` există numai cu `config.autoDisplays`. În modul implicit, un HDMI slăbit mută fereastra peste alt display; `wallRuntime` doar raportează.
6. **Minor** · permisiuni — niciun `session.setPermissionRequestHandler`; renderer-ul primește implicit cameră/microfon/notificări.
7. `shortcuts.ts:24-28`, `ipc.ts:52-55` · **Minor** · kiosk — Ctrl+Q închide aplicația inclusiv în kiosk.
8. `main.ts:38` · **Minor** — `force_high_performance_gpu` e switch macOS; lipsesc `crashReporter.start` și fuse-urile în `electron-builder.yml`.

**Recomandări**
1. Reînviere pentru hang: în `unresponsive` timer ~10 s, apoi `win.webContents.forcefullyCrashRenderer()` care reutilizează watchdog-ul existent. Contor pentru GPU cu relaunch; `app.disableDomainBlockingFor3DAPIs()`.
2. `sandbox: true`, `setPermissionRequestHandler` cu allow-list `media`, `electronFuses` (`runAsNode: false`, `enableNodeCliInspectArguments: false`, `onlyLoadAppFromAsar: true`); la boot în kiosk log + `app.exit(1)` în loc de `showErrorBox`.
3. Hot-plug independent de `autoDisplays` cu debounce și re-aplicare `setBounds`; `crashReporter.start({ uploadToServer: false })` cu minidump-uri în `runs/`.

---

## Review E — renderer, player, audio, avatar

**Verdict**
Arhitectură solidă (scheduler pur testat, reconciliere follower completă, fără backdrop-filter), dar cu o cursă reală la granița 465 s, lipsync ancorat pe ceasul greșit și cache-uri audio nelimitate pe o zi de 10 ore — **7/10**.

**Puncte forte**
1. `cue-scheduler.ts` pur și testat; `timeline.ts:257-259` și `ambient.ts:390-393` folosesc `never` pentru exhaustivitate.
2. `player.ts:861-962` `follow()` acoperă toate stările master, prag clamp ≥ 50 ms, `BIG_JUMP_SEC` separă „catch-up” de „seek cu skip”.
3. Igienă audio/vizuală: clipurile fetch+decode înainte de armare, lanțul FX demontat după coadă, `span.ts:54,168` cu `requestVideoFrameCallback` + dirty-flags, `entities.ts:784-788` oprește rAF când nu e nimic vizibil, reduced-motion respectat.

**Constatări**
1. `player.ts:1004-1008` + `:886-888` + `:641-647` · **ridicată** · logică · Follower-ul intră singur în epilog la `duration-0.02`; un `clock` întârziat cu `state:"playing"` ajunge după → `follow()` vede `phase() !== "play"` → `enterPlay(464.98,true)` (seek înapoi) → tick-ul îl termină iar → `enterEpilogue(0)` a doua oară: cue-urile de epilog se retrag de două ori și cadrul sare vizibil.
2. `player.ts:998-1001, 977` · medie · modern · Player-ul nu folosește `requestVideoFrameCallback` pentru drift; `mediaTime`/`expectedDisplayTime` ar elimina zgomotul de ±16 ms.
3. `player.ts:987-989` + `sync.ts:110-118` · medie · bug · Nudge-ul (±3 %) rămâne activ pe toată durata reconectării WS → drift ~240 ms, apoi seek vizibil. Lipsește reset la nominal în `close`.
4. `timeline.ts:328-329` + `avatar/index.ts:195-199` + `playback.ts:144,150` · medie · logică · Lipsync-ul pornește la `performance.now()`, audio la `source.start(ctx.currentTime)` fără lookahead și fără `baseLatency+outputLatency`; `handle.started` nu e consumat — la clipurile decodate tardiv vizemele pornesc înaintea sunetului.
5. `voice/index.ts:78,123` + `playback.ts:37,80` · medie · performanță · `clips` și `decoded` cresc nelimitat (~11 MB/min PCM la text unic); pe 10 ore → sute de MB.
6. `index.ts:387-390` · medie · logică · `onMission` apelează `player.follow()` și pe ecranul sursă-de-ceas cu `phaseTime` neextrapolat → master-ul se auto-seek-uiește la snapshot învechit.
7. `ambient.ts:558` + `music-files.ts:30,27` · joasă · bug · `gain.value=` direct pe cadru → treaptă audibilă la 231,5–232 s; resincronizarea face `stop()`+`start()` sec (click).
8. `ambient.ts:266,296,329` · joasă · `l.timers.push()` crește nelimitat (~20k id-uri/oră la rain).
9. `avatar/index.ts:350` · joasă · în span Căpitanul privește la alt televizor (`window.innerWidth*0.58`).
10. `glass-tv.css:9,99`, `experience.css:2`, `index.ts:320` · joasă · design · două convenții CSS în același folder, linii de 300–2.500 caractere. Pozitiv: `backdrop-filter` absent (verificat).

**Recomandări**
1. Închide cursa de la 465 s: follower-ul așteaptă `epilogue` de la server, sau `follow()` ignoră `playing` cu `expected ≥ duration-0.1` timp de ~1 s după terminarea locală; reset `playbackRate` în `close` și când nu vin clock-uri.
2. Ancorează lipsync-ul pe ceasul audio: `source.start(ctx.currentTime+0.05)` și `startAtMs` derivat din el plus `outputLatency`; consumă `handle.started`; măsoară drift-ul video prin rVFC.
3. LRU pentru cheile dinamice în `clips`/`decoded`, golirea `decoded` la schimbarea epocii, un singur timer per layer; `setTargetAtTime` în loc de `gain.value=`; crossfade la resincronizare.

---

## Review F — tabletele copiilor și sistemul Glass

**Verdict**
Livrarea alegerilor este solidă și „A stânga / B dreapta” e respectat peste tot, dar tableta a crescut în șase-șapte fluxuri paralele cu palete, tonuri și dimensiuni de text proprii, iar mascotele și „sticla” din spec s-au subțiat până la stickere de 48 px — **nota 6/10**.

**Puncte forte**
1. Livrarea alegerilor corectă și defensivă: `choice-delivery.ts:8-13` blochează a doua atingere per zonă, `:16-30` aruncă cue-urile expirate la reconectare; `mission-ui.ts:53-58, 320-333` supraviețuiește unui reload.
2. Efectele gated pe eveniment, nu pe randare: `EffectGate` (`glass.ts:154`), confetti și sunet o singură dată; sunetele se deblochează după prima atingere și tac la `reducedStimuli`.
3. Diffing atent la 1 Hz: `index.ts:489-496` și `mission-ui.ts:263-293` înlocuiesc doar zona schimbată, păstrând focusul; jucăriile nu-și rup DOM-ul sub un pointer capturat.

**Constatări**
1. `index.ts:296-298` · medie · bug · La eroare „a răspuns deja” pentru copilul A se șterge `optimisticChoices[cueId]` întreg, deci și alegerea copilului B dispare fără explicație.
2. `index.ts:646, 691-696` · scăzută · bug · după reconectare la mijlocul unui cue, cronometrul reporneste de la `timeoutSec` întreg.
3. `mission-ui.ts:323` · medie · bug · retrimiterea unui `pending` la fiecare snapshot nu are plafon; fără ACK, tableta bombardează serverul la 1 Hz la nesfârșit.
4. `styles.css:209`, `experience.css:3,8,38`, `crew-selection.css` · **ridicată** · accesibilitate · 43 apariții de text sub 20 px (11–19 px) exact în mesajele de stare pe care copilul trebuie să le citească; spec P3 și guideline cer ≥ 20 px.
5. `index.ts:416-421, 558, 728, 861, 911` · medie · UX · fraze întregi în MAJUSCULE („MISIUNE ÎN DESFĂȘURARE”, „RĂMÂN SĂ PRIVESC”); copiii de 7–9 ani le citesc mult mai greu.
6. `index.ts:914, 911, 78, 620` · medie · limbaj · „Netrimis (eroare 404) · folosiți SALVEAZĂ”, „TRIMIS OPERATORULUI”, „Această instrucțiune veche nu cere un răspuns” — cod HTTP și vorbire de developer pe ecranul copilului.
7. `styles.css:191-236`, `experience.css:19`, `play-older.css:297`, `play-toys.css:270`, `crew-relay.ts:174` · medie · design · ~60 hex-uri locale în loc de tokeni; `var(--text-primary)` și `var(--text)` nu există în `glass.css`; butoane primare bleumarin plin — opusul „Sticlă, nu întuneric”.
8. `styles.css:80, 220`, `experience.css:147` · medie · design · mascota postului, cerută ca erou levitant, e retrogradată la sticker de 48–70 px.
9. `glass.css:114-116`, `styles.css:161-162`, `education-renderer.ts:155`, `crew-stage.ts:36` · medie · performanță · gradient mesh animat + `backdrop-filter` pe 5 carduri + `box-shadow` animat infinit + două contexte WebGL — jank pe Android mediu exact în momentul alegerii.
10. `index.ts:772`, `experience-ui.ts:72,93`, `play-board.ts:370,396`, `mission-ui.ts:176` · scăzută · UX · același gest are patru etichete: „DOAR PRIVESC”, „Prefer să privesc”, „Doar privesc/Privesc”, `observe/abstain`.

**Experiența copilului**
Un copil de 9 ani ar fi încântat în primele 30 de secunde: cardurile de post cu mascote, confetti la atingere, sunetul de clopoțel și cele două jumătăți colorate sunt exact ce trebuie. Apoi începe confuzia: după alegerea postului poate primi ecranul „legacy”, sau alegerea de personaj în stil arcade, sau tutorialul „Salută nava”, sau o jucărie SVG cu antenă și glisor, sau un diagram 3D rotitor — fiecare cu alt vocabular, alte culori și alt buton de „privesc”, fără un fir vizual care să-i spună că e același joc. Textele de stare, în care se ascunde răspunsul la „a mers?”, sunt cele mai mici de pe ecran, așa că va întreba adultul. La sfârșit, certificatul și fotografia sunt un moment bun, dar „TRIMIS OPERATORULUI” sau „eroare 404” îl scot brusc din poveste. Pe o tabletă modestă, blurul peste gradientul animat riscă să facă butoanele să reacționeze cu întârziere, ceea ce un copil interpretează drept „nu am apăsat bine” și apasă iar.

**Recomandări**
1. Un singur „shell” de identitate pe toate fluxurile: mascota postului mare + culoarea postului ca `--zone-accent`, o singură etichetă „Doar privesc”, un singur vocabular de stare; toate hex-urile locale pe tokenii din `glass.css`.
2. Text minim 20 px pentru orice mesaj adresat copilului, fără propoziții în majuscule; rescrie statusurile tehnice în limbaj de poveste.
3. Buget de randare pentru Android: oprește `glass-atmosphere` și `backdrop-filter` când `deviceMemory ≤ 4` sau când detectorul de cadre lente a coborât calitatea; un singur context WebGL; plafonează retrimiterile.

---

## Review G — consola, login, depanare, analitică, administrare, perete

**Verdict**
Fundația tehnică e solidă (DOM sigur, readiness explicit, /admin exemplar), dar consola expune trei căi paralele de pornire, scurgeri de jargon și o gestiune a sesiunii inconsecventă între module — **6/10**.

**Puncte forte**
1. `admin/index.ts:119-122, 211-254, 469-479, 504-508` — generation counter + AbortController contra răspunsurilor tardive, 401/403 tratate distinct, focus returnat, PIN-urile golite la închidere. Etalonul pentru celelalte pagini.
2. `control/index.ts:469-503, 954-960` — readiness cu motive în limbaj natural, buton de start care cere confirmare când nava nu e gata.
3. `control/presentation.ts:96-103, 122-136` — modurile „Înainte de show / În show / Instrumente” ascund panourile tehnice; singurul loc unde consola vorbește cu operatorul, nu cu inginerul.

**Constatări**
1. `control/index.html:80-91` + `presentation.ts:80-85` + `index.ts:1050-1059` · **ridicată** · UX — patru căi de pornire coexistă. Tasta Space/Enter pornește show-ul din orice punct al paginii, fără debounce și fără guard in-flight în `dispatch` (290-300).
2. `control/experience-control.ts:58-59` · medie · bug — `fetch` fără tratare 401; dialogul „Tutorial și echipaj” rămâne pe „Se încarcă…” la nesfârșit după expirarea sesiunii.
3. `control/index.ts:870-871` și `debug/index.ts:245` · medie · securitate — PIN-ul nou se cere prin `window.prompt`, în clar pe ecranul din sală, fără validare. Panoul de utilizatori există în trei implementări (control, debug, admin).
4. `login/index.ts:62-63,113` + `control/index.ts:919-926` · medie · securitate — tokenul e copiat în `sessionStorage` dar nicio pagină nu-l citește; `who.innerHTML` interpolează `user.name` neescapat.
5. `control/index.ts:121, 509-519, 546, 707` + `index.html:39, 146-147, 247` · medie · UX — scurgeri: IDLE, ON/OFF, LIVE/OFFLINE, AUTO-RUN, PREFLIGHT, teme brute, roluri „viewer/admin”, deși `ROLE_LABELS` românești există.
6. `control/index.ts:216-229` · scăzută · bug — la 4403 bucla de reconectare suprascrie mesajul cu „Deconectat · reîncerc în Ns”.
7. `wall/index.ts:103` · scăzută · bug — 403 trimite la login deși utilizatorul e autentificat; buclă login → 403 → login.
8. `control/index.html:45` vs `index.ts:486-487` vs `presentation.ts:154` · medie · UX — trei răspunsuri diferite la întrebarea „e normal 0 tablete?”.
9. `control/styles.css:1,8,55-56,69,247` și `analytics/styles.css:1` · scăzută · design — `:root` redefinește paleta neon a temei întunecate (`--cyan`, glow); `.eyebrow` 10 px contra 16 px din `glass.css`; `.button` 43 px contra țintei tactile 48 px.
10. `debug/index.ts:129-131, 242` · scăzută · securitate — `pf.lang`/`pf.variant` interpolate neescapat în `innerHTML`; id-uri în URL fără `encodeURIComponent`.

**Experiența operatorului**
Un operator de weekend deschis pe `/control` în modul „Înainte de show” vede un mesaj cald, trei verificări și cinci posturi — asta e bine. Dar deasupra stă hero-ul cu telemetrie („Temă PROLOGUE”, „Auto-run OFF”), iar la un clic pe „Toate instrumentele” cade în trei ecrane de butoane majuscule. Dialogurile „Misiune și instalație” și „Tutorial și echipaj” adaugă alte 20+ acțiuni cu vocabular din specificație („topologie”, „revizie”, „recuperare”). Nu există un singur indicator „poți porni / nu poți porni și de ce” vizibil în toate modurile. Consola e utilizabilă de cine a construit-o; pentru un începător este intimidantă și încă nesigură la tastatură.

**Recomandări**
1. O singură acțiune primară per stare; scoateți scurtătura globală Space/Enter sau cereți confirmare; guard in-flight în `dispatch`.
2. Modul comun `web/shared/session.ts` (fetch cu 401/403/abort/generation, după modelul admin) folosit în control, experience-control, wall, debug; eliminați panourile de utilizatori din control și debug.
3. Dicționar unic de etichete românești în `@shared`; eliminarea suprascrierii `:root` din `control/styles.css`/`analytics/styles.css`.

---

## Review H — scripturi, build, teste, proces

**Verdict**
Fundația tehnică (esbuild, node:test, teste pure fără timere) este solidă, dar procesul e neglijat: 4 teste roșii de o zi, 51 scripturi ad-hoc, sute de MB de WAV în git, fără CI — **nota 5/10**.

**Puncte forte**
- `scripts/test.mjs` bundle-uiește testele cu esbuild și rulează `node --test`: rapid, fără Jest/Vitest. Zero `setTimeout`/`sleep` în teste; `state.test.ts` folosește ceas virtual.
- Testele aserționează comportament: reducer pur verificat prin `structuredClone`+`deepEqual`, tranzacție SQLite cu rollback, ledger idempotent.
- `build.mjs` verifică fișiere runtime obligatorii, dedupe `three`, stub explicit pentru server lipsă → `exit 1`. Dependency footprint minim: 6 deps runtime, 8 dev.

**Constatări**
1. `mission-session.ts:14` · **HIGH** · corectitudine · `progress.participants` duplică `experience.participants`; `accept()` verifică doar prima. Două surse de adevăr.
2. `scripts/glass-final-review.mjs:6` · **HIGH** · securitate · fallback PIN operator hard-codat `'4078'` în script comis.
3. `.gitignore` / `assets/music/{qa,masters}` · **HIGH** · git hygiene · WAV + `.api-pcm` (intermediare de QA) urmărite în git; clone lent, istoric ireparabil fără `filter-repo`.
4. `package.json:23` · **MEDIUM** · CI · `npm run check` omite `smoke:renderer/wall/scenarios/experience`; nu există `.github/workflows`; smoke-urile cer Electron.
5. `scripts/` · **MEDIUM** · sprawl · 51 `.mjs`; 9 scripturi neinvocate de nimic; 11 fac capturi CDP manuale cu `sleep(700)` → flaky by design; ~8 s-ar reduce la Playwright `toHaveScreenshot`.
6. `scripts/build.mjs:128-131` · **MEDIUM** · build · `optional: true` pentru `login/debug/analytics/admin` — un typo ar produce un build „verde” fără admin.
7. `git log` · **MEDIUM** · granularitate · 4 commituri „Codex work/CODEX done” = 819 fișiere, 190k inserții. Bisect și review pe diff imposibile.
8. `docs/` + `HANDOFF.md` (881) + `HANDOFF-LIVE.md` + `HANDOFF-ISTORIC.md` · **LOW** · trei handoff-uri paralele; onboarding într-o zi: nu, fără un index „citește doar acestea 3”.

**Cele 4 teste**
Cauză unică: commit-ul `5395c92` a introdus înregistrarea echipajului (`crew:lock`): `fresh()` setează `progress.participants:[]`, iar `freshExperience()` are `participants:[]` (înainte `undefined` = toți activi). Testele construiesc sesiuni fără `crew:lock`: `mission-store.test.ts:17` primește opțiuni toate `disabled`; `mission-store.test.ts:50` și `experience.test.ts:78` primesc `inactive-seat`; `education-experience.test.ts:10` intră pe ramura „Loc liber”. Fix: fixture comun `activeCrew(session,['1A','1B'])` sau `experience.participants` ca singură sursă.

**Recomandări**
1. Repară cele 4 teste azi cu un fixture comun și unifică `participants`; `npm test` ca pre-commit.
2. Scoate WAV/`.api-pcm` din git (LFS sau `assets/music/qa/` în `.gitignore`); șterge cele 9 scripturi orfane; înlocuiește review-urile CDP cu un singur `playwright test`.
3. `.github/workflows/check.yml` cu `typecheck → validate → build → test → smoke:auth`; `docs/README.md` de o pagină care indică 3 documente canonice.

---

## 9. Sinteză transversală (orchestrator)

**Ce spun opt reviewers independenți, fără să se fi consultat**

1. **Nucleele sunt bune.** Mașina de stări, scheduler-ul de cue-uri, motoarele de joc, validatoarele de geometrie, autentificarea, SQLite-ul tranzacțional și watchdog-ul Electron sunt scrise cu grijă, testate și moderne. Nimeni nu a propus o rescriere.
2. **Hub-urile sunt problema.** `server/index.ts` (1.532 linii), `control/index.ts` (1.085), `player.ts` (1.037), `tablet/index.ts` (914) concentrează integrarea și toate defectele grave: checkpoint-ul neprotejat, promisiunile fără catch, cursa de la 465 s, scurtătura Space. Codul nou din ultimele 36 de ore a fost adăugat în aceste fișiere pe o singură linie, fără spații, vizibil diferit de restul.
3. **Cinci modele de domeniu concurează.** Show/Cue, Scenario, Play, Mission, Experience, cu patru enumerări paralele de stare și o sentinelă `legacy-v3` ramificată în 27 de locuri. Fiecare rundă a adăugat un strat în loc să consolideze pe cel dinainte.
4. **Interfața s-a fragmentat exact acolo unde contează.** Tableta copilului are șase-șapte fluxuri cu vocabular, culori și butoane diferite; consola are patru căi de pornire și trei panouri de utilizatori. Sistemul Glass există și e bun, dar jumătate din CSS-ul nou îl ocolește cu hex-uri locale.
5. **Procesul nu a ținut pasul.** Patru commit-uri de 190.000 de linii, 431 MB de audio în git, 51 de scripturi, 37 de documente, teste roșii de o zi, fără CI.

**Defectele care pot opri un spectacol cu public** (verificate pe cod)

| # | Defect | Unde | Efect |
|---|---|---|---|
| 1 | Checkpoint SQLite la 1 Hz fără try/catch | `server/index.ts:1441` | orice eroare de disc omoară procesul în timpul show-ului |
| 2 | Promisiuni `handleCommand` fără `.catch` | `server/index.ts:1348,1337,1479,1431` | respingere netratată = proces oprit în Node 24 |
| 3 | Date scriibile lângă executabil | `main/paths.ts:45` | varianta instalată în Program Files nu pornește |
| 4 | Renderer blocat, nu crăpat, nu e reînviat | `main/windows.ts:484` | un TV înghețat până la final |
| 5 | Cursa film → epilog la 465 s | `renderer/player.ts:1004,886` | cadru care sare, cue-uri de epilog retrase de două ori |
| 6 | Space/Enter global pornește show-ul | `control/index.ts:1050` | o tastatură atinsă lansează numărătoarea |
| 7 | Rate-limit ocolibil prin `X-Forwarded-For` | `server/auth.ts:265` | PIN de 4 cifre forțabil de pe LAN |

**Plan de acțiune, în ordine**

1. **Astăzi, înainte de orice funcționalitate nouă:** defectele 1, 2, 6 (o oră de lucru în total), cele 4 teste roșii, mutarea datelor în `userData`, `.gitignore` pe WAV și `.api-pcm`, un commit pe direcție.
2. **Săptămâna aceasta:** 4, 5, 7; `sandbox: true` și handler-ul de permisiuni; text ≥ 20 px și fără majuscule pe tabletă; un singur vocabular de stare în română; `session.ts` comun după modelul admin.
3. **Înainte de următorul strat de funcționalități:** spargerea celor patru hub-uri în module; consolidarea celor cinci modele într-unul sau două, cu `protocolVersion`; Prettier impus; CI cu `typecheck → validate → build → test → smoke:auth`; un index de trei documente canonice.
4. **Repetiție cu hardware real și copii reali**, cu PIN-ul schimbat, înainte de public.

---

## 10. Părerea mea despre întreaga experiență

**Ce s-a construit este remarcabil pentru două zile.** Un film de opt minute pe cinci televizoare sincronizate la nivel de cadru, un Căpitan care vorbește în română cu buzele mișcându-se corect, zece copii care aleg în perechi și văd alegerile lor apărând pe ecranul central, muzică originală care urmează cronologia, un certificat și o fotografie de plecat acasă. Plus patru scenarii pe grupe de vârstă cu 167 de replici vocale, un echipaj de 12 personaje ilustrate, un tutorial cu jucării interactive, un perete video cu calibrare optică și o pagină de administrare. Fiecare bucată luată separat este bine gândită. Nucleele tehnice sunt de calitate reală, iar cinci reviewers din opt au subliniat că nu ar rescrie nimic.

**Problema nu e calitatea, e cantitatea.** Experiența pe care ai cerut-o la început, „un player video custom cu un avatar care vorbește și tablete pentru copii”, există și funcționează. Peste ea s-au depus, în 36 de ore, încă patru sau cinci experiențe, fiecare cu propriul model de date, propriul vocabular și propria estetică. Reviewer-ul tabletei a spus-o cel mai bine: copilul e încântat în primele 30 de secunde, apoi nu mai știe dacă e în același joc. Nu pentru că vreun ecran e prost, ci pentru că sunt prea multe feluri de ecrane. Aceeași diagnoză vine de la reviewer-ul consolei despre operator și de la reviewer-ul contractelor despre inginerul nou.

**Ce înseamnă asta concret.** Scopul unei experiențe pentru copii nu e să facă multe lucruri, e să facă un lucru pe care copilul îl înțelege fără să întrebe un adult, iar operatorul să-l pornească fără să se teamă. Astăzi show-ul original bifează asta. Tutorialul, echipajul, jucăriile și scenariile pe vârste sunt idei bune, dar sunt fiecare la 70 la sută, cu text prea mic, cu „eroare 404” pe ecranul copilului, cu patru feluri de „doar privesc”. Șapte defecte pot opri un spectacol cu părinți în sală și niciunul nu e în funcționalitățile noi; toate sunt în felul în care funcționalitățile noi au fost cusute în vechile hub-uri.

**Ce aș face în locul tău.** Aș îngheța adăugarea de funcționalități pentru o săptămână. Aș repara cele șapte defecte și testele, aș comite pe direcții, aș scoate audio-ul din git. Apoi aș alege **o singură experiență completă pentru prima reprezentație publică**: show-ul original V3.3 cu Glass, mascote, muzică și certificat, fără tutorial și fără echipaj, cu consola în modul „Înainte de show / În show” și nimic altceva vizibil operatorului. Aș face repetiția cu televizoare, tablete și copii reali. Abia după ce zece copii au ieșit din sală fredonând motivul „Acasă” aș aduce, una pe rând, celelalte straturi, fiecare consolidată pe modelul existent și nu lipită lângă el.

**Nota mea de ansamblu: 6,5 din 10 pentru cod, 8 din 10 pentru viziune, 5 din 10 pentru pregătirea de public.** Diferența dintre ultimele două se închide cu disciplină, nu cu funcționalități noi. Materia primă e excelentă.
