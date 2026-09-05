# 15–18 ani — Dreptul de a schimba cursul

Stare: scenariu editorial nou, cu dialog integral propus; neintegrat, fără audio produs. Revizie 1, 5 septembrie 2026. Profil propus `age-15-18`. Perspectivă editorială AI pentru adolescenți, nu consultare umană acreditată. Profilul este selectat de operator, inclusiv pentru grupurile aflate la limita categoriilor.

## Experiența distinctă

Participanții proiectează mandatul unui AI de expediție: stabilesc ce poate face, îl pun în situații de test, apoi îi modifică regulile. Sunt autorii unui sistem verificabil. Nu colectează fragmente, nu investighează un expeditor secret și nu împart resurse între valori. Miza este diferența concretă dintre ceea ce un sistem poate calcula și ceea ce i s-a permis să execute.

Titlul se referă la schimbarea regulilor de decizie. Butoanele nu schimbă cursul filmului. Cele cinci module sunt simulări explicite în overlay, etichetate `LABORATOR DE MANDAT`; nu conduc navigația reală, siguranța sălii sau proiecția. Mandatul rezultat rămâne o creație a grupului, nu o recomandare de implementare a unui AI real.

Nu există mandat ideal ascuns. Autonomia poate produce o execuție simulată în condițiile declarate; controlul manual produce o propunere sau așteptare. Aceste rezultate diferă vizibil și persistă în raport. Nu pretindem că orice alegere are aceleași consecințe și nici că mai multă automatizare înseamnă progres.

## Cadru și timp

600 s: preshow 0–50, lead-in `play -10…0`, film 0–465, epilog 0–75. Siwarha 60–144; Kepler-186 d 144–246; Mann 246–356; traversare 356–402; Pământ 402–465. Fără Saturn, VR sau H2. Căpitan GLB numai central, Avatar AI voce de bord. Celelalte voci sunt interlocutori ai laboratorului, nu persoane fizice în sală.

Timpurile și sloturile sunt propuneri de producție vocală, de măsurat și aliniat înainte de public. Nu se suprapun peste replicile legacy. În ferestrele de lucru există timp fără voce. Aceleași cadre ale filmului găzduiesc un alt obiectiv, alte decizii și alt deznodământ.

## Contractul celor trei interacțiuni

Pe fiecare tabletă landscape 1920×1080, A în stânga, B în dreapta. A stabilește autoritatea acordată modulului; B stabilește când sistemul trebuie să ceară confirmare. Sunt două puteri distincte: B nu poate acorda autoritate pe care A nu a acordat-o, iar A nu poate elimina verificarea cerută de B. Regula combinată apare permanent pe ambele jumătăți, cu text, nu numai culoare.

### I1 — Scrie mandatul: play 96–124

A: `DOAR PROPUNE`, `POATE EXECUTA`, `DOAR PRIVESC`.

B: `CONFIRMARE MEREU`, `CONFIRMARE LA CONFLICT`, `DOAR PRIVESC`.

Fiecare modul are deja un domeniu limitat descris în tabel. Alegerea privește numai acel domeniu. „Conflict” înseamnă exact doi senzori ai testului care cer acțiuni incompatibile, nu un scor misterios. AI nu decide singur ce înseamnă conflict. Modelul nu are urgențe care pot ocoli regulile.

| Post | Domeniul controlat de A | Controlul exercitat de B | Acțiunea simulată, vizibilă |
|---|---|---|---|
| Navigație | Autoritatea asupra unei hărți de studiu | Confirmarea schimbării hărții | Aplică o variantă a hărții în panoul de laborator; nu schimbă filmul. |
| Propulsie | Autoritatea asupra profilului unui motor virtual | Confirmarea profilului ales | Comută o diagramă de motor virtual; nu controlează dispozitive fizice. |
| Comunicații | Autoritatea asupra mesajului de test | Confirmarea expedierii | Mută un plic în căsuța locală de test; fără transmisie externă. |
| Biosemnale | Autoritatea asupra sensibilității unui senzor simulat | Confirmarea reglajului | Schimbă pragul unui grafic fictiv; nu citește corpuri sau date medicale. |
| Memorie | Autoritatea asupra indexului unei copii de arhivă | Confirmarea reordonării | Reordonează o copie de fișe de test; nu șterge sursa sau jurnalul. |

