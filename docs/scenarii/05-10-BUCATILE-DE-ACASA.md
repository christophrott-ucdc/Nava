# 5–10 ani — Bucățile de acasă

Profil propus: `age-5-10`. Stare: scenariu editorial complet pentru revizie și producție, **neintegrat în player**. Replicile înlocuiesc dialogul numai în viitorul pachet de vârstă; acest document nu modifică show-ul legacy, vocile sau filmul.

## Intenție și perspectivă editorială AI

Aceasta este o adaptare editorială realizată din perspectiva AI a lucrului cu un public de copii; nu reprezintă consultarea unui specialist uman sau o validare psihologică. Copiii caută bucăți de lumină, le așază în forme și construiesc un felinar de bord. Obiectivul este vizibil și concret: un obiect făcut din contribuțiile lor, purtat până acasă. Nu dezbat valori, nu rezolvă o dilemă morală și nu sunt evaluați după rapiditate.

Cele trei verbe sunt **găsește → potrivește → leagă**. Căpitanul este un partener curios, capabil să ofere el însuși un felinar când nimeni nu interacționează. Natura nu acordă note, iar Tehnologicul devine un atelier cu umor. Participarea rămâne o invitație. Nu atribuim intenții tăcerii și nu spunem că lipsa unui răspuns pune nava în pericol.

Copiii pot vedea formele și demonstrațiile fără să citească. Instrucțiunile au o acțiune principală, iar butonul „Doar privesc” există permanent. Alternativa la glisare este atingerea piesei și apoi a conturului. Participanții A și B nu trebuie să atingă simultan și nu există cronometru roșu, clasament sau sunet de greșeală. Această alegere editorială trebuie probată cu grupuri reale, inclusiv la capetele intervalului 5–10 ani.

## Timp, spațiu și limite

Ancorele provin din [planul tehnic](../PLAN-TEHNIC-AUTOMATIZARE-SCENARII.md) și din `assets/show/show.json`: preshow 50 s; lead-in `play -10…0`; film 465 s; epilog 75 s. Total 600 s. Film: lansare 0–60, Siwarha 60–144, natură 144–246, Mann 246–356, tunel 356–402, Pământ 402–465. Nu adăugăm Saturn. Planetele sunt numite după apariția lor, nu imediat la schimbarea temei.

Toate momentele de mai jos sunt **propuneri pentru producția vocală**, în secunde ale fazei, nu fișiere audio deja temporizate. Slotul include rostire și respirație; fiecare înregistrare se verifică înainte de publicare, fără accelerarea vocii sau extinderea filmului. Ramurile aceleiași familii ocupă același slot și sunt mutual exclusive. Spațiile rămase sunt pentru film, muzică și participare. După instrucțiunile etapelor rămân 14 s (96–110), 13 s (203–216) și 13 s (304–317) fără voce. Viteza bugetată este de aproximativ 100–110 cuvinte/minut, niciodată peste 120; durata reală trebuie măsurată pe audio.

Căpitanul apare exclusiv ca GLB pe TV-ul central. Avatarul AI este voce; integrarea viitorului H2 nu face parte din scenariu. Entitățile și felinarul sunt **overlay-uri de produs propuse**, nu elemente despre care pretindem că există în film. Alegerea nu schimbă zborul, viteza sau planeta vizitată. Cinci tablete 1920×1080 landscape; A în jumătatea stângă și B în dreapta, ambele citite normal.

## Dialog exact

Textul dintre ghilimele este integral textul rostit. ID-urile sunt unice în pachet. `C/P/Z` = complet/parțial/zero contribuții acceptate pentru interacțiunea indicată; definițiile exacte sunt mai jos.

