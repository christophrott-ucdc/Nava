# Decizii de arhitectură

## ADR-01 — Electron și server Node într-un singur produs

Acceptat. Electron poate controla ferestre kiosk pe display-uri, reda video cu accelerare hardware și găzdui serverul LAN. Costul de memorie este acceptabil pe PC-ul de show.

## ADR-02 — Vanilla TypeScript și esbuild

Acceptat. Playerul, consola și tabletele folosesc DOM direct. Nu se adaugă un framework UI; suprafața este mică, build-ul rapid și distribuția rămâne simplă.

## ADR-03 — Media prin `file://`

Acceptat. Filmul mare rămâne lângă executabil și beneficiază de seek/range nativ. Serverul nu retransmite 4K.

## ADR-04 — H.264 High 4:2:0 pentru film

Acceptat. Sursa HEVC Rext 4:4:4 nu este redată sigur în Chromium. Transcodarea NVENC păstrează 3840×2052/60 fps și reduce fișierul la aproximativ 2,5 GB.

## ADR-05 — `show.json` ca sursă executabilă

Acceptat. Scenele, textele și timpii nu sunt hardcodate și se pot reîncărca. Id-urile cue-urilor sunt stabile și leagă scenariul de vocile pre-generate.

## ADR-06 — Ceas server-authoritative cu sursă video

Acceptat. Serverul decide comenzile și starea; ecranul central raportează timpul real al filmului. Follower-ele fac seek peste pragul de 0,25 s și ajustare de rată ±3% sub prag.

## ADR-07 — Lead-in negativ

Acceptat. `start` intră la `phaseTime = -launchLeadInSec`, cu filmul înghețat pe primul cadru. La zero începe redarea, păstrând numărătoarea în timeline-ul aceleiași faze.

## ADR-08 — Pista V3 este locală și strictă

Actualizat. Cele 51 de asset-uri V3 sunt pre-generate și preîncărcate din manifest înainte de lansare. Cue-urile spectacolului au `fallback: silent`: un asset lipsă produce subtitrare, tăcere temporizată și eroare în jurnal, niciodată TTS Windows/browser. TTS live rămâne numai pentru teste explicite. Nicio cheie nu intră în Git sau renderer.

## ADR-09 — Avatar și entități separate

Actualizat pentru scenariul V3. Numai `CAPITANUL` folosește GLB/TalkingHead și lip-sync, exclusiv pe ecranul configurat cu `showAvatar: true`. `AVATAR_AI` este vocea și interfața/HUD-ul navei, fără corp umanoid. Cele trei civilizații sunt randate procedural pe canvas, astfel încât nu cer asset-uri sau licențe suplimentare.

## ADR-10 — Aplicații web pe LAN

Acceptat. Consola și tabletele sunt pagini responsive servite de master, fără instalare. Rețeaua de show trebuie tratată ca privată; autentificarea nu face parte din această versiune.

## ADR-11 — Film extern pachetului

Acceptat. Installerul include codul, avatarul, show-ul și vocile existente, dar nu filmul de 2,5 GB. Operatorul copiază directorul `media/` lângă executabil.

## ADR-12 — Limitele integrării fizice

Actualizat. Experiența V3 nu presupune robot Unitree, capsulă VR sau mutarea publicului. NavaPlayer nu comandă DMX, fum ori podeaua; evenimentele `cueFired` și tema publicată oferă puncte de extensie viitoare.

## ADR-13 — Cinci posturi, două perspective per tabletă

Acceptat. Cele cinci tablete sunt legate anonim de posturile 1–5. Fiecare interacțiune are zone A/B independente și opțiunea „Doar privesc”, fără nume, scor, clasament sau consens obligatoriu. La întrebarea Tehnologicei, serverul selectează determinist una dintre cele trei replici pre-generate: perspective diferite, alegeri identice sau niciun răspuns înregistrat.

## ADR-14 — Durată publică deterministă