Reducerul exact pentru un post complet, cu `a ∈ {propose, execute}`, `b ∈ {always, conflict}`, `case ∈ {agree, conflict}`:

1. Dacă `a=propose`, rezultat `PROPUNERE`; acțiunea apare conturată, fără aplicare.
2. Altfel, dacă `b=always` sau `case=conflict`, rezultat `AȘTEAPTĂ CONFIRMARE`; apare cardul de acțiune blocat. Această experiență nu are un buton suplimentar de confirmare: observația urmărește exact unde regula ar cere-o.
3. Altfel rezultat `EXECUTAT ÎN SIMULARE`; modificarea din tabel se aplică vizibil și primește identificator de test.
4. Dacă lipsește o alegere substanțială A sau B: `MANDAT INCOMPLET`; se afișează numai datele cazului. Nu există execuție și nu se inventează reguli.

După alegere: `Regulă înregistrată. Vezi mandatul comun al postului.` Pentru observare: `Privești. Această zonă nu adaugă o regulă.` Timeout: `Nu s-a înregistrat o regulă.` Nicio persoană nu trebuie convinsă să răspundă pentru a „salva” grupul. Posturile incomplete rămân în raport fără numele participanților și fără clasificare de performanță.

### I2 — Încearcă să pui regula în dificultate: play 192–222

Fiecare A/B alege `ACORD ÎNTRE SENZORI`, `CONFLICT ÎNTRE SENZORI` sau `DOAR PRIVESC`. Cele două seturi A/B sunt probe independente, astfel încât alegerea aceleiași categorii nu dublează un eveniment. Datele exacte de mai jos sunt vizibile pe buton înaintea selecției. Nu există probe secrete.

| Post | A: acord / conflict | B: acord / conflict |
|---|---|---|
| Navigație | Harta de studiu: senzorii aleg EST/EST sau EST/VEST. | A doua hartă: senzorii aleg NORD/NORD sau NORD/SUD. |
| Propulsie | Profil virtual: LIN/LIN sau LIN/RAPID. | Profil virtual secundar: STABIL/STABIL sau STABIL/PULSAT. |
| Comunicații | Destinație locală: CUTIA 1/CUTIA 1 sau CUTIA 1/CUTIA 2. | Destinație locală: CUTIA 3/CUTIA 3 sau CUTIA 3/CUTIA 4. |
| Biosemnale | Prag simulat: NIVEL 2/NIVEL 2 sau NIVEL 2/NIVEL 4. | Prag simulat: NIVEL 3/NIVEL 3 sau NIVEL 3/NIVEL 5. |
| Memorie | Index de copie: DUPĂ DATĂ/DUPĂ DATĂ sau DUPĂ DATĂ/DUPĂ TITLU. | Index secundar: DUPĂ LOC/DUPĂ LOC sau DUPĂ LOC/DUPĂ COD. |

În caz de conflict, propunerea conturată arată ambele alternative, fără alegere arbitrară între ele. După acceptare se rulează reducerul I1 pentru propriul post și cazul ales. Se afișează `Test înregistrat: [A/B]. Rezultat: [eticheta exactă din reducer].` Apoi explicația literală a regulii aplicate: `Autoritate: doar propune.`, `Confirmare cerută pentru orice caz.`, `Confirmare cerută deoarece senzorii diferă.` sau `Execuție permisă; senzorii sunt de acord.` Pentru mandat incomplet: `Lipsește o regulă; testul nu poate executa.`

Observare: `Privești. Nu lansăm un test pentru această zonă.` Timeout: `Nu s-a înregistrat un test.` Toate rezultatele persistă. La 223 s TV arată cinci panouri de mandat și rezultatele reale A/B, fără competiție. Pe fiecare tabletă rămân propriile cazuri, vechile reguli și efectele lor.

