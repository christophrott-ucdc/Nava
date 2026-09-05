# HANDOFF — ISTORIC · addendele append-only §16–§28 (Codex, 2026-09-04)

> **Document istoric.** Conținutul de mai jos a fost mutat **verbatim** din `HANDOFF.md` (secțiunile §16–§28, liniile 730–1959 ale versiunii de la commit `5af8383`) la 2026-09-04, când `HANDOFF.md` a fost rescris ca un singur document curent (agentul E, pachetul E-01).
>
> Aceste addende au fost scrise în ordine cronologică, prin adăugare la final, și **se contrazic între ele** (10 tablete → 5 tablete; Căpitan robot Unitree → Căpitan GLB; capsulă VR → fără VR; film 12:21 cu hold → tăietură deterministă la 465 s; 24 voci legacy → 51 voci V3). Regula de citire a rămas cea de atunci: **un addendum mai nou prevalează asupra unuia mai vechi**. Pentru starea curentă a proiectului nu se citește acest fișier, ci `HANDOFF.md` și `HANDOFF-LIVE.md`.
>
> Numerotarea secțiunilor (§16–§28) și referințele interne („vezi §12", „§22.9") se referă la vechiul `HANDOFF.md` și nu mai corespund cu secțiunile actuale. Textul nu a fost corectat, reformatat sau completat.

---

## 16. CONTINUARE APPEND-ONLY — integrare și finalizare (Codex, 2026-09-04)

> Această secțiune a fost **adăugată la final** la cererea utilizatorului. Conținutul anterior, inclusiv starea istorică din §12, nu a fost rescris. Pentru starea curentă se citesc în ordine toate addendum-urile de la §16 în jos.

### 16.1 Explorare și constatări inițiale

- A fost citit integral acest `HANDOFF.md`, apoi `docs/BRIEF.md`, contractele `src/shared/types.ts`, `src/shared/protocol.ts`, `src/shared/contracts.ts` și scenariul executabil `assets/show/show.json`.
- Repo-ul era pe branch-ul `board/nava-player`, fără niciun commit, iar toate fișierele erau untracked.
- Implementarea existentă era mult mai avansată decât starea istorică din §12, dar integrarea era întreruptă: lipseau `src/renderer/avatar/index.ts`, `src/renderer/voice/index.ts`, `src/server/tts-providers.ts`, `scripts/tts-generate.mjs` și ambele aplicații web din `src/web/`.
- `npm run typecheck` eșua din cauza modulelor lipsă și a celor două câmpuri noi absente din fallback-ul rendererului: `launchLeadInSec` și `epilogueOnVideoEnd`.
- `npm run build` eșua la aceleași importuri și sărea peste consola și aplicația tabletelor.
- S-a confirmat starea reală a show-ului: `0.2.0-aligned`, 8 scene, 53 cue-uri, dintre care 24 voce, 8 teme, 6 entități, 5 SFX, 5 tablete, 4 markere și un countdown.
- S-au confirmat local media H.264 de 2.504.162.463 B, avatarul GLB de 14.302.780 B și planșele de cadre.

### 16.2 Lucru paralel cu agenți

Utilizatorul a autorizat explicit folosirea mai multor agenți. Au fost pornite patru piste de lucru, cu proprietate de fișiere separată:

1. **avatar_voice** — avatar, motor voce, TTS providers și generatorul de voci;
2. **web_apps** — consola operatorului și aplicația tabletelor;
3. **platform_audit** — Electron main/preload, server, build, packaging și smoke tests;
4. **release_qa** — audit independent, fără editări, al produsului integrat.

### 16.3 Renderer: lead-in real la T−10 și epilog automat

- În `src/renderer/index.ts`, show-ul fallback a primit câmpurile obligatorii `launchLeadInSec: 10` și `epilogueOnVideoEnd: false`.
- În `src/renderer/player.ts` s-a reparat integrarea câmpului `launchLeadInSec`. Înainte, serverul pornea la `phaseTime=-10`, dar rendererul pornea imediat filmul la 0. Acum:
  - faza `play` poate avea timp negativ;
  - video-ul rămâne înghețat pe cadrul zero în lead-in;
  - pause/play îngheață și reia countdown-ul negativ;
  - seek la un timp negativ reintră în lead-in;
  - follower-ele urmăresc corect ceasul negativ;
  - filmul începe când ceasul ajunge la zero.
- Citirea vechiului câmp inexistent `autoEpilogue` a fost înlocuită cu contractul real `epilogueOnVideoEnd`.
- Tranziția locală automată spre epilog este întârziată 750 ms după evenimentul video `ended`, astfel încât ecranul-sursă să raporteze mai întâi serverului starea `ended`; serverul rămâne autoritatea și poate difuza simultan comanda `epilogue`. Într-o rulare offline, timeout-ul local păstrează comportamentul automat.
- A fost adăugat `scripts/smoke-core.mjs`, care verifică serverul și rendererul la T−10, filmul înghețat, pauza countdown-ului și pornirea filmului la zero. Testul trece.

### 16.4 Avatar, voce și TTS

Au fost create/completate:

- `src/renderer/avatar/index.ts` — `createAvatarController` cu TalkingHead, încărcare GLB, transporter, Romanian visemes, lip-sync pe un buffer mut sincronizat cu audio-ul real, fallback sintetic, mood/attention/resize/dispose și recuperare după pierderea contextului WebGL;
- `src/renderer/voice/index.ts` — `createVoiceEngine` cu lanț manifest offline → `/api/tts` → `speechSynthesis`, validare/decode/cache audio, efecte per personaj, amplitudine, SFX și ecrane follower mute;
- `src/server/tts-providers.ts` — ElevenLabs cu endpoint de timestamps și Gemini prin schema curentă `v1beta/interactions`, erori sigure când lipsesc cheile, WAV pentru PCM și estimare de timpi;
- `scripts/tts-generate.mjs` — generator reluabil cu `--lang`, `--provider`, `--cue`, `--force`, `--dry-run`, încărcare `.env` fără afișarea secretelor și păstrarea rezultatelor parțiale;
- `assets/voice/{ro,en,fr}/manifest.json` — manifeste offline valide, momentan goale.

În `.env.example` a fost documentat și `GEMINI_TTS_MODEL=gemini-3.1-flash-tts-preview`. Schema API a fost verificată față de documentația oficială curentă ElevenLabs și Google Gemini. `node scripts/tts-generate.mjs --dry-run` găsește toate cele 24 de replici. Nu au fost generate MP3/WAV deoarece nu există chei API; fallback-ul Windows rămâne funcțional.

### 16.5 Consola operatorului și tabletele

Au fost adăugate `index.html`, `styles.css` și `index.ts` în ambele directoare:

- `src/web/control/` — WebSocket cu reconectare și fallback HTTP, toate comenzile protocolului, ceas interpolat și timeline T−10…durată, scene, căutare/filtrare cue-uri, statusuri și fire manual, volume, limbă, QR/URL LAN, starea video/ecranelor/tabletelor, roluri și răspunsuri live;
- `src/web/tablet/` — identitate UUID persistentă, nume/rol, reconectare cu backoff și ping, coadă offline, teme/scene/subtitrări, alegere rol, întrebare, vot, mesaj, mulțumire și reset de sesiune.

Interfețele folosesc numai DOM și `textContent` pentru datele copiilor/serverului; nu a fost introdus un framework sau HTML nesigur.

### 16.6 Platformă, server și build

Auditul platformei a reparat și verificat:

- normalizarea completă a configurației și validarea URL-ului WebSocket;
- blocarea popup-urilor și navigării rendererului Electron;
- reconectarea followerului când constructorul WebSocket eșuează;
- validarea show-ului, rolurilor WS și a handshake-urilor duplicate;
- shutdown bounded și închiderea conexiunilor keep-alive;
- validarea strictă a interacțiunilor tabletelor și resetul sesiunii la restart;
- recomputarea corectă a subtitrării după seek/reload;
- build one-shot care eșuează dacă lipsesc entrypoint-uri sau fișiere runtime, în loc să livreze parțial;
- overwrite sigur pe Windows pentru utilitarele media.

Au fost adăugate `scripts/smoke-platform.mjs` și `scripts/smoke-media.mjs`. Testul de platformă acoperă HTTP, static assets, QR, roluri WS, state machine, tablete și shutdown. Testul media acoperă transcodarea CPU într-un director temporar, overwrite Windows-safe și contact sheet.

### 16.7 Validare show și comanda unică de verificare

- A fost adăugat `scripts/validate-show.mjs`: validează schema de bază, fazele, temele, scenele, suprapunerile, id-urile duplicate, ordinea cue-urilor, limitele lead-in/video, vorbitorii, entitățile și textul românesc.
- În `package.json` au fost adăugate scripturile `validate:show`, `smoke:core`, `smoke:platform`, `smoke:media` și `check`.
- `npm run validate:show` trece pentru 8 scene și 53 cue-uri.
- `npm run typecheck` trece fără erori.
- Build-ul normal și cel minificat trec pentru `main`, `preload`, `renderer`, `web/control` și `web/tablet`.
- `smoke-core`, `smoke-platform` și `smoke-media` trec.

### 16.8 Documentație creată

Au fost adăugate documentele care erau promise în acest handoff, dar lipseau efectiv:

- `README.md` — pornire, verificare, distribuție, configurare și structură;
- `docs/SPEC-SHEET.md` — cerințe funcționale/nefuncționale, configurație, interfețe și acceptanță;
- `docs/SCENARIU.md` — scenariul executabil pe scene și id-uri;
- `docs/CUE-SHEET.md` — tabelul celor 53 de cue-uri și regulile de editare;
- `docs/OPERARE.md` — pregătire, rularea sesiunii, follower, taste și depanare;
- `docs/DECIZII.md` — deciziile arhitecturale consolidate.

### 16.9 Rulare Electron reală

Aplicația a fost pornită în Electron 44.2.0, în mod windowed, pe configurația master reală. Au fost confirmate în log:

- server master pe portul 4321 și URL-ul LAN;
- încărcarea rendererului și conectarea WebSocket a ecranului `center` ca sursă de ceas;
- show-ul `0.2.0-aligned` cu 53 cue-uri;
- metadata filmului real `3840×2052`, `741.78 s`;
- încărcarea cu succes a avatarului GLB (`avatar ready`);
- `/control/` și `/tablet/` răspund HTTP 200;
- `/api/health` raportează `videoReady: true`, un ecran și clock source `center`;
- `start` răspunde la `phaseTime: -10`; timpul avansează negativ, `pause` îl îngheață, apoi s-au verificat seek la revelație, epilog și restart;
- lipsa cheilor face `/api/tts` să răspundă controlat cu fallback, fără crash;
- shutdown-ul serverului și al aplicației este curat.

### 16.10 Packaging și identitate vizuală

- `npm run dist` a produs cu succes:
  - `dist-app/NavaPlayer-0.1.0-x64-portable.exe` — 107.733.306 B;
  - `dist-app/NavaPlayer-0.1.0-x64-setup.exe` — 107.963.481 B.
- Conținutul ASAR include main/preload/renderer/control/tablet, iar `resources` include avatarul, show-ul, manifestele vocale și exemplul de config. Filmul mare rămâne intenționat extern.
- Packaging-ul a avertizat că lipsește iconul produsului. Pentru a elimina aspectul generic a fost generat un mark Nava/EXODUS-7 (fereastră de navă, Pământ și stea de navigație, cyan pe navy, fără text), salvat ca `build/icon.png` și convertit în `build/icon.ico` pentru Windows. Artifactele trebuie reconstruite după integrarea tuturor remedierilor finale.

### 16.11 Problemă găsită de auditul independent — în curs de remediere

Auditul `release_qa` a reprodus o problemă de fază pe follower: după terminarea epilogului, starea serverului `ended` era interpretată de `Player.follow()` ca sfârșit al fazei `play`, ceea ce putea muta followerul de la alb/epilog înapoi la ultimul cadru al filmului/tema `home`. Cauza este că `Player.phase()` asociază istoric orice `ended` cu `play`. Remedierea planificată este păstrarea explicită a fazei active (`play` sau `epilogue`) prin starea `ended`, plus un test de regresie. Starea finală a acestei remedieri va fi **adăugată** într-un addendum ulterior, fără rescrierea acestei secțiuni.

---

## 17. ADDENDUM FINAL APPEND-ONLY — remediere, QA și livrare (Codex, 2026-09-04)

> Această secțiune a fost adăugată după §16. Nicio secțiune anterioară din `HANDOFF.md` nu a fost rescrisă sau ștearsă.

