# Prim-planuri, motoare și mixer — 14 septembrie 2026

Implementare în repository, fără modificarea filmelor, replicilor, MP3-urilor vocale sau fișierului sursă show.json. Instalația live de pe 4321 nu a fost repornită. Nu s-a făcut commit, publicare sau împachetare EXE.

## Prim-planurile

Pentru filmul de 678,05 secunde, pachetele tuturor vârstelor și limbilor primesc aceeași extensie din `src/shared/planet-stops.ts`:

| Lume | Timp în film | Oprire suplimentară |
| --- | --- | --- |
| Lumina | 01:36 | 10 s |
| Natura | 03:22 | 10 s |
| Cristalul | 05:02 | 10 s |
| Saturn | 08:52 | 10 s |
| Pământul la întoarcere | 10:40 | 10 s |

Cadrele au fost alese după inspectarea filmului central și verificate în rendererul cu cinci surse reale. Ancorele sunt editoriale pentru această versiune a filmului; un montaj nou cere recalibrare. Tunelul nu primește o oprire suplimentară.

ShowDirector oprește ceasul comun, filmul și avansarea cue-urilor, apoi reia automat după zece secunde reale, inclusiv la viteza de repetiție. Replica deja începută se poate termina natural; nu este relansată. Muzica pe fișier urmărește poziția filmului. Durata publică totală crește cu 50 s, fără schimbarea timpilor interni ai clipurilor. Pachetul copiilor are acum 873,05 s, inclusiv primirea și epilogul.

Opririle executate și timpul rămas sunt incluse în checkpointul SQLite. Suspendarea sau recuperarea nu consumă timpul rămas și nu pornește singură sala. PAUZĂ în timpul prim-planului transformă oprirea în pauză manuală; CONTINUĂ o încheie imediat. Seek-ul explicit nu readuce filmul la o planetă trecută. Fiecare oprire rulează o singură dată pe sesiune; RESTART le reactivează. Consola arată motivul opririi.

## Sunetul motoarelor

Efectul `rocket-departure` este sintetizat prin Web Audio: zgomot grav filtrat, o componentă de motor la 48–78 Hz și atac/eliberare progresive. Durată 3,5 s, gain 0,14. Este declanșat de cue-urile filmului la 0, 102, 208, 308 și 538 s, nu de randările interfeței. Numai ieșirea audio configurată emite sunet.

Proba offline folosește codul real de sinteză și produce `runs/debug/planet-stops-2026-09-14/rocket-departure-preview.wav`. Verifică PCM finit, nivel redus, lipsa clippingului și mutingul SFX. La proba consemnată: peak 0,064 și RMS 0,0076. Efectul nu folosește servicii externe și nu cere conexiune la internet.

## Mixerul operatorului

Trei glisoare tactile, permanent vizibile sub starea spectacolului în toate modurile consolei:

- **Dialog:** vocile scenariului și naratorul tutorialului/finalului.
- **Muzică:** coloana sonoră, muzica de așteptare și ambianța muzicală. Este separată de SFX; păstrează mixajul și duckingul existente.
- **Efecte:** motoare și celelalte efecte, inclusiv sunetele tabletelor. Întrerupătorul tabletSfx și preferințele de accesibilitate au în continuare prioritate.

Valorile sunt în ShowState și în checkpoint, sunt preluate la welcome/reconectare, iar sliderul nu este suprascris în timpul manipulării. Viewerul nu poate modifica mixajul. Reglarea SFX schimbă și efectele aflate deja în redare. S-a reparat și refacerea busului audio după închiderea unui AudioContext.

## Dovezi și limite

- `npm run check`: 256 teste și verificările typecheck, show, voices, build, smoke core/auth/platform/media.
- `npm run smoke:renderer`, prin harnessul izolat: film și GLB reale.
- `NAVA_QA_PLANETS=1 node scripts/qa-adaptive-displays.mjs`: cinci prim-planuri cu toate cele cinci decodoare, oprire comună, reluare, plus schimbare 5→2 după reset. Măsurare prin polling: 9,989–10,311 s.
- `node scripts/qa-operator-stress.mjs`: mixer trimis din interfața Chromium, valori păstrate după reload, 537 cereri, zero erori browser/server; probe de autentificare, recuperare și comenzi concurente.
- `node scripts/qa-rocket-audio.mjs`: sinteză reală și muting verificate offline.

Capturi și loguri: `runs/debug/planet-stops-2026-09-14/`. `renderer/planet-*.png` arată opririle; `operator/01-mixer.png` arată glisoarele. Capturile au fost inspectate vizual. Probele folosesc topologie OS simulată și servere/SQLite temporare, nu cinci televizoare fizice.

În sală rămân audiția pe sistemul real, reglarea raportului muzică/dialog/SFX, verificarea nivelului grav pe difuzoare și sincronizarea HDMI fizică. Noua revizie schimbă hashul pachetelor: pentru verificarea versiunii noi, pregătește un grup nou, nu forța recuperarea unui checkpoint al reviziei vechi.
