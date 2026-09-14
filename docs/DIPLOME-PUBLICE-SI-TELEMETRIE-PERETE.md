> Corecție ulterioară: panourile TV sunt acum o bandă de 6%, iar modelul fizic presupus a fost eliminat. [Comportamentul curent](TELEMETRIE-BANDA-FILM.md).

# Diplome publice și telemetrie pe toate ecranele

Actualizare 11 septembrie 2026. Înlocuiește cerința LAN din documentația anterioară a QR-ului.

## Perete și tablete

Pentru instalația cu cinci TV-uri, ordinea fizică este determinată din `videoWall.panels.x`; dacă geometria lipsește, din `displayIndex`. Lateralele corespund posturilor 1, 2, 4, 5. Ecranul central prezintă navigația postului 3.

| Post | Instrumente mari / laterale |
|---|---|
| 1 | Tracțiune, accelerație, debit de propulsant, viteză efectivă a gazelor |
| 2 | Tracțiune, propulsant rămas, masă navă, consum acumulat |
| 3 | Navigație, radar, tracțiune, accelerație, propulsant, Δv |
| 4 | Tracțiune, Δv, componentele accelerației X și Y în reperul local |
| 5 | Tracțiune, timp film, progresul filmului, durata rămasă a secvenței |

Aceeași funcție calculează afișajele tabletelor și ale TV-urilor. Nu există oscilații aleatoare sau contoare independente. Lateralele indică numărul de participanți confirmați la postul corespunzător; acesta nu pretinde că tableta este online. Încadrarea folosește fiecare viewport separat, inclusiv în preview și span; panourile laterale nu sunt mutate în containerul central. Mișcarea redusă, pauza și derularea folosesc aceeași stare a misiunii.

Acestea rămân valori ale modelului educativ documentat în NAVIGATIE-TELEMETRIE-DIPLOME.md, nu senzori hardware sau parametri de cameră recuperați din MP4.

## QR independent de instalație

Portalul static este construit în **`dist/public-diploma/`**: `index.html`, `app.js`, `logo.png`. Este independent de Electron, serverul navei, API-uri și rețeaua sălii.

QR-ul include în fragmentul URL versiunea, profilul de vârstă, data, locurile/personajele anonime și indicatorul demonstrație. Nu include cheia ElevenLabs, tokenuri administrative, nume personale sau identificatorul sesiunii. Fragmentul nu se trimite la serverul de hosting. Datele sunt validate înainte de desenare și nu sunt inserate ca HTML. Nu este o semnătură sau o acreditare: diploma este un suvenir de participare și payload-ul poate fi modificat de deținătorul URL-ului.

Telefonul deschide pagina publică pe date mobile sau Wi-Fi, desenează diploma și produce local un PDF A4 landscape cu imagine JPEG de 1800×1273 px. Nu este necesară publicarea fiecărei sesiuni sau o conexiune la internet a PC-ului în timpul experienței. Linkul nu expiră cât timp pagina publică rămâne disponibilă. PDF-ul descărcat funcționează offline; prima deschidere a paginii cere internet.

## Activare rămasă

1. Alegeți domeniul/contul public. Nu există încă o adresă publică confirmată în această livrare.
2. Publicați **numai conținutul `dist/public-diploma/`**, la o adresă HTTPS stabilă. Nu publicați repository-ul, `.env`, `runs` sau serverul operatorului. Publicarea nu a fost efectuată; cererea separată de deploy rămâne necesară.
3. Setați `DIPLOMA_PUBLIC_URL` în `.env` la adresa exactă a portalului (director terminat în `/` sau `index.html`), apoi reporniți Electron.
4. Verificați URL-ul pe un telefon cu Wi-Fi oprit, descărcați PDF-ul, apoi repetați cu PC-ul navei oprit.

Fără configurare publică validă, aplicația **nu mai afișează QR-ul LAN**. Arată că diploma nu este încă disponibilă și scrie o avertizare în jurnalul serverului. Ruta locală veche este păstrată pentru compatibilitate, dar nu mai este sursa QR-ului pentru public.

Typecheck și build au trecut. Nu s-au rulat teste, aplicația pentru verificare vizuală, scanări QR sau verificări PDF, conform cererii anterioare a utilizatorului. Nu există deploy sau domeniu activ confirmat. Artefactele sunt pregătite pentru publicare, nu prezentate drept serviciu public funcțional.