| ID | Fază | La sec | Slot sec | Vorbitor | Condiție | Replică |
|---|---|---:|---:|---|---|---|
| k510-001 | preshow | 1 | 9 | CAPITANUL | always | „Bun venit la bord! Eu sunt Căpitanul. Astăzi avem o valiză goală și un drum foarte lung.” |
| k510-002 | preshow | 11 | 7 | AVATAR_AI | always | „În valiză încape un felinar. Dar bucățile lui sunt împrăștiate prin trei lumi.” |
| k510-003 | preshow | 20 | 7 | CAPITANUL | always | „Le căutăm împreună. Nu sunt cioburi care taie. Sunt bucăți moi de lumină!” |
| k510-004 | preshow | 29 | 8 | AVATAR_AI | always | „A folosește partea stângă a tabletei. B folosește partea dreaptă. Fiecare are locul lui.” |
| k510-005 | preshow | 39 | 9 | CAPITANUL | always | „Puteți atinge formele sau puteți doar privi. Eu rămân cu voi. Călătoria începe în ambele feluri.” |
| k510-006 | play | -9 | 8 | CAPITANUL | always | „Valiza e la bord. Ochii spre stele! Plecăm să vedem ce putem găsi.” |
| k510-007 | play | 5 | 8 | AVATAR_AI | always | „Pământul rămâne în urmă. Am păstrat drumul de întoarcere. Acum putem privi în jur.” |
| k510-008 | play | 28 | 8 | CAPITANUL | always | „Uite câte lumini! Dacă aș avea buzunare cât nava, tot n-ar încăpea toate.” |
| k510-009 | play | 76 | 8 | LUMINA | always | „Bun venit pe Siwarha! Am găsit bucăți pentru felinarul vostru. Fiecare poartă o formă.” |
| k510-010 | play | 87 | 9 | AVATAR_AI | always | „Privește forma mare de sus. Atinge bucata care seamănă cu ea. Poți încerca pe îndelete.” |
| k510-011 | play | 110 | 7 | CAPITANUL | always | „Eu țin valiza deschisă. Bucățile găsite vor apărea lângă mine, pe rând.” |
| k510-012-C | play | 122 | 8 | LUMINA | find_complete | „Toate cele zece bucăți sunt în valiză. Cercuri, aripi, frunze: ce colecție luminoasă!” |
| k510-012-P | play | 122 | 8 | LUMINA | find_partial | „În valiză sunt bucățile găsite. Celelalte locuri rămân libere. Avem loc și pentru lumină simplă.” |
| k510-012-Z | play | 122 | 8 | LUMINA | find_none | „Valiza a rămas goală. Vă ofer eu un cerc de lumină pentru drum.” |
| k510-013 | play | 133 | 8 | CAPITANUL | always | „Mulțumim! Închidem valiza cu grijă. Următoarea oprire are un atelier cum n-am mai văzut.” |
| k510-014 | play | 183 | 8 | NATURA | always | „Aduceți piesele găsite. Dacă vă lipsește o piesă, vă ofer una din atelierul meu.” |
| k510-015 | play | 194 | 9 | AVATAR_AI | always | „Pune piesa găsită sau primită în contur. Poți glisa, ori atinge piesa și apoi locul.” |
| k510-016 | play | 216 | 8 | NATURA | always | „Fiecare fereastră are două locuri. Piesele voastre rămân întregi, una lângă alta.” |
| k510-017-C | play | 226 | 8 | NATURA | fit_complete | „Cele cinci ferestre sunt gata. Piesele așezate rămân în ele, fiecare cu forma ei.” |
| k510-017-P | play | 226 | 8 | NATURA | fit_partial | „Păstrăm fiecare piesă așezată. Printre ele rămân locuri deschise, prin care poate trece lumina.” |
| k510-017-Z | play | 226 | 8 | NATURA | fit_none | „Piesele au rămas pe masă. Adaug în valiză o frunză, amintire din grădină.” |
| k510-018 | play | 236 | 8 | CAPITANUL | always | „Felinarul are deja ceva de povestit. Mai trebuie să-i prindem lumina, ca să călătorească.” |
| k510-019 | play | 284 | 8 | TEHNOLOGIC | always | „Atelierul Mann, deschis! Reparăm felinare, umbrele și câteodată umbre. Ce ați adus în valiză?” |
| k510-020 | play | 295 | 9 | AVATAR_AI | always | „Fiecare atinge capătul lui de fir. Lumina ține minte ambele atingeri. Nu trebuie deodată.” |
| k510-021 | play | 317 | 8 | TEHNOLOGIC | always | „Un capăt ține minte atingerea. Celălalt poate veni după el. Firul nu se supără.” |
| k510-022-C | play | 333 | 8 | TEHNOLOGIC | link_complete | „Toate cele cinci fire sunt legate. Felinarul vostru are acum cinci mânere de lumină.” |
| k510-022-P | play | 333 | 8 | TEHNOLOGIC | link_partial | „Păstrez capetele atinse și firele legate. Pun eu mânerul de călătorie. Felinarul poate veni cu noi.” |
| k510-022-Z | play | 333 | 8 | TEHNOLOGIC | link_none | „Firele au rămas pe masă. Adaug eu mânerul de călătorie. Felinarul este pregătit de drum.” |
| k510-023 | play | 344 | 8 | CAPITANUL | always | „Un felinar cu mâner de călătorie! Exact ce ne trebuia. Îl țin aici, lângă mine.” |
| k510-024 | play | 360 | 9 | CAPITANUL | always | „Intrăm într-un tunel de stele. Tabletele se odihnesc acum. Felinarul ne însoțește până la capăt.” |
| k510-025 | play | 382 | 8 | AVATAR_AI | always | „Dincolo de tunel este drumul cunoscut. Puteți urmări lumina sau puteți privi numai stelele.” |
| k510-026 | play | 405 | 7 | CAPITANUL | always | „Pământul! Uite cât de albastru este. Acesta era drumul nostru spre casă.” |
| k510-027 | play | 419 | 8 | AVATAR_AI | always | „Pun felinarul lângă fereastră. Nu aprinde planeta. Luminează doar micul nostru colț de navă.” |
| k510-028 | play | 435 | 8 | CAPITANUL | always | „Am adus cu noi o lumină de la depărtare. Acum avem unde să o păstrăm.” |
| k510-029 | play | 451 | 9 | LUMINA | always | „Când vă veți aminti de stele, poate vă veți aminti și de valiza aceasta mică.” |
| k510-030 | epilogue | 5 | 8 | AVATAR_AI | always | „Călătoria s-a încheiat. Pe ecran rămâne felinarul și drumul prin cele trei lumi vizitate.” |
| k510-031-C | epilogue | 19 | 9 | CAPITANUL | final_complete | „Aici sunt toate bucățile găsite, ferestrele asamblate și firele legate de voi. Acesta este felinarul echipajului.” |
| k510-031-P | epilogue | 19 | 9 | CAPITANUL | final_partial | „Aici sunt urmele atingerilor voastre, alături de ajutorul atelierelor. Acesta este felinarul acestei călătorii.” |
| k510-031-Z | epilogue | 19 | 9 | CAPITANUL | final_none | „Acesta este felinarul primit pe drum: cercul, frunza și mânerul. Îl păstrăm ca amintire a călătoriei.” |
| k510-032 | epilogue | 34 | 8 | AVATAR_AI | always | „Nu mai este nimic de apăsat. Puteți privi felinarul sau puteți povesti încet cu vecinul.” |
| k510-033 | epilogue | 48 | 8 | CAPITANUL | always | „Închid valiza, dar las felinarul la vedere. Mulțumesc pentru călătorie, echipaj. Bun venit acasă!” |
| k510-034 | epilogue | 60 | 10 | CAPITANUL | always | „Rămâneți la posturi. Ghidul din sală vă va spune când vă puteți ridica și pe unde mergem.” |