### 17.1 Remedierea fazei `ended`

- `src/renderer/player.ts` păstrează acum separat faza activă în `phaseMode`, deoarece `PlaybackState="ended"` poate reprezenta fie finalul filmului, fie finalul epilogului.
- Toate tranzițiile setează explicit faza: `idle → null`, `preshow`, `play`, respectiv `epilogue`.
- `phase()` și `phaseTime()` nu mai deduc greșit faza exclusiv din `PlaybackState`.
- La `follow("ended", ...)`, un follower aflat deja în epilog oprește ceasul, se aliniază la timpul autoritar și păstrează timeline-ul și tema epilogului; nu mai repornește și nu mai caută filmul.
- Pentru un follower nou conectat direct într-o stare `ended`, faza este inferată prin apropierea timpului autoritar de capătul epilogului sau de durata filmului. O fază locală deja stabilită are întotdeauna prioritate.
- Pe calea finalului de film sunt oprite video-ul și timerul de auto-epilog, iar seek-ul mare actualizează împreună video-ul și timeline-ul.
- `scripts/smoke-core.mjs` conține testul de regresie complet: intrare în epilog, temă `white`, recepție `ended` la 120 s, fază păstrată `epilogue` și zero apeluri noi către `video.play()`.
- Testul țintit `npm run smoke:core` trece.
- Remedierea a fost salvată în commit-ul `ab3941b` — `fix: preserve epilogue phase after playback ends`.

### 17.2 Verificarea finală

După remediere s-a rulat din nou `npm run check`; toate etapele sunt verzi:

1. `tsc --noEmit`;
2. validarea show-ului: 8 scene, 53 cue-uri;
3. build pentru main, preload, renderer, control și tablet;
4. `smoke-core`, inclusiv regresia ended/epilog;
5. `smoke-platform`: HTTP, static, QR, WS, state machine, tablete și shutdown;
6. `smoke-media`: transcodare CPU, overwrite sigur pe Windows și contact sheet.

Agentul independent `release_qa` a reinspectat remedierea și a rulat separat aceeași suită. Verdictul lui: **verde, fără regresii sau blocante de cod**.

### 17.3 Reîmpachetarea Windows

- Prima reîncercare `npm run dist` după adăugarea iconului a eșuat cu `EPERM` la ștergerea `dist-app/win-unpacked/d3dcompiler_47.dll`.
- Cauza verificată a fost existența a patru procese `NavaPlayer.exe` care rulau din pachetul vechi și țineau DLL-ul deschis.
- Au fost închise numai procesele `NavaPlayer` cu calea exactă din `C:\Users\Chris\Documents\GitHub\Nava\dist-app\win-unpacked`; după confirmarea ieșirii lor, împachetarea a fost reluată.
- A doua rulare `npm run dist` a terminat cu exit code 0, fără avertismentul anterior despre icon generic.
- Artifactele finale, reconstruite după remedierea `ended`, sunt:
  - `dist-app/NavaPlayer-0.1.0-x64-portable.exe` — 108.042.526 B — SHA-256 `D6C3D1A81604FD3BF88C7C3ED6784C19E39C6EAD0D35D3CBEDEE7D3F8C8397A6`;
  - `dist-app/NavaPlayer-0.1.0-x64-setup.exe` — 108.336.891 B — SHA-256 `4BA6C0A8277AAC3BC8F5B101969A14BEA05CF28AB6C06988A0C181836FE5EF25`.
- Ambele executabile au fost verificate cu `Get-AuthenticodeSignature`: starea este `NotSigned`. Pentru distribuție publică fără avertismente SmartScreen va fi necesar ulterior un certificat de code-signing; acest lucru nu împiedică rularea locală în instalația dedicată.

### 17.4 Starea de livrare și limite externe

Codul, configurația exemplu, show-ul, avatarul, aplicațiile web, documentația, testele și pachetele Windows sunt finalizate. Rămân numai activități dependente de resurse sau de mediul fizic, nu lucrări de implementare:

- manifestele de voce sunt valide, dar goale; lipsesc cheile ElevenLabs/Gemini și aprobarea vocilor, deci în prezent se folosește fallback-ul `speechSynthesis`;
- este necesară repetiția de acceptanță pe hardware-ul real: cinci ieșiri video, routing audio, router dedicat și tablete;
- serverul de control nu are autentificare. Configurația este acceptabilă numai pe LAN privat/dedicat; pe Wi-Fi partajat, autentificarea/PIN-ul din lista istorică de TODO devine obligatoriu înainte de utilizare;
- executabilele nu au semnătură Authenticode, conform verificării de mai sus.

---

## 18. ADDENDUM APPEND-ONLY — scenariul regizoral de 10 minute (Codex, 2026-09-04)

> Această secțiune a fost adăugată la final. Nicio secțiune anterioară din `HANDOFF.md` nu a fost rescrisă sau ștearsă.

### 18.1 Consultanții creați

La cererea utilizatorului au fost creați trei agenți consultanți, fiecare lucrând independent și fără să editeze fișiere:

1. `scenarist` — structură dramatică, personaje, replici și cronometrare;
2. `regizor_film` — potrivirea cu montajul și imaginile reale, ritm, muzică și SFX;
3. `expert_copii` — limbaj, siguranță fizică și emoțională, incluziune, interacțiuni și operarea grupului.

Fiecare a citit documentele proiectului și show-ul executabil. După prima sinteză, toți trei au citit și auditat noul scenariu. Observațiile lor au fost integrate, iar versiunea corectată a fost trimisă încă o dată tuturor. Verdicturile finale au fost `VERDE`, `VERDE CA SCENARIU`, respectiv `VERDE`.

### 18.2 Constatarea comună de durată

- Cerința din brief este o experiență de 10:00.
- Configurația actuală, rulată integral, durează 15:31,78: 60 s pre-show + 10 s lead-in + 741,78 s film + 120 s epilog.
- Chiar dacă epilogul este declanșat după ultima replică, la video aproximativ 465 s, durata este aproximativ 10:55 cu structura actuală.
- Ultimele 276,78 s ale filmului după secunda 465 sunt aproape integral un hold pe Pământ. Nu sunt necesare pentru arcul principal.
- Consensul a fost construirea unui master regizoral de exact 600 s, care folosește filmul numai până la secunda 465 și pornește apoi epilogul.

### 18.3 Fișierul nou și structura lui

A fost creat `docs/SCENARIU-REGIZORAL-10-MIN.md`. Este primul livrabil de conținut, pentru aprobare, și nu schimbă încă `assets/show/show.json` sau codul aplicației.

Contractul temporal este:

| Timp public | Conținut | Durată |
|---|---|---:|
| 0:00–0:50 | activarea echipajului | 0:50 |
| 0:50–1:00 | countdown T−10 | 0:10 |
| 1:00–8:45 | film video 0–465 s | 7:45 |
| 8:45–9:55 | epilog / re-entry simbolic | 1:10 |
| 9:55–10:00 | alb cald și tăcere | 0:05 |

Suma a fost verificată automat: 600 s. Documentul are 28 de replici, 389 de cuvinte și aproximativ 180 s de vorbire la 130 de cuvinte/minut; circa 70% din spectacol rămâne pentru imagine, sound design, reacții și pauze.

### 18.4 Deciziile dramaturgice și de public

- Firul central este explicit la început și revine în revelație: echipajul caută alte lumi și se întreabă dacă suntem singuri.
- Copiii sunt echipaj, nu „selectați”; participarea și rolurile sunt opționale, iar statutul de observator este la fel de valid.
- Indicația „țineți-vă respirația” a fost eliminată. Instrucțiunile corporale nu presupun picioare pe podea, scaun cu spătar sau o anumită mobilitate.
- Există două semnale echivalente pentru oprire: copilul spune „pauză” sau face semn. Un facilitator dedicat stă lângă ieșire și vede toate cele zece locuri.
- Traseul low-sensory este operaționalizat: loc în grup aproape de ieșire, protecție auditivă, fără cască/efect fizic, însoțire discretă și revenire într-un moment vizual stabil.
- Singura interacțiune pe tabletă în timpul filmului este un vot printr-o atingere, cu cinci opțiuni și „Trec mai departe”. Nu există răspuns corect, clasament sau confirmări sonore în sală.
- Tabletele rămân întunecate în revelația Pământului. Copilul alege în gând ceva de ocrotit; nu este obligat să tasteze sau să vorbească.
- Formulările anxiogene, moralizatoare sau absolute din versiunea inițială au fost reformulate: nu se mai folosesc „cine minte se stinge”, „au învins moartea”, „nimic nu te mai doare” sau garanția „sunteți în siguranță”.
- Responsabilitatea pentru Pământ este colectivă, nu pusă pe umerii copilului.

### 18.5 Deciziile de imagine și sunet

- Scenariul descrie numai ce există în film: Pământul, Siwarha cu inele în mediul turcoaz, Kepler-186 d albastră cu nori, Mann lângă discul Gargantua, wormhole și Pământul-semiiună de la final.
- Nu mai pretinde că filmul arată păduri, râuri, orașe de cristal, țări, ferestre sau Saturn. Metaforele pot aparține vocilor și entităților, dar nu indicațiilor de cadru.
- Re-entry-ul vizual nu este pretins ca material existent; epilogul poate rula pe alb în sală sau într-un conținut VR separat, confirmat ulterior.
- Partitura cere o ambianță continuă, ducking cu aproximativ 8–10 dB sub voce și trei tăceri deliberate: după dispariția Pământului, după Natură și după întrebarea Tehnologică.
- Rumble-ul este anticipat prin puls, ploaia nu acoperă vocea, swell-ul coboară înaintea revelației și nu există stroboscop.

### 18.6 Cerințe înainte de implementare

Acestea sunt menționate în scenariu și nu au fost implementate în această etapă, deoarece utilizatorul a cerut mai întâi scriptul:

1. tranziția automată la epilog la video 465 s — aplicația actuală așteaptă finalul real de la 741,78 s, iar un marker nu poate schimba faza;
2. repoziționarea/redimensionarea entităților, care pot acoperi acum planeta din centrul cadrului;
3. producerea ambianței continue și implementarea ducking-ului automat al efectelor;
4. adaptarea votului de pe tabletă la opțiunile și regulile scenariului;
5. alegerea operațională pentru VR: echipament deja pregătit și utilizare simultană sau extensie post-show. Mutarea și echiparea a zece copii nu pot fi comprimate în 75 s în siguranță.

### 18.7 Verificări efectuate

- suma celor zece segmente temporale: 600 s exact;
- conversia dintre timpul public și video: corectă pentru intervalul video 0–465 s;
- estimarea dialogului: 389 de cuvinte, aproximativ 180 s la 130 cuvinte/minut;
- `git diff --check` pentru document: fără erori de whitespace;
- audit final separat al tuturor celor trei consultanți: verde.

### 18.8 Erată append-only

În §18.5, forma `semiiună` este o eroare de tastare; se citește `semilună`. Corecția este adăugată aici, fără modificarea textului anterior.

---

## 19. ADDENDUM APPEND-ONLY — reconstrucția creativă „Protocolul Acasă” (Codex, 2026-09-04)

> Această secțiune este adăugată la final. Nicio secțiune anterioară, inclusiv scenariul de lucru descris în §18, nu a fost rescrisă. Pentru direcția creativă actuală, §19 înlocuiește concluziile artistice din §18 fără să le șteargă din istoricul proiectului.

### 19.1 Motivul reconstrucției

Utilizatorul a respins explicit prima versiune de zece minute ca fiind prea simplă și a cerut creativitate totală, un scenariu mult mai bun și mai complex. Diagnosticul acceptat a fost că versiunea anterioară funcționa ca un tur ghidat, corect și sigur, dar nu avea suficient mister, cauzalitate, transformare de personaj sau un rol indispensabil pentru public.

Cei trei consultanți `scenarist`, `regizor_film` și `expert_copii` au primit un nou mandat: reconcepere de la zero, nu cosmetizare. Au propus independent motor dramatic, structură vizual-sonoră, participare cu payoff și limite de siguranță. Agentul principal a sintetizat ideile, a scris versiunea 2 integrală și a trecut-o prin trei runde de audit dur. Fiecare problemă raportată a fost corectată înainte de verdictul final.

### 19.2 Conceptul nou

Titlul complet este **„A PATRA LUME — PROTOCOLUL ACASĂ”**. Misterul central este **Semnalul fără adresă**:

