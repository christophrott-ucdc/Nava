# Research: proiecte open-source utile pentru NavaPlayer

**Data:** 5 septembrie 2026 · **Autor:** Claude (seat coder) · **Context:** Codex integrează în paralel SQLite; acest document acoperă restul ecosistemului.

**Stack-ul nostru actual (verificat în `package.json`):** Electron 44.2 (Node 24.18.1, Chromium 152), Hono 4.6, ws 8.20, three 0.184, `@met4citizen/talkinghead` 1.7, qrcode 1.5, esbuild, electron-builder 26. Șase dependențe de producție. Orice adăugare trebuie să justifice ruperea acestei sobrietăți.

---

## 0. Recomandarea scurtă

| Prioritate | Proiect | De ce acum |
|---|---|---|
| **Adoptă** | `node:sqlite` (built-in Node 24) | Electron 44 rulează Node 24.18.1, deci SQLite e deja în runtime. Zero module native, zero `electron-rebuild`, zero probleme la `electron-builder`. |
| **Adoptă** | Playwright `toHaveScreenshot()` | Înlocuiește cele 11 scripturi `glass-*.mjs` scrise ad-hoc cu regresie vizuală reală, cu baseline versionat. |
| **Adoptă** | Piper + vocile românești `ro_RO` | Independență totală de ElevenLabs pentru voci. Critic: astăzi, dacă expiră cheia API, nu mai putem regenera nicio replică. |
| **Evaluează** | Rhubarb Lip Sync (WASM) | Generare de viseme offline, ca plasă de siguranță pentru pipeline-ul nostru de lipsync românesc. |
| **Evaluează** | `dmxnet` / `artnet` | Avem deja un adaptor de lumini schițat; astea sunt bibliotecile mature care îl umplu. |
| **Evaluează** | `unitree_sdk2` | Necesar când Avatarul AI devine robotul H2 din sală. |
| **Doar inspirație** | Constellation (FWMSH) | Software de control pentru exponate de muzeu. Nu-l folosim, dar rezolvă exact problemele noastre operaționale. |
| **Nu adopta** | Framework-uri de sincronizare video (Syncplay, SyncTV etc.) | Toate rezolvă altă problemă: mai multe *mașini* pe internet. Noi avem un PC și cinci ieșiri video. Arhitectura noastră e deja corectă. |

---

## 1. SQLite — sprijin pentru munca lui Codex

### 1.1 `node:sqlite` vs. `better-sqlite3`

Electron 44 împachetează Node 24.18.1, deci modulul `node:sqlite` este disponibil nativ în procesul principal. Asta contează mai mult decât pare: `better-sqlite3` este un modul nativ C++ care trebuie recompilat pentru fiecare versiune de Electron și complică `electron-builder`, semnarea și pachetul portabil. `node:sqlite` nu are nicio dependență de build.

| Criteriu | `node:sqlite` | `better-sqlite3` (MIT, ~7.5k stele) |
|---|---|---|
| Instalare | inclus în runtime | modul nativ, necesită rebuild pentru Electron |
| Viteză | comparabilă | ușor mai rapidă, foarte matură |
| Confort | API minimal | are `.transaction()`, extensii, mai multe opțiuni |
| Risc pentru pachetul nostru portabil | zero | mediu (compilare, arhitecturi, semnare) |

**Recomandare pentru Codex:** pornește cu `node:sqlite`; treci la `better-sqlite3` doar dacă lipsește o funcție concretă. În ambele cazuri, `PRAGMA journal_mode = WAL` imediat după deschidere — e practica standard pentru concurență și e obligatorie când serverul scrie loguri în timp ce consola citește analitică.

### 1.2 Migrări și tipare

- **Drizzle ORM** (`drizzle-team/drizzle-orm`): schemă definită în TypeScript plus `drizzle-kit` care generează migrările SQL. Potrivit pentru un proiect nou care își definește schema acum, exact cazul nostru.
- **Kysely**: query builder tipat, dar fără management de migrări (recomandă unelte externe). Se poate combina cu Drizzle, dar pentru noi ar fi o dependență în plus fără câștig.

**Recomandare:** dacă schema depășește 3-4 tabele (rulări, alegeri, certificate, telemetrie, utilizatori), merită Drizzle pentru migrări versionate. Sub acest prag, SQL scris de mână în `src/server/db/` e mai onest.

### 1.3 Backup

