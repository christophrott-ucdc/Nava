# HANDOFF — „A Patra Lume · Protocolul Acasă" · NavaPlayer

> Documentul de predare al proiectului, scris pentru orice AI sau inginer care preia lucrul **fără acces la conversațiile anterioare**.
> Fiecare afirmație este verificabilă într-un fișier din repo; calea este dată între paranteze. Limba documentației: română. Limba codului: engleză.
> Versiunea curentă: rescriere completă la **2026-09-04** (agentul E, pachetul E-01), pe baza commit-ului `5af8383` de pe `board/nava-player` și a contractelor R4 din `src/shared/`. Addendele istorice §16–§28 ale vechiului document sunt în `docs/history/HANDOFF-ISTORIC.md`.

---

## 0. Citește asta întâi

### 0.1 Ce este acest fișier și ce nu este

`HANDOFF.md` este **imaginea coerentă a proiectului**: ce construim, de ce, cum funcționează, ce spune scenariul, ce s-a decis, ce nu face, ce urmează. Este un document **rescris**, nu un jurnal. Pentru **ce se întâmplă acum** (cine lucrează la ce, ce s-a terminat în ultima oră) se citește `HANDOFF-LIVE.md`, nu acest fișier.

### 0.2 Mecanismul de continuitate live: `HANDOFF-LIVE.md` + `HEARTBEAT.log`

| Fișier | Ce este | Cum se folosește |
|---|---|---|
| `HANDOFF-LIVE.md` (rădăcină, comis) | jurnal **append-only** al rundei curente: §1 context, §2 pachete de lucru cu proprietar și checkbox (`[ ]`/`[~]`/`[x]`/`[s]`), §3 jurnal orar `- [HH:MM] AGENT · pachet · ce s-a făcut · ce urmează` | fiecare agent bifează pachetele lui și adaugă o linie în §3 după fiecare pas; nu se editează liniile altora; **§2/§3 sunt autoritative pentru starea live** |
| `HEARTBEAT.log` (rădăcină, **ne-comis**, `.gitignore`) | scris mecanic la fiecare 60 s de `scripts/heartbeat.ps1`: `head`, numărul de fișiere necomise, fișierele modificate în ultimele 75 s, ultima linie din `HANDOFF-LIVE.md` | dacă nu mai primește linii, sesiunea care lucra a murit; PID-ul procesului este în `runs/heartbeat.pid`; pornire `npm run heartbeat`, oprire `npm run heartbeat:stop` (`package.json`) |

**Cum reia Codex (sau orice AI) lucrul** (`HANDOFF-LIVE.md`, antet): 1) citește acest §0 și `HANDOFF-LIVE.md` de la coadă la cap; 2) rulează `npm run check`; 3) `git status` pentru ce e necomis; 4) ia pachetele `[ ]` din `HANDOFF-LIVE.md` §2 în ordinea lor; 5) după fiecare pas adaugă o linie în §3.

### 0.3 Ordinea de citire

| # | Fișier | Ce afli | Obligatoriu? |
|---|---|---|---|
| 1 | `HANDOFF.md` (acesta) | ansamblul | da |
| 2 | `HANDOFF-LIVE.md` | starea live a rundei 4 (R4) | da |
| 3 | `src/shared/types.ts`, `src/shared/protocol.ts`, `src/shared/contracts.ts` | contractele TypeScript; secțiunile marcate `R4` sunt cele noi | da — **sursa de adevăr pentru cod** |
| 4 | `assets/show/show.json` | scenariul executabil V3.3: 8 scene, 87 cue-uri, 51 voci | da |
| 5 | `docs/SCENARIU-REGIZORAL-10-MIN.md` | scenariul regizoral complet (v3.3, 10:00) | da, dacă atingi texte/timpi |
| 6 | `docs/CUE-SHEET.md` | tabelul celor 87 de cue-uri (generat cu `npm run docs:cues`) | da, la aliniere |
| 7 | `docs/BRIEF.md` | brief-ul arhitectural ratificat + structura reală a filmului | da, înainte de cod |
| 8 | `docs/SPEC-SHEET.md`, `docs/OPERARE.md`, `docs/SECURITATE.md`, `docs/DECIZII.md` | cerințe, manual de operare, securitate, ADR-uri | pe rol |
| 9 | `docs/AVATAR.md` (agentul C, R4) | obținerea unui GLB de Căpitan compatibil | dacă atingi avatarul |
| 10 | `docs/history/HANDOFF-ISTORIC.md`, `docs/reference/**` | istoric și surse brute | referință |

### 0.4 Reguli de aur

1. Contractele din `src/shared/*.ts` nu se schimbă unilateral; `src/server/index.ts` se integrează **doar** de orchestrator (`HANDOFF-LIVE.md` §2).
2. Nicio cheie API în repo, loguri, manifest sau documentație. Cheile trăiesc în `.env` (ignorat; `.gitignore`).
3. `assets/show/show.json` este singura sursă executabilă a textelor și timpilor; textele vocale canonice sunt în `assets/show/voice-script-v3.json` și se sincronizează cu `npm run sync:voices`.
4. Fiecare agent atinge doar fișierele din paranteza pachetului său (`HANDOFF-LIVE.md` §2).
5. Nu se comite pe `main`; branch-ul de lucru este `board/nava-player`.

---

## 1. Ce este proiectul

**„A Patra Lume — Protocolul Acasă"** este o experiență imersivă de **exact 10:00** pentru **10 copii (8–14 ani) în 5 perechi**, la **5 posturi cu 5 tablete**, într-o sală de 17 × 7 m amenajată ca nava **EXODUS-7**, la **UCDC HUB AI** (Universitatea Creștină „Dimitrie Cantemir", București). Echipajul urmărește un semnal fără coordonate prin trei civilizații (Lumina, Natura, Tehnologica) și descoperă, la întoarcere, că „a patra lume" este Pământul, iar expeditorul semnalului este chiar echipajul. (`docs/SCENARIU-REGIZORAL-10-MIN.md`, „Premisa")

