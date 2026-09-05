# Manual de operare — NavaPlayer („A Patra Lume · Protocolul Acasă")

> Actualizat 2026-09-05 (agentul E, E-02) pentru runda 4 (R4). Fiecare afirmație are sursa în paranteză. Pentru **starea live** a pachetelor R4 (ce este gata, ce este schelet) citiți `HANDOFF-LIVE.md` §2 — unde scrie „în lucru" mai jos, acel pachet nu era bifat `[x]` la data actualizării.

---

## 1. Pregătirea PC-ului master

1. Puneți executabilul, `config.json` și folderul `media/` în același director. Filmul trebuie să fie `media/cinema_4k_h264.mp4` (H.264 High 4:2:0), dacă nu ați schimbat calea în `config.video.path`.
2. Conectați televizoarele, selectați modul desktop extins și confirmați ordinea display-urilor în Windows (sortate stânga → dreapta; `displayIndex 0` = cel mai din stânga, `src/main/windows.ts`). Setați **scale 100 %** pe toate TV-urile — obligatoriu pentru `displayMode: "span"` (`config.5screens.example.json`).
3. Porniți PC-ul și routerul dedicat. Permiteți NavaPlayer în Windows Firewall pe rețeaua **privată** (portul `4321`).
4. Verificați sunetul pe ieșirea dorită (`config.audio.outputDeviceId`; rutarea prin `AudioContext.setSinkId`, `src/renderer/voice/context.ts`) și opriți notificările Windows. Sleep-ul display-ului este blocat de aplicație cât rulează (`powerSaveBlocker("prevent-display-sleep")`, `src/main/main.ts`).
5. Lansați NavaPlayer. La prima pornire:
   - dacă lipsește `config.json`, se creează din `config.example.json` (`src/main/config.ts`);
   - pe **master**, dacă `security.screenToken` este gol, se generează un token de 32 caractere hex și se **scrie înapoi în `config.json`** (singura rescriere pe care o face aplicația); copiați-l în `config.json` al fiecărui follower (§7);
   - dacă lipsește `data/users.json`, se creează utilizatorul `admin` cu PIN-ul din `security.operatorPin` (**implicit `4078`**) și se scrie un avertisment în log (`src/server/users.ts`).
6. Ecranul tehnic poate fi identificat cu `I` (fiecare ecran își afișează id-ul 3 s).

Din checkout-ul de dezvoltare, varianta simplă este dublu-click pe `RUN.bat`: verifică mediul, construiește, pornește playerul **în fereastră**, serverul și deschide consola. Opțiuni: `RUN.bat --kiosk` (respectă modul kiosk din config), `RUN.bat --no-control`, `RUN.bat --check` (doar `npm run check`), `RUN.bat --help` (`RUN.bat`).

Argumente ale executabilului (`src/main/config.ts`): `--config <cale>`, `--dev`, `--role master|follower`, `--screen <id>`, `--windowed`, `--kiosk` (câștigă asupra `--windowed` și asupra `config.dev.windowed`).

## 2. Adresele și autentificarea

| Adresă (pe master) | Ce este | Cine intră |
|---|---|---|
| `http://<ip-lan>:4321/control/` | consola operatorului | necesită login cu PIN (redirecționează la `/login/`) |
| `http://<ip-lan>:4321/login/` | pagina de PIN (tastatură numerică) | oricine, cu limită de încercări |
| `http://<ip-lan>:4321/debug/` | pagina de depanare | necesită login (rol `viewer` sau mai mult) |
| `http://<ip-lan>:4321/analytics/` | analitică din jurnalele rulărilor | pagina (`src/web/analytics`) și routerul (`src/server/features/analytics.ts`) există; **montarea `/api/analytics` în `src/server/index.ts` de către orchestrator lipsea la 10:30** — până atunci pagina nu primește date (D-05) |
| `http://<ip-lan>:4321/tablet/?post=1..5` | aplicația copiilor | **fără autentificare** |
| `http://<ip-lan>:4321/api/health` | stare scurtă (rol, ecrane, tablete, `videoReady`, `state`) | public |