- EXODUS-7 primește înaintea misiunii un mesaj spart în zece fragmente: `GĂSIȚI A PATRA LUME`;
- cele zece fragmente corespund celor zece stații ale copiilor;
- Lumina dă semnalului o culoare;
- Natura îi dă un ritm;
- Tehnologica îi dă cele zece perspective pe care nu le poate reduce la un singur răspuns;
- în wormhole se descoperă clar că mesajul a călătorit înapoi în timp și a ajuns înainte de a fi trimis;
- la apariția Pământului, echipajul înțelege că el este chiar expeditorul;
- la 8:39 Avatarul reatașează explicit mesajul inițial, iar la 8:43 Căpitanul spune `Trimite`; aceasta este singura transmisie și închide cauzal bucla;
- a patra lume nu este o planetă necunoscută, ci prima lume pe care echipajul a învățat s-o privească din nou.

### 19.3 Complexitatea reală adăugată

- Un inel periferic cu patru arce și un motiv muzical de patru note acumulează memoria călătoriei. Al patrulea arc și ultima notă apar numai la Pământ.
- Fiecare dintre cele zece roluri primește automat o lentilă narativă distinctă: direcție, energie, undă, puls, anomalie, traseu, coerență, viață, traiectorie sau memorie. Rolul are payoff fără a adăuga sarcini.
- Există trei interacțiuni scurte: culoare, puls paralel și o alegere despre ce păstrează o lume vie. Toate au `Doar observ`, timeout și fallback complet.
- Replica Tehnologicei este adaptivă pentru trei situații reale: alegeri diverse, o singură alegere sau numai observație. Scenariul nu pretinde un rezultat care nu s-a produs.
- Tehnologica anticipează comic replica `Scanați sursa`; Căpitanul o rostește, iar ea răspunde sec `Știm`.
- Căpitanul are acum un arc complet: protocol → observație → îndoială → alegere → apartenență. Punctul lui de transformare este `Atunci sunt autentice`, iar în wormhole înțelege înaintea sistemului: `Atunci noi suntem expeditorul`.
- Climaxul elimină HUD-ul și lasă Pământul neacoperit. Efectul final este o diagramă schematică ce părăsește cadrul, nu un wormhole fotorealist inventat peste film.

### 19.4 Textul Căpitanului

Noul scenariu conține 17 intervenții ale Căpitanului și o anexă separată `TEXTUL INTEGRAL AL CĂPITANULUI`, pentru actor, TTS sau programarea robotului. Textul din anexă a fost comparat automat cu replicile din scenariul principal și este identic, inclusiv timecode-urile.

Indicația de interpretare este că nu joacă un robot fără emoție, ci o ființă care și-a organizat emoția sub forma disciplinei. Căldura apare prin pauze, volum și direcția privirii, nu printr-o schimbare bruscă de voce.

### 19.5 Corecțiile rezultate din audit

Auditurile succesive au reparat:

- două transmisii contradictorii ale semnalului — a rămas una singură, la 8:43;
- lipsa mesajului `GĂSIȚI A PATRA LUME` din semnalul final;
- confuzia dintre punctul de origine și momentul transmiterii;
- formulări care presupuneau zece răspunsuri diferite chiar dacă publicul nu participa;
- afirmația falsă că o mașină nu poate reproduce semnătura; ideea actuală este că mașina nu putea **alege** semnătura în locul copiilor;
- o explicație prea abstractă a buclei temporale; textul spune acum direct că semnalul a trecut prin wormhole înapoi în timp și a ajuns înainte să fie trimis;
- promisiunea falsă că rolurile văd lucruri diferite, prin definirea lentilelor lor automate;
- trei coliziuni de voce și un whoosh prea apropiat de dialog;
- un trigger sonor rămas legat de cuvântul eliminat `far`; acum primul arc se aprinde pe `adâncime`;
- lipsa instrucțiunii finale de a rămâne pe loc până la aprinderea luminilor și indicația facilitatorului;
- formulări care amenințau involuntar, invadau intimitatea emoțională sau transformau finalul într-o lecție morală.

### 19.6 Verificări finale

- contract temporal: 600 s exact;
- film: video 0–465 s, cu offset public constant de +60 s, aliniat pe toate corpurile și tranzițiile reale;
- 48 de intervenții vocale în scenariul principal, 477 de cuvinte;
- 17 replici ale Căpitanului, cu anexă verificată automat ca identică;
- verificare la o rostire lentă de 120 cuvinte/minut plus minimum 1 s buffer: zero coliziuni între ferestrele vocale;
- `git diff --check`: fără erori de whitespace;
- verdict final `VERDE` de la scenarist;
- verdict final `VERDE CA SCENARIU` de la regizorul de film;
- verdict final `VERDE` de la expertul pentru copii.

### 19.7 Fișierul autoritativ pentru etapa creativă

Scenariul curent este `docs/SCENARIU-REGIZORAL-10-MIN.md`, versiunea 2. `assets/show/show.json` și codul aplicației nu au fost încă schimbate după această versiune, deoarece utilizatorul a cerut mai întâi scenariul. Cerințele de producție și implementare sunt enumerate la finalul documentului.

---

## 20. ADDENDUM APPEND-ONLY — cinci posturi, continuitate și Căpitan exclusiv GLB (Codex, 2026-09-04)

> Această secțiune a fost adăugată la final. Nicio secțiune anterioară din `HANDOFF.md` nu a fost rescrisă sau ștearsă. Pentru configurația fizică actualizată, §20 înlocuiește informațiile de producție incompatibile din §18–§19 fără a le elimina din istoric.

### 20.1 Corecțiile cerute

Utilizatorul a precizat trei date de producție care devin autoritative:

1. instalația are **cinci posturi și cinci tablete**, nu zece posturi/tablete;
2. experiența este una continuă, fără mutarea publicului, schimbarea echipamentului sau un modul separat perceput la 8:45;
3. Căpitanul este exclusiv personajul GLB din fereastra lui de pe ecran și nu are nicio prezență fizică în sală.

Cei zece copii din brief au fost păstrați ca cinci perechi egale, câte una la fiecare post. Conceptul rezultat este `5 posturi × 2 urme = 10 contribuții`, fără lider, ajutor sau consens obligatoriu în pereche.

### 20.2 Adaptarea dramaturgică

`docs/SCENARIU-REGIZORAL-10-MIN.md` a fost actualizat la versiunea 3:

- semnalul conține cinci fragmente, câte unul pentru fiecare post;
- fiecare fragment și sigiliu păstrează două urme egale, câte una pentru fiecare copil din pereche;
- există cinci lentile cauzale: NAVIGAȚIE, PROPULSIE, COMUNICAȚII, BIOSEMNALE și MEMORIE;
- rolurile nu sunt decorative: Comunicațiile reconstruiesc mesajul, Navigația confirmă direcția și originea, Biosemnalele autentifică urma vie, Propulsia confirmă coerența undei, iar Memoria descoperă anomalia temporală;
- cele cinci sigilii se curbează la Pământ și închid vizibil al patrulea arc; apoi se deschid în zece trasee luminoase egale;
- replica Căpitanului de la 5:01 este acum `Cinci posturi. Zece urme. Un singur echipaj.`;
- toate referințele narative la zece fragmente, zece stații sau zece tablete au fost eliminate.

### 20.3 Mecanica celor cinci tablete

Fiecare tabletă landscape este fixată între cei doi copii și are două zone egale. Fiecare copil poate atinge sau observa independent, iar răspunsurile pot fi identice sau diferite. Lentilele aparțin postului, nu exclusiv unui copil, pentru ca adultul să nu fie obligat să arbitreze rolurile.

Cele trei interacțiuni păstrează timpul fix și au fallback complet. La expirare, tableta cere ridicarea privirii și povestea continuă fără confirmare `5/5`, loading sau intervenție de operator. Dacă un dispozitiv se deconectează, perechea rămâne în poveste ca observator.

Cerințele de producție adăugate sunt: ținte de minimum 56 × 56 CSS px, spațiu de minimum 8 px, etichetă plus simbol, contrast verificat și cel puțin un suport reglabil ca înălțime și unghi. Dacă opțiunile nu încap, cele două jumătăți sunt prezentate succesiv; țintele nu sunt micșorate. Pentru traseul low-sensory, vibrația se reduce global la cerere dacă instalația nu o poate izola fizic pe un singur post.

### 20.4 Topologia ecranelor și Căpitanul

Scenariul definește o singură compoziție globală decupată pe cinci ecrane, nu cinci copii identice. Topologia logică este `left-outer`, `left-inner`, `center`, `right-inner`, `right-outer`, asociată în ordine celor cinci posturi.

Ecranul `center`, pe care configurația exemplu redă deja GLB-ul, conține unica fereastră a Căpitanului. Celelalte patru renderere trebuie să aibă `showAvatar: false` și să nu instanțieze modelul. Avatarul navei a devenit numai voce și HUD, fără al doilea corp umanoid; civilizațiile rămân forme non-umanoide. Indicațiile de robot fizic au fost înlocuite cu cue-uri realizabile de privire, cap, clipit, respirație, expresie, lip-sync și cadraj GLB.

### 20.5 Continuitatea de la 8:45

Eticheta tehnică `epilogue` nu mai reprezintă o schimbare vizibilă de experiență. La 8:45:

- publicul rămâne la aceleași cinci posturi, cu aceleași ecrane și tablete;
- ultimul cadru al Pământului persistă peste schimbarea fazei;
- marginea albastră se extinde continuu într-un alb cald;
- nota a patra și ambianța se suprapun fără oprire;
- HUD-ul și sigiliile se transformă, fără ramă neagră sau reset vizibil;
- tabletele pulsează automat și nu solicită o nouă acțiune;
- Căpitanul reapare numai în aceeași fereastră GLB pentru jurnal și încheiere.

Orice referire la VR, căști sau mutarea copiilor în timpul celor zece minute a fost eliminată din versiunea curentă a scenariului.

### 20.6 Audit și verificări

Cei trei consultanți existenți au fost reactivați și au auditat independent versiunea 3:

- `scenarist`: **VERDE** după ce cele cinci lentile au primit funcții cauzale și al patrulea arc a primit payoff vizual;
- `regizor_film`: **VERDE CA SCENARIU** după fixarea topologiei celor cinci ecrane și a rendererului GLB unic;
- `expert_copii`: **VERDE** după corectarea regulii de pereche, a ramurii adaptive, a accesibilității tactile și a vibrației low-sensory.

Verificările automate finale pentru document:

- durată totală: 600 s exact;
- 48 de replici și 475 de cuvinte;
- 17 intervenții ale Căpitanului;
- anexa Căpitanului este identică cu textul din scenariul principal, inclusiv timecode-urile;
- zero coliziuni la 120 cuvinte/minut plus minimum 1 s buffer;
- `git diff --check` fără erori de whitespace.

### 20.7 Limită de etapă

Această schimbare finalizează **scenariul**, nu implementarea lui în player. `assets/show/show.json`, interfața tabletelor și configurația efectivă cu cinci ecrane nu au fost încă rescrise după versiunea 3. Lista exactă a cue-urilor și cerințelor necesare implementării se află la finalul scenariului.

---

## 21. ADDENDUM APPEND-ONLY — vocile expresive V3 pentru Căpitan și Avatarul Navei (Codex, 2026-09-04)

> Această secțiune a fost adăugată la final. Nicio secțiune anterioară din `HANDOFF.md` nu a fost rescrisă sau ștearsă.

### 21.1 Rezultatul livrat

Au fost generate toate cele **35 de intervenții vocale** Căpitan/Avatar din scenariul regizoral V3:

- 17 fișiere pentru `CAPITANUL`, cu vocea profesională română „Paul Bogorin” furnizată de utilizator;
- 18 fișiere pentru `AVATAR_AI`, cu vocea profesională română „AGEIS-7 - AI Alignment == 4/10” furnizată de utilizator;
- 354 de cuvinte vorbite în total: 138 Căpitanul și 216 Avatarul Navei;
- MP3 mono, 44,1 kHz, 192 kbps, cu timpi de cuvinte pentru lip-sync în `assets/voice/ro/manifest.json`;
- durată vocală cumulată în manifest: 210,84 s.

Cheia API transmisă de utilizator a fost injectată numai în mediul proceselor de generare și QA. Nu a fost scrisă în `.env`, cod, manifest, documentație sau Git. O scanare finală după un marker intern al cheii a confirmat absența ei din proiect.

### 21.2 Sursa vocală și interpretarea

A fost creat `assets/show/voice-script-v3.json`, sursa deterministă pentru cele 35 de cue-uri. Fiecare cue conține:

- speaker, fază, timp public și timp intern de player;
- text românesc identic cu scenariul;
- direcție actoricească în limbaj natural;
- maximum de durată admis;
- ID de voce, model, seed și setări de interpretare;
- taguri expresive precum `thoughtful`, `warmly`, `whispers`, `precise`, `reassuring` sau `authoritative`, acolo unde modelul le suportă.

Modelul principal este `eleven_v3`, ales pentru controlul prin taguri audio, punctuație și inflexiuni. O singură replică foarte strânsă temporal, `v3-ai-0035`, folosește `eleven_multilingual_v2` cu parametri proprii de stabilitate, stil și viteză. Generatorul nu introduce tagurile în timpii de lip-sync și nu le lasă să fie citite ca text.

### 21.3 Generatorul și controlul ferestrelor temporale

`src/server/tts-providers.ts` acceptă acum control vocal per cue: `voiceId`, `modelId`, taguri audio, setări de voce, seed și format de ieșire. `scripts/tts-generate.mjs` acceptă `--source <json>`, include toate controalele în cheia de generație și salvează proveniența completă în manifest.

Dacă o interpretare expresivă depășește fereastra fixă, generatorul aplică automat `ffmpeg atempo`, recalculează timpii cuvintelor și notează factorul în `postprocessTempo`. Această protecție a fost necesară pentru patru cue-uri: `v3-ai-0035`, `v3-cap-0604`, `v3-ai-0651` și `v3-ai-0718`. Niciunul dintre cele 35 de fișiere finale nu depășește fereastra lui.

### 21.4 Corecția regizorală de la 1:09

Primul audit de film a blocat replica Căpitanului de la 1:09: versiunea inițială dura 8,40 s, dar avea aproximativ 153 cuvinte/minut, mai rapid decât prologul de aproximativ 110 cuvinte/minut, deși indicația cerea o rostire mai lentă și contemplativă. Fereastra de 15 s ar fi permis și intrarea peste dispariția Pământului și tăcerea de la 1:20.

Replica a fost rescrisă în scenariul principal, în anexa Căpitanului și în sursa vocală ca:

> Pământul se îndepărtează. Păstrați-i imaginea. Când îl vom revedea, noi vom fi alții.

Fereastra maximă a devenit 10,8 s, iar interpretarea regenerată durează 7,36 s, aproximativ 106 cuvinte/minut. Se termină la aproximativ 1:16,36 și lasă peste trei secunde curate înainte de momentul de la 1:20. După această corecție, regizorul a dat verdictul `VERDE`. Scenariul principal are acum 48 de replici și 467 de cuvinte.

### 21.5 Proprietatea corpului și lip-sync-ul

Contractul runtime a fost corectat pentru cerința fizică actuală:

- `CAPITANUL` este singurul speaker cu `lipsyncAvatar: true` și vorbește prin personajul GLB de pe ecranul central;
- `AVATAR_AI` este vocea și HUD-ul navei, cu `lipsyncAvatar: false`, fără corp umanoid;
- comanda de test din player folosește acum Căpitanul și o replică dedicată lui;
- aceeași decizie este consemnată în `docs/DECIZII.md` și în comentariile contractului `src/shared/types.ts`.

### 21.6 Instrumente de verificare și audiție

Au fost adăugate:

- `scripts/validate-voice-script.mjs`: compară automat textul, ordinea, speakerul, timecode-ul și faza tuturor cue-urilor cu scenariul V3; verifică fișierele, ferestrele și absența tagurilor din lip-sync;
- `scripts/build-voice-reels.mjs`: construiește două montaje cu pauze de 0,75 s între replici;
- `scripts/qa-voice-transcription.mjs`: retranscrie montajele cu ElevenLabs Scribe v2 și măsoară WER, fără a salva cheia;
- comenzile npm `validate:voices`, `voice:reels` și `qa:voices`; `validate:voices` face parte acum din `npm run check`;
- instrucțiuni de regenerare și audiție în `README.md`.

Montajele rezultate sunt:

- `assets/voice/ro/preview-capitan-v3.mp3`: 17 replici, 92,93 s;
- `assets/voice/ro/preview-avatar-v3.mp3`: 18 replici, 145,09 s.

QA-ul final de retranscriere a identificat româna (`ron`) și a obținut WER 2,9% pentru Căpitan și 6,5% pentru Avatar, mult sub pragul automat de 18%. Niciun tag actoricesc în limba engleză nu a fost rostit.

### 21.7 Audit și verificări finale

Verdictele consultanților după generare și corecție:

- `scenarist`: **VERDE** pentru concordanța integrală dintre scenariu, sursa vocală și manifest;
- `regizor_film`: a identificat blocajul de la 1:09, apoi **VERDE** după rescriere și regenerare;
- `expert_copii`: **VERDE** pentru ton, claritate, ritm și siguranța ferestrelor.

Verificări tehnice finale:

- `npm run check`: trecut integral — TypeScript, show existent, cele 35 de voci V3, build și toate cele trei smoke tests;
- `npm run validate:voices`: 35/35 cue-uri identice cu scenariul, 17 Căpitan și 18 Avatar;
- `npm run qa:voices`: trecut pentru ambele montaje;
- `git diff --check`: fără erori de whitespace;
- toate fișierele audio sunt ne-goale și se încadrează în durata maximă alocată;
- markerul cheii API lipsește din fișierele proiectului.

### 21.8 Limită de integrare rămasă

Vocile V3, manifestul și timpii de lip-sync sunt finalizate și pregătite pentru player, dar nu au fost amestecate în `assets/show/show.json`, care execută încă vechea versiune de scenariu. `voice-script-v3.json` rămâne intenționat separat până când cue-urile vizuale, interactive și vocale ale întregului scenariu V3 sunt migrate împreună; astfel aplicația nu redă simultan două versiuni incompatibile ale poveștii.

---

## 22. ADDENDUM APPEND-ONLY — fișă completă de preluare pentru următorul agent (Codex, 2026-09-04)

> Această secțiune a fost adăugată la final la cererea expresă a utilizatorului, pentru ca un agent ulterior, inclusiv Fable 5.1, să poată continua fără reconstrucția contextului. Nicio secțiune anterioară din `HANDOFF.md` nu a fost rescrisă sau ștearsă. Cheia API nu este reprodusă aici, chiar dacă utilizatorul a permis folosirea ei, deoarece nu este necesară preluării și este un secret temporar.

### 22.1 Starea Git exactă la predare

- repository: `C:\Users\Chris\Documents\GitHub\Nava`;
- branch: `board/nava-player`;
- commit de scenariu V3 și configurație cu cinci posturi: `f742047 docs: adapt screenplay to five continuous stations`;
- commit cu toate vocile, generatorul, validările și §21: `b09e747 feat: generate expressive V3 character voices`;
- înainte de acest addendum, working tree-ul era curat;
- acest §22 trebuie comis separat după verificare.

### 22.2 Ordinea autorității — important pentru a nu reveni accidental la o versiune veche

La continuare, adevărul curent trebuie citit în ordinea următoare:

1. cerințele utilizatorului consemnate în §20: cinci posturi, cinci tablete, zece copii în cinci perechi, experiență continuă, Căpitan numai GLB pe ecranul central;
2. `docs/SCENARIU-REGIZORAL-10-MIN.md`, versiunea 3, inclusiv corecția replicii de la 1:09;
3. `assets/show/voice-script-v3.json` pentru cele 35 de cue-uri vocale Căpitan/Avatar;
4. `assets/voice/ro/manifest.json` pentru fișierele generate și alinierea pe cuvinte;
5. `assets/show/show.json` este încă implementarea executabilă **veche** și nu trebuie folosit ca sursă creativă pentru rescrierea V3.

Secțiunile mai vechi din `HANDOFF.md` au fost păstrate ca istoric, conform ordinului append-only. Dacă se contrazic cu §20–§22, prevalează addendumurile mai noi.

### 22.3 Ce a fost făcut în etapa de scenariu

Au fost folosiți trei consultanți separați: `scenarist`, `regizor_film` și `expert_copii`. Scenariul a fost reconstruit ca `Protocolul Acasă`, pe exact 10:00, apoi adaptat după clarificările utilizatorului:

- cinci posturi fizice și cinci tablete, fiecare post folosit de o pereche;
- două urme egale per post, fără lider impus și fără consens obligatoriu;
- cele cinci lentile funcționale NAVIGAȚIE, PROPULSIE, COMUNICAȚII, BIOSEMNALE și MEMORIE;
- o singură experiență fără mutarea copiilor, schimbarea dispozitivelor, căști sau VR;
- continuitate vizuală și sonoră peste limita tehnică `play`/`epilogue` de la 8:45;
- Căpitanul există numai ca GLB pe ecranul central, niciodată ca robot/actor în sală;
- Avatarul Navei este numai voce și HUD, fără al doilea corp umanoid;
- 48 de replici în scenariul complet, dintre care 17 ale Căpitanului;
- anexa `TEXTUL INTEGRAL AL CĂPITANULUI` este foaia de interpretare și trebuie să rămână identică cu replicile din corpul scenariului;
- după corecția vocală de la 1:09, scenariul are 467 de cuvinte vorbite.

### 22.4 Ce a fost făcut în etapa de voce

Utilizatorul a furnizat două ID-uri ElevenLabs:

- `Z1I8XGyUmANP9h72LN2z` — Căpitanul, vocea „Paul Bogorin”;
- `Q8ZbQAANLFvLw8uPBR8d` — Avatarul Navei, vocea „AGEIS-7”.

Metadatele vocilor au fost verificate prin API: ambele sunt voci profesionale verificate pentru limba română. Modelul expresiv principal este `eleven_v3`. S-a confirmat practic faptul că:

- v3 acceptă taguri audio în text și întoarce alignment de caractere;
- tagurile apar în alignment-ul brut, deci adaptorul trebuie să le elimine explicit din lista cuvintelor de lip-sync;
- v3 nu acceptă `use_pvc_as_ivc`; încercarea cu această opțiune a întors HTTP 400, iar opțiunea a fost eliminată;
- pauzele și ritmul pentru v3 se dirijează prin taguri, punctuație și structurarea textului, nu prin SSML break;
- `v3-ai-0035` a fost mai sigur temporal cu `eleven_multilingual_v2`, fără taguri, cu speed 1.2 și setări proprii.

Cheia API a fost pusă doar în `ELEVENLABS_API_KEY` pentru procesele care au făcut generare și retranscriere. Nu există `.env` creat pentru ea și nu a fost introdusă în istoricul Git.

### 22.5 Inventarul complet al cue-urilor generate

Coloanele sunt: ID, timpul public, faza/timpul intern, speaker, durata finală/fereastra maximă, model, factor `atempo`. Valoarea `—` înseamnă că nu a fost necesară postprocesarea; valoarea `1` pentru cue-ul regenerat de la 1:09 înseamnă niciun retiming efectiv.