**Realitatea V3 a instalației** (`docs/SCENARIU-REGIZORAL-10-MIN.md` „Regula de spațiu și continuitate"; `docs/DECIZII.md` ADR-09, ADR-12, ADR-13):

| Element | Cum este în V3 | Ce face software-ul |
|---|---|---|
| 5 televizoare 4K | topologie `left-outer`, `left-inner`, `center`, `right-inner`, `right-outer`, câte unul per post | redă filmul sincronizat; overlay-uri (subtitrări, HUD, entități, temă) |
| **Căpitanul** | **personaj digital GLB, unicul umanoid, doar în fereastra de pe ecranul `center`**; nu există robot fizic, actor sau voce off separată | TalkingHead + GLB cu lip-sync (`SPEAKERS.CAPITANUL.lipsyncAvatar: true`, `src/shared/types.ts`) |
| **Vocea Navei** (`AVATAR_AI`) | voce + HUD/inel/formă de undă, **fără corp** | audio + subtitrare + HUD (`lipsyncAvatar: false`) |
| LUMINA, NATURA, TEHNOLOGICA | forme non-umanoide | entități procedurale pe canvas (`src/renderer/ui/entities.ts`) |
| 5 tablete landscape | fixate între cei doi copii ai perechii; două zone egale A/B; posturi NAVIGAȚIE, PROPULSIE, COMUNICAȚII, BIOSEMNALE, MEMORIE | aplicația web `/tablet` (`src/web/tablet`), contract `post-assign` / `paired-choice` |
| Capsulă VR, roboți Unitree, mutarea publicului | **nu există** în V3 | — |
| Lumini de sală, fum, vibrații | în afara playerului; **R4 adaugă un schelet de lumini** (`lights`, Art-Net/Hue) | `LightsCue`, comanda `lights` (`src/shared/types.ts`, `protocol.ts`) |

**Contractul temporal public = 600 s** (`assets/show/show.json` `$comment`; `docs/DECIZII.md` ADR-14):

| Timp public | Fază tehnică | Conținut |
|---|---|---|
| 0:00–0:50 | `preshow` 0–50 s | Semnalul fără coordonate; posturile pe tablete; 5 replici |
| 0:50–1:00 | `play` −10…0 s | countdown T−10 pe cadrul 0 înghețat |
| 1:00–8:45 | `play` video 0–465 s | filmul (Pământ → Siwarha → Kepler-186 d → Mann/Gargantua → wormhole → Pământ) |
| 8:45–10:00 | `epilogue` 0–75 s | Protocolul Acasă: ultimul cadru trece în alb cald, fără tăietură vizibilă |

Sursa video fizică are 741,78 s; playerul o oprește determinist la `videoDurationSec: 465` (`show.json`; `Player.duration()` în `src/renderer/player.ts`).

---

## 2. De ce există acest software

Un player video obișnuit nu ajunge, pentru că experiența cere (`docs/BRIEF.md` §0, §3):

1. **Replici la momente exacte din film**, rostite de un personaj 3D cu lip-sync, plus vocile a patru personaje fără corp.
2. **Cinci ecrane în sincron** (același cadru), cu pauză, reluare și seek fără să „fugă" unul de altul.
3. **O consolă de regie** pentru operator, iar în R4 și un mod fără operator (`autoRun`).
4. **Cinci tablete** legate de aceeași cronologie, cu interacțiuni anonime, fără text liber, care influențează replica adaptivă a Tehnologicei și entitățile vizuale.
5. **Un singur executabil offline** (voci pre-generate, fără servicii obligatorii), instalabil pe PC-ul de show.

De aici: Electron (player + ferestre kiosk) + server Node încorporat (Hono + WebSocket) + TalkingHead, într-un `.exe`.

---

## 3. Ce livrăm

| Livrabil | Descriere | Unde în cod |
|---|---|---|
| **`NavaPlayer.exe`** (portabil + installer NSIS) | Electron 44 + Node; `dist-app/NavaPlayer-0.1.0-x64-portable.exe` (108 042 526 B), `-setup.exe` (108 336 891 B), nesemnate Authenticode | `electron-builder.yml`, `scripts/build.mjs` |
| Rol `master` | ferestre kiosk per ecran, server, ecranul `center` = sursă de ceas | `src/main/**`, `config.role` |
| Rol `follower` | același exe pe alt PC; se conectează la `masterUrl`, urmărește ceasul, tastatura lui ajunge la master ca `control` | `src/main/master-link.ts`, `src/renderer/sync.ts` |
| Player | `<video>` 4K H.264 prin `file://` + subtitrări, countdown, entități, temă, OSD, panou de lansare în `idle` | `src/renderer/**` |
| Avatar | TalkingHead + GLB, colț stânga-jos, transporter, lip-sync pe `words/wtimes/wdurations` | `src/renderer/avatar/**` |
| Voce | manifest local → preload + decode al tuturor clipurilor înainte de lansare; `fallback: silent` pe cue-urile de producție; FX per vorbitor; SFX sintetizate | `src/renderer/voice/**` |
| Server | Hono + `ws`, `http://<ip>:4321`: `/control`, `/tablet`, `/ws`, `/api/*`; state machine autoritară; run-log JSONL | `src/server/**` |
| Consola operatorului | `/control/`: stare, transport, timeline [−10, 465], scene, cue-uri, tablete, QR, **START EXPERIENCE**, **ARATĂ PLAYERUL** | `src/web/control/**` |
| Aplicația tabletelor | `/tablet/?post=N`: sigiliul postului, două zone A/B, `paired-choice`, **DOAR PRIVESC** | `src/web/tablet/**` |
| Pipeline vocal | `voice-script-v3.json` → ElevenLabs (`eleven_v3`) → `assets/voice/ro/*.mp3` + `manifest.json`; validare, montaje, QA Scribe | `scripts/tts-generate.mjs`, `validate-voice-script.mjs`, `build-voice-reels.mjs`, `qa-voice-transcription.mjs`, `sync-v3-voices-to-show.mjs`, `src/server/tts-providers.ts` |
| Utilitare media | transcodare NVENC, planșe de cadre | `scripts/media-transcode.mjs`, `media-contact-sheet.mjs` |
| Launcher | `RUN.bat` (dublu-click: build + player windowed + consolă în browser) | `RUN.bat` |
| Teste | validatoare show/voci, smoke core/platform/media/renderer, teste unitare `src/**/*.test.ts` | `scripts/smoke-*.mjs`, `scripts/test.mjs` |
| **R4 (în lucru)** | autentificare PIN + utilizatori, `/debug`, preflight, span-mode, autostart, perf 1 Hz, ambianță, entități reactive, rehearse, readiness, editor cue, analitică, certificat, lumini, dialog live, foto, variante | `HANDOFF-LIVE.md` §2 |

Scripturi npm (`package.json`): `build`, `build:watch`, `start`, `dev`, `dist`, `typecheck`, `validate:show`, `validate:voices`, `smoke:core|auth|platform|renderer|media`, `check` (= typecheck + validate:show + validate:voices + build + test + smoke core/auth/platform/media), `tts`, `sync:voices`, `voice:reels`, `qa:voices`, `docs:cues`, `media:transcode`, `media:sheet`, `test`, `heartbeat`, `heartbeat:stop`.

---

## 4. Scenariul curent: V3.3 „Protocolul Acasă"

Sursa regizorală: `docs/SCENARIU-REGIZORAL-10-MIN.md` (v3.3, adaptare scenică românească). Sursa vocală canonică: `assets/show/voice-script-v3.json` (`3.3.0-ro-stage-adaptation`). Sursa executabilă: `assets/show/show.json` (`0.5.0-ro-stage`, `timingStatus: aligned`, `preshowAutoStart: true`, `launchLeadInSec: 10`, `epilogueOnVideoEnd: true`). Rezumat: `docs/SCENARIU.md`.

### 4.1 Personaje (`SPEAKERS`, `src/shared/types.ts`)

| Id | Etichetă | Cine | Culoare | FX | Lip-sync GLB | Voce ElevenLabs (`voice-script-v3.json`) |
|---|---|---|---|---|---|---|
| `CAPITANUL` | CĂPITANUL | unicul GLB, ecranul `center` | `#e2e8f0` | `clean` | **da** | `Z1I8XGyUmANP9h72LN2z` „Paul Bogorin" |
| `AVATAR_AI` | VOCEA NAVEI | voce + HUD | `#7dd3fc` | `hologram` | nu | `Q8ZbQAANLFvLw8uPBR8d` „AGEIS-7" |
| `LUMINA` | AVATAR LUMINĂ (scenic: LUMINA) | civilizația I | `#fcd34d` | `choir` | nu | `GRHbHyXbUO8nF4YexVTa` „Anca" |
| `NATURA` | AVATAR NATURĂ (scenic: NATURA) | civilizația II | `#86efac` | `forest` | nu | `9nKRcmsd1bEJbszIZ2HO` „Vasile Poenaru" |
| `TEHNOLOGIC` | TEHNOLOGICA | civilizația III | `#a5f3fc` | `crystal` | nu | `3z9q8Y7plHbvhDZehEII` „Antonia" |

### 4.2 Scenele (`show.json` `scenes[]`)

| Id | Fază | Interval fază | Temă | Ce se vede în film |
|---|---|---|---|---|
| `intro` | preshow | 0–50 | `prologue` | video oprit pe cadrul 0 (Pământul mare) |
| `launch` | play | −10–60 | `launch` | lead-in înghețat; Pământul se îndepărtează 0–20 s; nebuloasa-țintă de la 36 s |
| `light` | play | 60–144 | `light` | Siwarha (planetă cu inele, nebuloasă turcoaz) 74–137 s |
| `nature` | play | 144–246 | `nature` | Kepler-186 d (albastră, nori) 180–244 s |
| `tech` | play | 246–356 | `tech` | warp 246–280; Mann + discul Gargantua 282–352 |
| `wormhole` | play | 356–402 | `void` | dungi de stele 360–402 |
| `revelation` | play | 402–465 | `home` | Pământul (semilună) de la 403 s; tăietură la 465 |
| `reentry` | epilogue | 0–75 | `white` | ultimul cadru → alb cald; HUD și ambianță continuă |

### 4.3 Cele 51 de replici (`show.json`, `kind: "voice"`, toate cu `fallback: "silent"`)

Timpul public = `at` pentru preshow, `60 + at` pentru play, `525 + at` pentru epilog (`scripts/build-cue-sheet.mjs`).

| # | Cue | Fază@at | Public | Vorbitor | Text (`text.ro`) |
|---|---|---|---|---|---|
| 1 | `v3-cap-0004` | preshow@4 | 0:04 | CĂPITANUL | Exodus Șapte a interceptat un semnal fără coordonate. E împărțit în cinci fragmente — câte unul pentru fiecare post. În fiecare fragment apar două amprente. |
| 2 | `v3-ai-0015` | preshow@15 | 0:15 | VOCEA NAVEI | Postul Comunicații a reconstituit mesajul: „Găsiți a patra lume." Expeditorul nu poate fi identificat. |
| 3 | `v3-cap-0024` | preshow@24 | 0:24 | CĂPITANUL | Din clipa asta, nu mai sunteți pasageri. Sunteți un singur echipaj: cinci posturi, cinci feluri de a citi același semnal. Fiecare contează. |
| 4 | `v3-ai-0035` | preshow@35 | 0:35 | VOCEA NAVEI | Alegeți sau priviți. Pentru pauză, spuneți „pauză" ori faceți semnul. |
| 5 | `v3-cap-0043` | preshow@43 | 0:43 | CĂPITANUL | Pregătiți-vă de plecare. Când apare cifra cinci, numărăm împreună. |
| 6 | `v3-cap-0109` | play@9 | 1:09 | CĂPITANUL | Pământul se îndepărtează. Priviți-l bine. Când îl vom revedea, îl vom privi altfel. |
| 7 | `v3-ai-0125` | play@25 | 1:25 | VOCEA NAVEI | Echipajul este stabil. Nivelul de uimire depășește estimările. Îl las așa. |
| 8 | `v3-ai-0136` | play@36 | 1:36 | VOCEA NAVEI | Postul Navigație confirmă direcția. Semnalul ne conduce spre o sursă de lumină. Prima destinație. |
| 9 | `v3-ai-0206` | play@66 | 2:06 | VOCEA NAVEI | Siwarha. Aici, emoțiile pe care alegeți să le arătați devin lumină. |
| 10 | `v3-light-0224` | play@84 | 2:24 | LUMINA | Cuvintele voastre ajung greu la noi. Culorile ajung într-o clipă. |
| 11 | `v3-light-0236` | play@96 | 2:36 | LUMINA | Dacă vreți, alegeți culoarea pe care ați lua-o cu voi prin întuneric. |
| 12 | `v3-light-0258` | play@118 | 2:58 | LUMINA | Fiecare culoare schimbă imaginea. Iar liniștea dintre culori îi dă adâncime. |
| 13 | `v3-cap-0310` | play@130 | 3:10 | CĂPITANUL | Primul indiciu: semnalul poartă acum culoarea echipajului. Consemnat. |
| 14 | `v3-ai-0352` | play@172 | 3:52 | VOCEA NAVEI | A doua destinație: Kepler o sută optzeci și șase d. Pe lumea aceasta, nimic viu nu trăiește singur. |
| 15 | `v3-nature-0415` | play@195 | 4:15 | NATURA | Credeți că „eu" se termină la marginea trupului. Și totuși, aerul din voi a trecut prin frunze. Apa din voi a fost, cândva, nor. |
| 16 | `v3-nature-0433` | play@213 | 4:33 | NATURA | Când sigiliul pulsează, îl puteți atinge. Nu trebuie s-o faceți toți deodată. |
| 17 | `v3-nature-0453` | play@233 | 4:53 | NATURA | V-am auzit ritmurile. Sunt diferite — și totuși, împreună alcătuiesc o singură rețea. |
| 18 | `v3-cap-0501` | play@241 | 5:01 | CĂPITANUL | Cinci posturi. Zece amprente. Un echipaj. |
| 19 | `v3-ai-0512` | play@252 | 5:12 | VOCEA NAVEI | A treia destinație nu ne trimite un mesaj. Ne așteaptă cu o predicție. |
| 20 | `v3-ai-0534` | play@274 | 5:34 | VOCEA NAVEI | Mann. Aici, bolile au fost aproape învinse, distanțele aproape șterse, iar riscul poate fi calculat. Civilizația de aici prevede aproape orice. |
| 21 | `v3-tech-0556` | play@296 | 5:56 | TEHNOLOGICA | Bun venit, Exodus Șapte. Știam că veniți. Căpitanul va spune: „Scanați semnalul." |
| 22 | `v3-cap-0604` | play@304 | 6:04 | CĂPITANUL | Scanați semnalul. |
| 23 | `v3-tech-0606` | play@306 | 6:06 | TEHNOLOGICA | Știam. |
| 24 | `v3-tech-0610` | play@310 | 6:10 | TEHNOLOGICA | Modelele noastre acceptă un singur răspuns. Spuneți-mi: ce ține o lume în viață? |
| 25 | `v3-tech-0635-diverse` | play@335 | 6:35 | TEHNOLOGICA · *manual* | Modelele cereau un singur răspuns. Voi ați găsit mai multe. |
| 26 | `v3-tech-0635-observe` | play@335 | 6:35 | TEHNOLOGICA · *manual* | Niciun răspuns nu a fost înregistrat. Uneori, și tăcerea spune ceva. |
| 27 | `v3-tech-0635-same` | play@335 | 6:35 | TEHNOLOGICA · *manual* | Ați ales la fel. Dar fiecare post privește răspunsul din alt unghi. |
| 28 | `v3-cap-0642` | play@342 | 6:42 | CĂPITANUL | Atunci nu elimina nimic. |
| 29 | `v3-tech-0645` | play@345 | 6:45 | TEHNOLOGICA | Păstrez tot. Adevărul nu are o singură formă. |
| 30 | `v3-ai-0651` | play@351 | 6:51 | VOCEA NAVEI | Semnal complet. Unda e stabilă. |
| 31 | `v3-cap-0654` | play@354 | 6:54 | CĂPITANUL | Urmăm semnalul. |
| 32 | `v3-ai-0718` | play@378 | 7:18 | VOCEA NAVEI | Postul Memorie raportează o anomalie. Semnalul traversează tunelul în sens invers. Încă nu a fost trimis. |
| 33 | `v3-cap-0727` | play@387 | 7:27 | CĂPITANUL | Repetă. |
| 34 | `v3-ai-0729` | play@389 | 7:29 | VOCEA NAVEI | A ajuns la noi înainte să fie trimis. Și poartă amprentele acestui echipaj. |
| 35 | `v3-cap-0738` | play@398 | 7:38 | CĂPITANUL | Atunci... noi îl vom trimite. |
| 36 | `v3-ai-0742` | play@402 | 7:42 | VOCEA NAVEI | Navigația confirmă. Punctul de origine este chiar în fața noastră. |
| 37 | `v3-cap-0750` | play@410 | 7:50 | CĂPITANUL | Pământul. |
| 38 | `v3-ai-0754` | play@414 | 7:54 | VOCEA NAVEI | Originea semnalului este aici. Iar momentul transmisiei... încă nu a sosit. |
| 39 | `v3-cap-0802` | play@422 | 8:02 | CĂPITANUL | Înțeleg. N-am urmărit semnalul altcuiva. Noi l-am construit, pas cu pas. |
| 40 | `v3-ai-0809` | play@429 | 8:09 | VOCEA NAVEI | Lumina i-a dat culoare. Natura i-a dat ritm. Iar voi i-ați dat ceva ce nicio mașină nu poate inventa: propriile alegeri. |
| 41 | `v3-echo-0820` | play@440 | 8:20 | LUMINA | V-am recunoscut după lumină. |
| 42 | `v3-echo-nature-0824` | play@443.8 | 8:23.8 | NATURA | V-am recunoscut după ritm. |
| 43 | `v3-echo-tech-0826` | play@446.4 | 8:26.4 | TEHNOLOGICA | V-am recunoscut după alegeri. |
| 44 | `v3-cap-0829` | play@449 | 8:29 | CĂPITANUL | Corectez jurnalul. A patra lume nu era ascunsă. Noi nu știam încă s-o vedem. |
| 45 | `v3-ai-0838` | play@458 | 8:38 | VOCEA NAVEI | Mesaj complet: „Găsiți a patra lume." |
| 46 | `v3-cap-0843` | play@463 | 8:43 | CĂPITANUL | Trimite-l. |
| 47 | `v3-ai-0850` | epilogue@5 | 8:50 | VOCEA NAVEI | Suntem aici, cu voi. Nu mai aveți nimic de rezolvat. De aici, drumul ne duce acasă. |
| 48 | `v3-ai-0908` | epilogue@23 | 9:08 | VOCEA NAVEI | Știam unde este Pământul. Nu știam de ce îi spuneți „acasă". Asta am învățat de la voi. |
| 49 | `v3-cap-0920` | epilogue@35 | 9:20 | CĂPITANUL | Jurnal de bord: semnalul a fost trimis. Bucla s-a închis. |
| 50 | `v3-ai-0930` | epilogue@45 | 9:30 | VOCEA NAVEI | Ați plecat să găsiți o lume necunoscută. V-ați întors la lumea pe care o știați deja — iar acum o priviți altfel. |
| 51 | `v3-cap-0943` | epilogue@58 | 9:43 | CĂPITANUL | Protocolul Acasă s-a încheiat. Bun venit acasă, echipaj. Rămâneți la posturi. Ghidul vă va spune când vă puteți ridica. |

Într-o reprezentație se redau **49** de clipuri: la 6:35 se alege exact una dintre cele trei variante `v3-tech-0635-*`.

### 4.4 Ramura adaptivă de la `play:335` (6:35)

Cele trei replici `v3-tech-0635-{diverse,same,observe}` sunt `manual: true`, deci timeline-ul nu le declanșează. Markerul `tech-adaptive-select` (`play:335`) cere serverului ramura prin `tablets.perspectiveBranch("tech-tablet-perspectives")` (`src/server/tablets.ts`): **fără alegeri exprimate → `observe`**; **≥ 2 valori distincte → `diverse`**; **altfel → `same`**. Serverul difuzează un singur `fireCue` către toate ecranele. Un raport de ceas întârziat nu rearmează markerul; numai o comandă explicită `seek` rearmează cue-uri (`src/server/cues.ts`, antet). Validatorul impune existența markerului și caracterul `manual` al celor trei variante (`scripts/validate-show.mjs`).

### 4.5 Interacțiunile pe tablete (`show.json`, `kind: "tablet"`)

| Cue | Fază@at | Public | Interacțiune |
|---|---|---|---|
| `pre-tablet-roles` | preshow@0 | 0:00 | `post-assign` — NAVIGAȚIE, PROPULSIE, COMUNICAȚII, BIOSEMNALE, MEMORIE |
| `launch-tablet` | play@−10 | 0:50 | `waiting` |
| `light-tablet-color` | play@103 | 2:43–2:55 | `paired-choice` mode `color`: „Ce culoare ai lua cu tine prin întuneric?" — AURIU·CERC, ALBASTRU·UNDĂ, VERDE·FRUNZĂ, VIOLET·STEA + DOAR PRIVESC |
| `light-tablet-close` | play@115 | 2:55 | `waiting` |
| `nature-tablet-pulse` | play@219 | 4:39–4:51 | `paired-choice` mode `pulse`: „Atinge cercul o singură dată când pulsează." |
| `nature-tablet-close` | play@231 | 4:51 | `waiting` |
| `tech-tablet-perspectives` | play@317 | 6:17–6:34 | `paired-choice` mode `perspective`: „Ce crezi că ține o lume în viață?" — CURIOZITATEA, GRIJA, POVEȘTILE, ALEGERILE, ALTCEVA + DOAR PRIVESC |
| `tech-tablet-close` | play@334 | 6:34 | `waiting` |
| `epi-tablet-thanks` | epilogue@68 | 9:53 | `thanks` — „MISIUNE ÎNCHEIATĂ · SEMNAL TRANSMIS" |

Celelalte cue-uri nevocale: 8 `theme`, 6 `entity` (show/hide LUMINA 82/125,2; NATURA 192/239,2; TEHNOLOGIC 294/350,5), 6 `sfx` (`liftoff-rumble` 0 s, `rain` 194 s/45 s, `wormhole-whoosh` 360 s, `low-swell` 400 s, `arrival-chime` 463,5 s, `white-fade` epilog 0), 1 `countdown` (play −10, 10→0), 6 `marker`. Lista completă: `docs/CUE-SHEET.md`.

---

## 5. Filmul

### 5.1 Fapte tehnice (`docs/BRIEF.md` §1, §11; `media/transcode_4k.log`)

| | Sursa (client) | Fișierul redat |
|---|---|---|
| Cale | `C:\Users\Chris\Documents\GitHub\Video\Cinema.mp4` (în afara repo-ului) | `media/cinema_4k_h264.mp4` (local, **ignorat de git**, **neîmpachetat**) |
| Codec | HEVC **Rext 4:4:4** — nedecodabil în Chromium | **H.264 High 4:2:0** (NVENC p5, cq 20) |
| Rezoluție / cadență | 3840 × 2052 (1,87:1), 60 fps | identic |
| Durată | 741,77 s | 741,78 s fizic; **465 s folosiți** |
| Audio | fără pistă | fără pistă (vocile și SFX-urile vin din player) |
| Mărime | 7,09 GB | 2 504 162 463 B |

Transcodarea: `npm run media:transcode` (`scripts/media-transcode.mjs`). Raport 2052 px înălțime: `video.fit: "cover"` taie ≈ 101 px lateral; `contain` lasă benzi de 54 px (`config.example.json`).

### 5.2 Structura reală (planșe la 2 s / 1 s, `docs/BRIEF.md` §11)

| Secunde video | Conținut | Scenă |
|---|---|---|
| 0–20 | Pământul mare, se îndepărtează, dispare la ~20 s | `launch` |
| 20–72 | zbor; nebuloasa-țintă apare la 36 s | `launch` |
| 74–137 | **Siwarha** (inele, nebuloasă turcoaz), viraj 138–143 | `light` |
| 144–178 | câmp de stele | `nature` |
| 180–244 | **Kepler-186 d** (albastră, oceanică) | `nature` |
| 246–280 | warp | `tech` |
| 282–352 | **Mann** + discul Gargantua, viraj 353–358 | `tech` |
| 360–402 | wormhole / dungi de stele | `wormhole` |
| 403–465 | **Pământul** (semilună) — **tăietură la 465** | `revelation` |
| 465–741,78 | hold pe Pământ — **nefolosit** | — |

Nu există un beat Saturn în render; scriptul SpaceEngine (`docs/reference/spaceengine-script.txt`, ≈ 625 s) este doar referință de rută.

### 5.3 Tăietura la 465 s

`show.json` are `videoDurationSec: 465` și `epilogueOnVideoEnd: true`. `Player.duration()` returnează valoarea configurată; când `phaseTime ≥ duration − 0,02` rendererul face `seek` la 465, oprește video-ul și **intră local, imediat, în epilog** (`handleEnded` → `enterEpilogue`, `src/renderer/player.ts`), fără să aștepte round-trip-ul WS; serverul primește ecoul stării fără să reseteze ceasul epilogului (`docs/DECIZII.md` ADR-14). Epilogul se oprește local la 75 s (`scenes[reentry].end`). Validatorul respinge orice `play` cue cu `at > 465` (`scripts/validate-show.mjs`).

---

## 6. Arhitectura

### 6.1 Diagrama

```
NavaPlayer.exe (Electron 44 + Node) — rol master
├─ main (src/main)      config.json + .env · ferestre kiosk per ecran (displayMode "windows") sau o fereastră
│                       peste toate ecranele (displayMode "span", R4) · IPC · runs/app-*.jsonl · startServer()
├─ preload              window.nava (contextBridge): getBoot(), log(), sendCommand(), quit()
├─ renderer × N ecrane  <video file://…> · timeline (cue engine) · sync (WS + drift) · ui/* · avatar/ · voice/
│                       R4: perf 1 Hz, span.ts (un <video> → N canvas-uri), ambient.ts, photo.ts, room-mic.ts
└─ server (src/server)  Hono + @hono/node-server + ws  → http://<ip-lan>:4321
     /control/  /tablet/  /ws  /api/*          R4: /login, /debug, /analytics, /api/auth/*, /api/users, /api/debug/*
     state.ts (autoritate + ceas) · cues.ts (oglinda cue-urilor) · tablets.ts · tts.ts · runlog.ts
     R4: auth.ts, users.ts, preflight.ts, debug.ts, features/{lights,dialog,dynamic-voice,show-editor,analytics}.ts

clienți: /control (operator) · /tablet × 5 (?post=1..5) · NavaPlayer.exe role=follower (alt PC) · /debug (R4)
```

Reguli tehnice (`docs/BRIEF.md` §3): TypeScript strict; fără framework UI; esbuild (`main`/`preload` → CJS, `renderer`/`web/*` → IIFE); video prin `file://` absolut; Electron cu `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false`; `autoplay-policy=no-user-gesture-required`, `ignore-gpu-blocklist`. `[hidden] { display: none !important; }` este regulă globală obligatorie în `src/renderer/styles.css` (regresie în `scripts/smoke-core.mjs`).

### 6.2 Mașina de stări (`PlaybackState`, `src/shared/types.ts`; `src/server/state.ts`)

```
idle ──(preshow | click panou | Space | Enter)──▶ preshow ──(50 s, preshowAutoStart)──▶ playing @ −10
 ▲                                                    │(start | S)                        │ lead-in: video înghețat pe cadrul 0,
 │(restart | R)      idle ──(start | play din idle)───┘                                   │ countdown 10→0, phaseTime pe timer
 │                                                                                        ▼ 0 s: video pornește, liftoff-rumble
 │                                            paused ◀──(pause)── playing ──(play)──▶ paused
 │                                                                  │ 465 s (duration) sau (epilogue | E)
 └───────────────────────────────── ended ◀──(75 s)── epilogue ◀────┘
```

| Stare | Ce face playerul | Cine declanșează cue-urile |
|---|---|---|
| `idle` | video pe cadrul 0; panoul **PORNEȘTE EXPERIENȚA** / **PRE-SHOW** pe ecranul-sursă de ceas | — |
| `preshow` | video înghețat; 5 replici la 4/15/24/35/43 s; tabletele primesc posturile | timer al fazei |
| `playing` cu `phaseTime < 0` | lead-in T−10: cadrul 0 înghețat, countdown; `pause` îngheață countdown-ul; `seek` la t < 0 reintră în lead-in | timer |
| `playing` cu `phaseTime ≥ 0` | video rulează; `phaseTime = video.currentTime` | `video.currentTime` |
| `paused` | video oprit; cue-urile nu avansează | — |
| `epilogue` | ultimul cadru → alb cald; 5 replici; tabletele `thanks` la 68 s | timer (0–75 s) |
| `ended` | după 75 s de epilog; **faza activă (`play`/`epilogue`) este păstrată în `phaseMode`** ca un follower să nu revină la film | — |

Serverul tratează `play` din `idle` ca `start` (`state.ts`, `case "play"`); `pause` funcționează doar în `playing`; `seek` este limitat la faza curentă (`clampToPhase`); `skipToScene` schimbă faza dacă scena e în altă fază. Rapoartele de ceas sosite în primele 600 ms după o comandă care schimbă timpul sunt ignorate (`REPORT_GRACE_MS`).

**Comenzi** (`Command`, `src/shared/protocol.ts`). Implementate: `preshow`, `start`, `play`, `pause`, `seek`, `skipToScene`, `restart`, `epilogue`, `fireCue`, `stopVoice`, `setVolume`, `setLang`, `reloadShow`, `testAvatar` (Căpitanul: „Căpitanul EXODUS-7 online. Vă aud, echipaj."), `identifyScreens`. **R4 (contract definit, implementare în lucru — D-02, B-06, B-03, B-08, D-08):** `rehearse {rate}`, `setRate {rate}`, `autoRun {enabled}`, `lights {theme}`, `ambient {enabled}`, `say {speaker, text}`, `setVariant {variant}`, `photo`, `preflight`.

**Readiness gate (R4, D-01):** `ShowState.readiness` (`Readiness` în `types.ts`: ecrane conectate/lipsă, tablete, `videoReady`, `assetsOk`, `reasons`); `preshowAutoStart`/`autoRun` pornesc doar când ecranele cerute sunt conectate, video-ul este gata și preflight-ul vocilor a trecut.

### 6.3 Regulile motorului de cue-uri (`src/renderer/timeline.ts`, `src/server/cues.ts`)

1. La fiecare frame, toate cue-urile fazei curente cu `at ≤ phaseTime`, nedeclanșate și nu `manual`, se declanșează în ordinea `at`.
2. **Seek înapoi (comandă explicită):** cue-urile cu `at > phaseTime` se rearmează. Un raport de ceas care sare înapoi (jitter) **nu** rearmează.
3. **Seek înainte:** cue-urile sărite se marchează `skipped` fără a rula, cu excepția `theme` (ultima temă se aplică) și `entity` (starea finală show/hide); serverul aplică și ultimul `tablet`.
4. **O singură voce simultan**; o voce nouă o oprește pe cea anterioară și subtitrarea ei.
5. `manual: true` → doar `fireCue`. `fireCue` rulează cue-ul acum, indiferent de `at`.
6. Subtitrarea rămâne 800 ms după terminarea audio-ului (`SUBTITLE_HOLD_MS`).

### 6.4 Sincronizarea (`src/renderer/sync.ts`, `src/server/index.ts`, `src/shared/protocol.ts`)

- Un singur endpoint WS `ws://<host>:4321/ws`; primul mesaj trebuie să fie `hello { client: screen|control|tablet, id, name?, post?, isClockSource?, token? }`; răspuns `welcome { serverTimeMs, state, show, config.sync }` — show-ul întreg, ca follower-ele să nu depindă de fișiere locale.
- Handshake: fără `hello` → close 1008 „no hello"; `hello` dublu → 1008; server ocupat → 1013; oprire → 1001; payload maxim 64 KiB (`MAX_WS_PAYLOAD`). **R4:** `token` lipsă/invalid → `error` cu `code 4401` (neautentificat) sau `4403` (rol insuficient) și close.
- **Serverul este autoritatea.** Comenzile vin de la consolă, de la tastatura ecranului master (IPC) sau de la follower (`master-link.ts`, ca client `control`) și sunt retransmise tuturor ecranelor ca `applyCmd`.
- **Ceasul:** ecranul `center` al masterului are `isClockSource: true` și trimite `report` la `sync.clockHz` (4 Hz); serverul difuzează `clock`. Fără sursă de ceas, ancora extrapolează (ceas virtual).
- **Drift (ecrane ne-sursă):** țintă = `phaseTime + (now − serverTimeMs)/1000 × rate`; `|drift| > seekThresholdSec` (0,25 s) → seek; altfel `playbackRate = 1 ± rateNudge` (3 %).
- Consola și tabletele primesc `state` (la schimbare + 1 Hz), `cueFired`, `tabletView`, `tablets`. **R4:** `perf` (1 Hz, `PerfSample`), `perfSummary`, `entityParams`, `dynamicVoice`, `photo`/`photoCaptured`.

### 6.5 Follower și span-mode

- **Follower** (`config.role: "follower"`, `masterUrl`): deschide propriile ferestre, renderer-ele se conectează la WS-ul masterului, iar tastatura lui ajunge la master prin `master-link.ts` (coadă 5 s, max 20 comenzi). Media, GLB și vocile trebuie să existe și pe follower; `playAudio: false` dacă sunetul vine doar de la master. **R4 (A-03, P-01):** `hello` al ecranului poartă `screenToken` din boot.
- **Span-mode (R4, A-02, B-07):** `displayMode: "span"` = o singură fereastră peste toate ecranele; `getBoot().viewports: SpanViewport[]`; un singur `<video>` decodat, desenat pe câte un canvas per viewport (economie GPU). Implicit rămâne `"windows"` (`CONFIG_DEFAULTS_R4`).
- **Perspectivă laterală (R4, B-05):** `screens[].yawOffsetDeg` (ex. −30/−15/+15/+30) → crop/shift orizontal al filmului pe laterale.

### 6.6 Harta folderelor și proprietatea (R4, `HANDOFF-LIVE.md` §2)

```
Nava/
├─ HANDOFF.md · HANDOFF-LIVE.md · README.md · RUN.bat · HEARTBEAT.log (negit)        E (docs) / Orchestrator (LIVE)
├─ docs/  OPERARE SPEC-SHEET SECURITATE DECIZII SCENARIU SCENARIU-REGIZORAL-10-MIN CUE-SHEET   E
│  ├─ BRIEF.md (Orchestrator) · AVATAR.md (C) · history/HANDOFF-ISTORIC.md (E) · reference/** (ne-editabil)
├─ src/shared/  types.ts protocol.ts contracts.ts                        Orchestrator
├─ src/main/** src/preload/** · scripts/install-autostart.ps1 · config*.example.json     A
├─ src/renderer/** (fără avatar/, voice/) · src/renderer/**/*.test.ts     B
├─ src/renderer/avatar/** src/renderer/voice/** · scripts/tts-generate.mjs, precompute-visemes.mjs · assets/voice/**   C
├─ src/server/** (fără index.ts, auth.ts, users.ts, debug.ts, preflight.ts) · src/web/control/** src/web/tablet/** src/web/analytics/**   D
├─ src/server/index.ts auth.ts users.ts debug.ts preflight.ts · src/web/login/** src/web/debug/**   Orchestrator (P-01..P-06)
├─ assets/show/show.json (câmpuri noi: C-06) · assets/avatar/avatar-ai.glb · assets/voice/ro/ (51 mp3 + manifest + 3 preview)
├─ media/ (mp4 ignorat) · runs/ (JSONL, ignorat) · cache/ (TTS, ignorat) · data/users.json (ignorat) · dist/ dist-app/ (ignorate)
└─ package.json tsconfig.json electron-builder.yml .env.example .gitignore   Orchestrator
```

### 6.7 Contracte

| Fișier | Conține |
|---|---|
| `src/shared/types.ts` | `Speaker`/`SPEAKERS`, `Phase`, `CueKind` (7 + R4: `dynamic-voice`, `ambient`, `lights`, `photo`), `VoiceCue.variants`, `TabletPost`/`TabletZone`/`TABLET_POSTS`/`TABLET_OBSERVE_VALUE`, `TabletV3Interaction`, `SceneTheme` (8), `ShowFile` (+`variants`), `ScreenConfig` (+`yawOffsetDeg`), `AppConfig` (+`displayMode`, `autostart`, `security`, `ambient`, `lights`, `autoRun`, `variant`, `avatar.body`, `avatar.glbBySpeaker`), `CONFIG_DEFAULTS_R4`, `SpanViewport`, `UserRole`/`UserRecord`/`UsersFile`/`SessionInfo`, `PerfSample`, `EntityParams`, `Readiness`, `ShowState`, `VoiceClipMeta`/`VoiceManifest` |
| `src/shared/protocol.ts` | client→server: `hello` (+`token`), `report`, `cmd`, `tablet` (`set-post`, `choice` + evenimentele V2 păstrate), `perf`, `photoCaptured`; server→client: `welcome`, `clock`, `applyCmd`, `state`, `cueFired`, `tabletView`, `tablets`, `error` (+`code`), `entityParams`, `dynamicVoice`, `photo`, `perfSummary`; `Command`; `NavaBridge` (`getBoot()` + câmpuri R4: `serverHttpUrl`, `screenToken`, `security.publicState`, `displayMode`, `viewports`, `variant`) |
| `src/shared/contracts.ts` | `VoiceEngine`, `AvatarController`, `VoiceClip`, `PlaybackHandle`, fabricile `createVoiceEngine` / `createAvatarController` |
| `docs/BRIEF.md` §9 | semnături fixe: `startServer(opts) → ServerHandle`, `synthesize(opts) → TtsResult`, `resolveVoiceId` |

### 6.8 Build, packaging, layout la rulare

- `npm run build` → `scripts/build.mjs` (esbuild) → `dist/main`, `dist/preload`, `dist/renderer`, `dist/web/{control,tablet}`; build-ul eșuează dacă lipsește un entrypoint. `npm run dev -- --windowed` → build + Electron cu DevTools la nevoie. `npm run dist` → `dist-app/NavaPlayer-0.1.0-x64-{portable,setup}.exe` (`electron-builder.yml`: asar, `extraResources: assets/**, config.example.json`; filmul **nu** e împachetat).
- CLI (`src/main/config.ts`): `--config <cale>`, `--dev`, `--role master|follower`, `--screen <id>`, `--windowed`. Node ≥ 22 (`RUN.bat`); mașina de dezvoltare are v24.19.0.
- **appRoot** (`src/main/paths.ts`): în dezvoltare = rădăcina repo-ului; portabil = `PORTABLE_EXECUTABLE_DIR`; installer = `dirname(exe)`. `config.json`, `.env`, `media/`, `runs/`, `cache/`, `data/` stau în appRoot; `assets/**` se caută în appRoot, apoi în `resources/`.

```
<appRoot>/
├─ NavaPlayer.exe · config.json · .env (opțional) · data/users.json (R4, scrypt; ignorat de git)
├─ assets/show/show.json · assets/avatar/avatar-ai.glb · assets/voice/ro/{manifest.json, v3-*.mp3}
├─ media/cinema_4k_h264.mp4 (2,5 GB, copiat manual)
├─ runs/app-<stamp>.jsonl (log aplicație) · runs/show-<stamp>.jsonl (run-log per rulare; nou la fiecare `start`)
└─ cache/ (TTS live) · HEARTBEAT.log (doar în checkout-ul de dezvoltare)
```

---

## 7. Avatarul

- **Fișier:** `assets/avatar/avatar-ai.glb` (14 302 780 B), același GLB ca `avatars/avatar.glb` („BiologV2.glb", **Avaturn**) din proiectul-sursă Exodus; are cele 15 viseme Oculus, blendshape-uri ARKit și rig Mixamo (`docs/BRIEF.md` §1). Bibliotecă: `@met4citizen/talkinghead` ^1.7.0 peste `three` ^0.184 (`package.json`); `lipsyncModules: []`, `modelFPS: 30`, `cameraView: "upper"` (`src/renderer/avatar/talkinghead-setup.ts`).
- **Comportament:** canvas transparent peste video, colț `bottom-left`, lățime 22 %, margine 40 px (`config.avatar`); transporter (beam-in) la **prima replică a Căpitanului** (`ensureAvatarVisible`, `src/renderer/timeline.ts`); apoi permanent vizibil; `setAttention("idle")` când vorbesc alții; recuperare la pierderea contextului WebGL; afișat doar pe ecranele cu `showAvatar: true` (în V3 numai `center`).
- **Casting — nepotrivire cunoscută:** GLB-ul este un corp **feminin** (Avaturn), în timp ce vocea Căpitanului este masculină („Paul Bogorin"). **R4, C-01** (livrat în cod la 2026-09-05): `config.avatar.body` și `config.avatar.glbBySpeaker` (`AppConfig`, `types.ts`; validate în `src/main/config.ts`), `resolveBody` (opțiune → `config.avatar.body` → `"M"`), `buildCastingReport()` cu avertisment explicit în log-ul rendererului când GLB-ul livrat este castat ca Căpitan (`src/renderer/avatar/casting.ts`; raportul **nu** apare încă în `/debug`), și ghidul `docs/AVATAR.md` pentru obținerea unui GLB de Căpitan (Avaturn / Ready Player Me, cu viseme Oculus + ARKit).
- **lipsync-ro** (`src/renderer/avatar/lipsync-ro.ts`, teste în `lipsync-ro.test.ts`): mapare proprie română → viseme Oculus din `words/wtimes/wdurations`. **R4, C-02:** `scripts/precompute-visemes.mjs` scrie `visemes/vtimes/vdurations` în manifest; la 2026-09-05 **51 din 51** clipuri RO le au (`generatedAt 2026-09-04T19:45Z`); rendererul preferă visemele precalculate. **R4, C-04:** latența lip-sync (audio start → primul visem) intră în `PerfSample.lipsyncLatencyMs` (`perf-probe.ts`).

---

## 8. Vocile

### 8.1 Inventar (`assets/voice/ro/manifest.json`, generat 2026-09-04T19:06Z)

| | |
|---|---|
| Clipuri | **51** (`CAPITANUL` 17, `AVATAR_AI` 18, `LUMINA` 4, `NATURA` 4, `TEHNOLOGIC` 8), MP3 mono 44,1 kHz 192 kbps, durată cumulată 298,93 s |
| Model | `eleven_v3` (50 clipuri) cu taguri de interpretare și seed pe cue; `eleven_multilingual_v2` doar pentru `v3-ai-0035` |
| Retiming | 13 clipuri au `postprocessTempo ≠ 1` (`ffmpeg atempo`, timpii cuvintelor rescalați); maxim 1,552× pe `v3-cap-0604` „Scanați semnalul.", apoi 1,214× (`v3-ai-0035`), restul ≤ 1,151× |
| Câmpuri per clip | `cueId, lang, speaker, text, file, mime, durationMs, words, wtimes, wdurations, provider, direction, modelId, voiceId, audioTags, voiceSettings, postprocessTempo, generationKey, generatedAt` |
| Montaje de audiție | `preview-capitan-v3.mp3` (17), `preview-avatar-v3.mp3` (18), `preview-civilizatii-v3.mp3` (16) |
| QA (`npm run qa:voices`, Scribe v2, ro) | Căpitan WER 1,3 %, Vocea Navei 5,6 %, civilizații 0,6 %; prag 18 %; niciun tag rostit (`docs/history/HANDOFF-ISTORIC.md` §28.5) |

### 8.2 Politica de redare (`src/renderer/voice/index.ts`; `docs/DECIZII.md` ADR-08)

1. La boot, motorul încarcă manifestul și face **fetch + decode pentru toate clipurile** (max. 6 concurente) înainte ca UI-ul de lansare să fie armat; la cue, clipul vine din memorie.
2. Toate cele 51 de cue-uri de producție au `fallback: "silent"` (impus de `scripts/validate-show.mjs`): un MP3 lipsă → subtitrare + tăcere temporizată + eroare explicită în log; **niciodată** vocea Windows/browser în spectacol.
3. `POST /api/tts` (ElevenLabs/Gemini, cache pe disc în `cache/`) și `speechSynthesis` rămân doar pentru cue-uri ad-hoc/test care permit `fallback: "browser"` și, în R4, pentru `say` / `dynamic-voice` (B-08, D-03).
4. Ecranele cu `playAudio: false` nu emit sunet, dar raportează timpii pentru subtitrare/lip-sync. **R4, B-01:** `setSinkId(config.audio.outputDeviceId)` + lista dispozitivelor în `perf`.

### 8.3 Regenerare și chei

- Textele se schimbă **numai** în `assets/show/voice-script-v3.json` (și în scenariul regizoral), apoi: `npm run tts -- --source assets/show/voice-script-v3.json --provider elevenlabs [--cue <id>] [--force]` → `npm run voice:reels` → `npm run qa:voices` → `npm run sync:voices` → `npm run check`. Generarea este reluabilă, cu `generationKey` dependent de text + setări; nu regenera vocile aprobate fără motiv.
- Cheile: doar în `.env` (`.env.example` listează `ELEVENLABS_API_KEY`, `ELEVENLABS_MODEL_ID`, `ELEVENLABS_VOICE_*`, `GEMINI_API_KEY`, `GEMINI_TTS_MODEL`, `TTS_PROVIDER`), citite de `src/main/env.ts`, `src/server/tts-providers.ts` și `scripts/tts-generate.mjs`; nu ajung în renderer sau pagini web. `npm run check` nu consumă API; `qa:voices` și `tts` da.
- **Variante pe vârstă (R4, C-06):** `VoiceCue.variants["7-9"|"10-12"|"13+"]`, `ShowFile.variants`, `config.variant`, comanda `setVariant`; fișier `assets/voice/<lang>/<id>.<variant>.mp3`; varianta lipsă cade pe textul/clipul de bază. Schelet cu o variantă „7-9" pentru 3 replici.
- **Limbi (R4, C-03):** `setLang` acceptă doar limbi cu manifest complet; EN/FR marcate indisponibile în consolă până la generare (`--lang en|fr`).

---

## 9. Tablete, consolă, depanare, analitică

### 9.1 Tabletele (`src/web/tablet`, `src/server/tablets.ts`)

- Cinci tablete, fiecare legată de un post fix 1–5 (`?post=N` sau onboarding; persistă local); un post nu poate fi revendicat de două tablete conectate simultan.
- Două zone egale **A/B** (`TABLET_POSTS[post].perspectives`, ex. NAVIGAȚIE = DIRECȚIE/TRASEU); fiecare zonă răspunde independent, o singură dată per cue, nu poate suprascrie cealaltă; **DOAR PRIVESC** (`TABLET_OBSERVE_VALUE = "observe"`) și lipsa inputului sunt stări valide.
- Nu se colectează prenume, text liber, clasamente, procente sau consens; confirmările A/B sunt private pe tableta respectivă (`tabletView.zoneChoices`); posturile persistă la restart, răspunsurile sesiunii se șterg (`POST /api/tablets/clear`).
- Cerințe UI din scenariu: ținte ≥ 56 × 56 CSS px, gap ≥ 8 px, etichetă + simbol, reduced-motion. **R4:** telemetrie fictivă sincronă (D-07), certificat de misiune PNG + QR (D-06), buton de start pentru `autoRun` cu `startTrigger: "tablet"` (D-09).

### 9.2 Consola operatorului (`src/web/control`)

Stare + ceas interpolat, timeline T−10…465, scene, căutare/filtrare cue-uri cu `fireCue`, volume, limbă, QR/URL LAN, ecrane/tablete și răspunsuri live, **START EXPERIENCE** (start imediat la T−10, pentru test), **ARATĂ PLAYERUL** (`POST /api/player/focus`), bannerul „ACESTA ESTE DOAR PANOUL DE CONTROL". Stări video oneste: `NEÎNCĂRCAT`, `T−10 · ÎNCĂRCAT`, `RULEAZĂ`, `BLOCAT`, `ÎNCĂRCAT`. **R4, D-10:** login cu PIN (cookie `nava_session`), `token` în `hello`, butoane rehearse/ambient/lumini/say/variant, panou readiness/preflight; **D-04:** editor de cue-uri (drag pe timeline, `POST /api/show` cu backup + reload).

### 9.3 Pagina de depanare `/debug` (R4, P-03)

Stare, clienți WS, statusurile cue-urilor, preflight-ul celor 51 de clipuri (există + dimensiune + durată; P-04), `perf` per ecran (cadre pierdute, fps video/avatar, latență lip-sync, drift, heap, `roomLevel`), loguri, config redactat (fără secrete), acțiuni. Protejată de PIN (§10).

### 9.4 Analitică (R4, D-05)

`/analytics` din `runs/show-*.jsonl` (comenzi, tranziții, cue-uri, evenimente tablete). Rotația jurnalelor: `runs/` păstrează ultimele 20 rulări, PNG-urile merg în `runs/debug/` (P-05); `app-*.jsonl` rotit în main (A-05).

### 9.5 Rețea

Tabletele și consola trebuie să fie în aceeași rețea cu PC-ul master (port 4321, `bindHost: 0.0.0.0`); firewall-ul Windows trebuie să permită portul pe rețeaua privată. Recomandat: SSID dedicat sălii (`docs/SECURITATE.md`).

---

## 10. Securitate (R4 — contract în `types.ts`/`protocol.ts`; implementare P-01/P-02; detalii în `docs/SECURITATE.md`)

| Element | Valoare / regulă | Sursă |
|---|---|---|
| Starea la commit `5af8383` | **fără autentificare**: `/api/cmd`, `/api/show/reload`, `/api/tablets/clear`, `/api/tts` acceptă orice client din LAN; CORS `origin: "*"` | `src/server/index.ts` |
| PIN implicit | **`4078`** (`security.operatorPin`), folosit la crearea `data/users.json` dacă lipsește; **de schimbat înainte de primul show public** | `CONFIG_DEFAULTS_R4`, `types.ts` |
| Utilizatori | `data/users.json` (ignorat de git): `UserRecord { id, name, role: admin|operator|viewer, pinHash (scrypt), salt, createdAt, lastLoginAt?, disabled? }`; admin implicit cu PIN 4078 | `types.ts`, `.gitignore`, P-02 |
| Sesiuni | `POST /api/auth/login` → cookie `nava_session`; TTL `sessionTtlMin` (implicit 720 min); `SessionInfo`; `data/sessions.json` ignorat | `protocol.ts` (comentariu `HelloMsg.token`), `.gitignore` |
| Ce protejează PIN-ul | `/api/cmd`, scrierile `/api/show/*`, `/api/users`, `/api/tablets/clear`, `/api/debug/*`, `/api/tts`; WS `hello` al clientului `control` cu `token` | `HANDOFF-LIVE.md` P-01 |
| Ecranele (renderer-e) | `hello` cu `security.screenToken` (generat la prima pornire dacă e gol; transmis prin `getBoot().screenToken`) | `types.ts`, `protocol.ts` |
| Ce rămâne public | `/tablet/` și WS-ul tabletelor (fără token), `/api/health`, `/api/state` dacă `security.publicState: true` (implicit), `/api/qr`, `/api/urls` | `SecurityConfig.publicState` |
| Coduri de eroare WS | `4401` neautentificat, `4403` rol insuficient | `ErrorMsg.code` |

---

## 11. Operarea (manualul complet: `docs/OPERARE.md`)

- **Dezvoltare / probă:** dublu-click `RUN.bat` → verifică Node ≥ 22, `package.json`, `config.json` (îl creează din exemplu dacă lipsește), show/GLB/film; `npm ci` doar dacă lipsește Electron; build; pornește Electron windowed; deschide `http://localhost:4321/control/` după ce răspunde 200. Opțiuni: `--kiosk`, `--no-control`, `--check`, `--help`.
- **Instalație:** `NavaPlayer-…-portable.exe` + `config.json` + `media/cinema_4k_h264.mp4` în același folder; `config.screens[]` cu `displayIndex` după ordinea reală a display-urilor (sortate stânga→dreapta, `src/main/windows.ts`); `showAvatar: true` numai pe `center`. `config.json` local al mașinii de dezvoltare are un singur ecran; nu inventa indici înainte de instalare.
- **Flux:** `idle` → o atingere pe ecran / `Space` / `Enter` → pre-show 50 s → lead-in automat → film → epilog → **RESTART**. `S` / **SARI LA LANSARE** / **START EXPERIENCE** sar peste pre-show.
- **Taste pe ecranul-sursă de ceas** (`src/renderer/index.ts`): `Space` (idle → preshow; film → pauză/reluare), `Enter` (idle → preshow; altfel play), `S` start, `P` preshow, `R` restart, `E` epilog, `←/→` seek ∓5 s, `I` identifică ecranele, `T` test avatar, `F` fullscreen, `O` panou diagnostic (orice ecran), `Esc`×2 ieșire (doar windowed). În main (`src/main/shortcuts.ts`): `F11` fullscreen, `Ctrl+Q` ieșire.
- **Autostart (R4, A-01):** `config.autostart: true` → `setLoginItemSettings`; alternativ `scripts/install-autostart.ps1` (Task Scheduler); `powerSaveBlocker` și watchdog (repornire renderer / relansare la eroare fatală).
- **Repetiție accelerată (R4, B-06, D-02):** `rehearse {rate}` (video + voci comprimate), `setRate 1` pentru revenire.
- **Continuitate:** `npm run heartbeat` în checkout; `HANDOFF-LIVE.md` §3 după fiecare pas.

---

## 12. Decizii (rezumat; complet în `docs/DECIZII.md`)

| ADR | Decizie | Motiv scurt |
|---|---|---|
| 01 | Electron + Node într-un singur executabil | kiosk offline, ferestre pe N ecrane, decodare hardware, server încorporat |
| 02 | Vanilla TypeScript + esbuild, fără framework UI | suprafață mică, pornire rapidă |
| 03 | Media prin `file://` | seek/range nativ, fără retransmisie 4K |
| 04 | H.264 High 4:2:0 (NVENC) | Rext 4:4:4 nu merge în Chromium |
| 05 | `show.json` = sursă executabilă, reîncărcabilă | texte/timpi fără rebuild; id-uri stabile leagă vocile |
| 06 | Ceas server-authoritative; `center` = sursă | un singur adevăr pentru ecrane, consolă, tablete |
| 07 | Lead-in negativ (`phaseTime = −10`) | countdown pe cadrul înghețat, în aceeași fază |
| 08 | Pistă V3 locală, strictă (`fallback: silent`, preload) | determinism; niciodată voce Windows în show |
| 09 | Căpitan = unicul GLB; Vocea Navei = voce + HUD; entități procedurale | cerință de producție; fără al doilea corp |
| 10 | Aplicații web pe LAN, fără instalare | QR, zero instalare pe tablete |
| 11 | Filmul în afara pachetului | 2,5 GB |
| 12 | Fără robot, VR, DMX, fum în player; hook-uri prin `cueFired`/temă | scop V3 |
| 13 | Cinci posturi, două perspective per tabletă, ramură adaptivă deterministă | anonimat, fără consens obligatoriu |
| 14 | Durată publică deterministă 50 + 10 + 465 + 75 = 600 s; tranziții locale în renderer | 10:00 exact, fără round-trip |
| 15 (R4) | PIN + utilizatori în loc de „fără autentificare" | tabletele copiilor sunt pe același Wi-Fi |
| 16 (R4) | Readiness server-authoritative înainte de auto-start | nu porni fără ecrane/video/voci |
| 17 (R4) | Span-mode: o decodare, N viewport-uri | GPU pentru 5 × 4K |
| 18 (R4) | Voci pre-generate + viseme precalculate | lip-sync fără calcul la runtime |
| 19 (R4) | Ambianță procedurală, nu muzică licențiată | fără licențe, ducking controlat |
| 20 (R4) | Schelet-first pentru lumini / foto / dialog live | contract stabil, hardware absent |

---

## 13. Ce NU face (și hook-ul pentru viitor)

| În afara scopului | Hook existent |
|---|---|
| Robot fizic, actor, voce off pentru Căpitan | nu există și **nu trebuie introdus** (§1) |
| Conținut VR / mutarea publicului | — |
| Lumini DMX reale, fum, vibrații podea | **schelet R4** `lights` (Art-Net UDP / Hue REST, D-08); `ThemeCue` + `state.theme` pe WS |
| Muzică compusă | **R4** ambianță procedurală per temă cu ducking (B-03); SFX sintetizate (`SfxCue`) |
| Dialog live STT → LLM → TTS | **schelet R4** Web Speech API → `POST /api/dialog` (Gemini) → `say` (C-05); latența nu e garantată |
| Fotografie de echipaj | **schelet R4** `PhotoCue` / `photo` (B-09) |
| Semnare Authenticode a exe-ului | nu; SmartScreen va avertiza la distribuție publică |
| Voci EN/FR | tipurile permit `en`/`fr`; manifeste negenerate |
| Compoziție panoramică reală pe 5 ecrane (mișcare continuă stânga→dreapta) | parțial: `yawOffsetDeg` (B-05); inelul cu 4 arce și sigiliile din scenariu nu sunt implementate ca overlay dedicat |

---

## 14. STATUS

> **`HANDOFF-LIVE.md` §2/§3 este autoritativ pentru starea live.** Tabelul de mai jos este o **fotografie la 2026-09-05, 10:30** (agentul E, la închiderea E-02/E-03), oglindind `HANDOFF-LIVE.md` §2 din acel moment și fișierele prezente în checkout (necomise; HEAD = `cbd2929`). Nu îl actualiza în locul `HANDOFF-LIVE.md`.

### 14.1 Ce este gata și verificat

- [x] **Commit `5af8383`** (`npm run check` verde): show V3.3 `0.5.0-ro-stage` (8 scene, 87 cue-uri, 51 voci `fallback: silent`, ramură adaptivă, 5 posturi × 2 zone); 51 MP3 ElevenLabs + manifest; 3 montaje; QA Scribe sub prag; player (lead-in negativ, tăietură la 465 s, epilog 75 s, `[hidden]` global, watchdog video, panou de lansare); server (state machine, ceas, cue tracker, tablete 5×2, run-log, QR, `POST /api/player/focus`); consolă **START EXPERIENCE** / **ARATĂ PLAYERUL**; tabletă cu **DOAR PRIVESC**; `RUN.bat`; `dist-app/*.exe`; smoke core/platform/media/renderer.
- [x] **Commit `cbd2929`** („R4 checkpoint", 2026-09-05 ~10:17, `tsc` curat, 54 teste, `smoke-auth` + `smoke-core` OK, Electron verificat live: `screen:center` autentificat, preflight 51/51 cu 51 viseme, readiness `ready`, login 4078, `/api/debug` OK): P-01…P-05 (auth PIN, utilizatori scrypt, `/debug`, preflight, rotație `runs/`), contracte R4, integrarea în `index.ts` a show-editor/certificates/dialog/lights + hooks director, `sync.ts` cu `screenToken`, consolă cu `/api/auth/me` → token în `hello`, `HANDOFF-LIVE.md`, `scripts/heartbeat.ps1`, `scripts/smoke-auth.mjs` (30 verificări).

### 14.2 Pachetele R4 (oglinda `HANDOFF-LIVE.md` §2 la 2026-09-05 10:30; `[x]` gata · `[~]` în lucru · `[s]` schelet · `[ ]` nebifat)

| Owner | Stare per pachet (din `HANDOFF-LIVE.md` §2) | Ce există în checkout (observat de E) |
|---|---|---|
| Orchestrator | `[x]` P-01 auth · `[x]` P-02 utilizatori · `[x]` P-03 `/debug` · `[x]` P-04 preflight · `[x]` P-05 rotație `runs/` · `[~]` P-06 integrare `index.ts` / `npm run check` / commit | `src/server/{auth,users,debug,preflight,maintenance}.ts`, `src/web/{login,debug}`; **nemontat încă:** `features/analytics.ts` la `/api/analytics`; **neacceptate încă** de `loadShowFile`/`validate-show.mjs` cele 4 tipuri noi de cue |
| A (main) | `[ ]` A-01 · `[x]` A-02 span · `[x]` A-03 boot R4 · `[x]` A-04 config loader R4 · `[ ]` A-05 | **codul A-01 și A-05 există** deși nebifate: `powerSaveBlocker`, watchdog + `app.relaunch()`, `applyAutostart` (`src/main/main.ts`), `scripts/{install,uninstall}-autostart.ps1`, `rotateRunLogs` (`src/main/logger.ts`); `config.5screens.example.json`, `config.follower.example.json` |
| B (renderer) | `[x]` B-01 setSinkId · `[x]` B-02 perf 1 Hz · `[x]` B-03 ambianță · `[x]` B-04 entități reactive · `[x]` B-05 yaw · `[x]` B-06 rehearse · `[s]` B-07 span · `[x]` B-08 dynamic-voice · `[s]` B-09 foto/mic · `[x]` B-10 teste | `perf.ts`, `span.ts`, `photo.ts`, `room-mic.ts`, `perspective.ts`, `cue-scheduler.ts`, `voice/ambient.ts`, teste `perf/perspective/cue-scheduler/ui/entities`; `player.ts` tratează `rehearse/setRate/ambient/say/setVariant/photo` |
| C (avatar/voce) | `[ ]` C-01…C-07 (agentul C s-a oprit fără să bifeze) | **codul există pentru C-01, C-02, C-03 (guard), C-04, C-05, C-07:** `avatar/casting.ts`, `perf-probe.ts`, `lipsync-ro.test.ts`, `scripts/precompute-visemes.mjs` (manifest RO **51/51** cu viseme), `createLangGuard` în `voice/manifest.ts` (nefolosit încă de player — de verificat), `voice/live-dialog.ts`, `server/features/dialog.ts`; **C-06 parțial:** `variants` în `show.json` (3 replici `7-9`), fără audio și **fără `--variant` în `tts-generate.mjs`**; `docs/AVATAR.md` livrat de E |
| D (server/web) | `[ ]` D-01 · `[ ]` D-02 · `[ ]` D-03 · `[x]` D-04 editor · `[ ]` D-05 · `[ ]` D-06 · `[ ]` D-07 · `[ ]` D-08 · `[ ]` D-09 · `[x]` D-10 consolă · `[ ]` D-11 | **codul există pentru D-01/D-02/D-03/D-08/D-09** deși nebifate: `readiness()`, comenzile R4, `requestStart` în `state.ts`; `features/{dynamic-voice,lights,show-editor,show-validate,certificates,analytics}.ts`; `src/web/analytics/**`; consola cu login, readiness, butoane R4, editor; **lipsesc:** `src/server/state.test.ts` (D-11), certificat/telemetrie/buton start pe tabletă (D-06/D-07/D-09 partea web); `POST /api/certificates` cere `operator`, deci tabletele nu pot posta |
| E (docs) | `[x]` E-01 · `[x]` E-02 · `[x]` E-03 | `HANDOFF.md`, `docs/history/HANDOFF-ISTORIC.md`, `docs/{OPERARE,SPEC-SHEET,DECIZII,SECURITATE,AVATAR}.md`, `README.md`; `docs/CUE-SHEET.md` regenerat identic; `docs/BRIEF.md` **neatins** (proprietar: orchestrator) |

### 14.3 Verificări care nu pot fi făcute pe PC-ul de dezvoltare

- Audiție pe sistemul real de sunet; cinci display-uri reale (`displayIndex`); cinci tablete fizice `?post=1..5`; repetiție completă de 10:00 cu facilitator; grupe-pilot 8–9 / 10–11 / 12–14 ani (`docs/SCENARIU-REGIZORAL-10-MIN.md`, „Cerințe de producție").

---

## 15. Pași următori recomandați, în ordine

1. Terminați și integrați pachetele R4 în ordinea din `HANDOFF-LIVE.md` §2 (orchestratorul integrează `index.ts`; `npm run check` verde; commit pe `board/nava-player`).
2. Schimbați PIN-ul `4078` și generați `screenToken` înainte de orice rețea cu public (`docs/SECURITATE.md`).
3. Obțineți/aprobați un GLB **masculin** pentru Căpitan (`docs/AVATAR.md`), setați `config.avatar.glbBySpeaker.CAPITANUL` și `avatar.body: "M"`; rulați `npm run smoke:renderer`.
4. Rulați `scripts/precompute-visemes.mjs` pe cele 51 de clipuri și comiteți manifestul.
5. Configurați instalația reală: `config.5screens.example.json` → `config.json` cu `displayIndex` corecți, `yawOffsetDeg`, `showAvatar` doar pe `center`; testați `displayMode: "span"` vs `"windows"` pe GPU-ul sălii.
6. Repetiție tehnică: audiție, 5 tablete, `rehearse 4` pentru cue-uri, apoi o rulare completă la 1×.
7. Decideți lumini (Art-Net/Hue) și, dacă există hardware, activați `lights.driver`.
8. `npm run dist`, test „curat" pe un PC fără Node; opțional certificat de code-signing.

---

## 16. Întrebări deschise pentru Christoph

| # | Întrebare | De ce contează | Implicit dacă nu răspunde |
|---|---|---|---|
| 1 | Un PC cu 5 ieșiri sau master + follower-e? Ce GPU are PC-ul sălii? | `displayMode`, follower, drift | suportăm ambele; `span` pe un singur GPU |
| 2 | GLB de Căpitan masculin: Avaturn/RPM al lui Christoph sau generăm noi? | casting voce–corp (§7) | păstrăm GLB-ul actual cu `body: "M"` până la înlocuire |
| 3 | PIN-ul final și lista utilizatorilor (admin/operator/viewer)? | `data/users.json` | admin cu 4078 — **nesigur pentru public** |
| 4 | Wi-Fi dedicat pentru tablete? Ce tablete/browser? | port 4321, `?post=N` | SSID separat, 5 tablete Android/iPad |
| 5 | Sistemul audio al sălii (boxe PC, mixer, per TV)? Sub-bas pentru rumble? | `audio.outputDeviceId`, volume | ieșirea implicită a masterului |
| 6 | Lumini de sală controlabile (Art-Net / Hue) sau nu? | `lights.driver` | `none` |
| 7 | Variante pe vârstă: se vor înregistra toate replicile pentru 7-9 / 13+? | costul TTS, `variants` | doar textul de bază |
| 8 | Dialog live cu copiii: dorit în V3 sau doar schelet? | cheie Gemini la runtime, latență | schelet dezactivat |
| 9 | Fotografia de echipaj: webcam pe `center`, unde se afișează, GDPR? | `PhotoCue`, stocare | schelet dezactivat |
| 10 | Ambianța procedurală este acceptabilă sau vine un score compus? | `ambient.enabled` | procedurală, cu ducking |
| 11 | Inelul cu 4 arce și sigiliile din scenariu: se implementează ca overlay HUD în această rundă? | B-04 acoperă doar culoare/puls/perspectivă pe entități | nu în R4 |
| 12 | Semnare Authenticode pentru exe? | SmartScreen | nu |

---

## 17. Glosar

| Termen | Sens aici |
|---|---|
| **Cue** | eveniment din `show.json`: `voice`, `countdown`, `sfx`, `entity`, `tablet`, `theme`, `marker`; R4: `dynamic-voice`, `ambient`, `lights`, `photo` |
| **Fază** / **`phaseTime`** / **`at`** | `preshow` (timer), `play` (`video.currentTime`, poate fi negativ în lead-in), `epilogue` (timer); `at` = secunda din fază la care se declanșează cue-ul |
| **Lead-in** | intervalul `play` −10…0 cu video-ul înghețat și countdown |
| **Tăietura la 465** | `videoDurationSec`; playerul nu redă restul filmului |
| **Scenă / Temă** | interval `[start, end)` cu o `SceneTheme`: `prologue`, `launch`, `light`, `nature`, `tech`, `void`, `home`, `white` |
| **Post / Zonă / Lentilă** | postul fizic 1–5 al unei tablete; jumătatea A/B a unui post; felul în care postul „citește" semnalul (NAVIGAȚIE…MEMORIE) |
| **Semnal / fragment / amprentă / indiciu** | dicționarul scenic V3.3: transmisia întreagă / una din cele cinci părți / contribuția unui copil / descoperirea unei lumi |
| **Ramură adaptivă** | `diverse` / `same` / `observe` la 6:35 |
| **Master / Follower / Sursă de ceas** | rolul exe-ului; ecranul `center` al masterului al cărui `video.currentTime` este adevărul |
| **Drift** | diferența față de sursa de ceas; seek > 0,25 s, altfel `playbackRate` ±3 % |
| **Span-mode** | o singură fereastră peste toate ecranele, un `<video>`, N canvas-uri (R4) |
| **Readiness** | condițiile de pornire automată (ecrane, tablete, video, preflight) (R4) |
| **Preflight** | verificarea celor 51 de clipuri la pornire/la cerere (R4) |
| **Perf** | eșantion 1 Hz per ecran: cadre pierdute, fps, latență lip-sync, drift, heap, `roomLevel` (R4) |
| **screenToken / nava_session** | tokenul ecranelor în `hello`; cookie-ul de sesiune al consolei (R4) |
| **TalkingHead / viseme Oculus / ARKit / Mixamo / Avaturn** | biblioteca de avatar; cele 15 forme ale gurii; blendshape-urile faciale; rigul; serviciul care a generat GLB-ul |
| **lipsync-ro** | maparea proprie română → viseme |
| **`words/wtimes/wdurations`** / **`visemes/vtimes/vdurations`** | timpii cuvintelor din ElevenLabs / visemele precalculate (R4) |
| **`fallback: silent`** | un asset lipsă produce tăcere + subtitrare, nu voce Windows |
| **Run-log** | `runs/show-<stamp>.jsonl`, un eveniment pe linie |
| **HANDOFF-LIVE / HEARTBEAT** | jurnalul live al rundei / pulsul mecanic la 60 s (§0.2) |
| **Exodus** | proiectul-sursă (`docs/reference/EXODUS_SUMMARY.md`) al avatarului și al codului de referință |

---

## 18. Addendum 2026-09-05 — brief autonom GPT-6 Astra pentru Nava Glass R5

### 18.1 Ce s-a adăugat

- A fost creat `docs/ASTRA-IMPLEMENTARE-GLASS.md`, document autonom de execuție pentru GPT-6 Astra, astfel încât un agent fără istoricul conversației să poată prelua și termina redesignul R5.
- Brief-ul leagă cerințele din `docs/DESIGN-SPEC-GLASS.md` de arhitectura reală Electron/TypeScript/Hono/WebSocket, de suprafețele proiectului, de responsabilități pe fișiere, de ordinea implementării, de testele automate și de matricea de verificare vizuală.
- Au fost stabilite explicit granițele funcționale: se păstrează scenariul, vocile, timpii, state machine-ul, autentificarea, rolurile, editorul, telemetria, analitica, debugul, video-ul și Căpitanul GLB. Singura extensie minimă de protocol autorizată de brief este `tabletSfx`.
- Au fost rezolvate pentru agent două ambiguități: cele șase opțiuni de pe tabletă folosesc grilă 3×2, iar setarea SFX ajunge la tablete prin extensia minimă descrisă în document.

### 18.2 Integrarea brief-ului vizual suplimentar al utilizatorului

Textul suplimentar despre redesign premium Apple/Liquid Glass a fost integrat semantic în documentul Astra, nu copiat ca un al doilea prompt generic. Cerințele specifice Nava rămân autoritative.

Au fost adăugate:

- mandatul unei transformări vizuale complete și evidente, cu un before/after de două generații;
- bara de calitate „produs premium, Apple-adjacent”, fără clonare Apple și fără aspect generic de admin dashboard;
- reguli clare pentru atmosferă, materiale glass, niveluri de profunzime, fallbackuri CSS și folosirea restrânsă a blurului;
- contracte pentru navigație, header, carduri, butoane, formulare, tabele, badge-uri, dialoguri, meniuri, grafice existente, stări goale/eroare/loading și iconografie;
- reguli pentru tipografie, spațiere, mișcare, reduced-motion, accesibilitate și dimensiunile reale ale tabletelor, suprafețelor operatorului și TV-ului;
- disciplina de execuție: audit scurt, implementare directă, propagare pe toate suprafețele, verificare după fiecare etapă și pass final de consistență;
- inventarierea stackului, rutelor, stilurilor, tokenurilor, layouturilor, componentelor reutilizate și id-urilor DOM în baseline.

Cerințele generice incompatibile au fost adaptate: nu se introduce framework, Tailwind, shadcn, bibliotecă UI sau font extern; nu se inventează grafice; nu se forțează un breakpoint mobil generic peste instalație; rendererul TV nu primește `backdrop-filter`; valorile normative din specificația Nava au prioritate față de intervalele orientative din textul primit.

### 18.3 Verificare și stare git

- `git diff --no-index --check -- NUL docs/ASTRA-IMPLEMENTARE-GLASS.md` — fără erori de whitespace; codul de ieșire 1 este cel așteptat deoarece fișierul nou diferă de `NUL`.
- Au fost verificate prezența tuturor secțiunilor integrate și structura heading-urilor Markdown.
- Schimbarea este exclusiv de documentație; suita aplicației nu a fost rulată pentru această editare.
- La momentul acestei intrări, HEAD este `e20c506`; `docs/ASTRA-IMPLEMENTARE-GLASS.md` este necomis, iar acest addendum din `HANDOFF.md` este de asemenea necomis.
- Nu s-a făcut commit sau push.

---

## 19. Corecție 2026-09-05 11:26 — toate tabletele sunt 1080p landscape

Christoph a corectat explicit orientarea dispozitivelor. Afirmația „portret” din versiunea R5 a `docs/DESIGN-SPEC-GLASS.md` era greșită și contrazicea deja descrierea instalației din §1 al acestui document și `docs/SCENARIU-REGIZORAL-10-MIN.md`.

Configurația autoritativă este:

- cinci tablete pentru copii, câte una pentru fiecare post;
- o tabletă separată pentru operator;
- toate cele șase dispozitive sunt 1080p landscape, cu rezoluția țintă 1920×1080;
- pe tabletele copiilor, zona A este jumătatea din stânga și zona B jumătatea din dreapta; ambele se citesc normal, fără rotirea textului;
- consola și loginul operatorului sunt proiectate prioritar pentru 1920×1080 landscape;
- la orientarea accidentală portret, tableta copiilor afișează un mesaj prietenos de rotire, fără să înghesuie interacțiunea.

Au fost corectate toate cerințele afectate din `docs/DESIGN-SPEC-GLASS.md` și `docs/ASTRA-IMPLEMENTARE-GLASS.md`: rezumat, decizii, componente, layout A/B, alegerea postului, paired-choice, plan, matrice vizuală și definiția de „gata”. Istoricul anterior nu a fost rescris; această secțiune îl invalidează explicit numai în privința orientării și rezoluției tabletelor.

Schimbările sunt necomise. Nu s-a făcut commit sau push.

---

## 20. Nava Glass R5 — implementare și verificare software, 2026-09-05

Redesignul este implementat în toate suprafețele: cele cinci posturi pentru copii, consola operatorului, login, debug, analytics și renderer TV. Fundația comună include glass.css, glass-tv.css, opt teme, preview, iconografie, șase mascote RGBA în 1024/256, confetti și cinci SFX originale. Tabletele sunt 1920×1080 landscape: A în stânga, B în dreapta, fără rotirea textului și fără scroll în vederile show-ului. Operatorul are o tabletă separată, aceeași rezoluție.

Căpitanul rămâne exclusiv GLB-ul pe TV-ul configurat. Eticheta AVATAR_AI este „AVATARUL AI”; robotul Unitree H2 nu este integrat. Filmul, GLB-ul, replicile, vocile și timingul show-ului sunt neatinse. Singura extensie de contract este tabletSfx, implicit true, comutabilă de operator prin mecanismul existent de comandă/stare, testată pentru validare, serializare și autorizare.

Fundația a precedat agenții T/R/K cu domenii de fișiere separate. Livrările au fost inspectate și integrate. QA a corectat suprapunerea MEMORIE/subtitrare, subtitrările TV în dreptul GLB-ului, contrastul void/tech, axele analytics și stivuirea markerilor editorului. Editorul a fost exercitat prin modificare locală și anulare; show.json a rămas identic.

Verificări finale trecute: npm run check (typecheck, validare show/voci, build, 90 teste unitare, smoke core/auth/platform/media) și npm run smoke:renderer cu film real, cadre în avans, GLB vizibil, context WebGL activ și veil ascuns cu suprafață zero. Matricea vizuală acoperă tabletele la 1920×1080, operatorul/login/debug/analytics și la 1440×900, TV la 3840×2160 și 1600×900, toate temele, focus, reduced-motion, SFX/confetti o singură dată, certificat/reîncercare și fotografie cu ascundere la termen.

Raportul complet: docs/DESIGN-REVIEW.md. Capturi înainte/după și loguri: runs/debug/glass-r5/; galerie: runs/debug/glass-r5/index.html. README și OPERARE reflectă starea reală, inclusiv rutele analytics/certificate deja montate și operarea tabletSfx.

Rămâne repetiția pe hardware: cinci TV-uri și toate cele șase tablete, două persoane per post, atingere simultană, cameră, volum, autoplay, rețea/sincronizare, performanță susținută și citirea subtitrărilor la distanța reală. Validarea software locală nu certifică instalația fizică. Modificările sunt necomise; nu s-a făcut commit, push, merge, release sau deploy.

---

## 21. Samsung panoramic și finisare pentru prezentare — 2026-09-05

Cererea ulterioară a utilizatorului confirmă un singur PC cu 4 TV-uri Samsung QN90F de 98″ și unul 115″ central. Implementate direct: spațiu fizic comun videoWall în mm, cropuri coordonate și corecția scării 115″, cinema central cu ambient lateral, un decoder span, clock central corect, overlay-uri relative la panoul central, grilă și diagnostic native/readiness. `/wall/` permite previzualizarea filmului real, geometrie, indici și export. Importul este validat, atomic și păstrează baza/credentialele. Profilul local `config.wall.local.json` este separat și ignorat de Git; implicit cinema pentru păstrarea cadrului original.

Consola are modurile Înainte de show/În show/Instrumente, cinci posturi și momente descrise pentru operator. Tabletele adaugă orientare permanentă A/stânga B/dreapta, focus independent, pending vs. confirmat, reconectare și protecția rezultatelor asincrone la restart. Certificatele folosesc răspunsuri confirmate. Fotografiile autentificate de peste 64 KB sunt acum transportate până la limita existentă 1,5 MB, păstrând limita mică pentru celelalte mesaje.

Agenții T/R/K au avut domenii separate; livrările au fost inspectate. Review-ul a corectat protecția căilor Windows, validarea indicilor/modurilor, import BOM/atomic, diagnosticul reactualizat și blocarea auto-start în calibrare. Verificări trecute: npm run check (109 teste+smoke core/auth/platform/media), npm run smoke:renderer (span și individual 4K), npm run smoke:wall, 11 cazuri import, SFX/confetti/certificat/foto, toate 5 posturile 1920×1080 și opt teme. Pe rendererul real, toate cinci canvas-urile panoramice au pixeli identici cu decupajele așteptate (eroare maximă 0).

Ghidul complet și limitele sunt în docs/VIDEO-WALL.md. Filmul local este 3840×2052/60 fps, raport~1,87:1, iar peretele nominal~7,84:1. Cropul cover păstrează aproximativ 21% din cadrul original; cinema păstrează filmul integral central. O panoramă fără crop necesită altă sursă adaptată peretelui. Fișierele show/voice/avatar/media și timingul nu au fost modificate.

Galerie: runs/debug/final-wall/index.html; verificările copiilor: runs/debug/children-final/; comparația R5: runs/debug/glass-r5/index.html. Rămân calibrarea efectivă (goluri, unghiuri, scaling, overscan), 5 ieșiri 4K simultane pe PC, GPU/refresh/sincronizare/temperaturi, sunet, citire la distanță, touch A/B, rețea și cameră. Limită păstrată: fără ID unic de rulare, o tabletă deconectată peste întreaga tranziție între grupuri nu poate distinge sigur același cue repetat. Unitree H2 nu este integrat.

HANDOFF.md a primit numai această secțiune nouă. Nu s-a făcut commit, push, merge, release sau deploy.

---

## 22. Plan tehnic pentru automatizare și scenarii pe vârste — 2026-09-05

Cererea curentă a lui Christoph este exclusiv planificare și un document Markdown. Livrabil: [docs/PLAN-TEHNIC-AUTOMATIZARE-SCENARII.md](docs/PLAN-TEHNIC-AUTOMATIZARE-SCENARII.md). Acesta acoperă detecția/împărțirea automată a display-urilor, calibrarea automată, upgrade-urile 3/4/6/7/8/9/10 din lista discutată și scheletul tehnic separat pentru 5–10, 10–15, 15–18 ani și adulți. Modulele, contractele, API-urile și testele noi din plan sunt propuneri, nu implementări existente.

Au fost citite integral cele două surse din Downloads: `A Patra Lume Scenariu (1).docx` și `A_PATRA_LUME_SMOOTH_APPROACH_MANN_NO_TEXT.txt`. Indicațiile din documente sunt material de referință, nu autorizație pentru roboți, VR sau modificarea timingului. Ruta finală din TXT include Mann/Gargantua/Saturn; cele 61 de instrucțiuni explicite Wait însumează 625,5 s, fără a certifica durata exportului. Show-ul actual păstrează cele 465 s de film și totalul de 600 s. Planul păstrează separat pista actuală aliniată și un import provizoriu, cu verificare viitoare pe cadre reale.

Arhitectura propune un runId înainte de preshow, profil rezolvat și fixat pentru fiecare misiune, confirmări/deduplicare pentru alegeri și efecte, checkpoint durabil și reluare suspendată, cooperare deterministă, accesibilitate pe post și rezumat final comun pentru certificate/foto/analytics. Cele patru profiluri pornesc ca drafturi fără replici/scenografie nouă; nu sunt declarate scenarii gata pentru public. Adaptorul legacy păstrează show-ul și asseturile existente.

Detecția logică folosește Electron și date native Windows; calibrarea fizică automată a îmbinărilor și unghiurilor cere observație prin cameră sau un profil măsurat anterior. Datele estimate nu devin calibrare validată. Configurația confirmată 98–98–115–98–98, un singur GLB central și cele cinci tablete A stânga/B dreapta rămân autoritative. Hardware-ul necesită calificare separată.

Această tură modifică numai documentația: planul nou și adăugiri la finalul celor două handoff-uri. Au fost verificate structura, referințele locale, codificarea și whitespace-ul; testele aplicației nu au fost rerulate pentru această editare. Worktree-ul existent este păstrat. Nu s-a făcut commit, push, merge, release sau deploy.


---

## 23. Patru experiențe și dialoguri pe vârste — 2026-09-05

Cererea ulterioară autorizează explicit replicile și experiențele distincte. Livrabile: docs/scenarii/README.md, patru scenarii integrale, REVIZIE-SCENOGRAFICA.md, VALIDARE-EDITORIALA.md și exporturi JSON draft în assets/scenarios/. Perspectivele pentru copii, adolescenți și adulți au fost lucrate separat de agenți AI, apoi inspectate de un agent de scenografie și de orchestrator. Nu reprezintă consultații cu experți umani.

5–10: caută bucăți de lumină, montează aceleași piese și leagă felinarul. 10–15: investighează un semnal, construiește probe temporale și atașează dovezi verdictului. 15–18: stabilește mandatul unui AI, testează cazuri și revizuiește reguli cu comparație înainte/după. Adulți: configurează observația, gestionează rezerva sondei și selectează documentul transmis. Fiecare are trei etape, roluri pentru toate posturile A/B, feedback și finaluri care păstrează contribuțiile reale, inclusiv observare/timeout. Revizia a reparat continuitatea pieselor, independența A/B, accesul tuturor la probe, vocea prea administrativă și afirmațiile false în cazurile fără contribuții.

163 replici/variante: 42 + 41 + 40 + 40. Scriptul docs/scenarii/validate_export.py verifică ID-uri, vorbitori, faze, sloturi, ramuri exclusive/exhaustive pe 1815 stări editoriale și JSON-ul exportat. Plafon textual120 cuvinte/minut pentru5–10,130 pentru restul; fără suprapuneri. Nu sunt durate audio măsurate sau teste ale mecanicilor runtime. Verificare de integritate:256fișiere din worktree rămân identice cu începutul turei; istoricul handoff păstrat prin append binar. git diff --check și referințele locale verificate.

Pachetele sunt explicit editoriale, productionReady=false, fără activare în player și fără MP3-uri noi. Filmul, show.json, vocile actuale, GLB-ul și timpii existenți rămân neatinse. Sunt necesare implementarea mecanicilor, probe cu public reprezentativ, producție vocală și verificare pe film/hardware. Testele aplicației nu au fost rerulate pentru această livrare editorială; nu se declară gata de prezentat publicului. Fără commit/push/merge/release/deploy.

---

## 24. Scenarii executabile, ElevenLabs, SQLite și display-uri automate — 2026-09-05

Cererea ulterioară a autorizat producția vocală și implementarea planului. Sunt integrate cele patru experiențe complete: piese/felinar pentru5–10, probe și dovezi pentru10–15, mandate testate/revizuite pentru15–18, observație/rezervă/arhivă pentruadulți. Cele cinci posturi păstrează A stânga/B dreapta la1920×1080. Rezultatele nu inventează contribuții. Căpitanul GLB rămâne pe un singur TV; Unitree H2 nu este integrat.

163 MP3 ElevenLabs reale, patru manifeste, receipt-uri, hashuri, aliniere,14.466viseme, patru reels și transcrieri independente. Reluarea producției a reutilizat163clipuri fără cereri noi. WER0,27–0,33%. Resolverul ajustează șapte momente de replică în spațiile tăcute, pe baza duratelor măsurate; nu accelerează vocile și nu modifică filmul465s/preshow50s/lansare10s/epilog75s. Originalul show.json, vocile legacy, GLB și media au rămas fără diff. Cheia este doar în.env ignorat.

SQLite nativ în data/nava.sqlite: WAL/FULL, stare+eveniment în aceeași tranzacție înainte de ACK, deduplicare, checkpoint-uri și artefacte. Identitate run/server/timeline/cue, refuz evenimente vechi, certificate idempotente și foto legată de solicitarea activă. Recuperare suspendată după restart; continuare numai după verificare. Editor cu hash/backup și invalidare audio; confort pe cinci posturi, debug/analytics și repetiție tehnică cu anulare și statistici separate.

Inventarul nativ detectează1–16display-uri, exclude rolul operator, tratează DPI/clone/hotplug și păstrează profilul instalației. config.auto.local.json a fost creat separat pentru98–98–115–98–98; pornire npm run auto:start. Calibrarea ArUco citește fotografie/video local, verifică patru markere/display și generează homografii proiective. Atelierul verifică din nou topologia; aplicarea în pregătire persistă profilul și redeschide ferestrele. Shaderul WebGL folosește spațiul comun al peretelui. Geometria proiectată nu este prezentată ca milimetri sau reconstrucție3D.

Verificări trecute: npm run check (147teste + core/auth/platform/media), smoke:scenarios (4profiluri×10zone×3etape, SQLite cold recovery, duplicate/certificate), smoke:wall (inclusiv foto>64KB legată de solicitare), smoke:renderer cu film/GLB real.140stări tabletă în browser la1920×1080, text1,3×, contrast/reduced-motion/subtitrări; consolă/debug/analytics la1920 și1440. Toate4profilurile TV cu pregătirea audio reală, film în mișcare, GLB/subtitrări și finaluri4K/windowed. Optică:12testeOpenCV,8testeTS, import/persistență nativă și5cropuri GPU cu eroare0. Defectul seek din numărătoare în film a fost reparat și reverificat.

Repetiția reală la ritm normal (adulți):601,116s,597mostre,27.965cadre,1cadru pierdut (0,0036%), încheiere automată. Test pe un renderer local și tablete de test; nu este calificarea întregii instalații. Raport în runs/debug/scenarios-new/rehearsal-real.json. Galerie166capturi: runs/debug/scenarios-new/index.html; operator: runs/debug/scenario-upgrade-operator/index.html. Documentație: docs/IMPLEMENTARE-SCENARII-DISPLAY.md, docs/DISPLAY-AUTOMATION.md, docs/OPTICAL-CALIBRATION.md, docs/scenarii/VOICE-PRODUCTION.md; README/OPERARE actualizate.

Rămân probele fizice: cinci Samsung simultan, GPU/cabluri/desktop extins, imaginea reală de calibrare/overscan/unghiuri, audibilitate și lip-sync perceput, șase tablete reale, camera și trei misiuni consecutive. Nu există observare live permanentă a camerei sau genlock TV. Sunt necesare audiție regizorală și probe cu public pe categorii. Perspectivele de specialitate au fost oferite de agenți AI, nu de consultanți umani. Worktree-ul existent a fost păstrat; fără commit, push, merge, release sau deploy.
## 25. Tutorial vocal interactiv și final colectiv — 2026-09-05

Implementată cererea de tutorial complet, logică și design, cu final mai interactiv. „Nava vă recunoaște”: atingere, probă specifică profilului, legătură A/B și predare către Căpitan. Serverul păstrează directorul în idle până la predare; nu schimbă show.json, filmul465s sau timpii50+10+465+75. Start pentru cele patru profiluri noi intră în tutorial; legacy păstrează pornirea existentă și tutorial explicit. Consola configurează locurile ocupate și oferă pauză, continuare, repetare, pas următor validat, omiterea explicită și predarea cu readiness.

12MP3 de producție și3probe ElevenLabs, narator român Mihai distinct de Căpitan/Avatar, fără clonarea unei personalități. Manifest SHA256, decodare reală și transcriere216/216cuvinte. Pachetul vocal este servit prin HTTP numai pentru fișiere validate, inclusiv fallback resources la împachetare. Gating pe durata măsurată și ACK-ul rendererului de referință. Fără generare plătită la runtime. Nu este o audiție umană.

Interfețe tabletă Glass landscape A stânga/B dreapta, patru mecanici fără punctaj, opțiune de observare, confirmări reale și efecte deduplicate. Finalul apare în ultimele15s ale epilogului: alegeri diferite pe categorii, constelație construită numai din contribuții, locuri libere și observatori distincți. Naratorul final pornește doar după ended. Jurnalul trimis operatorului așteaptă alegerile locurilor active, pentru a include contribuția finală. Starea și evenimentele sunt persistate tranzacțional în SQLite; recuperarea rămâne suspendată până la readiness și reia explicația curentă.

Verificări: npm run check157teste+core/auth/platform/media; smoke:scenarios4profiluri×10zone×3etape; smoke:experience cu protocol/SQLite/recovery/deduplicare și hashHTTP; interfață conectată la server1920×1080 și consolă1440×900;20vederi tabletă cu text1,3×/contrast/reducedmotion/ținte64px, fărăoverflow; TV3840×2160/windowed, tutorial narat real și predare la preshow; npm run smoke:renderer cu filmul/GLB reale. ACK-urile sintetice din smoke:experience sunt delimitate de proba audio reală Electron. Capturi/rapoarte în runs/debug/tutorial-final și runs/debug/tutorial-tablet, galerie combinată în runs/debug/tutorial-final/index.html. Ghid docs/TUTORIAL-FINAL.md, casting docs/TUTORIAL-VOICE-PRODUCTION.md, README și OPERARE actualizate.

Rămân pe hardware: audiție umană și balans audio, cinciSamsung simultan, șase tablete tactile, lizibilitate de la4–5m, reconectareWi-Fi și trei sesiuni consecutive. Nu s-a făcut commit/push/merge/release/deploy. Modificările anterioare din worktree și istoricul HANDOFF sunt păstrate.

## 26. Coloana sonoră originală Eleven Music — 2026-09-05

Executată producția și integrarea din docs/PROMPT-CODEX-MUZICA.md. Zece piese music_v2 reale, M08 generat primul, referințe audio reale M08 pentruM01/M05/M09/M10. assets/music conține mastere WAVstereo48k, răspunsurile PCM nemodificate, MP3 de rulare, bonuri cu proveniență și manifest. Normalizare−26/−20LUFS în toleranță0,3dB; truepeak toate sub−3dBTP. Reutilizarea întregului pachet verificată fără cereri noi. Cheia rămâne în.env ignorat, fără secret în cod/bonuri.

Muzica este un strat file al AmbientCue în magistrala ambientală existentă; ambientul procedural și SFX-urile rămân. Duck−9dB în300ms/revenire800ms pentru voce și narator, clock existent pentruoffset/pauză/seek/rate, ferestre strict limitate. Followerii playAudio:false nu construiesc grafmuzical. Masterele nu sunt modificate; M02 a venit21s pentrucerere12s și a fost derivat fărăregenerare. M03 este limitat la60s înshow. M01/M09 au derivate59/79s și trei repetări pentruaudiție. M10 urmărește cue-ul thanks legacy68s și se oprește la75; nu inventează thanks în profilurile fărăacea interacțiune.

Contradicție înbrief consemnată: nature-marker-silence coincide cu o replică la233, urmată dealta la241. Numai muzica și ambientul ajung lagainexactzero232–246; vocile originale se păstrează. Show.json, cele51voci, filmul și state machine-ul nu au fost modificate. Nu sunt dependențe noi.

PASS npm run check162teste+smoke-uri; smoke:scenarios4profiluri; smoke:renderer cu film șiGLB reale; probeElectron cu toatezecebuffer-e și cincimixuri reale voce+muzică, atenuare, pauză/relansare, mute, seekînintervalultăcut și final. Artefacte runs/debug/music/index.html, audio-qa.json, renderer.json, intelligibility.json, cincimixuriWebM și treibucleWAV. docs/MUZICA.md conține fiecareprompt, proveniența, regenerarea și limitele verificării. Transcrierile nu sunt prezentate drept audiție umană: apar diferențe laSiwarha și scriereaKepler186d.

Toate piesele rămân needsReview:true pentruaudiția artistică a luiChristoph: motivrecognoscibil, bucleperceptuale și balansulsălii. Trebuie ascultate toate51replicile pehardware. Nu s-a făcut commit/push/merge/release/deploy; modificarea anterioară dinHANDOFF-LIVE a fost păstrată.

### 2026-09-05 — Plan educativ pentru interacțiuni 3D

Adăugat docs/PLAN-3D-EDUCATIV.md: matrice pentru patru categorii de vârstă × trei etape, legată de mecanicile existente, cu obiective, reprezentări propuse și verificarea înțelegerii separată de acțiunile acceptate. Revizie independentă făcută de agent AI din perspectiva fizicii spațiale și ingineriei, cu surse NASA/ESA; nu consultanță umană acreditată.

Clarificate limitele: +2 s este decalaj al modelului, fără distanțe astronomice calculate; acordul senzorilor nu dovedește adevărul; bugetul adulților și reducerea zgomotului sunt abstracte; Kepler-186 d nu are biosferă confirmată. Planul păstrează ficțiunea distinctă de observații și nu dezvăluie Pământul anticipat. Mini-PC-ul și topologia hardware rămân de validat; A/B landscape și fallback accesibil sunt cerințe.

Livrare de proiectare, fără modificări de cod, gameplay, show, voci sau timing. Implementarea 3D și pilotul educativ/hardware rămân lucrări viitoare. Verificare documentară și git diff --check; nu au fost rulate din nou testele runtime pentru această modificare exclusiv de documentație. Fără commit/push/deploy.

### 2026-09-05 — Interacțiuni educative 3D implementate

Implementate cele 12 activități din PLAN-3D-EDUCATIV.md pe toate cele cinci posturi: forme/potrivire/cooperare 5–10, explicații/probe K-R/verdict 10–15, autoritate/test/revizuire 15–18, buget/sondă/arhivă adulți. ZoneView.visual este extensie opțională read-only, calculată prin contextul motorului existent; nicio schimbare a acțiunilor sau regulilor. Intervalele sunt segmente proporționale, offsetul +2 s rămâne global, fără distanțe astronomice inventate. Tutorialul și finalul disting locurile neincluse, observarea, răspunsul lipsă și confirmarea.

Un singur renderer Three.js per tabletă, două viewporturi A/B, forme extrudate, rotire locală fără comenzi, confirmare după server, SVG echivalent, context-loss/recovery, cache/dispose, randare la schimbare și DPR adaptiv. Texte/controale HTML păstrate, toate țintele verificate ≥64 px. Corectate winding-ul geometriei, oprirea randării la broadcast-uri neschimbate și layouturile dense/finale. Capturile finale folosesc compositor Electron nativ, nu ferestre offscreen care omiteau stratul GPU; pixeli colorați verificați efectiv.

PASS: npm run check 173/173 teste și smoke-uri; smoke:scenarios toate patru profilurile, 10 zone×3 etape, retry/stale-run/SQLite/certificate; education-review 205 stări reale cu 32 audituri tematice, text1,3×/contrast, input/focus A/B, constructor dens, fără overflow sau etichete peste caption, fallback și reduced-motion; tutorial-review 26 capturi pe toate cele patru profiluri. ACK-urile audio din QA tabletelor sunt sintetice, marcate explicit. Separat experience-renderer-review a verificat naratorul real, filmul/GLB-ul și finalurile 4K/windowed și a rulat npm run smoke:renderer cu succes; final-only a verificat o singură redare naturală după ended. Contrast text nou minimum conservator5,85:1.

Dovezi: runs/debug/education-3d/index.html (62 capturi curente +26 tutorial +before), education-review.json, tutorial/review.json, contrast.json, check.log, scenarios.log; TV în runs/debug/tutorial-final și runs/renderer-smoke-avatar.png. Ghid docs/EDUCATIE-3D.md; README, OPERARE și planul actualizate. Cele două modificări handoff și planul existente înaintea implementării au fost păstrate.

Hardware/public rămase: alegerea și proba mini-PC-ului/topologiei, maparea multitouch, două persoane simultan la post, încărcarea cumulată și pilotul educativ pe patru grupe. Nu se pretinde validare pedagogică umană. Extensiile distincte din plan (predicție salvată, justificare, ecosistem/zgomot fizic nou) nu sunt strecurate în upgrade-ul vizual. Filmul, show.json, vocile, muzica și timingul nu au fost modificate. Fără commit/push/merge/release/deploy.

## 2026-09-05 — Română firească și jocuri cu rezultate concrete

Cererea curentă: revizie completă a limbii române pe tablete și refacerea jocurilor astfel încât participanții să înțeleagă scopul, acțiunea și consecința. Implementat direct, păstrând toate modificările existente și fără commit/push/deploy.

- Rescrise instrucțiunile, tutorialul, finalul, indiciile, mesajele de rezultat și explicațiile. Instrumentele fictive sunt etichetate vizibil, iar busola folosește V pentru vest.
- 5–10: orientare cu semn auriu, montare validată, trei trasee și reîncercare explicată. 10–15: două ritmuri, comparație și reconsiderarea concluziei. 15–18: două cazuri de senzori per participant și tabel înainte/acum. Adulți: două credite, documente cu citiri concrete, limite și transmiterea unui document.
- Contracte aditive: game.rotation/game.tests, goal/feedback/guidance/documents/resourceLabel/comparison și ACK reason opțional. SQLite existent, fără migrare. Filmul, GLB-ul, vocile, muzica și ferestrele show-ului sunt păstrate.
- Rezolvat overflow-ul la text mărit, suprapunerea ajutorului peste comenzi, mesajele de greșeală rămase după corectare și tăierea jurnalelor PNG lungi. Datele și tabelele înlocuiesc diagrama unde rezultatul trebuie citit.
- Corectat și testul smoke-auth care căuta cifrele PIN-ului ca subșir în întregul JSON, inclusiv hash-uri/UUID-uri aleatoare. Acum verifică formatul hash-ului și absența câmpului/valorii PIN în clar; autentificarea nu a fost schimbată.

Verificare: npm run check — 179/179 teste și verificările core/auth/platform/media trecute. QA vizuală reală — 205 stări, 32 verificări de teme, 108 capturi curente plus 26 capturi/stări de tutorial; cinci posturi A/B la 1920×1080, text 1,3, contrast, ținte ≥64px, fără scroll/ocluzii, fallback 2D și WebGL restaurat. Server smoke verifică regulile noi, deduplicarea, recuperarea SQLite și certificatele. Rapoartele tutorialului folosesc ACK-uri audio sintetice declarate; audiția este verificată separat în rendererul real.

Dovezi: runs/debug/romanian-games/index.html; education-review.json; tutorial/review.json; server/server-smoke.json; check-final.log; renderer-final.log. Capturile FAIL-* sunt iterații corectate și sunt excluse din galerie. Comparația anterioară rămâne în runs/debug/education-3d/. Ghid actual: docs/REVIZIE-ROMANA-JOCURI.md; README și OPERARE actualizate.

Rămân pentru instalație: mini-PC-ul final, maparea Windows a ecranelor tactile, atingere simultană A/B, performanța împreună cu TV-urile, volume/lizibilitate în sală și pilot cu participanți reali din toate grupele. Revizia agenților AI și testele nu înlocuiesc validarea pedagogică umană.
Verificarea finală a rendererului a trecut: tutorial cu narator real, finalurile celor patru categorii la 4K/windowed și npm run smoke:renderer cu filmul în redare (1,06 → 2,36 s, 69 → 147 cadre) și GLB vizibil fără context pierdut. Log: runs/debug/romanian-games/renderer-final.log.

## 27. Logo EXODUS7 în antetul tabletelor — 2026-09-05

La cererea separată a utilizatorului, creat logo EXODUS7 cu imagegen integrat: navă și orbită de sticlă, wordmark bleumarin, 7 portocaliu. PNG 2172×724 cu alpha real salvat în src/web/tablet/brand/exodus7-v1.png și integrat în antet prin viewBox, la 266×72 px / 222×60 px. Eliminată doar inițializarea vechiului brand-glyph; păstrate celelalte modificări din worktree.

npm run typecheck și npm run build au trecut. Capturi Electron cu aplicația reală și server izolat la 1920×1080 și 1280×800: runs/debug/exodus-logo/. Documentație și prompt complet: docs/EXODUS7-LOGO.md. Nu s-au făcut commit/push/deploy. Această cerere nu reia lucrul oprit la jocuri: depășirea de 8–11 px la adulți cu subtitrare lungă rămâne de corectat/verificat.
## 28. Amplasarea ilustrațiilor EXODUS7 — 2026-09-05

La cererea utilizatorului, identificate prin lectura codului locurile utile pentru mai multe ilustrații în stilul logo-ului: primire, tutorial A/B, felinar, antenă, opțiuni finale pentru copii, jurnal, așteptare și încheiere TV. Planul docs/PLAN-ILUSTRATII-EXODUS7.md include punctele de integrare, pachetul propus de 10 imagini și limitele de accesibilitate, geometrie educativă și afișare a rezultatelor reale.

Nu au fost generate sau integrate imagini noi în această etapă. Nu au fost rulate teste, builduri sau capturi noi, conform interdicției explicite a utilizatorului. Logo-ul TV implementat în intervenția anterioară rămâne în worktree; testarea lui a fost oprită la cerere. Fără commit/push/merge/release/deploy.

## 29. Pachetul cute EXODUS7 — 2026-09-05

După aprobarea planului, generate 10 ilustrații folosind exclusiv imagegen integrat: nava la îmbarcare, nava în hublou, doi exploratori cu tabletă comună, carcasa felinarului, carcasa receptorului, felinarul-suvenir, mâinile care ocrotesc o stea, busola, emblema expediției și întoarcerea acasă. Asseturile selectate sunt păstrate în src/web/shared/illustrations/exodus7/ cu prompturile exacte și proveniența; variantele de lucru originale rămân în folderul generatorului.

Integrate în sursele tabletelor și în finalul TV pentru profilurile copiilor. Textele/controalele rămân HTML/SVG, geometria pieselor și semnalele rămân în cod, fallback-ul vector și setările de confort sunt păstrate. Jurnalul și certificatul încarcă asseturile înainte de exportul canvas; logo-ul rămâne comun. Nu s-au schimbat filmul, GLB-ul, replicile, vocile sau timingul. Mecanica finalului rămâne cea existentă, cu opțiuni ilustrate.

Ghid: docs/ILUSTRATII-EXODUS7.md; planul și README/OPERARE actualizate. Galerie de fișiere, fără capturi runtime: src/web/shared/illustrations/exodus7/index.html. Nu au fost rulate teste, builduri, aplicația sau capturi noi, conform interdicției explicite a utilizatorului. Aceasta este implementare în surse, nu validare vizuală/runtime/hardware și nu finalizarea lucrului oprit anterior la jocuri. Fără commit/push/merge/release/deploy.