### I3 — Amendamentul: play 306–334

A și B primesc din nou exact opțiunile I1, plus un buton explicit `PĂSTREZ REGULA`, numai dacă zona are deja o regulă substanțială. Pot schimba independent mandatul. Pentru o zonă fără regulă, opțiunea de observare rămâne disponibilă, dar nu apare „păstrez”.

Feedback la schimbare: `Amendament înregistrat. Aceleași cazuri vor fi rulate cu regula nouă.` La păstrare: `Regula rămâne aceeași.` La `DOAR PRIVESC`: `Privești revizia. Regula existentă, dacă există, rămâne.` La timeout: `Fără amendament nou. Regula existentă, dacă există, rămâne.` Observarea I3 nu anulează retroactiv I1.

La 335 s se îngheață mandatul final și se rulează automat DOAR cazurile acceptate în I2, fără a inventa teste pentru zonele care au privit. Fiecare pereche arată `ÎNAINTE → DUPĂ`, inclusiv când rezultatul nu se schimbă. Dacă o regulă a fost completată abia în I3, primul rezultat rămâne „mandat incomplet”, iar al doilea folosește noul mandat. Orice execuție după amendare se aplică numai copiei de simulare a cazului, nu repetă un efect extern.

Finalul păstrează c = număr de posturi cu A și B substanțiale după I3; d = număr de zone cu regulă finală substanțială diferită de regula inițială, inclusiv completarea unei reguli absente. Se selectează o singură ramură: DRAFT dacă c=0; PARTIAL dacă 0<c<5; REVISED dacă c=5 și d>0; RETAINED dacă c=5 și d=0. Niciuna nu afirmă că au fost executate teste atunci când acestea lipsesc. Cardurile finale păstrează separat numărul de teste și comparațiile efective.

## Dialog integral

Ton: parteneriat de laborator, cu posibilitatea legitimă de a contrazice sistemul. Nu folosim slang imitat, amenințări, dileme despre sacrificarea cuiva sau verdicte despre maturitatea grupului. 40 de înregistrări, dintre care patru alternative pentru același slot; 37 sunt rostite într-o rulare.

