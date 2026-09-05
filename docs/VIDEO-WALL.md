# Nava Glass — peretele Samsung și prezentarea pentru copii

Implementare software: 5 septembrie 2026. Configurație confirmată: un singur PC, două Samsung QN90F de 98″ în stânga, un QN90F de 115″ în centru, două QN90F de 98″ în dreapta. Căpitanul GLB și subtitrările apar numai pe centru. Cinci tablete pentru copii și o tabletă pentru operator, toate 1920×1080 landscape; A stânga, B dreapta. Unitree H2 rămâne în afara integrării.

## Ce redă fiecare televizor

Configurarea veche cu `yawOffsetDeg` muta individual același cadru pe fiecare TV. Noul `videoWall` definește un singur spațiu fizic în milimetri. Intersecția fiecărui panou cu sursa video produce un decupaj distinct. Ecranul de 115″ primește o porțiune proporțional mai mare, păstrând aceeași scară fizică. Golurile și ramele consumă spațiu din imagine, astfel încât o linie continuă din film să continue corect după îmbinare.

| Mod | Rezultat | Alegerea pentru filmul existent |
|---|---|---|
| `cinema` | Film integral pe centru; cer procedural continuu pe laterale, sincronizat cu timpul și tema show-ului | Preset implicit, păstrează compoziția originală |
| `panorama`, `cover` | O singură imagine umple peretele prin cinci decupaje coordonate, fără deformare | Decupează mult din înălțimea sursei existente |
| `panorama`, `contain` | Păstrează sursa completă și proporțiile; zonele neacoperite rămân negre | Cu filmul actual imaginea se concentrează în centru |

Filmul local verificat prin FFprobe are **3840×2052, 60 fps**, aproximativ 1,87:1. Estimarea inițială „16:9” se referea la formatul TV-urilor; sursa efectivă este puțin mai lată. Peretele nominal are aproximativ **7,84:1**, înaintea spațiilor. Cu `cover`, pe suprafețele active se vede aproximativ **21% din cadrul original**. Nicio împărțire software nu poate păstra simultan întregul cadru îngust, umplerea întregului perete și proporțiile originale. Pentru panoramă completă fără acest crop este necesară o sursă creată pentru raportul peretelui, verificată separat cu durata și sincronizarea show-ului. Filmul existent nu a fost transcodificat sau modificat în această intervenție.

`displayMode: "span"` folosește un singur video decodat și cinci canvas-uri. Modificările cadrului sunt urmărite prin `requestVideoFrameCallback`, cu fallback; nu se redesenează continuu un film oprit. Ambientul cinema este plafonat la 30 fps și devine static cu reduced-motion. Varianta `windows` folosește aceeași geometrie, cu decoder per fereastră. Configurațiile fără `videoWall` își păstrează comportamentul anterior.

## Pornire și calibrare

Profilul local a fost creat separat în `config.wall.local.json` și este ignorat de Git. `config.json` rămâne baza existentă. Pentru recreare pe alt PC:

```powershell
npm run wall:configure
npm run wall:preview
```

Prima comandă păstrează media, avatarul, sunetul, autentificarea și restul setărilor locale; adaugă cele cinci ieșiri, geometria Samsung și cerința de cinci tablete. Refuză suprascrierea bazei, inclusiv prin majuscule sau aliasuri Windows. Acceptă BOM UTF-8, validează indicii și scrie atomic. Un profil existent necesită `--replace` explicit. Un `--out` personalizat trebuie transmis și argumentului `--config` la pornirea Electron.

`wall:preview` simulează cele cinci suprafețe într-o singură fereastră locală, inclusiv diferența 98″/115″. **Nu certifică prezența fizică a televizoarelor.** Readiness rămâne incomplet când lipsesc ieșirile reale. Nu folosi `--wall-preview` împreună cu `--kiosk`.

1. Pe PC-ul din sală, folosește desktop **extins**. Configurează fiecare TV la 3840×2160, aceeași scalare Windows (100%) și aceeași rată de refresh. Pune cele cinci dreptunghiuri Windows în ordinea fizică, fără suprapuneri. Calibrarea fizică în mm este distinctă de această hartă Windows.
2. Deschide **Consolă → Calibrare panoramă**, `/wall/`. Atelierul folosește cadre din filmul local, nu ilustrații simulate. Poți schimba modul, încadrarea, poziția sursei și cadrul de referință.
3. Introdu dimensiunile **suprafețelor active**, pozițiile X/Y și spațiile dintre ele. Dimensiunile inițiale 2170×1220 mm pentru 98″ și 2546×1432 mm pentru 115″ sunt estimări din diagonala nominală 16:9. Centrele sunt aliniate; spațiile inițiale sunt zero. Măsurarea în sală este necesară. X include și ramele; nu introduce dimensiunile carcasei drept dimensiuni active.
4. **Index Nava** este zero-based și sortează ieșirile după X, apoi Y. Nu este numărul Windows Identify. Atelierul listează indexul, ID-ul sistem, coordonatele, dimensiunile DIP și scalarea. Diagnosticul se actualizează la cinci secunde și elimină starea validată la pierderea legăturii.
5. Descarcă `nava-wall-profile.json`, mută-l în repository sau folosește calea sa completă. Importă-l:

```powershell
npm run wall:configure -- --profile nava-wall-profile.json --replace
npm run wall:preview
```