| Cue | Public | Intern | Speaker | Durată / max | Model | atempo |
|---|---:|---|---|---:|---|---:|
| `v3-cap-0004` | 4 s | preshow@4 | CAPITANUL | 10,24 / 10,8 s | eleven_v3 | — |
| `v3-ai-0015` | 15 s | preshow@15 | AVATAR_AI | 8,32 / 8,8 s | eleven_v3 | — |
| `v3-cap-0024` | 24 s | preshow@24 | CAPITANUL | 8,72 / 10 s | eleven_v3 | — |
| `v3-ai-0035` | 35 s | preshow@35 | AVATAR_AI | 7,65 / 7,8 s | eleven_multilingual_v2 | 1,4812× |
| `v3-cap-0043` | 43 s | preshow@43 | CAPITANUL | 4,00 / 6 s | eleven_v3 | — |
| `v3-cap-0109` | 69 s | play@9 | CAPITANUL | 7,36 / 10,8 s | eleven_v3 | 1 |
| `v3-ai-0125` | 85 s | play@25 | AVATAR_AI | 7,60 / 10 s | eleven_v3 | — |
| `v3-ai-0136` | 96 s | play@36 | AVATAR_AI | 5,60 / 23 s | eleven_v3 | — |
| `v3-ai-0206` | 126 s | play@66 | AVATAR_AI | 8,00 / 17 s | eleven_v3 | — |
| `v3-cap-0310` | 190 s | play@130 | CAPITANUL | 5,36 / 13 s | eleven_v3 | — |
| `v3-ai-0352` | 232 s | play@172 | AVATAR_AI | 8,16 / 22 s | eleven_v3 | — |
| `v3-cap-0501` | 301 s | play@241 | CAPITANUL | 4,80 / 4,9 s | eleven_v3 | — |
| `v3-ai-0512` | 312 s | play@252 | AVATAR_AI | 6,00 / 21 s | eleven_v3 | — |
| `v3-ai-0534` | 334 s | play@274 | AVATAR_AI | 9,44 / 21 s | eleven_v3 | — |
| `v3-cap-0604` | 364 s | play@304 | CAPITANUL | 1,65 / 1,8 s | eleven_v3 | 1,1636× |
| `v3-cap-0642` | 402 s | play@342 | CAPITANUL | 1,76 / 2 s | eleven_v3 | — |
| `v3-ai-0651` | 411 s | play@351 | AVATAR_AI | 1,85 / 2 s | eleven_v3 | 1,6000× |
| `v3-cap-0654` | 414 s | play@354 | CAPITANUL | 1,84 / 2 s | eleven_v3 | — |
| `v3-ai-0718` | 438 s | play@378 | AVATAR_AI | 8,65 / 8,8 s | eleven_v3 | 1,1468× |
| `v3-cap-0727` | 447 s | play@387 | CAPITANUL | 1,36 / 1,7 s | eleven_v3 | — |
| `v3-ai-0729` | 449 s | play@389 | AVATAR_AI | 7,04 / 8 s | eleven_v3 | — |
| `v3-cap-0738` | 458 s | play@398 | CAPITANUL | 2,72 / 3 s | eleven_v3 | — |
| `v3-ai-0742` | 462 s | play@402 | AVATAR_AI | 2,16 / 7,8 s | eleven_v3 | — |
| `v3-cap-0750` | 470 s | play@410 | CAPITANUL | 2,00 / 3 s | eleven_v3 | — |
| `v3-ai-0754` | 474 s | play@414 | AVATAR_AI | 7,60 / 7,8 s | eleven_v3 | — |
| `v3-cap-0802` | 482 s | play@422 | CAPITANUL | 5,92 / 6 s | eleven_v3 | — |
| `v3-ai-0809` | 489 s | play@429 | AVATAR_AI | 10,16 / 10,8 s | eleven_v3 | — |
| `v3-cap-0829` | 509 s | play@449 | CAPITANUL | 7,20 / 8 s | eleven_v3 | — |
| `v3-ai-0838` | 518 s | play@458 | AVATAR_AI | 4,80 / 4,8 s | eleven_v3 | — |
| `v3-cap-0843` | 523 s | play@463 | CAPITANUL | 0,80 / 1,8 s | eleven_v3 | — |
| `v3-ai-0850` | 530 s | epilogue@5 | AVATAR_AI | 11,44 / 17 s | eleven_v3 | — |
| `v3-ai-0908` | 548 s | epilogue@23 | AVATAR_AI | 8,16 / 11 s | eleven_v3 | — |
| `v3-cap-0920` | 560 s | epilogue@35 | CAPITANUL | 4,56 / 9 s | eleven_v3 | — |
| `v3-ai-0930` | 570 s | epilogue@45 | AVATAR_AI | 8,24 / 12 s | eleven_v3 | — |
| `v3-cap-0943` | 583 s | epilogue@58 | CAPITANUL | 9,68 / 10 s | eleven_v3 | — |

Toate cele 35 de fișiere individuale se află în `assets/voice/ro/`, cu numele `<cue>.mp3`. Manifestul conține text, speaker, durată, `words`, `wtimes`, `wdurations`, provider, direcție, model, voice ID, taguri, setări, factor de postprocesare, generation key și data generării.

### 22.6 Fișiere create sau schimbate în commitul vocal

Surse și documentație:

- `assets/show/voice-script-v3.json` — nou; sursa celor 35 de replici;
- `docs/SCENARIU-REGIZORAL-10-MIN.md` — replica 1:09 corectată în corp și anexă;
- `docs/DECIZII.md` — ADR-09 actualizat: Căpitan GLB, Avatarul Navei numai voce/HUD;
- `README.md` — comenzile V3 și avertismentul privind separarea de `show.json`;
- `HANDOFF.md` — §21 și prezentul §22, numai prin adăugare la final;
- `package.json` — comenzile `validate:voices`, `voice:reels`, `qa:voices`; validatorul vocal inclus în `check`.

Cod:

- `src/server/tts-providers.ts` — controale ElevenLabs per cue, taguri v3, seed, output format, voice settings și curățarea tagurilor din alignment;
- `scripts/tts-generate.mjs` — `--source`, generation key dependent de setări, metadate extinse, retiming `ffmpeg atempo` și scalarea alignment-ului;
- `scripts/validate-voice-script.mjs` — validare screenplay ↔ source ↔ manifest/audio;
- `scripts/build-voice-reels.mjs` — două montaje de audiție cu 0,75 s pauză;
- `scripts/qa-voice-transcription.mjs` — Scribe v2, română, calcul WER și detecția tagurilor rostite;
- `src/shared/types.ts` — inversarea corectă a proprietății lip-sync: Căpitan `true`, Avatarul Navei `false`;
- `src/renderer/player.ts` — butonul/comanda `testAvatar` testează în realitate Căpitanul GLB cu replica `Căpitanul EXODUS-7 online. Vă aud, echipaj.`.

Audio:

- `assets/voice/ro/manifest.json` — 35 intrări V3;
- `assets/voice/ro/v3-cap-*.mp3` — 17 fișiere;
- `assets/voice/ro/v3-ai-*.mp3` — 18 fișiere;
- `assets/voice/ro/preview-capitan-v3.mp3` — 92,93 s;
- `assets/voice/ro/preview-avatar-v3.mp3` — 145,09 s.

### 22.7 Comenzi de lucru pentru agentul următor

Verificarea completă fără apeluri plătite:

```powershell
npm run check
```

Verificarea doar a contractului vocal:

```powershell
npm run validate:voices
```

Regenerarea montajelor locale, fără API:

```powershell
npm run voice:reels
```

Regenerarea tuturor vocilor, numai cu `ELEVENLABS_API_KEY` prezent în mediul procesului:

```powershell
npm run tts -- --source assets/show/voice-script-v3.json --provider elevenlabs --force
```

Regenerarea unui singur cue:

```powershell
npm run tts -- --source assets/show/voice-script-v3.json --provider elevenlabs --cue v3-cap-0109 --force
```

QA-ul de retranscriere, care face apeluri API și necesită cheia în mediu:

```powershell
npm run qa:voices
```

Pornirea aplicației în dezvoltare:

```powershell
npm run dev -- --windowed
```

Consola operatorului este la `http://localhost:4321/control/`; aplicația tabletelor este la `http://<IP-PC>:4321/tablet/`.

### 22.8 Rezultatele de QA care trebuie păstrate ca baseline

Ultima rulare completă `npm run check` a trecut:

- `tsc --noEmit`;
- validatorul `show.json`: 8 scene, 53 cue-uri, dintre care 24 voice în versiunea executabilă veche;
- validatorul V3: 35/35 cue-uri, 17 Căpitan și 18 Avatar;
- build-urile main, preload, renderer, control și tablet;
- `smoke:core`;
- `smoke:platform`;
- `smoke:media`.

Ultimul QA Scribe v2:

- Căpitanul: 136 cuvinte detectate din 138 așteptate, WER 2,9%;
- Avatarul Navei: 217 cuvinte detectate din 216 așteptate, WER 6,5%;
- pragul automat este 18%;
- niciun tag actoricesc nu a fost rostit.

Verificările suplimentare au confirmat:

- MP3 mono la 44,1 kHz și 192 kbps;
- zero depășiri ale ferestrelor de cue măsurate cu `ffprobe`;
- `git diff --check` fără erori;
- nicio urmă a markerului cheii API în fișierele proiectului;
- verdicte finale `VERDE` de la scenarist, regizor și expertul pentru copii.

### 22.9 Limitarea executabilă exactă — nu trebuie ratată

`assets/show/show.json` conține încă 24 de cue-uri vocale vechi, cu ID-uri precum `pre-01`, `launch-01`, `light-01`, `nature-01`, `tech-01`, `rev-01` și `epi-01`. Manifestul actual conține numai cele 35 de ID-uri `v3-*`. Prin urmare:

- rularea executabilului actual **nu redă automat noile fișiere V3**;
- pentru vechile ID-uri, sistemul va ajunge la fallback-ul live/cache/vocea Windows, în funcție de configurare;
- nu trebuie copiate doar vocile V3 peste vechiul `show.json`, fiindcă replicile ar intra într-o structură vizuală și interactivă incompatibilă;
- migrarea corectă este atomică: întregul scenariu V3, cue-urile vizuale, interacțiunile tabletelor, fazele și cele 35 de voci trebuie trecute împreună în sursa executabilă.

Această limitare este intenționată și a fost aleasă pentru a nu produce o demonstrație aparent funcțională, dar dramaturgic falsă.

### 22.10 Următorul pachet de lucru recomandat

Următorul agent trebuie să implementeze integral scenariul V3, nu să-l rescrie creativ. Ordinea sigură este:

1. citește complet `docs/SCENARIU-REGIZORAL-10-MIN.md`, §20–§22 și validatorul existent;
2. definește/migrează structura completă de scene și cue-uri V3 în sursa executabilă;
3. păstrează exact ID-urile vocale `v3-*`, astfel încât manifestul existent să fie folosit fără regenerare;
4. implementează cele cinci lentile și cele cinci tablete pentru perechi, cu două zone egale, timeout și fallback observator;
5. configurează topologia `left-outer`, `left-inner`, `center`, `right-inner`, `right-outer`, cu `showAvatar: true` numai pe `center`;
6. păstrează continuitatea la 8:45, chiar dacă motorul schimbă intern faza în `epilogue`;
7. validează că numai `CAPITANUL` mișcă GLB-ul și că `AVATAR_AI` produce sunet/HUD fără a deschide un corp;
8. testează redarea de la început, seek înainte/înapoi, reconnect tabletă, timeout fără input și trecerea play→epilogue;
9. rulează `npm run check`, apoi o audiție reală pe sistemul de sunet și un test pe toate cele cinci ecrane/tablete;
10. actualizează din nou `HANDOFF.md` numai prin adăugare la final și comite schimbarea.

### 22.11 Invariante și capcane pentru Fable 5.1 sau alt succesor

- Nu rescrie și nu curăța retroactiv `HANDOFF.md`; adaugă numai o secțiune nouă la final.
- Nu introduce cheia API în `.env`, source, documentație, manifest, output de test sau commit.
- Nu regenera vocile deja aprobate doar pentru că există acces API; păstrează asset-urile și seed-urile dacă textul nu se schimbă.
- Dacă o replică se schimbă, actualizează simultan scenariul, anexa Căpitanului dacă este cazul, `voice-script-v3.json`, audio, manifest și montajul relevant.
- Nu transforma Avatarul Navei într-un al doilea personaj GLB.
- Nu muta Căpitanul în sală și nu introduce robot fizic, actor sau voce off separată de fereastra lui GLB.
- Nu transforma cele cinci posturi în zece tablete sau zece stații.
- Nu cere consens în pereche și nu condiționa continuarea de participarea tuturor tabletelor.
- Nu face pauză vizibilă, loading sau reset la 8:45.
- Nu considera `show.json` vechi drept scenariu aprobat; este doar starea executabilă de migrat.
- Nu șterge fallback-urile TTS existente până când manifestul V3 este integrat și testat în scenariul executabil.
- `ffmpeg` trebuie să fie disponibil în PATH pentru retiming și montaje.
- `npm run qa:voices` consumă API; `npm run check` nu consumă API.

---

## 23. ADDENDUM APPEND-ONLY — launcher Windows end-to-end `RUN.bat` (Codex, 2026-09-04)

> Această secțiune a fost adăugată la final. Nicio secțiune anterioară din `HANDOFF.md` nu a fost rescrisă sau ștearsă.

La cererea utilizatorului a fost creat `RUN.bat` în rădăcina proiectului, astfel încât un dublu-click să pornească întregul stack local. Launcherul:

- își fixează working directory-ul la folderul în care se află, deci funcționează și când este lansat din Explorer;
- verifică existența `node.exe`, `npm.cmd` și impune Node.js 22+;
- verifică `package.json` și `package-lock.json`;
- creează `config.json` din `config.example.json` numai dacă lipsește și nu suprascrie niciodată configurația existentă;
- verifică înainte de pornire `assets/show/show.json`, `assets/avatar/avatar-ai.glb` și `media/cinema_4k_h264.mp4`;
- rulează `npm ci --no-audit --no-fund` numai dacă instalarea locală Electron lipsește;
- rulează build-ul prin comanda npm existentă și pornește Electron, serverul Hono/WebSocket, consola și endpoint-ul tabletelor în același proces de aplicație;
- așteaptă până la 45 s după răspunsul `http://localhost:4321/control/`, apoi deschide automat consola în browserul implicit;
- păstrează consola batch deschisă cât timp rulează aplicația, astfel încât logurile de startup să fie vizibile;
- la eroare păstrează fereastra deschisă prin `pause` și indică folderul `runs\` pentru loguri;
- la închiderea normală a aplicației termină cu exit code 0.

Modul implicit de dublu-click adaugă `--windowed`, pentru ca aplicația să poată fi închisă ușor în dezvoltare. Sunt disponibile:

```text
RUN.bat               pornire windowed + deschidere automată a consolei web
RUN.bat --kiosk       respectă kiosk/fullscreen din config.json
RUN.bat --no-control  nu deschide automat browserul
RUN.bat --check       rulează npm run check fără a lansa playerul
RUN.bat --help        afișează opțiunile
```

`README.md` și `docs/OPERARE.md` au fost actualizate cu această cale de pornire. Launcherul nu conține și nu solicită cheia ElevenLabs la pornirea obișnuită; folosește vocile pre-generate disponibile și mecanismele de fallback existente.

### 23.1 Verificarea launcherului

Au fost testate trei trasee reale:

- `cmd.exe /d /c RUN.bat --help`: exit 0 și afișarea corectă a tuturor opțiunilor;
- `cmd.exe /d /c RUN.bat --check --no-control`: exit 0 după TypeScript, ambele validatoare, build și cele trei smoke tests;
- `cmd.exe /d /c RUN.bat`: startup end-to-end reușit în modul windowed.

La testul complet, logul a confirmat:

- build reușit pentru main, preload, renderer, control și tablet;
- încărcarea `config.json` în rol master;
- găsirea filmului de 2,5 GB, a GLB-ului, a show-ului și a directorului de voci;
- server pe portul 4321 și WebSocket local conectat;
- fereastra `center` creată;
- `show.json` încărcat cu 53 de cue-uri;
- metadata filmului 3840×2052, 741,78 s;
- avatar GLB `ready`;
- `GET http://localhost:4321/control/` → HTTP 200, 6438 bytes;
- închiderea ferestrei a declanșat shutdown normal, deconectare WebSocket și oprirea serverului; portul 4321 a fost eliberat.

---

## 24. ADDENDUM APPEND-ONLY — remediere input pe ecran și taste în `IDLE` (Codex, 2026-09-04)

> Această secțiune a fost adăugată la final. Nicio secțiune anterioară din `HANDOFF.md` nu a fost rescrisă sau ștearsă.

Utilizatorul a raportat că apăsarea ecranului sau a tastelor nu producea nimic. Logul real `runs/app-20260904-202444.jsonl` a arătat că inputul de tastatură ajungea în renderer, dar `Space` trimitea comanda `play` în starea `idle`, iar serverul o respingea repetat cu `PLAY funcționează doar din PAUZĂ (folosește START)`. Clickul pe suprafața filmului nu avea niciun handler, iar singurul strat clickabil era veil-ul de autoplay, afișat doar când browserul refuza redarea. Problema era deci de contract și affordance, nu de focus sau de capturarea tastelor.

Remedierea aplicată:

- `src/server/state.ts`: `play` din `idle` este acum echivalent cu pornirea unei sesiuni noi; apelează `onRunStart`, intră în faza `play` la `-launchLeadInSec` și pornește countdown-ul;
- `src/renderer/index.html`: a fost adăugat un panou de lansare vizibil numai pe ecranul master/sursa de ceas în starea `idle`;
- panoul conține **PORNEȘTE EXPERIENȚA**, **PRE-SHOW**, plus indicațiile `Space`, `Enter`, `S`, `P`, `O` și `F`;
- click oriunde pe panou sau butonul principal trimite `start`; butonul secundar trimite `preshow`;
- `Space` în `idle` funcționează acum prin contractul `play`; `Enter` în `idle` trimite direct `start`;
- tastele `Space`/`Enter` pe un buton focalizat sunt lăsate browserului, evitând dublarea comenzii;
- panoul se ascunde automat la orice ieșire din `idle` și reapare după `restart`;
- textul veil-ului de autoplay a fost corectat: acel click activează sunetul și continuă, nu pretinde că inițiază nava;
- `src/renderer/styles.css`: a fost adăugată interfața responsive, cu ținte mari, focus vizibil, contrast și cursor activ;
- comentariul vechi care spunea că GLB-ul apare la prima replică `AVATAR_AI` a fost corectat la `CAPITANUL`;
- `scripts/smoke-core.mjs`: există acum regresie automată care cere ca `PLAY` din `IDLE` să înceapă show-ul și să creeze o singură sesiune;
- `README.md` și `docs/OPERARE.md` explică noul comportament click/Space/Enter.

Validare:

- `npm run check`: trecut integral;
- test real prin `RUN.bat --no-control`: aplicația, serverul, filmul și avatarul au pornit fără eroare;
- înainte de comandă `/api/state` a raportat `idle`;
- `POST /api/cmd` cu `{ "cmd": { "action": "play" } }` a răspuns `ok: true`;
- după comandă, `/api/state` a raportat `playing`, timp negativ în countdown și rată 1;
- rendererul a aplicat `play` și a declanșat cue-urile de launch/countdown;
- închiderea ferestrei a oprit curat serverul și procesul launcherului.

Pentru a vedea remedierea, orice instanță pornită înainte de acest commit trebuie închisă, apoi `RUN.bat` trebuie lansat din nou; build-ul este executat automat la fiecare pornire.

---

## 25. ADDENDUM APPEND-ONLY — curățenie vocală V3, experiență executabilă și tablete 5×2 (Codex + agenții scenarist/regizor/expert copii, 2026-09-04)

> Această secțiune a fost adăugată strict la final. Nicio secțiune anterioară din `HANDOFF.md` nu a fost rescrisă sau ștearsă.
>
> **Această secțiune înlocuiește operațional limitările și pașii rămași descriși în §22.9–§22.11 și comportamentul de start descris în §24.** Starea executabilă curentă este `show.json` v`0.4.0-v3-complete`, cu 87 cue-uri și 51 de asset-uri vocale V3. Clickul principal/`Space`/`Enter` din idle pornește acum pre-show-ul complet; `S` sau **SARI LA LANSARE** omit pre-show-ul.

### 25.1 Incidentul raportat și cauza reală

Utilizatorul a raportat că TTS-ul de la început este inacceptabil. Cauza nu era vocea V3 generată, ci faptul că sursa executabilă `assets/show/show.json` conținea încă 24 de ID-uri vocale legacy (`pre-01`, `launch-01` etc.), în timp ce manifestul local conținea ID-uri `v3-*`. Playerul nu găsea clipul local, încerca `/api/tts`, primea eroare deoarece nu există cheie la runtime, apoi cădea pe `speechSynthesis`/vocea Windows. Așadar pista V3 exista pe disc, dar era ocolită de show-ul executabil.

Remedierea este structurală, nu cosmetică:

- toate vocile legacy au fost scoase din `show.json`;
- toate asset-urile V3 sunt sincronizate cu aceleași ID-uri, texte, vorbitori și timpi;
- fiecare cue vocal de producție are `fallback: "silent"`;
- dacă un MP3 lipsește, rendererul afișează subtitrarea, păstrează fereastra de timp prin tăcere și scrie o eroare explicită; nu apelează browserul/Windows;
- fallback-ul browser rămâne în motor numai pentru cue-uri ad-hoc/de test care îl permit explicit;
- mesajele de startup nu mai afirmă înșelător că lipsa `.env` activează automat vocea browserului pentru spectacol.

### 25.2 Pista vocală completă

`assets/show/voice-script-v3.json` este acum v`3.2.0-adaptive-complete`. Conține 51 de asset-uri:

- 17 replici `CAPITANUL`;
- 18 replici `AVATAR_AI`;
- 16 replici/variante pentru LUMINA, NATURA, TEHNOLOGIC și ecourile finale.

Într-o reprezentație se redau 49 de clipuri, nu 51, deoarece la 6:35 serverul selectează exact una dintre cele trei variante TEHNOLOGIC. Toate cele 51 rămân în manifest și show pentru disponibilitate și operare manuală.

Vocile configurate sunt:

- Căpitan: ElevenLabs voice ID `Z1I8XGyUmANP9h72LN2z` (`Paul Bogorin`);
- Avatarul Navei: `Q8ZbQAANLFvLw8uPBR8d` (`AGEIS-7`);
- LUMINA: `GRHbHyXbUO8nF4YexVTa` (`Anca — Warm Voice for Every Story`);
- NATURA: `9nKRcmsd1bEJbszIZ2HO` (`Vasile Poenaru`);
- TEHNOLOGIC: `3z9q8Y7plHbvhDZehEII` (`Antonia`).

Cheia API oferită temporar de utilizator a fost folosită numai ca variabilă de proces pentru generare și QA. Nu a fost scrisă în `.env`, cod, manifest, loguri, documentație sau commit. O scanare după un fragment distinct al cheii a ieșit curată pe întregul proiect, inclusiv `runs/`.

Au fost adăugate cele 16 asset-uri care lipseau din setul inițial de 35:

- `v3-light-0224.mp3`, `v3-light-0236.mp3`, `v3-light-0258.mp3`;
- `v3-nature-0415.mp3`, `v3-nature-0433.mp3`, `v3-nature-0453.mp3`;
- `v3-tech-0556.mp3`, `v3-tech-0606.mp3`, `v3-tech-0610.mp3`, `v3-tech-0635-observe.mp3`, `v3-tech-0645.mp3`;
- `v3-echo-0820.mp3`;
- `v3-tech-0635-diverse.mp3`, `v3-tech-0635-same.mp3`;
- `v3-echo-nature-0824.mp3`, `v3-echo-tech-0826.mp3`.

Replica `v3-ai-0534` a fost simplificată pentru copii din „hazardul” în „riscul”, modificată simultan în scenariul regizoral, sursa vocală, show și audio, apoi regenerată. Toate vocile noi folosesc `eleven_v3`, indicații de joc/inflexiune, seed-uri stabile și retiming numai când durata depășea fereastra.

Montajele de audiție actuale sunt:

- `assets/voice/ro/preview-capitan-v3.mp3` — 17 cue-uri;
- `assets/voice/ro/preview-avatar-v3.mp3` — 18 cue-uri;
- `assets/voice/ro/preview-civilizatii-v3.mp3` — 16 cue-uri/variante.

QA final cu ElevenLabs Scribe v2, limba română:

- Căpitan: 136/138 cuvinte, WER 2,2%;
- Avatarul Navei: 214/216 cuvinte, WER 3,7%;
- civilizații/ecouri/ramuri: 165/165 cuvinte, WER 3,0%;
- niciun tag de performanță Eleven v3 nu a fost rostit ca text.

### 25.3 Ramura adaptivă TEHNOLOGIC și ecourile finale

Auditul agentului scenarist a descoperit că versiunea intermediară reda necondiționat „Ați ales să observați”, indiferent ce apăsau copiii. Au fost adăugate toate cele trei variante canonice:

- `v3-tech-0635-diverse`: există minimum două alegeri exprimate diferite;
- `v3-tech-0635-same`: toate alegerile exprimate sunt identice;
- `v3-tech-0635-observe`: nu există alegeri exprimate; include cazul în care toți aleg „Doar observ” sau nu răspund.

Cele trei cue-uri sunt `manual: true`, deci timeline-ul nu le poate reda împreună. Markerul automat `tech-adaptive-select` de la `play:335` cere serverului ramura prin `tablets.perspectiveBranch("tech-tablet-perspectives")`, apoi serverul difuzează un singur `fireCue` către toate ecranele. Ramurile returnate sunt literal `diverse | same | observe`.

Un raport video întârziat după seek putea muta ceasul serverului puțin înapoi și rearma markerul, producând două redări ale aceleiași replici. `src/server/cues.ts` distinge acum seek-ul explicit de jitterul unui raport de ceas: numai comanda de seek rearmează cue-uri. Există regresie automată și testul real a confirmat o singură redare.

Climaxul de la 8:20 conține acum toate cele trei ecouri, secvențiate fără suprapunere:

- LUMINA: „Vă recunoaștem lumina.”;
- NATURA: „Vă recunoaștem legătura.”;
- TEHNOLOGIC: „Nu încăpeți într-un singur răspuns.”

