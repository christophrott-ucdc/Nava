> Actualizare — 10 septembrie 2026: acest document descrie pachetul integrat `age-5-10`. Tabelul vocal este sincronizat cu JSON-ul curent; mecanicile și timpii editoriali vechi au fost înlocuiți cu implementarea actuală. Filmul are 678,05 s. Verificarea finală a acestei revizii este în curs; integrarea în cod nu echivalează cu acceptarea pe hardware.

# 5–10 ani — Bucățile de acasă

Profil integrat: `age-5-10`, selectabil în consola operatorului ca „5–10 ani · Bucățile de acasă”. Dialogul și fișierele audio sunt în `assets/scenarios/age-5-10/`; scenariul se activează prin pachetul ales de operator. JSON-ul păstrează `productionReady: false`: producția audio și integrarea există, dar acest indicator nu certifică repetiția sau acceptarea publicului. Prezentarea către Dumitru Prunariu folosește experiența copiilor, inclusiv cu un singur participant.

## Intenție și perspectivă editorială AI

Aceasta este o adaptare editorială realizată din perspectiva AI a lucrului cu un public de copii; nu reprezintă consultarea unui specialist uman sau o validare psihologică. Copiii caută bucăți de lumină, le așază în forme și construiesc un felinar de bord. Obiectivul este vizibil și concret: un obiect făcut din contribuțiile lor, purtat până acasă. Nu dezbat valori, nu rezolvă o dilemă morală și nu sunt evaluați după rapiditate.

Cele trei verbe sunt **găsește → potrivește → leagă**. Căpitanul este un partener curios, capabil să ofere el însuși un felinar când nimeni nu interacționează. Natura nu acordă note, iar Tehnologicul devine un atelier cu umor. Participarea rămâne o invitație. Nu atribuim intenții tăcerii și nu spunem că lipsa unui răspuns pune nava în pericol.

Copiii pot vedea formele și demonstrațiile fără să citească. Instrucțiunile au o acțiune principală, iar butonul „Doar privesc” există permanent. Alternativa la glisare este atingerea piesei și apoi a conturului. Participanții A și B nu trebuie să atingă simultan și nu există cronometru roșu, clasament sau sunet de greșeală. Această alegere editorială trebuie probată cu grupuri reale, inclusiv la capetele intervalului 5–10 ani.

## Timp, spațiu și limite

Sursele de execuție sunt `assets/scenarios/age-5-10/dialogue.ro.draft.json`, `src/shared/mission.ts` și filmul panoramic remapat. Preshow: 50 s; lead-in: `play -10…0`; film: **678,05 s**; epilog: 75 s. Programul durează **813,05 s, aproximativ 13:33**, plus alegerea personajelor, tutorialul și pauzele interactive.

| Secvență a filmului | Interval în secunde |
|---|---:|
| Lansare | 0–60 |
| Lumea Luminii | 60–144 |
| Lumea Naturii | 144–246 |
| Mann, inclusiv apariția găurii negre | 246–388 |
| Traversarea tunelului | 388–504 |
| Saturn și drumul de întoarcere | 504–610 |
| Întoarcerea spre Pământ | 610–678,05 |

Acestea sunt intervalele scenelor, nu promisiuni că planeta rămâne vizibilă în fiecare cadru. Reperele măsurate din film sunt în [REINTEGRARE-FILM](../REINTEGRARE-FILM.md). **Saturn este inclus**, cu trei replici la 510, 527 și 557 s. Ferestrele activităților copiilor sunt **96–120 s**, **204–224 s** și **323,5–355,5 s** pe ceasul filmului; a treia fereastră rezultă din remaparea vechiului interval 306–331 s.

Coloana „Max. sec” din tabel este `maxDurationSec` din pachet: bugetul disponibil până la următorul slot vocal, nu durata măsurată a MP3-ului și nici o indicație de rostire prelungită. Variantele C/P/Z împart același slot și sunt mutual exclusive. Timpii, textele și audio rămân gestionate de pachetul executabil; modificarea acestui document nu le schimbă.