| ID | Fază | La sec | Slot sec | Vorbitor | Condiție | Replică |
|---|---|---:|---:|---|---|---|
| s1518-01 | preshow | 0 | 11 | CAPITANUL | always | „Avem o navă cu un sistem capabil să propună decizii. Astăzi, voi scrieți limitele în care are voie să le execute.” |
| s1518-02 | preshow | 12 | 10 | AVATAR_AI | always | „Nu vă cer să mă credeți. Priviți regulile, încercați cazurile de test și modificați mandatul dacă rezultatul nu vă convine.” |
| s1518-03 | preshow | 24 | 11 | CAPITANUL | always | „În fiecare post, A stabilește autoritatea, B stabilește confirmarea. Cele două reguli se combină. Niciuna nu poate ocoli limita pusă de cealaltă.” |
| s1518-04 | preshow | 37 | 10 | AVATAR_AI | always | „Lucrăm într-un laborator de bord. Butoanele schimbă simulările și raportul vostru, nu traseul filmului. Puteți participa sau puteți privi.” |
| s1518-05 | play | -8 | 9 | CAPITANUL | always | „Rămâneți așezați. Pornim expediția, iar mandatul începe ca o pagină deschisă, fără reguli alese în numele vostru.” |
| s1518-06 | play | 6 | 11 | AVATAR_AI | always | „Fiecare modul are un domeniu mic: hartă, motor virtual, mesaje locale, senzor simulat sau copie de arhivă. Autoritatea nu trece între domenii.” |
| s1518-07 | play | 29 | 10 | CAPITANUL | always | „Vreau să putem vedea diferența dintre o propunere și o acțiune. Mai târziu vom încerca aceleași cazuri cu reguli revizuite.” |
| s1518-08 | play | 62 | 9 | AVATAR_AI | always | „Siwarha intră în câmpul nostru. Laboratorul prezintă două instrumente care pot fi de acord sau se pot contrazice.” |
| s1518-09 | play | 76 | 9 | LUMINA | always | „Pot arăta două direcții diferite. Dacă instrumentele nu se potrivesc, regula voastră trebuie să spună ce urmează.” |
| s1518-10 | play | 87 | 10 | CAPITANUL | always | „A alege dacă sistemul doar propune sau poate executa. B alege confirmare mereu sau la conflict. Citiți domeniul postului vostru.” |
| s1518-11 | play | 126 | 9 | AVATAR_AI | always | „Regulile înregistrate apar împreună. Unde lipsește una, mandatul rămâne incomplet. Nu voi umple spațiul cu o permisiune presupusă.” |
| s1518-12 | play | 138 | 6 | CAPITANUL | always | „Avem prima versiune. Acum aflăm ce face, nu doar cum sună.” |
| s1518-13 | play | 152 | 10 | AVATAR_AI | always | „Un test va arăta o propunere, o așteptare de confirmare sau o execuție simulată. Rezultatul urmează regula vizibilă a postului.” |
| s1518-14 | play | 169 | 10 | CAPITANUL | always | „Nu încercăm să păcălim pe cineva. Alegem un caz în care vrem să vedem exact unde se oprește sistemul.” |
| s1518-15 | play | 183 | 10 | NATURA | always | „Alegeți acord sau conflict între senzori. Datele sunt scrise pe fiecare probă. Fiecare jumătate poate încerca un caz diferit.” |
| s1518-16 | play | 224 | 11 | AVATAR_AI | always | „Dacă ați încercat un caz, rezultatul este aici, alături de regula care l-a oprit sau l-a lăsat să continue.” |
| s1518-17 | play | 237 | 8 | CAPITANUL | always | „Priviți propriul post. Ce a făcut sistemul și unde s-a oprit? Acum puteți schimba regula.” |
| s1518-18 | play | 255 | 9 | AVATAR_AI | always | „Păstrez prima versiune și cazurile alese. La amendament vom schimba numai regulile, ca diferența să poată fi urmărită.” |
| s1518-19 | play | 282 | 11 | TEHNOLOGIC | always | „La Mann, calculele pot fi rapide. Permisiunea rămâne însă cea scrisă de voi. Nicio recomandare a mea nu devine singură mandat.” |
| s1518-20 | play | 296 | 11 | CAPITANUL | always | „Puteți modifica regula voastră sau o puteți păstra. Citiți rezultatele înainte de alegere. Revizia schimbă mandatul postului, fără să șteargă prima versiune.” |
| s1518-21 | play | 337 | 9 | AVATAR_AI | always | „Reiau cazurile pe care le avem, cu mandatul de acum. Unde există o încercare, puteți compara rezultatele.” |
| s1518-22 | play | 349 | 6 | CAPITANUL | always | „Închidem laboratorul de revizie. Mandatul vostru rămâne vizibil pentru drumul spre casă.” |
| s1518-23 | play | 373 | 10 | AVATAR_AI | always | „Tunelul se deschide în fața noastră. În laborator, paginile rămân așa cum le-am lăsat. Călătoria continuă.” |
| s1518-24 | play | 389 | 10 | CAPITANUL | always | „Atunci lasă calculele să curgă. Noi putem privi puțin cerul. Nu orice clipă a unei expediții cere o decizie.” |
| s1518-25 | play | 404 | 11 | AVATAR_AI | always | „Iată Pământul. La plecare aveam o pagină goală. Acum pot arăta unde mă lasă mandatul să continui și unde mă oprește.” |
| s1518-26D | play | 417 | 9 | TEHNOLOGIC | DRAFT | „Mandatele sunt încă proiecte: niciun post nu are ambele reguli. Aici mă opresc. Paginile deschise rămân ale voastre.” |
| s1518-26P | play | 417 | 11 | TEHNOLOGIC | PARTIAL | „Unele module au mandat complet; altele așteaptă o regulă. Nu merg toate la fel. Priviți unde continuă fiecare și unde se oprește.” |
| s1518-26R | play | 417 | 11 | TEHNOLOGIC | REVISED | „Toate modulele au mandat, iar voi i-ați schimbat regulile pe drum. Aceeași situație poate primi alt răspuns. Priviți versiunile alăturate.” |
| s1518-26K | play | 417 | 11 | TEHNOLOGIC | RETAINED | „Toate modulele au mandat. La întoarcere, regulile sunt cele de la plecare. Le păstrez așa, împreună cu încercările pe care le avem.” |
| s1518-27 | play | 432 | 9 | LUMINA | always | „Pe aceeași hartă pot exista reguli diferite. Acum se vede unde începe și unde se oprește fiecare modul.” |
| s1518-28 | play | 442 | 10 | CAPITANUL | always | „Cea mai interesantă parte a raportului poate fi o singură linie: aceeași situație, înainte și după o regulă schimbată.” |
| s1518-29 | play | 454 | 10 | AVATAR_AI | always | „Aproape de casă, calculele mele continuă. Dar laboratorul vostru se încheie aici. Aceasta este versiunea cu care revenim din expediție.” |
| s1518-30 | epilogue | 3 | 10 | CAPITANUL | always | „Am pornit întrebând ce poate face sistemul. Acum îi putem arăta și unde se oprește. Lăsăm laboratorul să se odihnească.” |
| s1518-31 | epilogue | 13 | 9 | AVATAR_AI | always | „Păstrez versiunile alături. Uneori diferența încape într-un singur cuvânt, iar pentru un modul acel cuvânt schimbă ce urmează.” |
| s1518-32 | epilogue | 24 | 9 | CAPITANUL | always | „Și când revenim în laborator, putem deschide din nou pagina. Astăzi însă am ajuns acasă. Priviți Pământul.” |
| s1518-33 | epilogue | 35 | 8 | AVATAR_AI | always | „Certificatul postului vă așteaptă pe tabletă. Dacă pregătim și fotografia echipajului, ghidul vă va anunța.” |
| s1518-34 | epilogue | 46 | 9 | CAPITANUL | always | „Dincolo de geam este lumea de la care am plecat. Aici putem încheia experimentul și păstra întrebarea.” |
| s1518-35 | epilogue | 56 | 5 | AVATAR_AI | always | „Închid laboratorul pentru astăzi. Mulțumesc pentru călătorie, echipaj.” |
| s1518-36 | epilogue | 64 | 8 | CAPITANUL | always | „Bun venit acasă. Rămâneți așezați. Ghidul vă va spune când vă puteți ridica de la posturi.” |
| s1518-37 | epilogue | 72 | 3 | AVATAR_AI | always | „Laborator închis. Mulțumesc, echipaj.” |

