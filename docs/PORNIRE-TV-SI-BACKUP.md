# Pornire TV coordonată, stare tehnică și backup SQLite

Implementare: 11 septembrie 2026. Cod nou în repository; aplicația activă nu a fost repornită.

## Pornirea filmului

START (inclusiv DEMO TV și plecarea după tutorial) intră într-o verificare asincronă, înainte de film. PLAY din idle trece prin același flux. Repornirea dintr-o pauză nu declanșează această verificare. Repetiția tehnică internă păstrează calea diagnostic existentă.

1. Serverul creează un ID unic de pregătire pentru sesiunea, epoca cronologiei, pachetul și lista actuală de ecrane.
2. Fiecare renderer pregătește filmul la 0, în pauză, și confirmă după ce decodorul este pregătit, seek-ul s-a încheiat și timestampul cadrului decodat este la început (toleranță 35 ms). În span sunt pregătite toate sursele din acel compositor. Pentru film unic se confirmă suprafețele alimentate de sursa comună.
3. Serverul acceptă confirmările numai de la conexiuni screen autentificate și numai pentru ieșirile atribuite. Confirmări vechi și ID-uri străine nu satisfac verificarea. Deconectarea retrage confirmarea.
4. Se așteaptă maximum 15 secunde. Lipsurile sunt afișate în consola tehnică. Vocile, preflight-ul și problemele peretelui live sunt verificate înainte de programarea startului.
5. După confirmări, renderer-ele primesc același timestamp de pornire, cu 1,2 secunde înainte. Fiecare aplică START folosind estimarea ceasului serverului; serverul pornește aceeași cronologie. Ecoul comenzii este identificat pentru a evita o a doua pornire locală.
6. Resetarea sau deconectarea înainte de start anulează pregătirea. Schimbările de cronologie sunt blocate în timpul pregătirii. Erorile rămân vizibile pentru intervenție/reîncercare.

Cererea START poate răspunde ok când pregătirea a fost acceptată; starea tehnică indică separat dacă filmul a pornit efectiv. Preview-ul este etichetat explicit și nu certifică televizoarele fizice. Verificarea este înaintea filmului, nu înaintea fiecărei replici sau în timpul jocurilor. Nu s-au introdus noi opriri automate ale filmului în desfășurare; corecțiile video existente rămân active.

Acesta este un start software coordonat, nu genlock hardware. Nu dovedește latența internă a televizoarelor Samsung și nu promite scanarea identică a pixelilor. Necesită verificare vizuală pe cele cinci TV-uri, cu profilurile reale de imagine și cablarea reală.

## Stare tehnică

Consola afișează Pregătit / TV-urile se pregătesc / În așteptarea instalației / Necesită intervenție. Detaliile includ ieșirile confirmate/lipsă, preview, timestampul checkpointului SQLite, data ultimei copii și erorile backupului. Detaliile sunt expandabile, fără panou mare permanent.

GET /api/technical cere viewer sau superior. POST /api/technical/backup cere operator sau superior. Pollingul stării tehnice nu umple jurnalul HTTP cu o intrare în fiecare secundă.

## Backupuri

- Baza existentă este copiată prin API-ul online backup din node:sqlite, în loturi de 100 pagini; nu se copiază brut fișierul deschis.
- Copia temporară trece PRAGMA quick_check, apoi este publicată prin rename. La eroare rămân disponibile copiile anterioare.
- Destinație: data/backups, lângă nava.sqlite. Numele includ timestamp și UUID. Se păstrează cele mai recente 12 copii ale serviciului; nu se șterg alte fișiere.
- Timerul verifică o dată pe minut dacă au trecut minimum 5 minute de la ultima încercare. Backupul automat este amânat în timpul filmului, preshow-ului și epilogului; rulează în idle/ended sau cu sesiunea suspendată, când nu se pregătește startul TV.
- Prima încercare automată este la primul interval eligibil după pornire. Butonul „Creează backup acum” permite operatorului aceeași operație în așteptare/suspendare.
- Copiile existente sunt inventariate la relansare. Cererile concurente împart o singură operație. Închiderea controlată așteaptă operația înainte de închiderea conexiunii SQLite.
- Copiile sunt pe același disc și conțin datele misiunilor; nu protejează împotriva pierderii discului. Exportul pe alt suport și restaurarea asistată din backup nu sunt implementate în această etapă. Recuperarea obișnuită după crash folosește în continuare checkpointurile din baza principală.

## Verificare și limite

Typecheck și build verificate. Fără teste automate, browser automation, crash indus sau pornire a unei instanțe Electron, conform interdicției anterioare de testare. Nu se pretinde confirmare de funcționare pe hardware. De verificat ulterior: 5 ferestre și span, TV lipsă, deconectare în pregătire, reset înainte de start, DEMO preview, o singură pornire a vocii/countdownului, backup și retenție pe discul real.