Căpitanul apare exclusiv ca GLB pe TV-ul central. Avatarul AI este voce; integrarea viitorului H2 nu face parte din produsul prezentat. Felinarul și contribuțiile sunt grafica aplicației, distinctă de filmul înregistrat. Alegerile nu schimbă zborul, viteza sau planeta vizitată. Cele cinci tablete sunt 1920×1080 landscape, cu A la stânga și B la dreapta, ambele citite normal; consola ghidului este pe o tabletă separată.

Pământul și Saturn sunt reale. Călătoria atât de rapidă și tunelul țin de ficțiunea experienței; o gaură neagră nu este un pasaj demonstrat spre altă lume. Modelele tabletelor ilustrează concepte, fără să pretindă că măsoară filmul sau un circuit electric fizic.

## Dialog exact

Tabelul reproduce cele **45 replici** din `assets/scenarios/age-5-10/dialogue.ro.draft.json`: ID, fază, timp, buget, vorbitor, condiție și text în română. Include instrucțiunile revizuite ale circuitului (`k510-020`, `k510-021`, `k510-022-C`) și cele trei replici Saturn. Etichetele de interpretare ElevenLabs nu fac parte din textul rostit.

`C/P/Z` = complet/parțial/zero contribuții acceptate pentru etapa indicată, **raportate la participanții activi**, nu obligatoriu la zece locuri. Definițiile sunt mai jos.