Adresa LAN și QR-ul tabletelor sunt afișate în consolă (`/api/urls`, `/api/qr`).

### 2.1 Login cu PIN

- Deschideți `/login/` (sau orice pagină protejată — vă trimite acolo cu `?next=`), tastați PIN-ul, **OK**. Serverul pune cookie-ul `nava_session` (HttpOnly, `SameSite=Lax`) și întoarce tokenul de sesiune, pe care consola îl trimite în mesajul WebSocket `hello` (`src/server/auth.ts`, `src/web/login/index.ts`, `src/web/control/index.ts`).
- Sesiunea durează `security.sessionTtlMin` minute (**implicit 720 = 12 h**) și supraviețuiește repornirii serverului (`data/sessions.json`). **IEȘI** în `/debug/` sau `POST /api/auth/logout` o închide.
- PIN-ul este singurul identificator (nu există nume de utilizator la login), deci **PIN-urile sunt unice între utilizatori** (4–8 cifre).
- Limită: **8 încercări per IP la 5 minute**; a noua primește `429 Prea multe încercări. Așteaptă 5 minute.`
- **Schimbați PIN-ul `4078` înainte de primul show public** (§2.3, `docs/SECURITATE.md`).

### 2.2 Utilizatori și roluri (`data/users.json`, PIN-uri hash-uite scrypt)

| Rol | Poate | Nu poate |
|---|---|---|
| `viewer` | să vadă consola, `/debug/`, `/api/state`, `/api/show`, `/api/cues`, `/api/tablets`, `/api/run`, perf/loguri | să trimită comenzi (WS `cmd` → `error 4403`; `POST /api/cmd` → 403), să editeze show-ul |
| `operator` | tot ce poate viewer + comenzi (`/api/cmd`, WS), editorul de cue-uri (`PUT/POST/PATCH /api/show*`), `POST /api/tablets/clear`, `POST /api/player/focus`, preflight, rotația jurnalelor, deconectarea unui client, TTS live (`/api/tts`), `/api/dialog`, certificate | să administreze utilizatori |
| `admin` | tot + `GET/POST/PATCH/DELETE /api/users*`, `POST /api/users/:id/pin`, `GET /api/auth/sessions`, `POST /api/debug/gc` | să își retragă propriul rol de admin, să se dezactiveze/șteargă singur; trebuie să rămână cel puțin un admin activ |

Sursa: `src/server/index.ts` (gărzile), `src/server/auth.ts`, `src/server/users.ts`. Maxim 50 utilizatori; numele ≤ 32 caractere, unic.

### 2.3 Cum schimbați PIN-ul / adăugați operatori

1. Intrați ca admin în `/debug/` → panoul **UTILIZATORI (doar admin)**: adăugați `nume`, `rol`, `PIN 4–8 cifre`; schimbați PIN-ul, dezactivați sau ștergeți (`src/web/debug/index.html`).
2. Sau prin API, autentificat ca admin (cookie sau `Authorization: Bearer <token>`):
   - `POST /api/users` `{ "name": "Ana", "role": "operator", "pin": "271828" }`
   - `POST /api/users/<id>/pin` `{ "pin": "9081" }` — **invalidează toate sesiunile acelui utilizator**; el trebuie să se logheze din nou.
   - `PATCH /api/users/<id>` `{ "role": "viewer" | "disabled": true }`, `DELETE /api/users/<id>`.
3. Dacă ați uitat toate PIN-urile: opriți aplicația, ștergeți `data/users.json` (și `data/sessions.json`); la repornire se recreează `admin` cu `security.operatorPin`. Puteți pune alt `operatorPin` în `config.json` **înainte** de această repornire — el contează doar la crearea fișierului.

## 3. Pagina `/debug/` — ce arată

Panouri (`src/web/debug/index.html`, date din `GET /api/debug/summary`, auto-refresh la 2 s):