### 25.4 Cinci tablete, cinci posturi, zece perspective

Agentul cu experiență în lucrul cu copii a auditat și apoi a înlocuit modelul vechi „o tabletă = un copil cu nume și rol”. Contractul actual este anonim și corespunde scenariului:

- cinci tablete, fiecare legată de un post fix 1–5;
- posturile sunt NAVIGAȚIE, PROPULSIE, COMUNICAȚII, BIOSEMNALE și MEMORIE;
- posturile se pot fixa prin onboarding sau direct prin query `?post=N`, apoi persistă local;
- un post nu poate fi revendicat simultan de două tablete conectate;
- fiecare tabletă are două zone vizuale egale, A și B, pentru cei doi copii;
- fiecare zonă răspunde independent o singură dată per cue și nu poate suprascrie alegerea celeilalte;
- fiecare zonă oferă „Doar observ”; observația și lipsa inputului sunt stări valide;
- nu se colectează prenume, text liber, clasamente, procente sau consens;
- confirmarea A/B este privată pe tableta respectivă; celelalte tablete nu primesc răspunsurile;
- posturile persistă la restart, dar răspunsurile sesiunii se șterg;
- reconectarea recuperează postul și confirmările A/B din server.

Contractele noi sunt:

```text
post-assign { posts: string[5] }
paired-choice {
  mode: "color" | "pulse" | "perspective",
  prompt,
  options,
  allowObserve: true,
  timeoutSec?
}
set-post { post: 1..5 }
choice { cueId, zone: "A" | "B", value }
```

`options` acceptă string sau `{ value, label, symbol?, color? }`. Valoarea stabilă pentru observație este `TABLET_OBSERVE_VALUE = "observe"`.

Interacțiunile V3 executabile sunt acum:

- `light-tablet-color`, fereastră `play:103–115` / public 2:43–2:55;
- `nature-tablet-pulse`, fereastră `play:219–231` / public 4:39–4:51;
- `tech-tablet-perspectives`, fereastră `play:317–334` / public 6:17–6:34;
- `epi-tablet-thanks` la epilog 68 / public 9:53.

Au fost eliminate `tech-tablet-question` și `rev-tablet-message`; în revelație copiii privesc ecranele, nu scriu text. UI-ul tabletelor a fost refăcut cu două jumătăți simetrice, ținte de minimum 56 px, gap de minimum 8 px, simboluri/culori, mod reduced-motion și fără indicatori competitivi.

### 25.5 Continuitate vizuală și sonoră

Entity hide-urile legacy tăiau personajele în timpul ultimelor replici. Timpii actuali sunt:

- LUMINA hide la `play:125.2`, după finalul clipului de la 2:58;
- NATURA hide la `play:239.2`, după finalul clipului de la 4:53;
- TEHNOLOGIC hide la `play:350.5`, după replica de la 6:45.

Alte corecții de sunet/cue:

- ploaia NATURA durează 45 s și acoperă replica finală;
- `wormhole-whoosh` pornește la video 360 s / public 7:00;
- `wormhole-exit-swell` este limitat la 2 s, la video 400–402, înaintea următoarei replici;
- `home-transmit-chime` și `home-transmit-marker` marchează nota a patra și trimiterea semnalului la 463,5 s.

Nu s-a introdus un al doilea corp pentru Avatarul Navei. Numai `CAPITANUL` comandă GLB-ul și numai rendererul cu `showAvatar: true` îl instanțiază.

### 25.6 Preload audio și durată deterministă

Motorul vocal încarcă acum manifestul complet și face fetch + decode pentru toate clipurile înainte ca UI-ul de lansare să fie armat. Sunt folosite maximum șase operații concurente. La cue, clipul vine din memoria decodată, eliminând I/O-ul din ferestrele scurte dintre replici. Un asset care eșuează la preload este memorat ca indisponibil și nu mai este recitit/decodat pe muchia cue-ului; politica `fallback: silent` rămâne activă.

Contractul public este exact:

```text
0:00–0:50   pre-show
0:50–1:00   lead-in T−10
1:00–8:45   film video 0–465 s
8:45–10:00  epilog 0–75 s
TOTAL       600 s
```

Sursa video fizică rămâne 741,78 s, dar `Player.duration()` expune 465 s și rendererul oprește local la această limită. Tranziția play→epilogue se face imediat în renderer, fără a aștepta round-trip-ul WS; ecoul serverului nu resetează ceasul epilogului. Epilogul se oprește local exact la 75 s. Testele verifică masterul fizic lung, tăietura la 465 și finalul determinist.

### 25.7 Pornirea de pe ecran

§24 descrie o versiune intermediară în care clickul principal sărea direct la lansare. Comportamentul final este:

- click oriunde pe panoul idle, **PORNEȘTE EXPERIENȚA**, `Space` sau `Enter` → `preshow`;
- la 50 s, `preshowAutoStart: true` pornește automat lead-in-ul T−10;
- **SARI LA LANSARE** sau `S` → start direct la T−10;
- `P` → pre-show explicit;
- în timpul filmului, `Space` păstrează funcția pause/play.

Astfel, dublu-click pe `RUN.bat`, apoi o singură atingere pe ecran, pornesc fluxul continuu complet.

### 25.8 Automatizare și documentație

Au fost adăugate:

- `scripts/sync-v3-voices-to-show.mjs` / `npm run sync:voices`: migrează determinist toate vocile V3, tabletele V3, timpii entity/SFX și metadatele de durată în `show.json`; scriptul este idempotent și a fost rulat de două ori consecutiv fără duplicate;
- `scripts/build-cue-sheet.mjs` / `npm run docs:cues`: generează `docs/CUE-SHEET.md` direct din sursa executabilă; documentul nu mai conține cue-uri V2;
- validare extinsă în `scripts/validate-voice-script.mjs`: 51/51 asset-uri obligatorii, potrivire cu scenariul, manifest și show, durate maxime, tag-uri nerostite, cele trei ramuri manuale și fallback strict;
- validare extinsă în `scripts/validate-show.mjs`: contractele `post-assign`/`paired-choice`, exact cinci posturi, tipurile legacy interzise și invariantele V3;
- teste extinse în `scripts/smoke-core.mjs` și `scripts/smoke-platform.mjs`: 5×2 tablete, ramuri `observe/same/diverse`, imutabilitate A/B, confidențialitate, reconnect/restart, dispatch adaptiv, jitter fără dublare, preload/cache/failure și fallback silent;
- reel și QA pentru civilizații în `scripts/build-voice-reels.mjs` și `scripts/qa-voice-transcription.mjs`.

Au fost actualizate `README.md`, `docs/OPERARE.md`, `docs/SPEC-SHEET.md`, `docs/SCENARIU.md`, `docs/BRIEF.md`, `docs/DECIZII.md` și `docs/CUE-SHEET.md`. Documentele active spun acum cinci tablete pentru zece copii, fără Unitree fizic, fără VR, Căpitan numai în fereastra GLB `center`, 51 de asset-uri locale și tăietură la 465 s.

### 25.9 Verificări finale și probă reală

`npm run check` a trecut integral după toate modificările:

- TypeScript strict: PASS;
- show validator: 8 scene, 87 cue-uri (`countdown=1`, `entity=6`, `marker=6`, `sfx=6`, `tablet=9`, `theme=8`, `voice=51`);
- voice validator: 51 asset-uri, toate potrivite cu scenariul și show-ul;
- build Electron/main/preload/renderer/control/tablet: PASS;
- smoke core: timing de lansare, epilog determinist, preload audio, jitter și fallback silent: PASS;
- smoke platform: HTTP, static, QR, WS, state machine, posturi 5×2, ramură adaptivă și shutdown: PASS;
- smoke media: transcodare CPU, overwrite Windows-safe și contact sheet: PASS.

Proba reală a fost făcută cu `RUN.bat --no-control`, fără `.env` și fără cheie TTS la runtime. Logul `runs/app-20260904-205725.jsonl` și run-logul `runs/show-20260904-205746-2.jsonl` au confirmat:

- show `0.4.0-v3-complete`, 87 cue-uri;
- video 3840×2052 / 741,78 s încărcat, limită configurată 465 s;
- GLB ready;
- cue-ul de început `v3-cap-0004` redat din manifest;
- niciun request `/api/tts` și niciun 502/fallback browser;
- seek la `play:335` fără răspunsuri a selectat `v3-tech-0635-observe`;
- după corecția de jitter, ramura a fost declanșată o singură dată.

### 25.10 Starea exactă rămasă pentru instalarea fizică

Curățenia TTS, integrarea V3 și contractul tabletelor sunt finalizate în software. Pentru instalarea în locație rămân verificări care nu pot fi simulate pe PC-ul de dezvoltare:

- audiție pe sistemul real de sunet și reglarea volumelor pe sală;
- test cu cinci tablete fizice, fiecare fixată prin `?post=1` … `?post=5`;
- maparea indicilor Windows ai celor cinci display-uri și confirmarea că `showAvatar: true` există numai pe `center`;
- repetiție completă de 10 minute cu facilitator și zece copii/adulți-surogat;
- eventualul score/ambient muzical original și mixul cinematic final; filmul sursă nu are pistă audio, iar versiunea curentă folosește vocile și SFX-urile sintetizate descrise mai sus.

`config.json` local nu a fost suprascris: rămâne configurat pentru un singur display `center`, deoarece mașina de dezvoltare a raportat un singur monitor. În locație trebuie configurate display-urile reale după ordinea detectată; nu inventați indicii înainte de instalare.

---

## 26. 2026-09-04 — buton START EXPERIENCE pentru test rapid în consola operatorului

Utilizatorul a cerut un buton explicit de pornire deoarece controalele existente `PRE-SHOW` și `START` nu făceau suficient de clar care comandă începe imediat filmul. Verificarea efectivă în `http://localhost:4321/control/` a confirmat că vechiul `PRE-SHOW` intra corect în faza de 50 s, însă acest flux începe cu câteva secunde de liniște și putea fi perceput ca lipsă de răspuns. În plus, `Space` în consola web nu avea nicio acțiune din `IDLE`.

Au fost făcute următoarele schimbări, fără a modifica fluxul public continuu al playerului master descris în §25.7:

- `src/web/control/index.html`: a fost adăugat deasupra transportului un buton mare și vizibil **START EXPERIENCE**, cu explicația „Test: pornește imediat numărătoarea și filmul”;
- `src/web/control/styles.css`: butonul are stil primar cyan, țintă de 82 px, focus vizibil, hover și stare disabled;
- `src/web/control/index.ts`: clickul trimite comanda autoritativă `{ action: "start" }`, pornește direct la T−10 și butonul se dezactivează când show-ul nu mai este în `IDLE`/`PRE-SHOW`;
- în consola operatorului, `Space` sau `Enter` din `IDLE` ori `PRE-SHOW` execută același start imediat; în timpul filmului, `Space` continuă să facă pauză/reluare;
- `README.md` și `docs/OPERARE.md` documentează diferența dintre shortcut-ul de test din consolă și **PORNEȘTE EXPERIENȚA** de pe ecranul master, care păstrează experiența completă de la pre-show.

Verificarea a fost făcută prin interacțiune reală în browser, nu doar prin API: butonul era vizibil și activ în `IDLE`; clickul a schimbat starea în `ÎN REDARE`, ceasul în `T−00:09.x`, nota în `Start · HH:MM:SS` și a dezactivat butonul. A fost verificat separat și `Space`, cu aceeași tranziție. După teste, show-ul a fost readus în `idle`.

`npm run check` a trecut integral după build-ul final: TypeScript, validator show, validator voci, build Electron/web, smoke core, smoke platform și smoke media. Build-ul final păstrează comportamentul playerului master: clickul pe panoul său principal/`Space`/`Enter` pornește pre-show-ul continuu; numai noul buton **START EXPERIENCE** din consola operatorului este shortcut-ul evident pentru pornire imediată de test.

---

## 27. 2026-09-04 — sweep complet PM/QA/senior: cauza filmului invizibil, remediere și test vizual Electron

### 27.1 Cauza reală

Problema „se aude, dar filmul nu pornește și avatarul nu se vede” a fost reprodusă în Electron și inspectată prin Chrome DevTools Protocol. Video-ul era încărcat, `video.play()` reușea, timpul și cadrele avansau, iar canvasul GLB era sănătos. Cauza era stratul `#veil`: HTML îi aplica atributul `hidden`, dar regula CSS proprie `#veil { display: grid; }` câștiga în cascadă în fața stilului nativ al browserului pentru `[hidden]`. Veil-ul rămânea astfel desenat peste film și peste Căpitan, deși în DOM apărea ca ascuns.