| ID | Fază | La sec | Max. sec | Vorbitor | Condiție | Replică |
|---|---|---:|---:|---|---|---|
| k510-001 | preshow | 1 | 10 | CAPITANUL | always | „Bun venit la bord! Eu sunt Căpitanul. Azi avem o valiză goală și un drum lung de tot.” |
| k510-002 | preshow | 11 | 9 | AVATAR_AI | always | „În valiză încape un felinar. Bucățile lui sunt prin trei lumi.” |
| k510-003 | preshow | 20 | 9 | CAPITANUL | always | „Le căutăm împreună. Nu taie, nu înțeapă. Sunt bucăți moi de lumină.” |
| k510-004 | preshow | 29 | 10 | AVATAR_AI | always | „A lucrează în stânga tabletei, B în dreapta. Fiecare are locul lui.” |
| k510-005 | preshow | 39 | 11 | CAPITANUL | always | „Puteți atinge formele. Puteți și doar să priviți. Eu rămân cu voi. Călătoria începe oricum.” |
| k510-006 | play | -9 | 14 | CAPITANUL | always | „Valiza e la bord. Priviți spre stele. Pornim să vedem ce găsim.” |
| k510-007 | play | 5 | 23 | AVATAR_AI | always | „Pământul rămâne în urmă. Eu țin minte drumul înapoi. Acum putem privi în jur.” |
| k510-008 | play | 28 | 48 | CAPITANUL | always | „Uite câte lumini! Dacă aș avea buzunare cât nava, tot n-ar încăpea toate.” |
| k510-009 | play | 76 | 11 | LUMINA | always | „Bun venit pe Siwarha. V-am găsit bucăți pentru felinar. Fiecare are forma ei.” |
| k510-010 | play | 87 | 23 | AVATAR_AI | always | „Uită-te la forma mare de sus. Atinge bucata care seamănă cu ea. Ai timp destul.” |
| k510-011 | play | 110 | 12 | CAPITANUL | always | „Eu țin valiza deschisă. Bucățile pe care le găsiți vin la mine, pe rând.” |
| k510-012-C | play | 122 | 11 | LUMINA | find_complete | „Toate cele zece bucăți sunt în valiză. Cercuri, aripi, frunze. Cum mai luminează!” |
| k510-012-P | play | 122 | 11 | LUMINA | find_partial | „În valiză stau bucățile găsite de voi. Restul locurilor rămân goale. E bine și așa.” |
| k510-012-Z | play | 122 | 11 | LUMINA | find_none | „Valiza a rămas goală. Vă dau eu un cerc de lumină pentru drum.” |
| k510-013 | play | 133 | 50 | CAPITANUL | always | „Mulțumim. Închidem valiza cu grijă. La următoarea oprire e un atelier nemaivăzut.” |
| k510-014 | play | 183 | 11 | NATURA | always | „Aduceți piesele găsite. Dacă vă lipsește o piesă, vă dau eu una din atelier.” |
| k510-015 | play | 194 | 22 | AVATAR_AI | always | „Pune piesa în conturul ei. O poți trage sau poți atinge piesa, apoi locul.” |
| k510-016 | play | 216 | 10 | NATURA | always | „Fiecare fereastră are două locuri. Piesele stau întregi, una lângă alta.” |
| k510-017-C | play | 226 | 10 | NATURA | fit_complete | „Cele cinci ferestre sunt gata. Fiecare piesă stă la locul ei, cu forma ei.” |
| k510-017-P | play | 226 | 10 | NATURA | fit_partial | „Fiecare piesă pusă de voi rămâne acolo. Printre ele rămân locuri goale, pe unde trece lumina.” |
| k510-017-Z | play | 226 | 10 | NATURA | fit_none | „Piesele au rămas pe masă. Pun în valiză o frunză din grădina mea.” |
| k510-018 | play | 236 | 59 | CAPITANUL | always | „Felinarul are deja ceva de povestit. Mai are nevoie de lumină ca să vină cu noi.” |
| k510-019 | play | 295 | 14.5 | TEHNOLOGIC | always | „Atelierul Mann e deschis! Reparăm felinare, umbrele, câteodată umbre. Ce aduceți?” |
| k510-020 | play | 309.5 | 28 | AVATAR_AI | always | „Pe tabletă ai o baterie, un bec și două legături. Rotește legăturile până când firele se unesc. Atunci becul se aprinde.” |
| k510-021 | play | 337.5 | 21 | TEHNOLOGIC | always | „Urmărește firul de la baterie, prin bec și înapoi. Dacă drumul e întrerupt, mai rotește legătura.” |
| k510-022-C | play | 358.5 | 14 | TEHNOLOGIC | link_complete | „Ați închis circuitele! Bateriile dau energie becurilor, iar felinarul echipajului luminează.” |
| k510-022-P | play | 358.5 | 14 | TEHNOLOGIC | link_partial | „Rămân capetele atinse și firele legate de voi. Mânerul de drum îl pun eu. Felinarul vine cu voi.” |
| k510-022-Z | play | 358.5 | 14 | TEHNOLOGIC | link_none | „Firele au rămas pe masă. Mânerul de drum îl pun eu. Felinarul e gata de plecare.” |
| k510-023 | play | 372.5 | 25.5 | CAPITANUL | always | „Un felinar cu mâner de drum. Exact ce ne trebuia. Îl țin aici, lângă mine.” |
| k510-024 | play | 398 | 55.5 | CAPITANUL | always | „Intrăm într-un tunel de stele. Tabletele se odihnesc acum. Felinarul vine cu noi până la capăt.” |
| k510-025 | play | 453.5 | 56.5 | AVATAR_AI | always | „După tunel începe drumul cunoscut. Puteți urmări lumina sau doar stelele.” |
| v4-saturn-01 | play | 510 | 17 | CAPITANUL | always | „Priviți inelele! E Saturn. Suntem din nou în Sistemul Solar. De aici, drumul spre casă ne este cunoscut.” |
| v4-saturn-02 | play | 527 | 30 | AVATAR_AI | always | „De departe, inelele par întregi. De aproape, sunt nenumărate bucăți de gheață și rocă. Fiecare se rotește în jurul lui Saturn.” |
| v4-saturn-03 | play | 557 | 56 | CAPITANUL | always | „Lăsăm Saturn în urmă. Următoarea oprire este o lume cu oceane, nori și oameni care ne așteaptă.” |
| k510-026 | play | 613 | 15.5 | CAPITANUL | always | „Pământul! Uite ce albastru e. Pe aici era drumul nostru spre casă.” |
| k510-027 | play | 628.5 | 17 | AVATAR_AI | always | „Pun felinarul la fereastră. Nu luminează planeta, ci colțul nostru de navă.” |
| k510-028 | play | 645.5 | 17.5 | CAPITANUL | always | „Am adus cu noi o lumină de departe. Acum are unde să stea.” |
| k510-029 | play | 663 | 15.05 | LUMINA | always | „Când o să vă amintiți de stele, poate vă amintiți și de valiza asta mică.” |
| k510-030 | epilogue | 5 | 14 | AVATAR_AI | always | „Călătoria s-a terminat. Pe ecran rămân felinarul și drumul prin cele trei lumi.” |
| k510-031-C | epilogue | 19 | 15 | CAPITANUL | final_complete | „Aici sunt bucățile găsite, ferestrele montate și firele legate de voi. Acesta e felinarul echipajului.” |
| k510-031-P | epilogue | 19 | 15 | CAPITANUL | final_partial | „Aici se văd atingerile voastre și ce au adăugat atelierele. Acesta e felinarul călătoriei noastre.” |
| k510-031-Z | epilogue | 19 | 15 | CAPITANUL | final_none | „Acesta e felinarul primit pe drum. Are un cerc, o frunză și un mâner. Îl păstrăm ca amintire.” |
| k510-032 | epilogue | 34 | 14 | AVATAR_AI | always | „Nu mai e nimic de apăsat. Puteți privi felinarul sau puteți vorbi încet cu vecinul.” |
| k510-033 | epilogue | 48 | 12 | CAPITANUL | always | „Închid valiza și las felinarul la vedere. Mulțumesc pentru călătorie, echipaj. Bun venit acasă!” |
| k510-034 | epilogue | 60 | 15 | CAPITANUL | always | „Rămâneți la posturi. Ghidul din sală vă spune când vă ridicați și pe unde mergem.” |

