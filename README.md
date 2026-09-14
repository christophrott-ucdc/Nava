# EXODUS7 · NavaPlayer

Aplicația Windows pentru experiența educativă „A Patra Lume”, UCDC HUB AI. Electron redă filmele panoramice, Căpitanul GLB și suprapunerile 3D; serverul local coordonează tabletele, consola operatorului, scenariile, vocile, muzica și recuperarea sesiunii.

Acest README descrie **starea surselor la 14 septembrie 2026**. Un EXE construit anterior nu preia automat modificările repository-ului.

## Pagini și acces

Serverul master folosește implicit portul **4321**. Pe tableta operatorului sau pe alt dispozitiv, înlocuiește `localhost` cu IP-ul PC-ului navei.

| Adresă | Utilizare | Acces la date și comenzi |
| --- | --- | --- |
| [Consolă operator](http://localhost:4321/control/) | Pregătire, scenariu, limbă, tutorial, transport, mixer, stare tehnică și recuperare | Viewer: citire; operator/admin: comenzi |
| [Loguri](http://localhost:4321/logs/) | Evenimente, niveluri, căutare, actualizare live, istoric și export JSONL | Viewer, operator sau admin |
| [Depanare](http://localhost:4321/debug/) | Readiness, preflight, clienți, performanță și configurație redactată | Citire autentificată; acțiuni după rol |
| [Analitică](http://localhost:4321/analytics/) | Rulări, contribuții, grafice și detalii de misiune | Viewer, operator sau admin |
| [Administrare](http://localhost:4321/admin/) | Dashboard, resurse CPU/GPU, control, loguri, wiki, parolă/MFA, conturi, audit, robot și actualizări | Admin |
| [Calibrare perete](http://localhost:4321/wall/) | Inventar, geometrie, preview și profilul TV-urilor | Citire autentificată; aplicarea instalației cere admin |
| [Clipuri](http://localhost:4321/clips/) | Verificarea surselor video și a setului panoramic | Autentificare pentru datele protejate |
| [Autentificare](http://localhost:4321/login/) | Intrare cu PIN | Public |
| `http://<ip-pc>:4321/tablet/?post=1` | Tableta postului 1; folosește 2, 3, 4 sau 5 pentru celelalte | Participanți, fără PIN de operator |
| [Preview Nava Glass](http://localhost:4321/shared/preview.html) | Componente, mascote și cele opt teme | Galerie de dezvoltare |
| [Health](http://localhost:4321/api/health) | Disponibilitatea serverului | Public |

`/logs` redirecționează la `/logs/`; aceeași convenție se aplică paginilor principale. Adresa `/` deschide consola.

Rolurile sunt **Observator → Operator → Administrator**, verificate pe server. Nu există parolă/PIN implicit. Prima configurare folosește un cod aleator local; apoi administratorul creează utilizatorii cu nume și parolă/PIN. SQLite criptat, MFA, blocare după 5 încercări, resetare/deblocare, inventar de dispozitive și Google Workspace @ucdc.ro: [ghid identitate și RBAC](docs/IDENTITATE-SI-RBAC.md).

## Loguri: /logs

Pagina **LOGURI** este accesibilă direct din bara consolei și la [localhost:4321/logs](http://localhost:4321/logs).

- Niveluri: **DEBUG, INFO, WARNING, ERROR, FATAL**.
- Surse: jurnalele aplicației Electron/server, evenimentele show-ului și diagnosticului, auditul administrativ.
- Căutare, filtrare după nivel și fișier, detalii JSON, „Intrări mai vechi” și export JSONL filtrat.
- Actualizare live la aproximativ 3 secunde; ascunderea paginii suspendă pollingul, nu înregistrarea.
- Evenimentele se salvează chiar dacă pagina nu este deschisă. Datele sensibile sunt redactate din afișare și din noile înregistrări instrumentate.

Fișierele principale sunt `runs/app-*.jsonl`, `runs/show-*.jsonl`, `runs/diagnostic-*.jsonl`; auditul se află lângă configurația utilizatorilor. Pagina citește ferestre limitate din fișiere, nu întreaga arhivă simultan. Exportul este limitat la rezultatele ferestrei consultate. Nu există ștergere de loguri din această interfață.

API autentificat: `GET /api/logs/files`, `GET /api/logs?level=ERROR&q=...`, export prin `format=jsonl`. [Surse, retenție și limite](docs/LOGURI.md).

## Pornire din repository

Cerințe: Windows 11, Node.js 22+ cu suport `node:sqlite`, npm și fișierele video configurate local. Filmele mari nu sunt incluse în Git sau în installer.

```powershell
npm install
# Numai la prima instalare; păstrează configurația existentă:
if (-not (Test-Path config.json)) { Copy-Item config.example.json config.json }
npm run check
npm run dev -- --windowed
```

Înainte de pornire, setează în configurație căile reale pentru film și, dacă folosești panorama, seturile `video.panelsByCount`. Exemplul generic pornește de la `media/cinema_4k_h264.mp4`; instalația locală actuală folosește exporturile din `../Video/`. Copierea exemplului singură nu instalează filmele.

Alternative:

| Comandă | Rezultat |
| --- | --- |
| `RUN.bat` | Lansatorul local; opțiuni prin `RUN.bat --help` |
| `PREZENTARE.bat` | Construiește sursele și deschide preview-ul prezentării |
| `PREZENTARE.bat --live` | Prezentare pe TV-urile configurate |
| `npm run wall:configure` | Creează configurația locală a peretelui |
| `npm run wall:preview` | Preview panoramic într-o fereastră |
| `npm run wall:start` | Pornește peretele în kiosk |
| `npm run auto:configure` | Pregătește profilul local cu detectare automată |
| `npm run auto:start` | Pornește folosind acel profil |

Consola este interfața de regie. Filmul, Căpitanul și grafica TV apar în fereastra Electron; **ARATĂ PLAYERUL** o aduce în față. **DEMO TV** pornește demonstrația pentru copii fără tablete și fără a inventa participanți.

## Ecrane și instalație

Configurația fizică de referință:

- Cinci Samsung în linie: **98″ – 98″ – 115″ – 98″ – 98″**, spații de 50 cm; toate conectate la același PC.
- Cinci tablete pentru participanți și o tabletă separată pentru operator, toate **1920×1080 landscape**.
- Fiecare tabletă are A în stânga și B în dreapta, fără text rotit. Experiența acceptă **1–10 participanți**, pe orice combinație de posturi ocupate.
- Căpitanul apare ca GLB numai pe TV-ul desemnat; nu este un personaj fizic în sală.

Cu `autoDisplays.enabled: true` și `countMode: "adaptive"`, aplicația detectează ieșirile eligibile la pornire și selectează împreună geometria, filmele și cerințele de readiness. Ieșirile atribuite operatorului sunt excluse. Seturile actuale acoperă **2, 3, 4 și 5 TV-uri**, cu fallback pentru unul singur; pentru alte numere sunt necesare exporturi compatibile.

Windows trebuie să folosească **Extindere**, cu pozițiile ecranelor corecte și aceeași scalare DPI pe TV-uri. În `span`, o fereastră fără ramă acoperă peretele; în `windows`, există ferestre separate. `--windowed`/`dev.windowed: true` înseamnă preview, iar **`--kiosk` forțează afișarea completă**.

Conectarea/deconectarea în pregătire permite reaplicarea configurației. În timpul show-ului, o schimbare de topologie suspendă experiența; nu se remapează filmele sub redare. Detectarea Windows nu măsoară singură golurile, unghiurile sau latența fizică a TV-urilor.

[Configurare adaptivă și seturi video](docs/ADAPTIVE-DISPLAYS.md) · [Cronologia filmului](docs/REINTEGRARE-FILM.md)

## Operarea unei sesiuni

1. În consolă, pregătește un grup nou și alege profilul și limba.
2. Participanții aleg și confirmă personaje din cele 12 portrete EXODUS7. Sunt necesare doar tabletele cu locuri confirmate.
3. Încheie îmbarcarea și rulează tutorialul vocal. Operatorul poate pune pauză, repeta sau continua.
4. Predă Căpitanului. Înainte de film, serverul așteaptă confirmările TV-urilor și programează un start comun.
5. Urmărește starea tehnică, contribuțiile și cronologia. Comenzile avansate și editorul sunt în **Instrumente**.
6. Finalul colectează contribuțiile și pregătește diploma; apoi pregătește următorul grup.

Profiluri: **5–10 ani — Steaua Omenirii**, **10–15 ani**, **15–18 ani**, **adulți**, plus originalul legacy. Mecanicile și dialogurile diferă între vârste. **RO / EN / FR** folosesc aceeași logică de sesiune, cu dialog, voci, interfețe și diplome localizate. Alege limba înainte de tutorial; pachetele incomplete sunt refuzate.

[Manual de operare](docs/OPERARE.md) · [Limbi și producție vocală](docs/MULTILINGUAL-RO-EN-FR.md) · [Scenariul copiilor](docs/STEAUA-OMENIRII-INTEGRARE.md)

## Prim-planuri și mixer

Filmul actual are **678,05 s**. La prim-planurile Luminii, Naturii, Cristalului, lui Saturn și Pământului se adaugă câte **10 s**, pe ceasul comun: **50 s suplimentare**. Pachetul copiilor, cu primire și epilog, are 873,05 s (14:33,05), plus timpul variabil al tutorialului și interacțiunilor. Pauza operatorului poate prelua controlul asupra opririi automate.

Mixerul este permanent vizibil în consola operatorului:

| Canal | Controlează |
| --- | --- |
| **Dialog** | Vocile scenariului și naratorul tutorialului/finalului |
| **Muzică** | Coloana sonoră, muzica de așteptare și ambianța muzicală |
| **Efecte** | Propulsia și celelalte SFX, inclusiv sunetele tabletelor |

Muzica scade automat sub voce. Plecările includ un efect discret de motor sintetizat local. Setările mixerului și timpul rămas al opririlor sunt păstrate în starea recuperabilă. `tabletSfx` și opțiunile de accesibilitate pot opri separat efectele tabletelor.

[Ancore, comportament și verificări](docs/PLANETE-SI-MIXER-2026-09-14.md)

## Recuperare și backup

SQLite păstrează participanții, progresul, alegerile și checkpointul experienței. Salvarea periodică este programată la 250 ms; aceasta nu reprezintă o garanție de pierdere maximă la orice defect hardware.

După crash, aplicația restaurează sesiunea **suspendată**. Operatorul verifică instalația și alege continuarea; conținutul cu alt hash nu este reluat forțat. Un decoder blocat sau o problemă a peretelui poate suspenda show-ul până la remediere.

Consola arată readiness/preflight, ecranele lipsă, recuperarea și ultima copie SQLite. Backupul consistent folosește mecanismul SQLite, nu copierea brută a bazei deschise. Copiile locale nu protejează împotriva pierderii discului.

[Recuperare SQLite](docs/RECUPERARE-SQLITE.md) · [Pornire sincronizată, stare tehnică și backup](docs/PORNIRE-TV-SI-BACKUP.md)

## Grafică, telemetrie și diplome

Nava Glass folosește opt teme, logo EXODUS7, mascote, ilustrații, selecție de personaje, tutorial, ecran animat de așteptare și final comun. Tabletele și TV-urile afișează obiecte și instrumente Three.js, cu alternative pentru mișcare redusă.

Telemetria și harta urmăresc filmul și starea sesiunii. Valorile provin dintr-un **model educativ al experienței**, nu din senzori ai unei nave reale. Pe TV-uri, instrumentele sunt prezentate ca o bandă discretă.

Diploma PDF prin QR trebuie să funcționeze pe internet, independent de LAN-ul sălii. Portalul static este pregătit, dar cere publicare HTTPS și `DIPLOMA_PUBLIC_URL`. **Nu este confirmat un domeniu public activ.** În lipsa lui, interfața indică indisponibilitatea; nu oferă un QR către localhost.

[Telemetrie și hartă](docs/NAVIGATIE-TELEMETRIE-DIPLOME.md) · [Banda TV](docs/TELEMETRIE-BANDA-FILM.md) · [Diplome publice](docs/DIPLOME-PUBLICE-SI-TELEMETRIE-PERETE.md)

## Voci și conținut

Redarea folosește fișiere locale și nu cere cheia ElevenLabs în timpul reprezentației. Cheia de producție vocală se păstrează în `.env`, exclus din Git.

- `assets/show/show.json`: cronologia de bază; pachetele sunt compuse de server.
- `assets/scenarios/<profil>/`: dialogul și vocile profilului.
- `assets/voice/<limbă>/`: vocile legacy și manifesturile de sincronizare.
- `assets/experience/voice/<limbă>/`: naratorul.
- `assets/music/`: muzica și manifesturile.
- `docs/scenarii/`: sursele editoriale.

Nu aplica automat vechile scripturi V3 peste pachetele actuale. Regenerarea trebuie să respecte sursa editorială, limba, manifesturile, duratele și hashurile verificate de preflight. Pentru inventar și validare: `npm run validate:voices`, `npm run validate:scenarios`, `npm run validate:experience`. `npm run docs:cues` regenerează foaia de cue-uri.

## Robot și actualizări

Administrarea include pregătirea pentru **Unitree H2 EDU**, adaptorul/simulatorul narativ și controlul actualizărilor aplicației și pachetelor de conținut. Driverul fizic nu este declarat disponibil; firmware-ul, sunetul și integrarea cu robotul trebuie confirmate pe hardware.

Distribuția actualizărilor și instalarea depind de configurarea serverului, semnăturilor și tipului de pachet. Portable și NSIS au comportamente diferite; un commit pe GitHub nu actualizează singur instalația.

[Robot și actualizări](docs/ROBOT-SI-ACTUALIZARI.md) · [Documentație H2 EDU](docs/unitree-h2-edu/README.md)

## Verificări și distribuție

```powershell
npm run check
# Renderer real, server și date temporare; rulează și smoke:renderer:
node scripts/experience-renderer-review.mjs --smoke-only
```

Ultima verificare software consemnată: **256 teste trecute**, check complet și smoke renderer cu film/GLB reale. Au existat și probe de reconectare, recuperare SQLite, comenzi concurente, mixer și redare cu cinci surse. Topologiile simulate nu înlocuiesc probele HDMI, touch, audio și anduranță din sală.

Pentru o distribuție nouă, după validare:

```powershell
npm run dist
```

Rezultatele sunt în `dist-app/`: executabil portable și installer NSIS. Filmele se livrează separat la căile din configurația instalației, inclusiv toate seturile panoramice necesare. `README-INSTALARE.md` și `MANUAL-UTILIZARE.docx` sunt resurse ale împachetării. `scripts/install-autostart.ps1` configurează pornirea la logon cu kiosk. Semnarea, update-ul real și executabilele livrate trebuie verificate separat.

## Structură și documentație

| Director | Conținut |
| --- | --- |
| `src/main`, `src/preload` | Electron, ferestre, inventar, IPC, watchdog și actualizări |
| `src/renderer` | Film, sincronizare, GLB, grafică TV și audio |
| `src/server` | HTTP/WebSocket, auth/RBAC, scenarii, SQLite, loguri, backup și integrări |
| `src/web` | Control, tablet, login, debug, analytics, admin, logs, clips, wall, shared și sursa portalului diploma |
| `src/shared` | Contracte, modele, localizare și reguli comune |
| `assets`, `production` | Conținutul runtime și uneltele de export SpaceEngine |
| `scripts` | Build, QA și producție de conținut |
| `docs` | Manuale și documentație funcțională |
| `AI` | Arhivă locală, briefuri și handoff-uri, ignorate de Git |

[Organizarea repository-ului și arhiva QA](docs/STRUCTURA-REPOSITORY.md). Datele active și dovezile locale rămân în `data/`, `runs/` și `cache/`; nu sunt livrate prin clonarea repository-ului.

Proiect privat, fără licență de redistribuire (`UNLICENSED`).

## EXODUS7 Admin Center

`http://localhost:4321/admin/` reunește controlul operatorului, status, CPU/RAM/GPU, loguri, analitică, wiki, conturi, sesiuni, audit și integrarea robotului/actualizărilor. Contul separat **Christoph** se activează din **Parolă & MFA**, folosind un administrator existent; alegi parola în interfață, apoi poți activa Authenticator prin QR și coduri de recuperare. Nu există parolă Christoph implicită. [Ghid complet de administrare și MFA](docs/ADMIN-CENTER.md).