| Panou | Conținut |
|---|---|
| **STARE SHOW** | `ShowState` complet + blocul de **readiness** (ecrane conectate/lipsă, tablete, video, active vocale, motive) |
| **SĂNĂTATE SERVER** | versiune, uptime, rol, port, URL-uri, sursa de ceas, `showError`, starea adaptorului de lumini |
| **PREFLIGHT ACTIVE** + buton **RULEAZĂ** | rezultatul verificării celor 51 de clipuri (§4); butonul cere rol `operator` |
| **PERFORMANȚĂ ECRANE** | per ecran: cadre pierdute %, fps video, fps avatar, latență lip-sync (roșu > 120 ms), drift maxim, `roomLevel`, heap, ieșire audio — din mesajele `perf` trimise de fiecare ecran la 1 Hz (`src/renderer/perf.ts`); `roomLevel` rămâne `null` dacă pagina ecranului nu a fost deschisă cu `?mic=1` (`src/renderer/room-mic.ts`) |
| **CLIENȚI CONECTAȚI** | fiecare WS: tip, id, nume, IP, conectat de, sursă de ceas; deconectare (`operator`) |
| **CUE-URI** | statusurile cue-urilor (armed/fired/skipped) și ultimul cue vocal |
| **TTS LIVE (CACHE)** | statistici `/api/tts` (cache pe disc `cache/`) |
| **MEDIU · VERSIUNI · CĂI** | Node/Electron/Chrome, host, RAM, `appRoot`, `runsDir`, `cacheDir`, `usersFile`, prezența cheilor `.env` (doar **da/nu**, niciodată valoarea), `ffmpeg` disponibil |
| **CONFIG (SECRETE MASCATE)** | `config.json` încărcat, cu `operatorPin` → `****`, `screenToken` → primele 4 caractere + lungimea, `lights.hueUser` → `****` |
| **UTILIZATORI (doar admin)** | lista + formularul din §2.3 |

Alte rute utile (`src/server/debug.ts`): `GET /api/debug/perf?screen=<id>&n=120`, `GET /api/debug/logs?n=100` (coada run-log-ului), `GET /api/debug/runs` (fișierele din `runs/`), `POST /api/debug/rotate-runs` (păstrează ultimele 20), `GET /api/frame?t=<sec>&w=<px>` (un cadru JPEG din film, prin `ffmpeg`, pentru editorul de cue-uri).

## 4. Preflight și readiness

**Preflight** (`src/server/preflight.ts`) rulează **la pornirea serverului**, **după fiecare `reloadShow`** și **la cerere** (butonul din `/debug/`, comanda `{ "action": "preflight" }` pe `/api/cmd` sau WS, `POST /api/debug/preflight`). Pentru fiecare cue `voice` verifică, în ordine: clip în `assets/voice/<lang>/manifest.json` → fișierul există → ≥ 1 024 B → `durationMs > 0` → `words` nevid; numără clipurile cu viseme precalculate. Verifică și existența filmului și a GLB-ului. Rezultatul (`ok`, `reasons`, `issues`) apare în `/debug/`, în run-log (`preflight`) și alimentează `readiness.assetsOk`. Dacă este activă o variantă (`config.variant`), clipul `<id>.<variant>` lipsă este raportat ca `variant-missing` (avertisment; se folosește baza).

**Readiness** (`ShowDirector.readiness()`, `src/server/state.ts`) este verde când:

1. toate ecranele cerute sunt conectate — `autoRun.requireScreens` ∪ (pe master) **toate** id-urile din `config.screens[]`;
2. `tabletsConnected ≥ autoRun.requireTablets` (implicit 0);
3. ecranul de referință a raportat `videoReady`;
4. preflight-ul nu a eșuat (`assetsOk !== false`; `null` = nerulat încă, nu blochează).

Pornirea **automată** (trecerea preshow → lansare după 50 s când `preshowAutoStart: true`, și modul `autoRun`) se face **numai** când readiness este verde; altfel motivele apar în run-log. Pornirea **manuală** (`start`, `S`, **START EXPERIENCE**) este **întotdeauna permisă**, cu motivele scrise în run-log (`start.readiness`). Blocul de readiness este în `/debug/` și în consolă (panoul **PREGĂTIRE**, `src/web/control/index.html`, completat din `state.readiness`).