## Interacțiunea 1 — Găsește bucata

Etapa 1, film **96–120 s**. Titlul interfeței este **„Prinde lumina!”**; instrucțiunea exactă din `playView`: „Atinge bucata care se potrivește cu forma de sus.” Copilul atinge sau trage forma aleasă. Numai forma corespunzătoare este înregistrată ca găsită; celelalte încercări sunt permise și primesc îndrumarea „Nu se potrivește încă. Urmărește marginea formei, nu culoarea.”

| Post | A — stânga: țintă; opțiuni curente | B — dreapta: țintă; opțiuni curente |
|---|---|---|
| NAVIGAȚIE | Cerc; Aripă / Cerc / Stea | Semilună; Flacără / Semilună / Spirală |
| PROPULSIE | Aripă; Aripă / Cerc / Undă | Flacără; Clopoțel / Flacără / Semilună |
| COMUNICAȚII | Undă; Aripă / Frunză / Undă | Clopoțel; Clopoțel / Flacără / Picătură |
| BIOSEMNALE | Frunză; Frunză / Stea / Undă | Picătură; Clopoțel / Picătură / Spirală |
| MEMORIE | Stea; Cerc / Frunză / Stea | Spirală; Picătură / Semilună / Spirală |

La reușită: „Ai prins-o! Piesa ta intră în valiză.” Forma și eticheta identifică piesa; culoarea nu este singurul indiciu. Explicația educativă: „Recunoști o formă chiar dacă are altă mărime.” La „Doar privesc”, jocul rămâne accesibil pentru revenire: „Poți urmări ce se întâmplă. Atinge jocul dacă vrei să încerci.”

Confirmarea serverului salvează `choices['1'] = 'found'`; încercările nu multiplică piesele, iar reușita nu se șterge dacă ulterior copilul încearcă altă formă. Cu N participanți activi, `find_complete` înseamnă N forme găsite, `find_partial` înseamnă 1…N−1, iar `find_none` înseamnă zero. La un singur participant, propria piesă este suficientă pentru ramura completă.

## Interacțiunea 2 — Montează ferestrele

Etapa 2, film **204–224 s**. Titlu: **„Atelierul felinarului”**. Instrucțiune exactă: „Rotește piesa și trage-o în contur.” Fiecare zonă păstrează forma prevăzută pentru propriul post, indiferent dacă participantul a găsit-o în prima etapă. Povestea îi atribuie Naturii piesa disponibilă când prima etapă nu a fost rezolvată; montarea este înregistrată separat de găsire.

| Post | A — stânga: inserție și contur | B — dreapta: inserție și contur | Formele postului |
|---|---|---|---|
| NAVIGAȚIE | Cercul găsit/primit → contur de cerc | Semiluna găsită/primită → contur de semilună | Cerc + semilună |
| PROPULSIE | Aripa găsită/primită → contur de aripă | Flacăra găsită/primită → contur de flacără | Aripă + flacără |
| COMUNICAȚII | Unda găsită/primită → contur de undă | Clopoțelul găsit/primit → contur de clopoțel | Undă + clopoțel |
| BIOSEMNALE | Frunza găsită/primită → contur de frunză | Picătura găsită/primită → contur de picătură | Frunză + picătură |
| MEMORIE | Steaua găsită/primită → contur de stea | Spirala găsită/primită → contur de spirală | Stea + spirală |

