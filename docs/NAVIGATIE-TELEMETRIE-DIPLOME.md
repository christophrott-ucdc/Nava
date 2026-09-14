> Corecție ulterioară: panourile TV sunt acum o bandă de 6%, iar modelul fizic presupus a fost eliminat. [Comportamentul curent](TELEMETRIE-BANDA-FILM.md).

> Corecție QR: acces public independent de LAN, cu portal static pregătit și DIPLOMA_PUBLIC_URL încă de configurat după publicare. Nu există încă un domeniu public activ confirmat. [Stare curentă și telemetria pe laterale](DIPLOME-PUBLICE-SI-TELEMETRIE-PERETE.md).

# Navigație, telemetrie și diploma echipajului

Implementare: 11 septembrie 2026. Necesită repornirea Electron și reîncărcarea paginilor tabletelor. Nu modifică filmul, vocile, muzica sau comenzile jocurilor.

## Comportament

Pe toate cele cinci tablete, instrumentele ocupă spațiul principal între activități. Când începe o activitate, devin o bandă de 84 px în partea de jos; cele două zone de joc își păstrează identitatea A/stânga și B/dreapta. Butonul „Deschide harta” permite inspectarea temporară, iar Escape închide harta. La începutul unei activități, harta extinsă se închide automat.

Destinațiile se pot selecta pentru explicații. Apăsarea unei metrici explică mărimea fizică și modelul. Radarul permite schimbarea razei ×1/×2/×4. Aceste acțiuni sunt locale și nu pilotează filmul sau modifică răspunsurile la jocuri.

Harta apare și în dreapta ecranului central, în zona de focus a peretelui panoramic. Grafica lumilor se mută alături, pentru a păstra instrumentele separate. Instrumentele dispar la epilog; diploma apare după încheierea acestuia. Se respectă pauza, seek-ul și reducerea mișcării. Tableta nu continuă extrapolarea ceasului în pauză sau după pierderea conexiunii.

## Ce este calculat și ce nu

`src/shared/flight-model.ts` este sursa comună pentru TV și tablete. Folosește reperele filmului de 678,05 s:

| Reper | Secunda filmului |
|---|---:|
| Pământ, plecare | 0 |
| Lumina | 60 |
| Natura | 144 |
| Cristal | 246 |
| Tunel | 388 |
| Saturn | 504 |
| Pământ, întoarcere | 610 |
| Sfârșit film | 678,05 |

Traseul mare este o **schemă editorială fără scară astronomică**. Poziția simbolului navei este interpolată între repere cu `u²(3−2u)`. Nu este o hartă de efemeride și nu reproduce orientarea camerei SpaceEngine. Lumile fantastice nu au distanțe astronomice cunoscute.

Instrumentele prezintă un **model educativ de propulsoare**, nu măsurători reale extrase din imagine. Masa inițială este 12.000 kg, masa uscată 9.000 kg, impulsul specific 450 s, tracțiunea maximă 18.000 N. Acestea sunt ipoteze ale navei fictive. Modelul nu include gravitația, atmosfera, soluții orbitale sau fizica unui tunel spațial.

- Forța variază continuu în impulsuri `Fmax × sin²(πu)` asociate manevrelor din secvențe.
- Debitul este `ṁ = F / (Isp × g₀)`, cu `g₀ = 9,80665 m/s²`.
- Accelerația propulsivă este `F / m`; masa scade cu propulsantul consumat.
- Δv acumulat este integrala accelerației propulsive ca mărime pozitivă. **Nu este viteza absolută a navei.**
- Poziția și viteza pe pista locală de antrenament se integrează la pas fix de 0,25 s, cu forța și masa la mijlocul pasului. Valorile sunt reconstruite determinist după timp, astfel încât seek-ul nu dublează consumul.
- Balizele radarului sunt puncte virtuale pe aceeași pistă locală integrată. Distanța este norma vectorului relativ; relevmentul derivă din `atan2`. Nu sunt detecții radar reale ale planetelor. În tunel nu se afișează contacte sau distanțe fizice.

Interfața poartă eticheta „SIMULARE EDUCATIVĂ”; unitățile au sens fizic, valorile provin din ipotezele documentate. O reconstrucție exactă a camerei necesită exportul poziției/orientării și parametrilor camerei la aceleași cadre ca filmul, nu doar MP4-ul. Un astfel de export nu a fost integrat în această livrare.

Fundamente: [ecuația tracțiunii NASA Glenn](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/rocket-thrust-equation/), [ecuația ideală a rachetei](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/ideal-rocket-equation/), [distanțele cosmice și unitatea astronomică](https://science.nasa.gov/solar-system/cosmic-distances/).

## QR și PDF

După starea `ended`, serverul trimite `crewDiplomaUrl` către tablete și renderer. QR-ul apare pe tablete și pe ecranul central. PDF-ul A4 landscape include EXODUS7, titlul profilului, data și personajele participanților confirmați, fără nume personale, clasament sau rezultate inventate. Repetițiile și demonstrațiile fără participanți sunt etichetate explicit.

Ruta publică este `/souvenir/:run/:token/diploma.pdf`. Tokenul HMAC este o capabilitate de acces pentru acea diplomă; nu oferă acces la consolă sau la lista sesiunilor. Nu este necesar cont de operator. Telefonul trebuie să poată accesa IP-ul LAN al navei; o rețea Wi-Fi cu izolarea clienților sau schimbarea IP-ului poate face QR-ul inaccesibil. Nu există găzduire pe internet în această implementare.

La prima accesare, Electron folosește o fereastră invizibilă, izolată, fără JavaScript sau resurse externe, pentru `printToPDF`. O singură generare este permisă simultan; cererile pentru aceeași diplomă partajează operația. Operația are timeout de 20 s și închide fereastra. PDF-ul este salvat în `runs/crew-diplomas/<runId>.pdf`, apoi reutilizat inclusiv după resetare/restart. Nu este regenerat la fiecare scanare și nu depinde de PNG-ul trimis de tabletă.

`runs/crew-diplomas/.download-secret` păstrează cheia legăturilor între reporniri. Backupul acestei funcționalități include PDF-urile, acest secret și baza SQLite; schimbarea secretului invalidează URL-urile anterioare. Nu publicați directorul integral ca fișiere statice. Serverul fără callback Electron nu emite un QR de generare nou.

## Verificare efectuată și limite

TypeScript și buildul au trecut. Conform interdicției utilizatorului, nu au fost rulate teste, nu a fost pornită aplicația pentru verificare și nu s-au produs capturi sau un PDF demonstrativ. Nu declarăm verificată vizual încadrarea, scanarea QR, tiparul PDF sau redarea pe hardware.

La acceptarea pe instalație: urmăriți trecerea mare/compact în cele trei activități; verificați A/B și țintele tactile; pauză, seek, reconectare; harta din dreapta centrului fără suprapuneri; scanare de pe Wi-Fi, diacriticele și încadrarea PDF pentru 1 și 10 participanți; descărcarea repetată și după resetare/restart. Nu au fost efectuate commit, push sau deploy.
