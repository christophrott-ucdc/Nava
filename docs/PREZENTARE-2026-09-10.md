# Prezentarea EXODUS7 — 10 septembrie 2026

## Pornire rapidă — doar TV, fără tablete

Închide Electronul deja deschis și pornește `PREZENTARE.bat` (sau `PREZENTARE.bat --live` pentru televizoare). Apasă **▶ DEMO TV**, sus, pe ecranul de așteptare al ferestrei Electron. Nu este necesară autentificarea în consolă sau conectarea tabletelor. Butonul alege automat `age-5-10`, pregătește vocile și pornește de la numărătoarea inversă de zece secunde, apoi filmul și epilogul. Primirea și tutorialul interactiv sunt omise explicit în acest mod; replicile înregistrate ale scenariului pentru copii sunt păstrate, inclusiv referirile la activități.

Modul păstrează sincronizarea TV, Căpitanul GLB, subtitrările și muzica. Nu inventează participanți sau răspunsuri, nu afișează rezultate goale ori alegerea finală de pe tablete; înregistrarea sesiunii este marcată `rehearsal`. Fișierele și pregătirea vocilor/video sunt verificate înaintea pornirii. Nu cere tablete și poate rula în preview, fără să certifice prezența celor cinci televizoare fizice. Butonul dispare în timpul redării și reapare la final; dacă pregătirea nu reușește, afișează motivul și permite reîncercarea. Resetarea normală a sălii elimină modul demo.

Implementare compilată cu `npm run build`; pornirea noului buton nu a fost testată în runtime în această livrare urgentă. Nu folosi executabilul portabil vechi: buildul curent este cel pornit prin lansatorul repository-ului.

Se prezintă **experiența copiilor de 5–10 ani**, „Bucățile de acasă”, către Dumitru Prunariu. Profilul rămâne `age-5-10`, chiar dacă evaluatorul este adult. Ghidul operează consola, iar evaluatorul poate parcurge experiența cu **un singur personaj confirmat**.

Pentru demonstrația individuală recomandăm **postul 2, zona A, în stânga**: piesa „Aripă” face vizibil exercițiul de rotație. Postul 1A are piesa „Cerc”; rămâne valid, dar rotația unui cerc se observă mai greu. Alegerea personajului nu schimbă postul fizic sau forma din joc.

## Pornire

Lansatorul acestei livrări este `PREZENTARE.bat`, din rădăcina repository-ului. Modul implicit este preview-ul celor cinci suprafețe într-o singură fereastră; `--live` este destinat televizoarelor fizice.

```powershell
cd C:\Users\Chris\Documents\GitHub\Nava
.\PREZENTARE.bat
```

Pe instalația fizică, după verificarea desktopului extins și a profilului display-urilor:

```powershell
.\PREZENTARE.bat --live
```

Nu lansa o a doua instanță peste una deja pornită. Preview-ul arată compoziția panoramei; nu confirmă că cele cinci ieșiri fizice sunt conectate sau calibrate. Verifică profilul activ din consolă după pornire, inclusiv dacă aplicația a recuperat o sesiune anterioară.