## 5. Fluxul unei sesiuni

1. În `IDLE`, verificați în consolă/`/debug/`: readiness verde, ecrane conectate, `videoReady`, cinci tablete, volumul. Pe ecranul master apare panoul de lansare; click oriunde, **PORNEȘTE EXPERIENȚA** sau `Space`/`Enter` pornește fluxul complet.
2. Pre-show-ul durează 50 s și oferă pe cele cinci tablete posturile NAVIGAȚIE, PROPULSIE, COMUNICAȚII, BIOSEMNALE și MEMORIE, câte unul pentru fiecare pereche. Replicile sunt la 4, 15, 24, 35 și 43 s.
3. Lansarea pornește automat după pre-show (dacă readiness este verde). Urmează countdown-ul T−10…0 pe cadrul înghețat, apoi filmul. **SARI LA LANSARE** / `S` / **START EXPERIENCE** omit pre-show-ul; `P` pornește explicit pre-show-ul.
4. **PAUSE/PLAY** numai dacă este necesar. Pentru repetiții: slider, salt la scenă, `fireCue` manual, sau modul de repetiție (§8).
5. La întrebarea Tehnologicei (6:17–6:34), lăsați copiii să aleagă; la 6:35 serverul alege singur una dintre cele trei replici (`diverse`/`same`/`observe`).
6. Playerul oprește determinist filmul la 465 s și continuă automat în epilog (75 s) pe aceleași ecrane și posturi.
7. După ultima replică, **RESTART** pentru următorul grup (șterge și răspunsurile tabletelor și posturile revendicate; `src/server/index.ts`, `handleCommand`).

## 6. Taste pe ecranul-sursă de ceas (`src/renderer/index.ts`; main: `src/main/shortcuts.ts`)

| Tastă | Acțiune |
|---|---|
| `P` | pre-show |
| `S` | start (T−10) |
| `Space` | din idle: pre-show; în film: pauză/reluare |
| `Enter` | din idle: pre-show; altfel play |
| `←` / `→` | seek −5/+5 secunde |
| `E` | epilog |
| `R` | restart |
| `I` | identifică ecranele |
| `T` | test avatar |
| `O` | diagnostic local (orice ecran) |
| `F` / `F11` | fullscreen (în span-mode `F11` este dezactivat) |
| `Esc` ×2 | ieșire, doar în mod windowed |
| `Ctrl+Q` | ieșire (main) |

## 7. Ecrane: `windows` vs `span`, follower

### 7.1 `displayMode` (`config.json`, `src/main/windows.ts`)

| | `"windows"` (implicit) | `"span"` |
|---|---|---|
| Ferestre | o fereastră kiosk per intrare din `screens[]` | **o singură fereastră** frameless peste uniunea display-urilor din `screens[]` (sortate x, y); `alwaysOnTop` + `skipTaskbar` în kiosk |
| Decodare video | una per fereastră (5 decodări 4K pe 5 TV-uri) | un singur `<video>` decodat (invizibil, `opacity 0`) și copiat cu `requestVideoFrameCallback` pe câte un canvas per viewport (`getBoot().viewports`), cu shift-ul de `yawOffsetDeg` al fiecărui ecran; overlay-urile (subtitrări, avatar, entități) sunt mutate pe viewport-ul ecranului cu `showAvatar`/`showSubtitles`. **Schelet** (`src/renderer/span.ts`, B-07): testat cu un singur viewport; dimensiunile overlay-urilor folosesc `vw/vh`, deci pe 3–5 ecrane ies de 3–5× prea mari; OSD/identify rămân la nivel de fereastră; `playAudio` nu se separă per viewport. **Pentru show folosiți `windows` până la un test pe 5 TV-uri.** |
| Cerințe | — | scale DPI identic (100 %) pe toate TV-urile; aplicația avertizează la DPI diferite / display-uri partajate |
| `--screen <id>` | deschide doar acel ecran | fereastra se restrânge la acel display |
| `--windowed` | ferestre normale | uniunea este scalată pe display-ul primar |

