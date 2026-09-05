# Ilustrații EXODUS7 pentru copii

Data: 2026-09-05. Planul de mai jos a fost aprobat prin „DO IT, cât mai cute”. Pachetul de 10 imagini este generat și integrat în surse; descrierea livrării este în [ILUSTRATII-EXODUS7.md](ILUSTRATII-EXODUS7.md). Nu au fost rulate teste, builduri sau capturi noi; interdicția utilizatorului privind testarea rămâne în vigoare.

## Direcție vizuală

Referințe: logo-ul din `src/web/shared/brand/exodus7-v1.png` și mascotele din `src/web/shared/mascots/`. Obiecte 3D stilizate, volume rotunjite, sticlă turcoaz, suprafețe sidefate, accente portocalii și lumină caldă. Păstrăm identitatea celor cinci mascote. Ilustrațiile explică locul, acțiunea sau rezultatul; o singură scenă principală pe suprafață.

Pentru 5–10 ani folosim personaje expresive și obiecte ușor de recunoscut; pentru 10–15, instrumente și mici scene de explorare. Aceste ilustrații pentru copii nu se aplică automat profilurilor de adolescenți și adulți.

## Locurile identificate

| Prioritate | Suprafață existentă | Imagine propusă | Rol și integrare |
|---|---|---|---|
| 1 | Primirea și așteptarea inițială | Nava EXODUS7 într-un mic hangar luminos, pregătită de plecare | Creează sentimentul de îmbarcare. `mission-ui.ts`, ramura `.mission-wait`; `index.ts`, `renderWaiting()` pentru fluxul original. Păstrăm identificarea postului și A/B. |
| 1 | Tutorialul A/B | Doi exploratori la aceeași tabletă landscape, fiecare cu mâna pe propria jumătate | Arată concret împărțirea stânga/dreapta. `experience-ui.ts`, `experienceHeader()` / pasul `touch`. Etichetele A/B și săgețile se desenează în interfață, nu în imagine. |
| 1 | Montarea felinarului, 5–10 ani | Carcasă de felinar din sticlă și metal cald, cu fereastră liberă pentru piesă | Face recognoscibil obiectul pe care îl construiește copilul. `play-toys.ts`, `buildLight()`, etapa 2. Piesa, conturul potrivirii și gestul rămân SVG, deasupra carcasei. Imaginea singură nu declară montajul reușit. |
| 1 | Antena, 10–15 ani | Mic receptor de expediție, cu suport și antenă rotunjite, în aceeași familie cu nava | Explică mai bine ce instrument controlezi. `play-toys.ts`, `buildSignal()`. Ilustrația formează carcasa; unghiul, impulsurile, intervalele și valorile rămân calculate și desenate de cod. |
| 1 | Cele trei opțiuni finale pentru copii | Un felinar, două mâini care protejează o lumină, o busolă de explorator | Opțiunile devin mai ușor de recunoscut. `experience-ui.ts`, ramura `finale`, numai profilul `age-5-10`. Textele actuale sunt separate. Aceasta este îmbunătățirea prezentării; refacerea mecanicii finalului rămâne o decizie distinctă. |
| 1 | Jurnalul salvat | Emblemă de expediție cu EXODUS7 și detaliu ilustrat al navei | Face jurnalul recognoscibil ca suvenir. Logo-ul existent se compune peste un asset fără text. `mission-ui.ts`, `certificate()`; `certificate.ts`, `drawCertificate()` pentru fluxul original. Rezultatele reale și textele rămân lizibile. |
| 2 | Așteptarea dintre etape | Nava văzută printr-un hublou, în croazieră | Leagă intervalul de poveste și îndeamnă la privirea TV-ului. `mission-ui.ts`, `.mission-wait`; nu adăugăm un joc sau obiecte apăsabile în această pauză. |
| 2 | Încheierea pe TV | Pământul cu o mică navă întorcându-se acasă, discret în fundal | Întărește întoarcerea acasă. `src/renderer/ui/experience.ts`, ramura `finaleActive`, și `experience.css`. Numai după dezvăluirea existentă; spațiul GLB-ului și subtitrărilor rămâne rezervat. |
| 3 | Indiciile și confirmările | Variante ale mascotelor existente: arată o piesă, privește TV-ul, se bucură de rezultatul primit | Însoțesc o instrucțiune scurtă, fără popup care întrerupe gestul. `play-board.ts`, `.play-help` / `.play-feedback`. Reușita urmărește confirmarea serverului; o încercare greșită nu primește imagine de succes. |
| 3 | Alegerea postului | Cele cinci mascote în mici scene cu busolă, propulsor, antenă, senzor și arhivă | Identifică rolurile prin obiecte. `index.ts`, `renderPostPicker()`. Prioritate mai mică: ecranul are deja mascote și este folosit rar când postul este configurat în URL. |

## Primul pachet: 10 imagini

Destinație: `src/web/shared/illustrations/exodus7/`. Galeria este în `index.html`, iar fiecare PNG are prompt și proveniență într-un fișier `.prompt.md` alăturat.

1. `ship-boarding-v1.png` — nava pregătită de plecare.
2. `ship-cruise-v1.png` — nava în croazieră, pentru așteptare.
3. `tutorial-pair-v1.png` — doi exploratori și tableta împărțită.
4. `lantern-shell-v1.png` — carcasa felinarului, cu zona piesei liberă.
5. `signal-receiver-shell-v1.png` — carcasa receptorului.
6. `keepsake-light-v1.png` — felinar pentru opțiunea finală.
7. `keepsake-care-v1.png` — mâini protectoare și lumină.
8. `keepsake-compass-v1.png` — busolă de explorator.
9. `expedition-emblem-v1.png` — suport ilustrat pentru emblema jurnalului.
10. `homecoming-v1.png` — întoarcerea acasă, pentru încheierea TV.

Generarea folosește instrumentul imagegen integrat și referințele existente. Obiectele izolate cer transparență reală; scenele au fundal aerisit și zone libere pentru text. Fiecare imagine se generează separat și se păstrează în proiect cu promptul său. Nu generăm text românesc în raster.

## Limite de integrare

- Zonele A/B rămân independente, normale la citire, la 1920×1080 landscape. Ilustrațiile nu reduc țintele tactile și nu acoperă controalele.
- Piesele cu forme exacte, traseele circuitului, graficele și datele rămân SVG/Three.js/HTML. Geometria educativă este determinată de cod, iar asseturile îi oferă context.
- Circuitele și luminile active se desenează din starea reală. Nu imprimăm în imagini un circuit greșit, date fictiv confirmate sau un rezultat deja reușit.
- Mascotele decorative se reduc sau se ascund conform setărilor existente de confort. Nu adăugăm mișcare continuă ori sunete noi pentru simpla afișare a unei imagini.
- TV-ul folosește asseturile în spațiul central existent. Căpitanul rămâne GLB-ul configurat, iar filmul și vocile nu se modifică.
- Jurnalul folosește asseturi locale, încărcate înainte de exportul canvas; grafica nu înlocuiește contribuțiile și nu acordă merite pe care rularea nu le confirmă.