## Interacțiunea 1 — Găsește bucata

ID `k510-find`; film 96–120 s. Recunoaștere vizuală printr-o singură atingere, nu vot. În fiecare jumătate: o formă-țintă mare, trei bucăți mari și „Doar privesc”. Numai forma corespunzătoare se colectează. O atingere pe altă formă nu consumă încercarea: text exact „Privește forma de sus”, conturul-țintă se evidențiază lent; fără buzzer sau cruce roșie. La atingerea validă, text „Bucată găsită”; după confirmarea serverului, ea intră în valiză pe overlay. Forma și eticheta identifică piesa; culoarea nu este singurul indiciu.

| Post | A — stânga: țintă; cele trei forme | B — dreapta: țintă; cele trei forme |
|---|---|---|
| NAVIGAȚIE | Cerc; cerc / frunză / aripă | Semilună; aripă / semilună / picătură |
| PROPULSIE | Aripă; picătură / aripă / cerc | Flacără; flacără / frunză / stea |
| COMUNICAȚII | Undă; undă / stea / semilună | Clopoțel; cerc / clopoțel / frunză |
| BIOSEMNALE | Frunză; aripă / frunză / undă | Picătură; stea / cerc / picătură |
| MEMORIE | Stea; stea / picătură / clopoțel | Spirală; frunză / spirală / aripă |

Instrucțiune locală exactă pentru toate zonele: „Găsește forma de sus”. La „Doar privesc”: „Poți privi valiza de pe ecran”. La închidere, fără contribuție: „Privim următoarea lume”. `C` = 10 piese confirmate; `P` = 1–9; `Z` = 0. Observarea și lipsa răspunsului rămân distincte în date, dar folosesc aceeași replică neutră dacă nu există piese. În `Z`, cercul oferit de Lumină are proveniență `gift`, niciodată `childContribution`.

