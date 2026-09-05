# Nava — planul educativ al interacțiunilor 3D

Data: 2026-09-05. Stare actualizată: cele 12 activități vizuale, tutorialul și finalul sunt implementate; detalii și dovezi în [EDUCATIE-3D.md](EDUCATIE-3D.md). Formulările de proiectare de mai jos păstrează rațiunea planului. Extensiile marcate separat nu sunt implementate.

Planul pornește de la mecanicile reale din `src/shared/scenario-engine.ts`. Revizia separată a fost realizată de un agent AI din perspectiva fizicii spațiale și a ingineriei, folosind sursele de mai jos. Nu reprezintă consultarea unui specialist uman acreditat sau validarea unui curriculum. Obiectivele pe vârste sunt propuneri care trebuie probate cu participanți.

## Decizia de proiectare

3D-ul va face vizibile forma, comparația, relația dintre componente și consecința unei alegeri. Fiecare obiect interactiv trebuie să răspundă la patru întrebări: ce urmărește participantul, ce poate face, ce rezultat poate observa și ce poate explica după aceea. Efectele de confirmare pot fi spectaculoase, dar nu vor inventa rezultate științifice.

Cele patru experiențe rămân distincte: 5–10 construiesc un întreg din piese; 10–15 investighează un semnal; 15–18 proiectează și revizuiesc reguli de autorizare; adulții gestionează observații și aleg ce transmit dintr-o arhivă. Lumina, Natura și Tehnologia sunt etapele narative comune, nu trei discipline științifice demonstrate automat de decor.

## Matricea celor 12 activități

Coloana „stare existentă” descrie ce poate confirma motorul. Înțelegerea se verifică prin explicație sau transfer, nu se deduce automat din acea stare. Întrebările sunt propuneri pentru discuția de după experiență, fără replici noi inserate în show.

| Vârstă / etapă | Obiectiv | Acțiune și stare existentă | Reprezentare 3D propusă | Verificare educativă scurtă |
|---|---|---|---|---|
| 5–10 / Lumină | Recunoaște o formă dintre alternative. | Alege forma proprie; `found`. | Piesă luminoasă cu reper frontal stabil; explorarea nu ascunde conturul necesar alegerii. | „Ce formă ai căutat? Cum ai deosebit-o?” |
| 5–10 / Natură | Leagă o parte de întreg și urmează o secvență. | Selectează piesa, apoi o potrivește; `fitted`. Piesa poate fi primită dacă lipsește din etapa anterioară. | Piesă separată, locaș lizibil, îmbinare după confirmarea serverului. Proveniența rămâne sinceră. | „Unde se potrivea piesa și ce s-a completat?” |
| 5–10 / Tehnologie | Recunoaște contribuțiile diferite la un ansamblu. | Fiecare zonă apasă `link`; A și B sunt independente. | Două contribuții alcătuiesc un obiect comun. Nu cere apăsare simultană. | „Ce ai adăugat tu? Ce a adăugat colegul?” |
| 10–15 / Lumină | Separă observația de explicația posibilă. | Ipoteză `far`, `relay`, `uncertain` sau observare. | Două modele explicative lângă aceleași observații; sursa nu este dezvăluită decorativ. | „Ce ai observat și ce doar presupui?” |
| 10–15 / Natură | Compară răspunsurile la două intrări diferite. | Construiește și trimite două permutări distincte ale intervalelor 1, 2, 3; măsurarea locală este separată. | Benzi trimis/primit aliniate, intervale etichetate, două probe comparabile. | „Ce ai schimbat între probe și ce s-a păstrat?” |
| 10–15 / Tehnologie | Leagă concluzia de o dovadă și îi recunoaște limita. | Verdict plus atașament; identitatea sursei poate rămâne necunoscută. | Dovada selectată rămâne vizibilă lângă verdict; lipsa datelor are o stare neutră. | „Ce susține dovada? Ce încă nu poți spune?” |
| 15–18 / Lumină | Distinge propunerea de execuție și autoritatea de confirmare. | A alege autoritatea, B condiția de confirmare. | Două module separate cu etichete și conexiuni explicite. | „Cine poate executa și când cere confirmare?” |
| 15–18 / Natură | Urmărește aplicarea unei reguli într-un caz de test. | Fiecare zonă alege acord sau conflict; motorul calculează rezultatul mandatului. | Două citiri și traseul deciziei până la propunere, așteptare sau execuție simulată. | „De ce a rezultat această acțiune?” |
| 15–18 / Tehnologie | Compară efectul păstrării sau revizuirii unei reguli. | Păstrează/schimbă; comparație pe același caz ales anterior. | Înainte/după cu aceeași intrare și diferența de rezultat evidențiată. | „Ce ai câștigat sau ce risc ai acceptat?” |
| Adulți / Lumină | Identifică un compromis între acoperire, precizie și resurse. | Acoperire largă cost 1, fină cost 2 sau abținere; buget inițial 2. | Trei sectoare versus un sector, cu rezerva vizibilă. Precizia este declarată de model. | „De ce ai ales această acoperire?” |
| Adulți / Natură | Leagă o alegere de cost și de condițiile observației. | Protecție cost 1 dacă există rezervă, pasiv cost 0 sau abținere. | Comparație clară între opțiuni și costuri; fără măsurători zgomotoase inventate. | „Ce compromis ai acceptat și ce nu ai măsurat?” |
| Adulți / Tehnologie | Selectează informație păstrând proveniența și limitele arhivei. | Transmite un document disponibil sau se abține; restul rămâne local. | Document transmis distinct de documente locale și de cele inexistente. | „Ce va ști destinatarul și ce îi lipsește?” |