`boot.screen` în span este ecranul cu `playAudio: true` (de regulă `center`). Ecranele laterale pot primi `yawOffsetDeg` (−30/−15/0/+15/+30) pentru un shift orizontal al filmului (`src/renderer/perspective.ts`; aplicarea în player, B-05, vezi `HANDOFF-LIVE.md`).

### 7.2 Follower pe alt PC (`config.follower.example.json`)

1. Pe follower: `role: "follower"`, `masterUrl: "ws://IP_MASTER:4321/ws"`, propriile `screens[]` (de ex. un singur TV lateral), `playAudio: false` dacă sunetul vine doar de la master.
2. **Copiați `security.screenToken` din `config.json` al masterului** (generat acolo la prima pornire) în `security.screenToken` al follower-ului. Un placeholder (`"<copiaza...>"`) este respins; fără token valid, follower-ul loghează o eroare și masterul refuză ecranele lui cu `4401` (`src/main/config.ts`, `src/server/auth.ts`).
3. Media (`media/`), GLB-ul și vocile trebuie să existe și pe follower (show-ul vine prin WS, în `welcome`).
4. Tastatura follower-ului ajunge la master ca client `control` (`src/main/master-link.ts`).

Dacă masterul are `screenToken` gol (config vechi, ne-rescris), acceptă ecranele fără token și loghează un avertisment o singură dată.

## 8. Autostart, watchdog, mod de repetiție

- **Autostart recomandat — Task Scheduler:** `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-autostart.ps1 [-ExePath "D:\Nava\NavaPlayer-0.1.0-x64-portable.exe"] [-DelaySeconds 15] [-Arguments "--kiosk"]`. Creează taskul `NavaPlayer` la logon-ul utilizatorului curent, interactiv, fără limită de timp, cu 3 reporniri la 1 minut și fără a doua instanță. Fără `-ExePath` caută `NavaPlayer*-portable.exe` în `dist-app/`. Dezinstalare: `scripts/uninstall-autostart.ps1`. „Access is denied" → rulați PowerShell ca administrator (`scripts/install-autostart.ps1`, antet).
- **Alternativa slabă — `config.autostart: true`:** executabilul **împachetat** își înregistrează singur cheia `Run` din HKCU (`app.setLoginItemSettings`, cu `--kiosk`); `false` o scoate la următoarea pornire (`src/main/main.ts`, `applyAutostart`).
- **Watchdog:** un renderer prăbușit este recreat; 3 prăbușiri în 60 s → log fatal + `app.relaunch()` (`src/main/main.ts`). Video „BLOCAT" pe ecran = fără progres al cadrelor 2,5 s.
- **Repetiție accelerată:** `{ "action": "rehearse", "rate": 4 }` (până la 8×) și `{ "action": "setRate", "rate": 1 }` pentru revenire — butoanele **Repetiție accelerată** / **Viteză** din consolă. Serverul schimbă rata nominală a ceasului (`src/server/state.ts`; rapoartele admit `rate ≤ 8`), ecranele aplică `playbackRate` pe video și pe voci (`src/renderer/player.ts`, `voice/playback.ts`); cue-urile se declanșează normal, subtitrările țin proporțional mai puțin. Reveniți la `setRate 1` înainte de public.

## 9. Ambianță, lumini, „Spune", variante, foto, analitică