Persistență: lista exactă de piese găsite și locurile neocupate rămân în valiză, apoi în harta finală. Nu ștergem o piesă dacă etapa următoare este omisă.

## Interacțiunea 2 — Montează ferestrele

ID `k510-fit`; film 204–224 s. Fiecare zonă primește **exact emblema găsită în etapa 1**, păstrând ID-ul, forma și proveniența, și un contur corespunzător în jumătatea sa de ramă. Emblema întreagă devine inserția ferestrei, fără a fi tăiată sau transformată în alt simbol. A și B montează două inserții alăturate ale aceleiași ferestre; fiecare lucrează exclusiv în jumătatea proprie. Alternativa la glisare este „Ating piesa, apoi locul”.

Pentru o zonă fără piesă găsită, Natura oferă înaintea jocului, prin replica k510-014, piesa de atelier cu aceeași formă prevăzută în tabel, marcată `gift`. Tableta spune exact „Piesă primită de la Natură”; pentru piesa din I1 spune „Piesă găsită pe Siwarha”. În ambele cazuri, numai gestul confirmat de montare este contribuție la I2. Originea `gift` nu devine niciodată „găsită” prin montare. Cercul oferit de Lumină la I1-Z este nucleul separat al felinarului, nu o colectare NAVIGAȚIE A și nu este consumat ca inserție de atelier.

| Post | A — stânga: inserție și contur | B — dreapta: inserție și contur | Fereastra postului |
|---|---|---|---|
| NAVIGAȚIE | Cercul găsit/primit → contur de cerc | Semiluna găsită/primită → contur de semilună | Cerc + semilună |
| PROPULSIE | Aripa găsită/primită → contur de aripă | Flacăra găsită/primită → contur de flacără | Aripă + flacără |
| COMUNICAȚII | Unda găsită/primită → contur de undă | Clopoțelul găsit/primit → contur de clopoțel | Undă + clopoțel |
| BIOSEMNALE | Frunza găsită/primită → contur de frunză | Picătura găsită/primită → contur de picătură | Frunză + picătură |
| MEMORIE | Steaua găsită/primită → contur de stea | Spirala găsită/primită → contur de spirală | Stea + spirală |

Instrucțiune exactă: „Pune piesa în contur”. După confirmare: „Piesa ta este așezată”. Când ambele inserții ale postului sunt confirmate: „Fereastra este gata”. Dacă piesa e eliberată în afara conturului, revine lin în locul inițial; „Mai poți încerca”. Nu există nevoie de coordonare simultană. La „Doar privesc”: „Poți privi atelierul”.

`C` = 10 inserții montate, deci cinci ferestre gata; `P` = 1–9; `Z` = 0. Rezultatul păstrează și inserțiile izolate, fără a inventa partenerul. Piesele găsite, dar nemontate, revin în valiză; piesele oferite pentru probă, dar nemontate, rămân la atelier și nu sunt adăugate automat felinarului. În `Z`, frunza oferită prin k510-017-Z este un dar separat `gift`, nu emblema BIOSEMNALE A găsită sau montată. În final se văd aceleași forme exacte din I1, poziția lor montată/în valiză și proveniența lor găsită/primită. Astfel, accesul la I2 rămâne deschis chiar dacă I1 a fost doar privită, fără a pierde legătura materială dintre etape.

## Interacțiunea 3 — Leagă firul

ID `k510-link`; film 306–331 s. Cooperare cu două capete memorate independent, fără sincronizare milisecundă și **în orice ordine**. A și B au fiecare un capăt mare de fir. Prima atingere acceptată a oricărui capăt îl fixează; atingerea celuilalt capăt închide firul. B singur contează exact ca A singur. Demonstrația arată cele două ținte fără a confirma vreo acțiune și fără a impune o ordine. Pentru posturile cu un participant, operatorul poate activa dinainte modul de accesibilitate în care aceeași persoană atinge succesiv cele două zone, fără a pretinde doi participanți.