Copilul poate roti piesa și o poate glisa în contur sau poate folosi comenzile alternative prin atingere/tastatură. La rotație primește „Acum încearcă piesa în contur.” Montarea unei piese orientate nepotrivit spune „Încă nu intră. Rotește-o și încearcă din nou.” La reușită: „Se potrivește! Piesa ta rămâne în felinar.” Ideea educativă este „O piesă rotită își păstrează forma.”

Piesa se montează când orientarea corespunde conturului; **cercul se potrivește la orice rotație**, deoarece forma sa nu se schimbă vizibil. Pentru a demonstra rotația se poate folosi postul 2A, cu Aripă. Un copil lucrează în propria jumătate; nu trebuie să umple locul unui partener absent și nu este cerută simultaneitatea A/B.

Serverul salvează `choices['2'] = 'fitted'` și orientarea. `fit_complete` cere montarea de către toți cei N participanți activi; `fit_partial` cere cel puțin o montare, dar mai puțin de N; `fit_none` înseamnă zero. Jurnalul distinge piesa găsită în prima etapă de cea disponibilă de la Natură. Vechiul proiect de câmpuri explicite `gift/childContribution` și transferuri între valiză și atelier era o propunere editorială; implementarea curentă deduce proveniența din găsirea și montarea confirmate, fără a inventa o găsire.

## Interacțiunea 3 — Leagă firul

Etapa 3, film **323,5–355,5 s**. Titlu: **„Aprinde felinarul”**. Instrucțiune exactă: „Rotește cele două coturi ca să aprinzi felinarul.” Fiecare participant are în propria jumătate **un circuit complet**, cu baterie, bec și două coturi rotibile. Aceasta înlocuiește vechiul proiect cu un capăt de fir pentru A și unul pentru B.

Cele două coturi pot fi rotite în orice ordine. Becul se aprinde numai când ambele continuă traseul baterie → bec → baterie. La întrerupere: „Circuitul este încă întrerupt. Rotește cotul ca să legi firele.” La închidere: „Circuitul este închis. Becul s-a aprins!” Explicația educativă este „Becul se aprinde când circuitul este închis: bateria și becul sunt legate printr-un drum dus și întors.”

Nu este necesară apăsarea simultană A/B, un al doilea participant sau o setare specială pentru demonstrația individuală. Un singur participant controlează ambele coturi din jumătatea sa; zona liberă rămâne liberă. Modelul este o schemă simplificată, nu o simulare numerică a curentului electric.

Prima închidere salvează `choices['3'] = 'linked'`. Până la sfârșitul etapei, copilul poate roti din nou un cot și observa becul stingându-se, apoi îl poate reaprinde. **Starea vizuală curentă a circuitului și reușita deja înregistrată sunt distincte**: explorarea ulterioară nu șterge contribuția și nu repetă recompensa.

`link_complete` cere ca toți cei N participanți activi să fi închis propriul circuit cel puțin o dată; `link_partial` cere 1…N−1 reușite; `link_none` cere zero. Ramurile vocale P/Z păstrează imaginile narative ale firelor și mânerului de călătorie. Ele nu descriu o mecanică nouă cu capete împărțite între doi copii.

## Rezumatul și ramurile finale

Contribuțiile celor trei etape sunt păstrate după închiderea ferestrelor de joc; a treia fereastră se termină la **355,5 s** pe ceasul filmului. Ramurile sunt evaluate de `scenarioConditions` numai pentru locurile active. Cu N participanți, `final_complete` cere **3 × N** realizări: găsire, montare și circuit închis pentru fiecare participant. `final_partial` cere cel puțin una dintre aceste realizări, dar nu toate, iar `final_none` înseamnă zero. O sesiune cu un participant poate avea un final complet. Nu se cer zece locuri ocupate și nu sunt inventate rezultatele partenerilor absenți.