Acceptat. Fluxul este 50 s pre-show + 10 s lead-in + 465 s film + 75 s epilog = 600 s. Rendererul face tranziția locală la praguri și nu așteaptă un round-trip WebSocket; serverul primește ecoul stării fără să reseteze ceasul.

---

## Runda 4 (R4, 2026-09-04/05) — decizii noi

> Contextul: cererea „repară tot și implementează tot (schelet unde nu se poate); PIN 4078, utilizatori, pagină de depanare; agenți în paralel; heartbeat la 1 minut" (`HANDOFF-LIVE.md` §1). Contractele sunt în `src/shared/types.ts` / `protocol.ts` (secțiunile marcate `R4`). Starea implementării fiecărei decizii este în `HANDOFF-LIVE.md` §2, nu aici.

## ADR-10 (actualizare R4) — Aplicații web pe LAN, acum cu autentificare

Actualizat. Consola și tabletele rămân pagini servite de master, fără instalare. Propoziția „autentificarea nu face parte din această versiune" este înlocuită de ADR-15: consola, comenzile și paginile de administrare cer PIN; aplicația tabletelor rămâne publică.

## ADR-15 — PIN + utilizatori în loc de „fără autentificare"

Acceptat. Până la commit-ul `5af8383`, `/api/cmd`, `/api/show/reload`, `/api/tablets/clear` și `/api/tts` acceptau orice client din LAN, iar tabletele copiilor stau în același Wi-Fi ca consola. Decizia: login **doar cu PIN** (fără nume de utilizator, ca să fie tastabil de pe telefon în sală), utilizatori în `data/users.json` cu PIN-uri `scrypt`, roluri `viewer < operator < admin`, sesiuni persistente (`nava_session`, TTL 12 h), WS `hello.token`, rate limit 8/5 min, admin implicit cu PIN **`4078`** creat la prima pornire. Ecranele nu au PIN, ci un `screenToken` comun generat pe master și copiat pe follower-e. Consecințe acceptate: PIN-urile trebuie să fie unice; HTTP fără TLS pe LAN-ul sălii (vezi `docs/SECURITATE.md`); tabletele rămân anonime și publice. Alternativa respinsă: parole per utilizator + HTTPS cu certificat autosemnat — prea multă fricțiune pe tablete și telefoane în sală. (`src/server/auth.ts`, `users.ts`)

## ADR-16 — Readiness server-autoritar înainte de pornirea automată

Acceptat. Pornirea automată (trecerea preshow → lansare după 50 s și modul `autoRun`) se face numai când serverul constată: ecranele cerute conectate (`autoRun.requireScreens` ∪ toate ecranele configurate pe master), `tabletsConnected ≥ requireTablets`, `videoReady` raportat de ecranul de referință și preflight-ul asset-elor nepicat. Serverul, nu rendererul, decide, pentru că doar el vede toate ecranele (inclusiv follower-ele) și rezultatul preflight-ului. Pornirea **manuală** rămâne mereu permisă, cu motivele scrise în run-log: operatorul poate decide să pornească fără un ecran lateral, software-ul nu. Preflight-ul verifică cele 51 de clipuri (clip + fișier + mărime + durată + cuvinte), filmul și GLB-ul la pornire, la reload și la cerere. (`src/server/state.ts` `readiness()`, `src/server/preflight.ts`)

## ADR-17 — Span-mode: o singură fereastră și o singură decodare pentru 5 × 4K

Acceptat, cu `windows` ca implicit. Cinci ferestre kiosk înseamnă cinci decodări 4K/60 simultane pe un singur GPU. `displayMode: "span"` deschide o singură fereastră frameless peste uniunea display-urilor din `screens[]` și dă rendererului `viewports[]` (poziție, mărime, `scaleFactor` per ecran); contractul cere un singur `<video>` decodat și desenat pe câte un canvas per viewport. Costul acceptat: toate TV-urile trebuie la aceeași scală DPI (100 %), `F11` este dezactivat, iar `--screen` restrânge fereastra. `windows` rămâne implicit pentru că este testat și nu depinde de partea de renderer (B-07). (`src/main/windows.ts`, `SpanViewport` în `types.ts`)