**Litestream** (`benbjohnson/litestream`) face replicare continuă a WAL-ului către S3, GCS sau **filesystem local**. Ultima variantă e cea interesantă pentru noi: un proces separat care copiază baza pe un al doilea disc în timp real. Dacă PC-ul de show moare în mijlocul unei zile cu 200 de copii, pierdem secunde, nu ore. Alternativă mai simplă și fără dependențe: `VACUUM INTO` la finalul fiecărei rulări.

---

## 2. Voce și lipsync — cea mai mare vulnerabilitate a proiectului

Astăzi cele 51 de clipuri vocale sunt generate cu ElevenLabs și comise în repo. Dacă vrem o replică nouă sau un scenariu nou (și avem deja patru scenarii noi în `docs/scenarii/`), depindem de un serviciu extern plătit.

### 2.1 Piper

`rhasspy/piper` (și continuarea `OHF-Voice/piper1-gpl`): sinteză neurală locală bazată pe VITS, exportată ONNX, suficient de rapidă pentru CPU în timp real, gândită să meargă și pe Raspberry Pi 4.

**Voci românești confirmate:** modelul oficial `ro_RO/mihai/medium` (aproximativ 63 MB, ONNX plus JSON de configurare) în `rhasspy/piper-voices` pe Hugging Face. Comunitatea are în plus voci `Lili` și `Raluca`, în variante medium și high, `Lili` fiind fine-tuned peste `mihai`.

**De ce contează pentru noi:** Căpitanul este masculin, iar `mihai` e o voce masculină românească. Chiar dacă nu înlocuim ElevenLabs pentru show-ul principal, Piper ne dă: generarea offline a replicilor din scenariile noi, repetiții fără cost, și o rezervă dacă se rupe accesul la API.

**Atenție la licență:** `piper1-gpl` este GPL. Modelele de voce au licențe proprii (multe MIT sau CC). Pentru un executabil comercial, folosește Piper ca **proces extern la generare**, nu ca bibliotecă linkată în aplicație. Așa rămâne o unealtă de producție, nu o dependență de distribuție.

### 2.2 HeadTTS

`met4citizen/HeadTTS` (MIT, ~171 stele) vine de la **același autor ca TalkingHead**, biblioteca noastră de avatar. Produce audio plus timestamp-uri la nivel de fonem și viseme Oculus, rulează în browser pe WebGPU/WASM sau pe un server Node local.

**Limitare decisivă: doar engleză americană.** Nu-l putem folosi pentru show. Rămâne totuși valoros ca **referință de arhitectură**: formatul lui de viseme (`aa`, `E`, `I`, `O`, `U`, `PP`, `SS`, `TH`, `CH`, `FF`, `kk`, `nn`, `RR`, `DD`, `sil`) este exact setul pe care îl folosim în `assets/voice/ro/manifest.json`. Merită citit codul lui de aliniere fonem-viseme și comparat cu `src/renderer/avatar/lipsync-ro.ts`, unde noi am scris totul de la zero.

### 2.3 Rhubarb Lip Sync

`DanielSWolf/rhubarb-lip-sync` (MIT): unealtă de linie de comandă care generează animație de gură din înregistrări audio, offline, prin PocketSphinx. Există și un port WebAssembly cu TypeScript, `danieloquelis/rhubarb-lip-sync-wasm`, tot MIT.

**Utilitate pentru noi:** validare independentă a visemelor noastre precalculate. Rulăm Rhubarb peste cele 51 de clipuri și comparăm cu manifestul; acolo unde diferă mult, avem un candidat de gură desincronizată. E o verificare de calitate pe care acum nu o avem deloc. Precizie limitată pe română (modelul acustic e antrenat pe engleză), deci se folosește ca semnal, nu ca adevăr.

---

## 3. Avatar 3D

- **`readyplayerme/visage`**: componente pentru afișarea avatarelor pe web, construite pe three.js. Relevant dacă vrem un al doilea personaj sau un configurator.
- **Convenția de viseme**: Ready Player Me prefixează cu `viseme_`, ARKit folosește alt set. Dacă schimbăm GLB-ul Căpitanului (decizie deschisă din runda 4: modelul actual este feminin, vocea e masculină), verifică întâi ce blendshape-uri exportă, altfel lipsync-ul nostru nu mai prinde.
- **three-vrm**: relevant doar dacă trecem pe format VRM. Nu recomand: adaugă complexitate fără câștig, GLB-ul actual funcționează.