Rezumatul și jurnalul păstrează formele și realizările confirmate; darurile Luminii, Naturii și atelierului sunt descrise separat de acțiunile participantului. Observarea și o etapă nerezolvată nu primesc calificative de eșec. Nicio etichetă „complet/parțial/zero” nu este prezentată copiilor ca notă.

Filmul vizitează și Saturn înainte de revenirea spre Pământ. Finalul interactiv apare către sfârșitul epilogului; invitația naratorului este separată de dialogul din tabel. Participantul alege o lumină, grija pentru ceilalți sau curajul de explorator, apoi apasă **„Trimite simbolul meu”**. Simplul card selectat nu confirmă trimiterea. Poate alege și să privească. Replica `k510-032`, la epilog 34 s, precedă această invitație finală; nu se interpretează drept eliminarea activității de încheiere.

Contribuția finală apare pe ecranul central, iar jurnalul poate fi primit și consultat în „Tutorial și echipaj → Jurnalele expediției”. Fotografia rămâne opțională și nu condiționează finalul. Pentru procedura prezentării și retrimiterea jurnalului, vezi [PREZENTARE-2026-09-10](../PREZENTARE-2026-09-10.md).

## Verificarea editorială a reviziei

Tabelul conține **45 de ID-uri unice**, copiate din pachetul curent, inclusiv ramurile alternative și cele trei replici Saturn. Nu toate cele 45 de clipuri se redau într-o singură sesiune: la fiecare familie C/P/Z se selectează o singură variantă. Cele trei texte ale circuitului revizuite în 10 septembrie păstrează ID-urile și timpii existenți.

Documentul a fost sincronizat prin citirea JSON-ului și a mecanicilor din cod. Această operație **nu este o repetiție de redare și nu certifică audiția, interacțiunea tactilă sau hardware-ul**. Repetiția reală a reviziei curente este în curs la redactare; rezultatele finale trebuie consemnate de integrare după terminarea ei. Duratele măsurate și identitatea MP3-urilor se citesc din manifestul vocal, nu din coloana bugetului.

Câmpurile `sourceDocument/sourceSha256` din JSON sunt proveniența importului editorial anterior. Această actualizare documentară este derivată din pachetul executabil și nu rescrie acele metadate, audio sau timpii.

## Mecanici noi necesare implementării

**Starea curentă: implementate, cu acceptarea finală de verificat.** Titlul acestei secțiuni păstrează reperul documentului inițial; lista de mai jos înlocuiește statutul istoric „neimplementat”.

1. Jocurile implicite folosesc `src/shared/play-engine.ts`, `play-board.ts` și `play-toys.ts`: recunoaștere de formă, rotație/montaj și circuit cu două coturi. Vechile tipuri `visual-match/paired-fit/latched-pair` există în prezentarea clasică; nu descriu gesturile implicite actuale.
2. Participanții confirmați și progresul pe fiecare zonă sunt păstrate în SQLite. Găsirea, montarea și circuitul au realizări separate; locurile libere nu blochează sesiunea și nu contribuie artificial la praguri.
3. Acțiunile sunt validate pe server cu identitatea rulării și etapei, apoi confirmate. Deduplicarea și persistența protejează rezultatele; după reconectare nu se retrimite o celebrare ca și cum ar fi o nouă reușită.
4. Ilustrațiile felinarului, formele, circuitul și contribuțiile comune sunt integrate cu filmul și GLB-ul central. Mișcarea redusă păstrează feedbackul static și gesturile necesare jocului.
5. Ramurile C/P/Z și fișierele vocale există în pachet. SFX-urile/confetti urmăresc prima reușită confirmată a etapei și respectă `tabletSfx` și setările postului. Repetarea experimentului nu multiplică rezultatul sau recompensa.
6. Rămân probele cu participanți reali pentru înțelegerea gesturilor și suficiența ferestrelor de **24/20/32 s**, plus audiția în sală, confortul în tunel, touch-ul A/B și verificarea celor cinci TV-uri. O prezentare cu evaluator adult pe profilul copiilor nu înlocuiește aceste probe cu publicul-țintă.

Acest fișier este documentație. Nu generează MP3-uri, nu aplică un scenariu și nu schimbă durata filmului.