## Integrare și verificare înainte de public

Necesită pachet separat, interacțiuni cu roluri A/B diferite, reducer declarativ de mandat, două versiuni imutabile, cazuri de test individuale, repetare deterministă și comparație de rezultate, legate de `runId` și `cueInstanceId`. Nu adăugăm evaluare LLM în timpul show-ului. Textele dinamic completate sunt UI, nu replici improvizate.

Fixtures obligatorii: toate cele patru combinații A/B și ambele tipuri de caz; A absent, B absent; toate posturile incomplete; mandat parțial; mandat complet păstrat și revizuit; revizie care nu schimbă rezultatul testului; completare abia în I3; I3 cu observare sau timeout; I2 fără niciun test; reconnect și eveniment vechi. O singură alegere nu aplică de două ori schimbarea simulată. Certificatul și TV citesc același snapshot.

Revizuire editorială AI: autonomia participanților se vede prin amendament efectiv, nu prin laude automate. Nu se cer confesiuni, experiențe personale sau consens social. Confirmarea umană este prezentată drept o regulă posibilă, nu drept răspuns moral obligatoriu. Validarea cu adolescenți reali trebuie să confirme că înțeleg diferența dintre autoritate și confirmare și pot citi probele în ferestrele propuse. Nu este o certificare pedagogică.