---

## 4. Lumini și show control

Avem deja un adaptor de lumini schițat (Art-Net și Hue) în server, dar fără bibliotecă reală în spate.

| Proiect | Ce face | Notă |
|---|---|---|
| `margau/dmxnet` | emițător și receptor Art-Net DMX pentru Node | Cel mai direct înlocuitor pentru scheletul nostru |
| `node-dmx/dmx` | bibliotecă de control DMX pentru Node | Alternativă, mai orientată pe drivere seriale |
| `OpenLightingProject/libartnet` | implementarea de referință a protocolului Art-Net | Referință de protocol, C, nu pentru integrare directă |
| QLC+ | software complet de control lumini, cross-platform | Dacă lumina devine complexă, e mai bine să trimitem OSC/Art-Net către QLC+ decât să reimplementăm o consolă |
| MIDIMonster | traduce între MIDI, Art-Net, sACN, OSC | Util la integrarea cu echipamentul altcuiva într-o locație nouă |

**Recomandare:** `dmxnet` pentru Art-Net, plus o cale de ieșire OSC. Dacă locația are deja o masă de lumini, noi trimitem semnale, nu preluăm controlul.

---

## 5. Robustețe în locație

Aici nu am găsit un proiect de adoptat, ci **tipare de copiat**. `mcontartesi/webpage-signage-runner` (kiosk multi-display pentru Windows și Linux) implementează exact ce ne lipsește:

- capturarea evenimentelor `render-process-gone` și `unresponsive` pentru a reînvia un renderer mort fără să repornească tot PC-ul;
- API REST de control și healthcheck pe un port dedicat;
- captură de ecran la distanță pentru diagnostic.

Noi avem cinci ferestre de renderer pe cinci televizoare. Dacă una moare în minutul patru al show-ului, acum nu se întâmplă nimic automat. **Recomandarea mea concretă:** implementăm în `src/main/main.ts` cei doi handleri Electron de mai sus, cu reîncărcare a ferestrei și re-sincronizare la ceasul serverului. Este cel mai bun raport valoare/efort din tot documentul, câteva zeci de linii.

Windows 11 a primit între timp un „Digital Signage Mode” care ascunde ecranele albastre de eroare în public. De verificat dacă e disponibil pe build-ul din sală.

---

## 6. Testare vizuală

Avem 11 scripturi ad-hoc (`glass-review.mjs`, `glass-tv-review.mjs`, `wall-review.mjs` și celelalte) care fac capturi și le pun într-o galerie HTML. Sunt utile, dar nimeni nu compară automat cu o referință.

**Playwright** are `toHaveScreenshot()` inclus în `@playwright/test`, fără plugin-uri: prima rulare devine baseline comis în repo, rulările următoare compară pixel cu pixel prin `pixelmatch`. Playwright știe să conducă și aplicații Electron.

**Recomandare:** un singur fișier de test cu vederile critice (alegere post, alegere pereche, certificat, consolă la 1920 și 1440, subtitrare TV) și baseline-uri comise. Din acel moment, orice regresie de design se vede la `npm run check`, nu la trei zile după.

---

## 7. Robotul Unitree H2 („Avatarul AI”)

Pentru integrarea pe care o plănuiești:

- **`unitreerobotics/unitree_sdk2`**: SDK-ul oficial, comunicare prin CycloneDDS, API C++ nativ plus wrapper Python. Documentația de suport listează explicit H2 printre roboții acoperiți.
- **`unitree_sdk2_python`**: interfața Python, cea mai rapidă cale către un prototip.
- **`unitreerobotics/unitree_ros2`**: dacă mergem pe ROS 2.

**Arhitectura pe care o recomand:** NavaPlayer **nu** vorbește direct cu robotul. Serverul nostru emite deja evenimente de cue pe WebSocket; scriem un mic pod în Python care ascultă acele evenimente și cheamă SDK-ul. Astfel, un robot care cade sau se deconectează nu poate opri show-ul, iar noi nu introducem CycloneDDS în executabilul Electron.

---

## 8. Polish de interfață

| Proiect | Licență | Utilitate |
|---|---|---|
| `catdad/canvas-confetti` | ISC (de confirmat la instalare) | Confetti performant pe canvas. Noi am scris propria implementare cu 12 particule; a lor e mai bogată și testată. |
| `loonywizard/js-confetti` | MIT (de confirmat) | Suportă emoji ca particule. Ar merge mascotele posturilor care plouă la certificat. |
| `lucide-icons/lucide` | ISC | Peste 1600 de iconițe SVG, gratuit comercial. Spec-ul nostru cere 24 de iconițe desenate manual; Lucide le acoperă imediat, în stil consistent. |