- Consola ghidului: [localhost:4321/control/](http://localhost:4321/control/), autentificare cu PIN-ul operatorului existent.
- Tableta demonstrației pe același PC: [localhost:4321/tablet/?post=2](http://localhost:4321/tablet/?post=2).
- Pe un dispozitiv separat, înlocuiește `localhost` cu IP-ul LAN afișat în consola operatorului și păstrează `/tablet/?post=2`.
- Filmul și Căpitanul apar în fereastra Electron **A Patra Lume — Nava**. Butonul **Arată playerul** o aduce în față; consola web nu este ecranul filmului.

## Verificarea înainte de sosirea evaluatorului

| Verificare | Ce trebuie observat efectiv |
|---|---|
| Profil | **5–10 ani · Bucățile de acasă** este afișat ca activ. Schimbarea selectului singură nu aplică profilul. |
| Starea sesiunii | Grup nou, cu lista de personaje liberă; nicio recuperare suspendată și nicio repetiție tehnică în curs. |
| Readiness | Ecranele cerute sunt conectate, filmul pregătit, activele verificate; sunt conectate posturile care au participanți confirmați. |
| Film și avatar | Redare reală pe cele cinci suprafețe, imagine continuă, Căpitanul GLB și subtitrările numai pe centrul configurat. |
| Sunet | Se aud naratorul, Căpitanul și Avatarul AI pe o singură ieșire audio. Muzica rămâne sub voce; fără ecou de la televizoare care repetă aceeași pistă. |
| Tabletă | Landscape 1920×1080, A stânga/B dreapta, text orientat normal. Atingerea acționează pe ecranul și jumătatea corecte. |
| Final | Alegerea finală poate fi trimisă, este vizibilă pe centru, iar jurnalul ajunge în consola operatorului. |

Rulează o sesiune completă cu un participant înainte de prezentare. După repetiție, pregătește un grup nou; nu lăsa pe ecran contribuții sau personaje rămase de la probă. Readiness este un control software, nu dovada că sunetul se aude sau că imaginile se îmbină corect în sală.

## Parcursul demonstrației

1. **Alege profilul.** În „Înainte de show”, selectează **5–10 ani · Bucățile de acasă** și apasă **Aplică**, dacă nu este deja activ. Așteaptă verificarea vocilor. Dacă există o misiune suspendată, folosește „Misiune și instalație → Recuperare” pentru o decizie explicită de continuare sau grup nou.
2. **Deschide postul 2.** Evaluatorul folosește jumătatea A. Alege un personaj și confirmă-l pe tabletă. În consolă trebuie să apară **1 participant**, la postul 2, zona A. Nu confirma alte personaje pentru a umple lista.
3. **Pregătește tutorialul.** Apasă **Pregătește echipajul și tutorialul**, apoi **Începe tutorialul**. Personajele se fixează pentru grupul curent. Atingerea inițială permite și redarea sunetelor locale ale tabletei.
4. **Lasă proba să se desfășoare.** Participantul își confirmă prezența, alege steaua la proba comenzilor, apoi confirmă legătura cu echipajul. Pașii avansează automat când contribuțiile necesare și vocea naratorului sunt încheiate. Nu trebuie apăsate simultan două zone și nu este necesar un al doilea participant.
5. **Predă Căpitanului.** La pasul „Pregătiți”, așteaptă deblocarea butonului **Pornește călătoria**. Deblocarea cere încheierea explicației confirmată de renderer, contribuțiile și readiness. Apasă o dată. Predarea vocală se încheie înainte de primire; dialogul se închide când începe preshow-ul.
6. **Urmărește filmul.** Primirea durează 50 de secunde, urmată de numărătoarea de 10 secunde. Consola trece în „În show”. Cu instalația pregătită, parcursul continuă automat. Nu scurta primirea sau jocurile prin salturi pe timeline în prezentarea normală.
7. **Lasă participantul să descopere.** În cele trei activități, găsește forma potrivită, o rotește și o montează, apoi închide circuitul felinarului. Ajută printr-o indicație scurtă când este nevoie, fără să preiei tu comenzile. Reușita este păstrată, iar participantul poate continua să încerce cât timp etapa este deschisă.
8. **Încheie pe tabletă și pe ecranul central.** Lasă epilogul și invitația naratorului să se termine. Participantul alege o lumină, grija pentru ceilalți sau curajul de explorator, apoi apasă **Trimite simbolul meu**. Selectarea cardului singură nu trimite contribuția. Alegerea de a privi rămâne validă.
9. **Verifică jurnalul.** În „Tutorial și echipaj → Jurnalele expediției”, apasă **Actualizează lista jurnalelor**. Linkul către fișier confirmă primirea. Dacă lipsește, cere retrimiterea de la postul 2 conectat și actualizează din nou. Confirmarea cererii de retrimitere nu este confirmarea transferului.
10. **Pregătește alt grup numai după încheiere.** Resetarea eliberează personajele și contribuțiile sesiunii următoare; nu este necesară pentru a încheia elegant demonstrația curentă.

Durata filmului este **678,05 secunde — 11:18,05**. Programul cu primire, lansare și epilog este **50 + 10 + 678,05 + 75 = 813,05 secunde — aproximativ 13:33**, la care se adaugă alegerea personajului, tutorialul, eventualele pauze și timpul de încheiere interactivă. Nu prezenta durata ca fiind exact 13 minute pentru întreaga vizită.

## Ce spune și ce face ghidul

Introducere sugerată, spusă de ghid, fără modificarea înregistrărilor: „Vă arătăm experiența pregătită pentru copiii de 5–10 ani. Puteți încerca singur toate activitățile; nava se adaptează la participanții prezenți.”

Lasă spațiu vocilor și imaginii. Dacă participantul ezită, indică gestul disponibil: „Caută forma”, „Încearcă s-o rotești”, „Urmărește circuitul până înapoi la baterie”. La final, întreabă ce a observat. Felinarul este un model simplificat pentru observarea formelor, rotației și circuitului închis; nu măsoară un circuit fizic din sală.

Explicație simplă pentru delimitarea științei de poveste: **„Pământul și Saturn sunt reale. Călătoria atât de rapidă și tunelul prin spațiu țin de imaginația poveștii. O gaură neagră nu este un pasaj demonstrat spre altă lume.”** Nu descrie lumile inventate sau scurtarea distanțelor ca observații ori tehnologii existente.

## Pauză, deconectare și recuperare

| Situație | Acțiunea ghidului |
|---|---|
| Participantul are nevoie de explicații în timpul filmului | Apasă **Pauză**, oferă ajutorul, apoi **Continuă**. Nu derula peste activitatea neînțeleasă. |
| Tutorialul are nevoie de o pauză | În „Tutorial și echipaj”, deschide „Oprește, repetă sau gestionează echipajul”. Folosește **Pauză**, apoi **Continuă**; **Repetă explicația** reia vocea pasului. |
| Contribuția apare confirmată, dar pasul încă așteaptă | Citește mesajul despre voce. Explicația trebuie să se încheie pe renderer, nu doar să expire un cronometru în browser. Verifică playerul și sunetul dacă așteptarea persistă. |
| Tableta postului 2 se deconectează | Pune filmul pe pauză dacă rulează. Restabilește rețeaua sau redeschide aceeași adresă, cu `post=2`. Personajul și progresul sunt păstrate; nu completa alt post ca înlocuitor și nu reseta grupul. Reia când legătura este confirmată. |
| Aplicația se repornește | În consolă, „Misiune și instalație → Recuperare → Verifică și continuă”. Recuperarea cere verificările instalației. Alege „Grup nou” numai dacă intenția este să începi de la zero. |
| Imaginea lipsește sau sunetul nu se aude | Verifică fereastra playerului, readiness și ieșirea audio. Nu confunda o comandă acceptată cu redarea văzută și auzită. |
| Trebuie încheiată anticipat demonstrația | **Treci la epilog** este o intervenție explicită. Anunță că închei parcursul mai devreme; nu prezenta această probă drept sesiune integrală. |

Sesiunea acceptă **1–10 participanți**, inclusiv numai un loc B sau trei persoane pe două tablete. Contează personajele confirmate. Locurile libere rămân libere; deconectarea unui post ocupat nu îl transformă automat într-un post liber. Nu modifica lista în timpul show-ului.

## Confirmarea pe instalația fizică

Configurația autoritativă este un singur PC cu **98″ — 98″ — 115″ — 98″ — 98″**, televizoare Samsung QN90F în linie dreaptă, cu **500 mm între ecrane**. Căpitanul GLB este numai pe centrul de 115″; nu există interpret fizic sau robot integrat în această prezentare. Cele cinci tablete de post și tableta operatorului sunt 1920×1080 landscape.

Înainte de folosirea modului `--live`, confirmă fizic:

- Windows folosește desktop extins, cu ordinea corectă a ecranelor, nu duplicarea imaginii. Identificarea ferestrelor corespunde televizoarelor reale.
- Panorama păstrează proporțiile, îmbinările și golurile de 50 cm. Alinierea verticală și poziția publicului la aproximativ 4–5 metri se verifică în sală; configurația software nu măsoară singură montajul.
- Nu există diferențe evidente de procesare sau întârziere între TV-uri la mișcarea camerei. Sincronizarea software nu elimină automat latența internă diferită a televizoarelor.
- Căpitanul și subtitrările se văd de la locul evaluatorului, inclusiv peste cadre luminoase. Nu este suficient ca ele să existe în captura de ecran.
- Naratorul, vocile personajelor și muzica sunt inteligibile la volum de sală; muzica nu acoperă replicile. SFX-urile tabletelor se aud discret și respectă comanda **Sunete tablete**.
- Maparea fiecărui touchscreen este corectă, inclusiv dacă toate suprafețele tactile sunt conectate la același PC. Verifică și zonele A/B, nu doar pointerul mouse-ului.

## Starea verificărilor

**Baseline anterior acestei pregătiri:** 211/211 teste, plus probele documentate pentru renderer, sincronizarea cadrelor și cinema, în [REINTEGRARE-FILM.md](REINTEGRARE-FILM.md) și `runs/frame-sync/`. Aceste rezultate aparțin reviziei anterioare; nu certifică automat modificările din 10 septembrie.

Acest ghid nu atribuie rezultate testelor sau capturilor încă neîncheiate ale rundei curente. Integrarea finală trebuie să consemneze separat comenzile executate, rezultatele și capturile reale. Verificările software pot confirma logica, fișierele și redarea observată de aplicație; **acceptarea montajului celor cinci televizoare, sunetul auzit și atingerea tabletelor cer repetiția pe hardware-ul fizic**.