## ADR-18 — Voci pre-generate + viseme precalculate

Acceptat, extinde ADR-08. Maparea română → viseme Oculus (`lipsync-ro.ts`) se rulează **o dată**, offline, cu `scripts/precompute-visemes.mjs`, care scrie `visemes/vtimes/vdurations` în `assets/voice/<lang>/manifest.json` din `words/wtimes/wdurations` (ElevenLabs). Rendererul preferă visemele precalculate și cade pe cuvinte doar dacă lipsesc. Motive: o singură sursă de adevăr pentru reguli (scriptul bundlează același `lipsync-ro.ts`), zero calcul la runtime în momentele strâns temporizate, rezultatele pot fi verificate în repo (`--check` în CI/preflight). Manifestul RO are 51/51 clipuri cu viseme. (`scripts/precompute-visemes.mjs`, `src/renderer/avatar/index.ts`)

## ADR-19 — Ambianță procedurală, nu muzică licențiată

Acceptat. Paturile sonore per temă (dronă, pad, zgomot filtrat, blip-uri) sunt sintetizate în Web Audio, fără fișiere și fără licențe, cu crossfade de 4 s la schimbarea temei, urmărire automată a cue-urilor `theme` și **ducking** la 0,25 (≈ −12 dB) sub voce, ca replicile să rămână inteligibile de la 17 m. Se poate opri din config (`ambient.enabled`), din cue (`ambient stop`) sau din comandă. Alternativa (score compus) rămâne deschisă (întrebarea 10 din `HANDOFF.md` §16); dacă vine, va intra tot prin cue-ul `ambient`. (`src/renderer/voice/ambient.ts`)

## ADR-20 — „Schelet întâi" pentru lumini, fotografie și dialog live

Acceptat. Hardware-ul (Art-Net/Hue, webcam) și serviciile (STT, LLM) nu sunt disponibile pe mașina de dezvoltare, dar contractele trebuie să fie stabile acum ca show-ul și consola să nu se mai schimbe când apar. Decizia: cue-urile `lights`, `photo`, `dynamic-voice` și comenzile `lights`, `photo`, `say`, ruta `POST /api/dialog` există și sunt validate; adaptorul de lumini funcționează cu `driver: none` (doar log), Art-Net UDP și Hue REST; dialogul răspunde cu replici pre-scrise fără cheie Gemini; foto este orchestrat de server prin mesaje `photo`. Nimic din acestea nu poate bloca show-ul: erorile merg în log, niciodată în excepții. (`src/server/features/{lights,dialog,dynamic-voice}.ts`, `src/renderer/voice/live-dialog.ts`)

## ADR-21 — `HANDOFF-LIVE.md` + heartbeat ca mecanism de continuitate

Acceptat. Runda se lucrează de mai mulți agenți în paralel, iar o sesiune poate muri la mijloc. `HANDOFF.md` rămâne imaginea coerentă, **rescrisă**, a proiectului; `HANDOFF-LIVE.md` este jurnalul **append-only** al rundei (§2 pachete cu proprietar și checkbox, §3 linii orare), autoritativ pentru starea live; `scripts/heartbeat.ps1` scrie mecanic la 60 s în `HEARTBEAT.log` (negit-uit) HEAD-ul, numărul de fișiere necomise, fișierele modificate recent și ultima linie din jurnal, ca oricine să vadă dacă sesiunea mai trăiește și de unde reia. Reguli: nu se editează liniile altora; fiecare agent atinge doar fișierele pachetului său; `src/server/index.ts` se integrează doar de orchestrator. Addendele istorice au fost mutate în `docs/history/HANDOFF-ISTORIC.md` ca `HANDOFF.md` să nu mai fie un jurnal contradictoriu. (`HANDOFF-LIVE.md`, `scripts/heartbeat.ps1`, `HANDOFF.md` §0)