Pentru 5–10 ani, instrucțiunile trebuie probate separat cu participanți de 5–7 și 8–10 ani. Citirea și dexteritatea nu sunt obiective ascunse. Selectare prin atingere și confirmare rămân suficiente; rotirea și tragerea sunt opționale.

## Cele cinci posturi

Obiectele vizuale urmează datele fiecărui post, nu introduc aceeași jucărie în cinci culori:

| Post | 5–10: piesele A/B | 10–15: instrument și limită | 15–18: domeniu simulat | Adulți: documente |
|---|---|---|---|---|
| Navigație | Cerc / Semilună | Direcție și reper; direcția nu furnizează singură distanța. | Hartă de studiu | Conturul coridorului / mișcarea marginii |
| Propulsie | Aripă / Flacără | Putere recepționată; consumul sursei rămâne necunoscut. | Profil de motor virtual | Pierderea sondei / variația consumului |
| Comunicații | Undă / Clopoțel | Intervale trimise și primite; regularitatea nu identifică sursa. | Mesaj local de test | Intensitatea emisiei / repetiția |
| Biosemnale | Frunză / Picătură | Date electromagnetice, fără senzor biologic; asemănarea cu pulsul nu dovedește viață. | Prag de senzor simulat | Ritmul rețelei / legături |
| Memorie | Stea / Spirală | Arhivă și intrări lipsă; o recepție fără intrarea asociată limitează comparația. | Copie a indexului arhivei | Succesiunea observațiilor / diferența citirilor |

Simbolul stea este o piesă geometrică, iar semiluna este un contur: nu prezentăm implicit o lecție despre forma stelelor sau fazele Lunii. Obiectul asamblat nu este numit circuit electric funcțional dacă modelul nu conține sursă și traseu de întoarcere.

## Corecțiile de fizică și inginerie adoptate

### Semnale: model limitat, incertitudine vizibilă

Motorul întoarce permutarea introdusă și descrie un decalaj `+2 s`. Nu există un solver de propagare sau de distanță. Într-o vizualizare viitoare a secvenței 1–3–2, intervalele rămân 1–3–2; decalajul mută întreaga secvență, nu adaugă două secunde fiecărui interval. Acest desen este ilustrarea modelului, nu o nouă așteptare impusă show-ului.