| Funcție | Cum se controlează | Stare (vezi `HANDOFF-LIVE.md` §2) |
|---|---|---|
| **Ambianță procedurală** (pat sonor per temă, Web Audio, fără fișiere) | `config.ambient { enabled, volume (relativ la sfxVolume), duck (0.25 ≈ −12 dB sub voce) }`; cue `ambient { action: start|stop|crossfade, bed?, gain?, fadeSec? }`; comanda `{ "action": "ambient", "enabled": false }`; urmărește automat cue-urile `theme` dacă show-ul nu are un `ambient` explicit pentru acea temă; ecranele cu `playAudio: false` au motor silențios | livrat (`src/renderer/voice/ambient.ts`, `timeline.ts`, butonul **Ambianță** în consolă) |
| **Lumini de sală** | `config.lights.driver: none | artnet | hue` (+ `host`, `universe`, `hueUser`, `groupId`); cue `lights { theme, fadeSec? }`; cue-urile `theme` și comanda `{ "action": "lights", "theme": "light" }`; starea la `GET /api/lights` | **schelet** funcțional (`src/server/features/lights.ts`); fără hardware, `none` = doar log |
| **„Spune"** (un personaj rostește text acum) | `{ "action": "say", "speaker": "CAPITANUL", "text": "…" }` → serverul difuzează `dynamicVoice` → ecranele cer audio de la `POST /api/tts` cu `Authorization: Bearer <screenToken>`; cere cheie `ELEVENLABS_API_KEY` sau `GEMINI_API_KEY` în `.env` pe master; fără cheie, ecranul loghează eroarea și afișează doar subtitrarea | livrat (server + `Player.speakDynamic`, butonul **Spune** în consolă) |
| **Mesajele copiilor citite de Căpitan** | cue `dynamic-voice { source: tablet-messages | tablet-choices-summary | live-dialog, template, maxItems, fallbackText }` | server livrat (`features/dynamic-voice.ts`); show-ul V3.3 nu are încă un astfel de cue |
| **Variante pe vârstă** | `show.json > variants` (`7-9`, `10-12`, `13+`); `config.variant: "7-9"` sau `{ "action": "setVariant", "variant": "7-9" | null }`; textul din `VoiceCue.variants["7-9"].ro`; audio `assets/voice/<lang>/<id>.7-9.mp3` = `manifest.clips["<id>.7-9"]`; lipsa cade pe baza | contract + 3 replici cu text `7-9` (`v3-cap-0004`, `v3-ai-0206`, `v3-tech-0610`); **fără audio generat** și **fără `--variant` în `scripts/tts-generate.mjs`** la data actualizării (C-06 în lucru) |
| **Fotografie de echipaj** | cue `photo { countdownSec?, showSec? }` sau `{ "action": "photo" }` → server trimite `photo` (countdown → capture → show → hide) → **doar ecranul-sursă de ceas** deschide webcam-ul, scalează la ≤ 1280 px, JPEG 0,82 și răspunde `photoCaptured` (≤ ~1,5 MB) → salvat în `runs/photos/`, afișat 12 s pe ecrane și tablete | **schelet** livrat (`src/renderer/photo.ts`); fără cameră sau fără permisiune: avertisment în log, numărătoarea se termină, nu se trimite nimic |
| **Dialog live** | `POST /api/dialog { text }` → răspuns în personaj (Gemini `gemini-2.5-flash` dacă `GEMINI_API_KEY`, altfel replici pre-scrise pe cuvinte-cheie); 20 cereri/min | **schelet** (`src/server/features/dialog.ts`, `src/renderer/voice/live-dialog.ts`); Web Speech API de regulă indisponibil în Electron |
| **Analitică** | `/analytics/` din `runs/show-*.jsonl` | pagina și routerul există (`src/web/analytics`, `src/server/features/analytics.ts`); `/api/analytics*` este protejat (`viewer`) dar **nemontat încă** în `index.ts` (integrare orchestrator, D-05) |
| **Editor de cue-uri** | `PUT/POST /api/show` (validare → backup în `assets/show/backups/`, păstrează 30 → scriere atomică → reload → `welcome` tuturor), `PATCH /api/show/cue/:id { at?, text?, manual?, note? }`, `GET /api/show/backups`, `POST /api/show/restore/:file`; în consolă: drag pe timeline + salvare | livrat (`features/show-editor.ts`, consolă D-04) |
| **Certificat de misiune** | `POST /api/certificates { post, dataUrl }` → `runs/certificates/<run>/post-N.png` | server livrat; **necesită rol `operator`** în integrarea actuală, deci tabletele (anonime) nu pot posta încă (vezi raportul E) |

