# Recuperarea experienței din SQLite

Implementare actualizată la 11 septembrie 2026. Folosește baza existentă `data/nava.sqlite` de lângă directorul runs al aplicației, nu o bază nouă. SQLite rămâne WAL + synchronous=FULL. Nu s-au șters sesiuni sau modificat schema.

## Ce se păstrează

- Identitatea sesiunii, profilul, hash-ul conținutului, scena/faza și timpul autoritativ al show-ului.
- Participanții, personajele, alegerile și progresul jocurilor; confirmările de acțiuni rămân în tranzacția SQLite existentă înainte de ACK.
- Stadiul tutorialului, contribuțiile finalului, setările de accesibilitate, limba, ambientul, tabletSfx și varianta.
- Viteza nominală de redare, inclusiv când experiența este în pauză; data ultimului checkpoint confirmat.

Timerul de checkpoint este 250 ms, separat de difuzarea stării către clienți. Stările identice nu provoacă rescrieri inutile. Datele din memorie și cheia de deduplicare sunt actualizate doar după salvare reușită. Erorile la salvarea periodică suspendă cronologia și apar în log și în panoul Recuperare.

250 ms este intervalul programat, nu o limită garantată de pierdere: blocarea procesului, I/O lent și defectarea discului pot mări intervalul. Se salvează cronologia autoritativă a serverului, nu fiecare cadru scanat fizic de fiecare TV. Nu este replicare pe alt PC și nu înlocuiește un backup.

## După crash

1. Relansează aplicația cu aceeași configurație, aceleași filme și aceeași bază SQLite.
2. Se examinează ultima sesiune înregistrată. O sesiune mai veche rămasă active nu este reînviată dacă ultima s-a încheiat. Se poate recupera și pregătirea cu personaje/participanți, înainte de pornirea filmului.
3. Profilul/hash-ul și validitatea checkpointului sunt verificate. Conținutul incompatibil rămâne pe disc și este raportat; nu se reia cu alte replici.
4. Cronologia este restaurată suspendată, fără autostart. În consolă, alerta deschide Recuperare și afișează momentul salvat și ora salvării.
5. Apasă „Verifică și continuă”. Se verifică preflight/readiness, se scrie starea pe disc și abia apoi se permite avansarea. Un show salvat în pauză rămâne în pauză; folosește apoi Continuă.
6. Tutorialul reia explicația pasului curent. Nu se șterg progresul sau participanții. Un grup nou este o acțiune separată.

Reluarea este serializată și idempotentă. Consola trimite runId, respins dacă sesiunea s-a schimbat; clienții API existenți pot încă trimite corpul gol. Comenzile normale și DEMO TV sunt blocate cât timp reluarea se pregătește. O eroare de salvare la reluare lasă experiența suspendată și permite reîncercarea după remedierea discului.

## Limite audio și verificare

Poziția filmului este restaurată la checkpoint. Replica vocală aflată în curs la crash nu este reluată la nivel de eșantion audio: cue-urile anterioare sunt sărite, cele viitoare continuă pe cronologie. Nu se promite recuperarea exactă a unui cuvânt ori a stării interne GLB. Muzica folosește sincronizarea existentă cu faza; nu s-a schimbat mixerul.

Typecheck și build trecute. Adăugate cazuri de regresie pentru redeschiderea SQLite, pregătirea echipajului, neînvierea sesiunilor vechi și retry după eroare de scriere, dar NU executate conform interdicției de testare. Nu s-a produs un crash real și nu s-a repornit aplicația activă. Rămân de verificat ulterior: crash în film/tutorial/pauză, reconectarea tuturor ecranelor, lipsa vocilor, disc plin, apăsări repetate și continuitatea audio/video pe instalație.

Nu copia numai nava.sqlite dintr-o aplicație activă ignorând fișierele WAL/SHM. Pentru backup este necesară o copie consistentă SQLite sau oprirea controlată a aplicației. Actualizare ulterioară: backupul automat consistent este implementat; vezi [Pornire TV și backup](PORNIRE-TV-SI-BACKUP.md).