**Notă de onestitate:** licențele pentru `canvas-confetti` și `js-confetti` le-am reținut din surse secundare; confirmă-le în `LICENSE` înainte de a le include în executabil. Lucide ISC este confirmat pe repo.

---

## 9. Ce am respins explicit

**Sincronizarea video multi-mașină** (Syncplay, SyncTV, SyncStream, ViewSync, rpi-video-sync-looper). Toate rezolvă „mai multe calculatoare care redau același film pe internet”. Noi avem un singur PC, un singur video decodat și cinci ferestre. Arhitectura noastră cu ceas autoritar pe server e strict mai simplă și mai precisă pentru acest caz. Adoptarea oricăreia ar fi un regres.

**Framework-uri de kiosk pentru muzee** (Constellation, kiosk-application-framework, muse-tech-central). Constellation, MIT, de la Fort Worth Museum of Science and History, rezolvă control de exponate, media player, chioșcuri de vot, monitorizare heartbeat, chiar DMX. Este scris în Python și presupune altă topologie. **Nu-l adoptăm, dar merită citit**: are răspunsuri gata făcute pentru exact plângerile clientului nostru, adică operatorul care nu știe dacă „5 tablete offline” e normal sau e o pană.

---

## 10. Trei acțiuni pe care le-aș face săptămâna asta

1. **Handleri de crash pentru renderer** în procesul principal. Câteva zeci de linii, elimină cel mai jenant mod de eșec în fața părinților.
2. **Piper cu vocea `ro_RO/mihai/medium`** ca unealtă de generare offline, ca să putem produce replicile celor patru scenarii noi fără ElevenLabs.
3. **Playwright cu baseline vizual** pe șase vederi critice, ca redesign-ul Glass să nu poată regresa tăcut.

## Surse

- [WiseLibs/better-sqlite3](https://github.com/WiseLibs/better-sqlite3) · [node:sqlite production guide 2026](https://www.hirenodejs.com/blog/nodejs-builtin-sqlite-node-sqlite-2026) · [Drizzle ORM](https://orm.drizzle.team/) · [Kysely](https://kysely.dev/) · [Litestream](https://github.com/benbjohnson/litestream)
- [rhasspy/piper](https://github.com/rhasspy/piper) · [OHF-Voice/piper1-gpl](https://github.com/OHF-Voice/piper1-gpl) · [rhasspy/piper-voices (ro_RO)](https://huggingface.co/rhasspy/piper-voices) · [eduardem/piper-tts-romanian](https://huggingface.co/eduardem/piper-tts-romanian)
- [met4citizen/HeadTTS](https://github.com/met4citizen/HeadTTS) · [DanielSWolf/rhubarb-lip-sync](https://github.com/DanielSWolf/rhubarb-lip-sync) · [danieloquelis/rhubarb-lip-sync-wasm](https://github.com/danieloquelis/rhubarb-lip-sync-wasm) · [readyplayerme/visage](https://github.com/readyplayerme/visage)
- [margau/dmxnet](https://github.com/margau/dmxnet) · [node-dmx/dmx](https://github.com/node-dmx/dmx) · [OpenLightingProject/libartnet](https://github.com/OpenLightingProject/libartnet)
- [mcontartesi/webpage-signage-runner](https://github.com/mcontartesi/webpage-signage-runner) · [FWMSH/Constellation](https://github.com/FWMSH/Constellation) · [rhulse/kiosk-application-framework](https://github.com/rhulse/kiosk-application-framework)
- [Playwright visual regression 2026](https://qaskills.sh/blog/playwright-visual-regression-testing-guide) · [Electron 44 release notes](https://www.electronjs.org/blog/electron-44-0)
- [unitreerobotics/unitree_sdk2](https://github.com/unitreerobotics/unitree_sdk2) · [unitreerobotics/unitree_ros2](https://github.com/unitreerobotics/unitree_ros2)
- [lucide-icons/lucide](https://github.com/lucide-icons/lucide) · [catdad/canvas-confetti](https://www.npmjs.com/package/canvas-confetti) · [loonywizard/js-confetti](https://github.com/loonywizard/js-confetti)