6. Grila verifică o axă comună și continuitatea caroiajului. Profilul cu `calibration: true` înlocuiește filmul cu grila și blochează auto-start prin preflight. După calibrare, **debifează grila, exportă și importă din nou**, apoi repornește playerul.
7. Numai pe instalația pregătită, pornește profilul de sală cu `npm run wall:start`. Această comandă nu a fost executată pe cele cinci TV-uri în verificarea locală.

Unghiurile de montare și spațiile nu au fost comunicate. Geometria curentă este o suprafață desfășurată, cu centre aliniate; nu implementează corecție optică off-axis pentru o anumită poziție a privitorului într-un arc. Montajul, continuitatea percepută și distanțele trebuie verificate fizic.

Samsung publică separat dimensiunile carcasei pentru [QN90F 98″](https://www.samsung.com/uk/tvs/qled-tv/qn90f-98-inch-neo-qled-4k-mini-led-smart-tv-qe98qn90fatxxu/) și [QN90F 115″](https://www.samsung.com/uk/tvs/qled-tv/qn90f-115-inch-neo-qled-4k-mini-led-smart-tv-qe115qn90ftxxu/). Ele nu înlocuiesc măsurarea suprafeței active și a îmbinărilor din sală.

## Experiența operatorului și a copiilor

Consola pornește în **Înainte de show**: verificări, cinci posturi, primirea echipajului și următoarele trei momente în limbaj obișnuit. **În show** aduce în față pauza, continuarea și încheierea; **Instrumente** păstrează toate comenzile, editorul, regia, SFX, utilizatorii și telemetria. Schimbarea vederii nu trimite comenzi. Rolurile și confirmările existente sunt păstrate. Finalul îndrumă operatorul spre salvarea certificatelor și pregătirea grupului următor.

Tabletele explică permanent A/stânga și B/dreapta. Alegerea locală în așteptare este distinctă de confirmarea serverului; un copil nu pierde focusul când celălalt răspunde. La reconectare se cere mai întâi vederea curentă, apoi se retrimite numai intenția încă relevantă. Schimbarea cue-ului elimină intențiile expirate, iar restartul golește alegerile și rearmează efectele. Certificatele includ răspunsurile confirmate; uploadurile vechi nu suprascriu mesajele unei misiuni noi. Subtitrările identice nu sunt reanunțate la fiecare broadcast.

Limită existentă: protocolul tabletelor nu include un ID unic de rulare. Dacă o tabletă pierde întreaga tranziție dintre două misiuni și revine exact la același cue, intenția veche nu poate fi identificată sigur numai din acel cue. Pentru trecerea la un grup nou, verifică reconectarea celor cinci tablete și starea curată de început. Nu a fost introdusă o schimbare ascunsă a contractului de rulare.

Fotografiile rendererului autentificat pot folosi limita existentă de 1,5 MB; o limită WebSocket de 64 KB le bloca anterior. Celelalte mesaje, inclusiv cele anonime, păstrează limita mică. Nu s-au schimbat scenariul, replicile, vocile, GLB-urile sau timpii.

## Dovezi software și verificarea fizică rămasă

- `npm run check`: typecheck, show, voci, build, **109 teste**, smoke core/auth/platform/media.
- `npm run smoke:renderer`: film real în avans, GLB vizibil, WebGL activ, autoplay veil ascuns; verificare span și ecran individual 4K.
- `npm run smoke:wall`: autentificare/redactare, clock central, cinci ieșiri numai cu dovezi native, pierdere conexiune/ieșiri, calibrare care blochează preflight, fotografie peste 64 KB și limita mesajelor anonime.
- Import: 11 verificări, inclusiv erori injectate la scriere/rename; configurația de bază rămâne byte-identică.
- Renderer real: panorama/cinema/grilă la 1920, 3840 și 7680 px lățime de preview, centru capturat la 3840×2160. Pixelii eșantionați ai fiecărui canvas panoramic coincid cu sursa calculată: eroare maximă 0 pe toate cinci panourile. Un singur element video.
- Web: consolele înainte/live/instrumente, login, debug, analytics, atelier, editor fără suprapunerea markerilor, opt teme și reduced-motion. Consola ghidată încape fără scroll la 1920×1080.
- Tablete: toate cele cinci posturi 1920×1080, A/B fără rotație, fără overflow, ținte ≥64 px, focus independent, reconectare, efecte unice, certificat/reîncercare, SFX din consolă și fotografie care se ascunde după 12 secunde.

Galerie nouă: `runs/debug/final-wall/index.html`; rezultate și loguri în același director. Verificările copiilor: `runs/debug/children-final/`. Comparația R5 inițială: `runs/debug/glass-r5/index.html`. Aceste directoare sunt locale, ignorate de Git. Scripturi reproductibile: `scripts/wall-review.mjs`, `scripts/wall-renderer-review.mjs`, `scripts/glass-effects-review.mjs`, în plus față de smoke-uri.

Rămâne obligatorie repetiția pe PC-ul cu **cinci ieșiri reale** și cele șase tablete: mapare și unghiuri, goluri/rame, scalare/overscan, aceeași rată de refresh, performanța continuă a ferestrei desktop 19200×2160, temperaturi/GPU/decodare, sincronizarea la îmbinări, citirea subtitrărilor din toate locurile, volumul și ieșirea audio centrală, autoplay după primul gest, atingere simultană A/B, Wi-Fi/reconectare și camera fizică. Verificarea locală nu poate certifica limita driverului GPU, sincronizarea fizică a panourilor sau capacitatea PC-ului de a susține cinci ieșiri 4K.

Nu s-a făcut commit, push, merge, release sau deploy.