## 10. Depanare

- **VIDEO LIPSĂ:** verificați calea, numele și codec-ul H.264 High 4:2:0. HEVC Rext 4:4:4 nu este acceptat.
- **Consola cere PIN și nu-l știți:** §2.3 pasul 3.
- **`429` la login:** ați depășit 8 încercări în 5 minute de pe acel IP; așteptați.
- **Consola se conectează dar nu poate trimite comenzi:** sunteți `viewer` (WS `error 4403`); cereți unui admin rolul `operator`.
- **Follower refuzat (`4401 token de ecran invalid`):** `security.screenToken` diferă de cel din `config.json` al masterului sau este placeholder (§7.2).
- **Preflight roșu:** deschideți `/debug/` → PREFLIGHT ACTIVE: lista `issues` spune cue-ul și problema (`missing-clip`, `missing-file`, `empty-file`, `no-duration`, `no-words`). Regenerați clipul (`npm run tts -- --cue <id>`), apoi `node scripts/precompute-visemes.mjs`.
- **Nu pornește automat după pre-show:** readiness nu este verde (§4) — vedeți `reasons` în `/debug/`; porniți manual cu `S`.
- **Se aude, dar nu se vede filmul/avatarul:** **ARATĂ PLAYERUL** în consolă; browserul de regie și fereastra spectacolului sunt suprafețe separate. Statusul trebuie să treacă din `T−10 · ÎNCĂRCAT` în `RULEAZĂ`.
- **Tableta nu se conectează:** aceeași rețea, IP-ul LAN (nu `localhost`), portul 4321 permis în firewall.
- **Avatar absent / corp nepotrivit:** confirmați calea GLB și `showAvatar: true` doar pe `center`; avertismentul de casting (GLB feminin cu voce masculină) este în log-ul rendererului — `docs/AVATAR.md`.
- **Fără voce:** `playAudio`, ieșirea Windows, `audio.outputDeviceId`, `assets/voice/ro/manifest.json` și existența MP3-ului. Vocile de producție **nu** cad pe TTS Windows/browser (`fallback: silent`).
- **Ecrane decalate:** cablați LAN-ul, un singur `isClockSource` (`center` al masterului), fără economisire de energie; driftul apare în OSD și în tabelul de performanță.
- **Proces blocat:** închideți și reporniți. Jurnale: `runs/app-*.jsonl` (aplicație, păstrate ultimele 20), `runs/show-*.jsonl` (run-log per rulare, păstrate ultimele 20; `src/server/maintenance.ts`, `src/main/logger.ts`).

## 11. Continuitatea lucrului (pentru echipa de dezvoltare)

`HANDOFF-LIVE.md` este jurnalul append-only al rundei curente: §2 pachete cu proprietar și checkbox, §3 o linie `- [HH:MM] AGENT · pachet · ce s-a făcut · ce urmează` după fiecare pas. `npm run heartbeat` pornește `scripts/heartbeat.ps1` (detașat; PID în `runs/heartbeat.pid`), care scrie la fiecare 60 s în `HEARTBEAT.log` (negit-uit): HEAD, numărul de fișiere necomise, fișierele modificate în ultimele 75 s și ultima linie din `HANDOFF-LIVE.md`. Dacă `HEARTBEAT.log` nu mai primește linii, sesiunea care lucra a murit; se reia din `HANDOFF.md` §0 + `HANDOFF-LIVE.md` de la coadă la cap. Oprire: `npm run heartbeat:stop`.

## 12. Înainte de public

Repetiție completă pe hardware-ul real: readiness verde, preflight verde, citirea subtitrărilor de la 17 m, volumul tuturor personajelor/SFX/ambianței, ordinea celor cinci display-uri, scanarea QR și interacțiunile pe cinci tablete, trecerea continuă la epilog. **PIN-ul `4078` schimbat**, `screenToken` copiat pe follower-e, SSID separat pentru sală (`docs/SECURITATE.md`). Ascultați cele trei montaje V3.3 (`assets/voice/ro/preview-*.mp3`).