| Post | A — stânga, text exact | B — dreapta, text exact | Firul identificabil vizual |
|---|---|---|---|
| NAVIGAȚIE | „Atinge capătul tău cu cerc” | „Atinge capătul tău cu cerc” | Cerc + linie continuă |
| PROPULSIE | „Atinge capătul tău cu aripă” | „Atinge capătul tău cu aripă” | Aripă + linie cu două benzi |
| COMUNICAȚII | „Atinge capătul tău cu undă” | „Atinge capătul tău cu undă” | Undă + linie ondulată |
| BIOSEMNALE | „Atinge capătul tău cu frunză” | „Atinge capătul tău cu frunză” | Frunză + linie cu frunze |
| MEMORIE | „Atinge capătul tău cu stea” | „Atinge capătul tău cu stea” | Stea + linie cu puncte |

După primul capăt, indiferent dacă este A sau B: „Capătul tău rămâne prins”. După al doilea capăt confirmat al postului: „Fir legat”. După alegerea de observare: „Poți privi felinarul”. `C` = 10 capete confirmate, deci cinci fire complet legate; `P` = 1–9 capete confirmate, inclusiv B singur; `Z` = zero capete confirmate. Un capăt singur persistă ca atare, fără a fi desenat drept fir închis. În P/Z, mânerul de călătorie oferit de Tehnologic este desenat separat de firele copiilor, cu proveniență `gift`. Etapa nu cere succes la etapele precedente.

## Rezumatul și ramurile finale

La film 332 s se îngheață contribuțiile celor trei etape. Ramura finală C cere toate cele 10 piese, toate cele 10 inserții montate și toate cele cinci fire; P cere cel puțin o contribuție acceptată și nu satisface C; Z înseamnă zero contribuții acceptate în toate etapele. Z produce cerc + frunză + mâner oferite de personaje; piesele de atelier nemontate nu intră în acest final. P păstrează formele găsite, inserțiile efectiv montate și capetele/firele confirmate, împreună cu darurile finale explicit oferite. O piesă primită și montată are două fapte separate: origine gift și montare confirmată. C păstrează toate cele zece forme găsite, montate în cele cinci ferestre, și cinci fire; nu cere piese de atelier sau ajutor final inventat. Nicio etichetă „complet/parțial/zero” nu apare ca notă pentru copii.

Harta finală și viitorul certificat arată drumul Siwarha → natură → Mann → Pământ și felinarul rezultat. Copiii care au privit primesc o amintire a călătoriei, fără contribuții inventate. Nu există replică ce promite fotografie; fotografia rămâne opțională și nu condiționează finalul. Certificatele sunt titrate „Echipajul — Bucățile de acasă”, fără calificativ sau ierarhie între posturi.

## Verificarea editorială a reviziei

42 de replici cu ID-uri unice; 598 cuvinte rostite însumând toate variantele și 479–484 cuvinte pe o rulare. Sloturile nu se suprapun pe ramura activă, rămân în fazele celor 600 s și bugetează maximum 120 cuvinte/minut. Acestea sunt calcule de text și slot, nu durate audio măsurate.

## Mecanici noi necesare implementării

1. Interacțiuni `visual-match`, `paired-fit` și `latched-pair`, cu alternative prin atingere/focus. Tipurile sunt propuneri, nu capabilități deja disponibile.
2. Snapshot pe rulare pentru colecție, inserții de ferestre, capete/fire și darurile personajelor, cu proveniență explicită; nu doar un număr agregat de voturi.
3. Confirmări și deduplicare `runId/cueInstanceId/eventId`, limite de timp pe ceasul show-ului și restabilire după reconnect fără reluarea celebrărilor. Prima confirmare validă fixează fiecare piesă/capăt; repetarea nu multiplică rezultatul.
4. Stratul comun felinar/valiză, forme și fire, cu cinci origini de post independente de numărul de TV-uri. Filmul și GLB-ul central rămân lizibile; pe reduced-motion se schimbă starea statică, fără zborul pieselor.
5. Ramuri deterministe C/P/Z și câte un asset vocal verificat pentru fiecare rând. O singură ramură se redă în slotul comun. SFX de confirmare maximum o dată per contribuție, sub controlul global `tabletSfx` și al setării postului; fără suprapuneri sonore excesive.
6. Proba cu grupuri pentru înțelegerea simbolurilor, accesibilitatea gesturilor, suficiența ferestrelor de 20–25 s și confortul în tunel. Dacă o fereastră nu ajunge, se simplifică sarcina înainte de producția finală; nu se lungește filmul tacit.

Nu sunt implementate aceste mecanici și nu sunt produse MP3-uri prin acest fișier. Livrabilul este gata pentru revizia scenografică și pentru verificarea de producție a vocilor.