Cele două probe diferite nu sunt două repetări identice ale aceluiași experiment. Se schimbă ordinea, păstrând setul intervalelor și suma lor. Nu există încă un câmp pentru predicția participantului sau o justificare liberă. Eventualele predicții afișate ale modelelor trebuie etichetate ca reguli ale simulării, nu răspunsuri date de participant.

Verdictul susține unul dintre modelele declarate în exercițiu. Nu demonstrează existența vieții ori inteligenței și nici că au fost eliminate toate explicațiile naturale. Votul majoritar poate selecta o ramură narativă, dar nu stabilește adevărul științific. [NASA: technosignatures](https://science.nasa.gov/universe/search-for-life/searching-for-signs-of-intelligent-life-technosignatures/).

Nu calculăm distanța astronomică din `+2 s`: măsurarea reală cere geometrie, identificarea parcursului dus sau dus-întors și corecții pentru întârzieri și ceasuri. [NASA: navigație și ranging](https://science.nasa.gov/learn/basics-of-space-flight/chapter13-1/).

Valoarea existentă `12° ±1°` primește o bandă de incertitudine. Pentru comparația `12°` / `32°`, specificăm sensul rotirii reperului și convenția unghiurilor înainte de desenarea săgeților; nu schimbăm valorile scenariului pentru a potrivi desenul. Puterea recepționată nu devine consumul emițătorului.

### Astronomie, ficțiune și sunet

Kepler-186 d este o exoplanetă, diferită de Kepler-186 f. Nu există justificare pentru prezentarea ecosistemului din poveste ca biosferă observată pe această planetă. Ilustrația lumii este ficțiune a experienței. [NASA: Kepler-186 d](https://science.nasa.gov/exoplanet-catalog/kepler-186-d/), [NASA: comparația sistemului](https://science.nasa.gov/resource/kepler-186-and-the-solar-system/).

Siwarha, Mann și Gargantua sunt tratate în experiență ca identificatori narativi, fără atribuire automată unor lumi confirmate. Găurile de vierme sunt ipoteze teoretice; o gaură neagră nu este prezentată ca portal de transport demonstrat. Călătoria montată nu este o simulare la scară a timpilor de deplasare. [NASA: wormholes](https://imagine.gsfc.nasa.gov/science/toolbox/cool_black_hole_fact2.html).

Sunetele interfeței sunt feedback sau sonificări la bord; nu sunt sunete care se propagă prin vidul exterior. O eventuală lecție viitoare despre ecosisteme trebuie să includă intrările de materie și energie, fără a sugera resurse create din nimic. [ESA: MELiSSA, circuitul materiei și energia luminii](https://www.esa.int/Enabling_Support/Space_Engineering_Technology/Melissa/Closed_Loop_Concept).

### Reguli și resurse

La 15–18 ani, acordul celor doi senzori nu garantează adevărul: pot exista erori comune. Exercițiul actual verifică aplicarea unui mandat, nu măsoară siguranța unei nave reale. Păstrarea unei reguli poate fi justificată; schimbarea nu primește automat o recompensă mai mare. A și B pot alege cazuri diferite, dar motorul nu permite promisiunea că fiecare va rula nelimitat toate cazurile.

La adulți, costurile sunt unități abstracte ale modelului, nu jouli. Pauza de 3 s și zgomotul redus sunt proprietăți descrise de opțiunea existentă; nu există un temporizator separat al acelei pauze sau eșantioane de zgomot calculate. Nu desenăm un cronometru ori un grafic care pretinde că acestea au fost măsurate. Celelalte documente rămân locale după transmitere.

Procesul propus urmează problema → model → test → examinarea rezultatului → revizuire, în limitele fiecărei mecanici. [NASA/JPL: engineering design process](https://www.jpl.nasa.gov/edu/resources/image/engineering-design-process-flow-chart/).

## Integrarea tehnică propusă

1. Un adaptor citește starea existentă și produce starea semantică a scenei: obiecte disponibile, selecție, rezultat confirmat, proveniență și comparații. Nu dublează regulile motorului în Three.js.
2. Un renderer per suprafață de 1920×1080, cu două viewporturi: A în stânga, B în dreapta. Textele și comenzile rămân HTML accesibil. Interacțiunile nu trec granița dintre zone.
3. Rotirea pentru inspecție rămâne locală și reversibilă. Confirmările folosesc comenzile existente; rezultatul final și efectul de succes apar după confirmarea serverului. Reconectarea reconstruiește scena fără repetarea SFX/confetti.
4. Calitatea poate varia: geometrie simplificată, mai puține particule, rezoluție internă redusă, apoi reprezentare 2D echivalentă. Nicio treaptă nu ascunde date sau modifică rezultatul. Reduced motion înlocuiește deplasările decorative cu schimbări statice lizibile.
5. Tabletele vor fi suprafețe tactile conduse de mini-PC; topologia exactă rămâne de stabilit. Nu presupunem cinci GPU-uri sau un singur proces pentru toate ecranele. Se testează maparea Windows a fiecărui touchscreen, pointerele simultane A/B și consumul cumulat pe mini-PC-ul ales.
6. Bugetul de performanță se stabilește prin probă pe hardware, inclusiv în timp ce filmul și celelalte suprafețe rulează. O scenă idle oprește animațiile inutile; o scenă ascunsă eliberează resursele potrivit ciclului de viață.

Tutorialul poate explica atingerea, selectarea și confirmarea pe un obiect simplu. În timpul replicilor și al filmului, scena tabletelor se liniștește. Finalul poate aduna contribuțiile confirmate într-un ansamblu comun, cu participare, observare și lipsă de răspuns distincte. Nu inventează contribuții și nu produce clasamente.

Film, voci, scenariu, timpi, state machine, autentificare și comenzi rămân contracte existente. Nu se dezvăluie Pământul prin glob, continente sau etichete înainte de revelația temporizată. Căpitanul rămâne GLB pe TV-ul configurat.

## Ordinea implementării și acceptanța

**Prima livrare:** adaptor semantic și scenă pilot pentru proba 10–15, cu benzi de semnale, limite ale modelului și fallback 2D. Aceasta verifică cel mai clar dacă 3D-ul face informația mai ușor de înțeles. Apoi piesele 5–10, mandatul 15–18, arhiva adulților, tutorialul și finalul. Fiecare etapă primește comparații vizuale și verificări pe stări reale.

**Extensii separate, neimplementate:** predicție explicită a participantului, justificare salvată, test de transfer, simulare de zgomot sau ecosistem. Acestea necesită contracte și probe noi; nu sunt ascunse într-o schimbare grafică.

Criterii înainte de acceptare:

- Toate cele 12 activități prezintă același adevăr semantic în 2D și 3D, inclusiv observare, date lipsă, piesă primită și buget epuizat.
- A/B sunt independente, lizibile și fără scroll la 1920×1080; atingerea simultană nu selectează în cealaltă zonă.
- Etichetele, forma și focusul completează culoarea; reflexiile și perspectiva nu ascund alternativele sau incertitudinea.
- Pauza, reconectarea și restaurarea nu repetă efectele și nu schimbă alegerile confirmate; se verifică lipsa interferenței cu filmul, GLB-ul și vocile.
- Verificarea educativă distinge efectuarea sarcinii de explicația participantului. Telemetria existentă nu este prezentată ca măsurare a înțelegerii; nu sunt introduse note, ranking sau date personale suplimentare.
- Pilot cu cele patru categorii: participantul poate descrie ce a făcut, ce a observat și cel puțin o limită relevantă pentru vârstă. Operatorul consemnează confuziile de limbaj și mecanică; nu se declară curriculum validat doar pe baza buildului.
- Performanța, multitouch-ul și confortul vizual sunt validate pe instalația fizică înainte de prezentarea publică.

Acest document fixează direcția și corectează promisiunile educative ale propunerii. Implementarea și verificările software sunt consemnate în [EDUCATIE-3D.md](EDUCATIE-3D.md); ele nu înlocuiesc revizia umană și proba cu publicul.