Remedierea este regula globală din `src/renderer/styles.css`:

```css
[hidden] { display: none !important; }
```

Aceasta acoperă toate overlay-urile care folosesc contractul HTML `hidden`, nu doar veil-ul. `scripts/smoke-core.mjs` conține o regresie statică obligatorie pentru regulă.

### 27.2 Separarea clară dintre regie și spectacol

Browserul de la `/control/` este numai consola de regie; nu este și nu trebuie să devină suprafața de redare. Filmul, subtitrările și GLB-ul Căpitanului rămân în fereastra Electron separată.

Pentru ca această diferență să nu mai poată fi confundată:

- `src/web/control/index.html` afișează bannerul „ACESTA ESTE DOAR PANOUL DE CONTROL” și butonul **ARATĂ PLAYERUL**;
- `src/main/windows.ts` are acum `focusFirst(): boolean`, care face `show`, `restore`, `moveTop` și `focus` pe prima fereastră de spectacol;
- `src/server/index.ts` expune local `POST /api/player/focus` prin callback-ul opțional `focusPlayer`;
- `src/main/main.ts` leagă endpoint-ul de managerul de ferestre;
- comenzile `PRE-SHOW`, `START`, `START EXPERIENCE`, `Space` și `Enter` din consola web aduc automat playerul în față;
- textul butonului explică explicit cele 10 secunde de numărătoare și faptul că prima apariție a Căpitanului după start direct este la aproximativ 19 secunde.

`scripts/smoke-platform.mjs` verifică endpoint-ul de focus și faptul că hook-ul local este apelat exact o dată.

### 27.3 Telemetrie și diagnostic de redare

`src/renderer/player.ts` nu mai tratează simpla citire a metadatelor drept dovadă că filmul poate fi redat. `videoReady` devine adevărat la `canplay`. După fiecare `video.play()` reușit, un watchdog verifică după 2,5 s:

- că elementul nu este în pauză;
- că `currentTime` a avansat cu minimum 0,35 s;
- că numărul de cadre prezentate a crescut, dacă API-ul este disponibil.

Un blocaj real afișează `VIDEO BLOCAT` în OSD, cu recomandări despre acceleratorul grafic și codecul H.264, și scrie dovezile în log. Un caz sănătos scrie `video.play() confirmed` și `video frames advancing`. Cererea de afișare a avatarului este de asemenea jurnalizată cu `screenId` și timpul fazei.

Consola operatorului afișează stări oneste: `NEÎNCĂRCAT`, `T−10 · ÎNCĂRCAT`, `RULEAZĂ`, `BLOCAT` sau `ÎNCĂRCAT`; nu mai confundă filmul pregătit cu filmul aflat în mișcare.

### 27.4 Test Electron real

A fost adăugat `scripts/smoke-renderer.mjs` / `npm run smoke:renderer`. Testul se conectează la instanța Electron reală, nu la un mock, pornește experiența și verifică DOM-ul, video-ul și WebGL-ul. Ultima rulare, pe build-ul final, a trecut cu:

- veil: `hidden=true`, `display=none`, suprafață 0×0 și absent din hit-test;
- primul eșantion video: `currentTime=1.190728`, 81 cadre;
- al doilea eșantion: `currentTime=2.717329`, 173 cadre;
- GLB: `shown=true`, `opacity=1`, canvas 523×654, context WebGL activ;
- captură: `runs/renderer-smoke-avatar.png`, cu filmul, Pământul, Căpitanul și subtitrarea finală „Când îl vom revedea, îl vom privi altfel.” vizibile simultan.

Logul final este `runs/app-20260904-220948.jsonl`, iar run-logul este `runs/show-20260904-221003-2.jsonl`. Aplicația de probă a fost oprită după test; porturile 4321 și 19191 au rămas libere.

---

## 28. 2026-09-04 — adaptarea scenică românească V3.3 și regenerarea integrală a vocilor

### 28.1 Audit în trei specializări

La cererea utilizatorului au lucrat în paralel trei agenți read-only, iar concluziile lor au fost integrate de agentul principal:

- **Maxwell / redactor_romana**: gramatică, topică, acorduri, eliminarea calcurilor și un vocabular canonic consecvent;
- **Helmholtz / dramaturg_ro**: arc dramatic, cauzalitate, revelație, intenție actoricească și rostire în fereastra exactă de timp;
- **Godel / public_copii_ro**: claritate pentru 8–14 ani, participare fără presiune, egalitatea copiilor din pereche și coerența textelor de pe cele cinci tablete.

Auditul a găsit două probleme de logică ce depășeau stilistica:

1. Căpitanul concluziona că echipajul va trimite semnalul înainte ca Vocea Navei să dovedească faptul că amprentele din semnal aparțin chiar acestui echipaj. Replica de la 7:29 conține acum dovada explicită.
2. Ramura fără input afirma implicit că publicul „a ales să observe”. Sistemul nu poate cunoaște intenția. Replica spune acum numai că nu s-a înregistrat niciun răspuns, apoi tratează tăcerea ca element scenic.

### 28.2 Dicționarul canonic

În toate documentele active și în UI se folosesc consecvent:

- **semnal** = transmisia întreagă;
- **fragment** = una dintre cele cinci părți primite de posturi;
- **amprentă** = contribuția unuia dintre cei zece copii;
- **indiciu** = descoperirea adusă de o lume;
- **lentilă** = felul diferit în care un post citește același semnal;
- **Vocea Navei** = voce + HUD, fără corp umanoid;
- **Căpitanul** = unicul GLB, vizibil numai pe ecranul `center`;
- **Tehnologica** = numele scenic; identificatorul tehnic stabil rămâne `TEHNOLOGIC`.

Au fost eliminate din textul scenic formulări precum „semnal fără adresă”, „cinci echipe”, `wormhole`, „momentul în fața noastră”, „Doar observ”, „nivelul de uimire depășește parametrii” și alte propoziții corecte formal, dar nenaturale în rostire.

### 28.3 Scenariul și replica finală

Sursa canonică este `assets/show/voice-script-v3.json`, versiunea `3.3.0-ro-stage-adaptation`. Scenariul regizoral complet este `docs/SCENARIU-REGIZORAL-10-MIN.md`; rezumatul este `docs/SCENARIU.md`. Validatorul compară automat fiecare replică din sursa vocală cu scenariul regizoral.

Toate cele 51 de replici au fost recitite și adaptate pentru română vorbită, cu indicații actoricești revizuite. Schimbările dramatice importante includ:

- Căpitanul formează explicit „un singur echipaj”, nu „cinci echipe”;
- participarea este formulată simplu: „Alegeți sau priviți”, fără vină sau evaluare;
- Vocea Navei spune natural „Nivelul de uimire depășește estimările. Îl las așa.”;
- NATURA cere o singură atingere și precizează că nu trebuie făcută de toți deodată;
- TEHNOLOGICA are trei răspunsuri firești pentru alegeri diferite, alegeri identice și niciun răspuns;
- înaintea revelației, Vocea Navei confirmă: „A ajuns la noi înainte să fie trimis. Și poartă amprentele acestui echipaj.”;
- replica-titlu este: „Corectez jurnalul. A patra lume nu era ascunsă. Noi nu știam încă s-o vedem.”;
- Vocea Navei înțelege sensul uman prin: „Știam unde este Pământul. Nu știam de ce îi spuneți «acasă». Asta am învățat de la voi.”;
- ultima replică a Căpitanului spune „Bun venit acasă, echipaj”, apoi păstrează instrucțiunea de siguranță pentru ridicarea copiilor.

`assets/show/show.json` a fost resincronizat la versiunea `0.5.0-ro-stage`, iar `docs/CUE-SHEET.md` a fost regenerat din cele 87 de cue-uri. Generatorul foii de cue afișează acum numele scenice `VOCEA NAVEI`, `CĂPITANUL` și `TEHNOLOGICA`, păstrând identificatorii interni neschimbați.

### 28.4 Cinci posturi, cinci tablete, două perspective egale

`TABLET_POSTS` din `src/shared/types.ts` definește acum perspective concrete, nu etichete abstracte A/B:

| Post | Lentilă | Jumătatea A | Jumătatea B |
|---:|---|---|---|
| 1 | NAVIGAȚIE | DIRECȚIE | TRASEU |
| 2 | PROPULSIE | ENERGIE | STABILITATE |
| 3 | COMUNICAȚII | CUVINTE | SEMNAL |
| 4 | BIOSEMNALE | PULS | LEGĂTURĂ |
| 5 | MEMORIE | AMINTIRE | TIMP |

`src/web/tablet/index.ts` arată aceste nume pe cele două jumătăți, explică „Un singur echipaj · cinci posturi”, folosește **DOAR PRIVESC** și confirmă neutru cu „E în regulă.”. Nu mai spune că observația „a intrat în semnal” ca și cum ar fi fost o alegere activă. Ecranul final spune simplu că postul a făcut parte din semnal până la capăt. `src/server/tablets.ts` folosește aceeași formulare în consola operatorului.

Prompturile au fost scurtate pentru copii și pentru timpul fizic disponibil:

- LUMINA: „Ce culoare ai lua cu tine prin întuneric?”;
- NATURA: „Atinge cercul o singură dată când pulsează.”;
- TEHNOLOGICA: „Ce crezi că ține o lume în viață?”.

`scripts/smoke-core.mjs` verifică explicit toate cele cinci perechi de perspective și existența textului natural **DOAR PRIVESC**.

### 28.5 Vocile regenerate

Au fost regenerate forțat toate cele 51 de MP3-uri ElevenLabs cu profilurile și vocile deja aprobate de utilizator: 17 Căpitan, 18 Vocea Navei și 16 civilizații/ecouri. Modelul principal rămâne `eleven_v3`, cu tag-uri de interpretare și seed-uri pe cue; instrucțiunea de siguranță de la 0:35 folosește în continuare profilul explicit `eleven_multilingual_v2`. Timpii de cuvânt și lip-sync au fost rescriși în `assets/voice/ro/manifest.json`.

Durata cumulată a materialului vocal este 298,93 s. Generatorul păstrează fiecare clip în fereastra sa. Instrucțiunea de la 0:35 a fost rescrisă și a coborât de la o compresie inacceptabilă de 1,76× la 1,21×. Cea mai mare compresie rămasă este 1,55× numai pe comanda de două cuvinte „Scanați semnalul.”, care trebuie să încapă între predicția Tehnologicei și răspunsul „Știam.”; următoarea este 1,21×, iar toate celelalte sunt cel mult 1,15×.

Montajele de audiție au fost reconstruite:

- `assets/voice/ro/preview-capitan-v3.mp3` — 17 cue-uri;
- `assets/voice/ro/preview-avatar-v3.mp3` — 18 cue-uri;
- `assets/voice/ro/preview-civilizatii-v3.mp3` — 16 cue-uri.

Controlul automat cu ElevenLabs Scribe V2, limba română fixată, a trecut mult sub pragul WER de 18%:

- Căpitan: 160/160 de cuvinte, WER 1,3%;
- Vocea Navei: 245/252 de cuvinte, WER 5,6%;
- civilizații și ecouri: 168/168 de cuvinte, WER 0,6%;
- niciun tag actoricesc nu a fost rostit în audio.

`scripts/qa-voice-transcription.mjs` poate încărca acum cheia din `.env`, la fel ca generatorul. Fișierul `.env` temporar folosit pentru generare și QA a fost șters; cheia API nu a fost scrisă în documentație, manifest, log sau Git.

### 28.6 Verificarea finală

După ultima schimbare de text și ultima regenerare, `npm run check` a trecut integral:

- TypeScript strict: PASS;
- show validator: 8 scene / 87 cue-uri / 51 voci: PASS;
- voice validator: 51/51 asset-uri identice cu scenariul și show-ul: PASS;
- build main, preload, renderer, control și tabletă: PASS;
- smoke core, platform și media: PASS;
- `git diff --check`: PASS;
- `.env` absent și niciun proces NavaPlayer/port de diagnostic rămas activ.

Testul live `npm run smoke:renderer` a fost repetat după regenerarea finală și a trecut din nou. Captura curentă arată subtitrarea românească revizuită, video-ul în mișcare și unicul GLB al Căpitanului simultan. Verificarea care rămâne dependentă de locație este numai repetiția fizică pe toate cele cinci display-uri, cele cinci tablete și sistemul real de sunet.
