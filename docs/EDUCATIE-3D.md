# Interacțiunile educative 3D — implementare și operare

Actualizat: 2026-09-05. Implementat în aplicația reală `/tablet/`, pentru cele patru categorii și cele cinci posturi. Nu este o pagină demonstrativă. Direcția educativă și delimitarea faptelor de ficțiune sunt în [PLAN-3D-EDUCATIV.md](PLAN-3D-EDUCATIV.md).

**Revizie ulterioară în aceeași zi:** [REVIZIE-ROMANA-JOCURI.md](REVIZIE-ROMANA-JOCURI.md) descrie mecanicile și textele actuale. Rapoartele și numerele de mai jos documentează prima integrare 3D; noua galerie este `runs/debug/romanian-games/`. Acțiunile au fost extinse ulterior cu rotație, trasee, două cazuri pentru pilot și documente concrete. Ferestrele show-ului rămân neschimbate.

## Ce apare pe tabletă

| Experiență | Lumină | Natură | Tehnologie |
|---|---|---|---|
| 5–10 ani | Conturul piesei, cu forma exactă a postului | Rotație cu semn auriu; montare numai după aliniere | Trei trasee; legătură numai după ambele alegeri corecte |
| 10–15 ani | Două explicații posibile pentru aceeași observație | Constructor și probe K/R; segmente proporționale cu intervalele reale din model | Dovezi și limită; verdictul nu devine o dovadă despre viață |
| 15–18 ani | Libertatea pilotului și condiția de confirmare | Două cazuri de senzori și rezultate concrete | Tabelul celor două cazuri înainte și după revizuire |
| Adulți | Acoperire sau detaliu, două credite și datele cercetate | Verificarea citirilor sau raport nefiltrat | Compararea documentelor și transmiterea unuia către următorul echipaj |

Tutorialul are diagrame corespunzătoare categoriei la salut, probă, cooperare și pregătire. Selectarea nu este confundată cu confirmarea. Finalul reprezintă cele zece locuri ale echipajului și gesturile reale; nu completează automat locurile neocupate sau răspunsurile lipsă. După alegerea finală rămâne afișat gestul confirmat, în locul alternativelor care nu mai pot fi alese. Observarea are propria stare.

Obiectele pot fi inspectate prin glisare în diagramă sau cu săgețile stânga/dreapta când aceasta are focus. `Home` revine frontal. Această explorare nu trimite un răspuns și nu consumă buget. Butonul **Rotește piesa** schimbă separat orientarea verificată de joc. **Privește mai atent** deschide explicațiile și datele exacte, fără a avansa show-ul.

## Operare și confort

- Orientare 1920×1080 landscape: A în stânga, B în dreapta, ambele cu text normal. Țintele rămân de minimum 64 px în verificarea la această rezoluție.
- Preferința OS `prefers-reduced-motion`, opțiunea operatorului de mișcare redusă și stimulii reduși opresc animația decorativă. Starea și explorarea voluntară rămân disponibile. Pauza și deconectarea blochează rotirea; comenzile existente păstrează propriile validări server.
- „Ghidaj vizual” oprit din confortul postului elimină diagrama; instrucțiunile și alegerile existente rămân.
- La lipsa WebGL sau pierderea contextului apare reprezentarea SVG 2D, cu aceleași fapte și etichete. Contextul restaurat readuce 3D-ul.
- Pentru depanare ori hardware modest se poate folosi `/tablet/?post=1&graphics=2d` (înlocuiește postul). Este o preferință locală a adresei, nu o schimbare de scenariu.
- Sunetele și confetti folosesc în continuare confirmările și controlul `tabletSfx` existente. Rendererul educativ nu generează audio și nu trimite comenzi.

## Contract tehnic

`ZoneView.visual` este un câmp opțional, aditiv, de prezentare. `education-facts.ts` primește progresul și contextul calculat de helperii existenți ai motorului: buget, mandat, măsurătoare, forme. Nu extrage date din propoziții și nu implementează un al doilea motor de autorizare. Revizia jocurilor adaugă acțiuni și câmpuri opționale în progres; ferestrele de răspuns rămân neschimbate. Tabelele `comparison` și `documents` înlocuiesc diagramele când citirea rezultatelor este sarcina principală.

`education-experience.ts` adaptează snapshot-ul tutorialului/finalului. `education-visual.ts` definește obiectele, legăturile, faptele și intervalele. Intervalele K/R sunt păstrate identic la trimitere/recepție; offsetul primit este 2 s pentru întreaga secvență, nu pentru fiecare interval. Este un model explicit, fără calcul astronomic al distanței.

`education-renderer.ts` folosește Three.js deja instalat: un canvas/context per tabletă, două viewporturi cu scissor, geometrii reutilizate, materiale și geometrii de scenă eliberate la înlocuire. Nu există texturi sau fonturi externe. Desenează la schimbări, redimensionare și explorare, plus o scurtă tranziție; nu menține o buclă continuă pe scene neschimbate. Calitatea internă pornește la DPR maximum 1,5 și poate coborî la 60% la cadre lente. Bufferul este păstrat pentru reprezentarea statică între redesenări.

CSS-ul este copiat prin mecanismul de build existent. Bundle-ul tabletelor include acum Three.js (~1,4 MB neminificat în buildul de dezvoltare). Nu s-au adăugat pachete npm. Filmul, GLB-ul TV, vocile, muzica, show.json, timpii, API-urile de comandă și schema SQLite rămân neschimbate.

## Verificări și dovezi

Galerie: `runs/debug/education-3d/index.html`. Capturile inițiale sunt în subfolderul `before/`. Raportul `education-review.json` descrie matricea de stări pe cinci browsere native Electron conectate la serverul real Hono/WebSocket. Rapoartele individuale și capturile `FAIL-*` pot documenta iterații vechi; rezultatul final este raportul combinat, nu acestea.

Rezultatul final: **173/173 teste** și toate verificările din `npm run check` trecute; `npm run smoke:scenarios` trecut, inclusiv recuperare SQLite; **205 stări** în raportul combinat, **62 capturi** curente ale experiențelor/temelor/fallback-urilor și **26 capturi** pentru tutorialurile complete. `contrast.json` verifică șase combinații noi, cu raport minim conservator **5,85:1** pentru text. Este un calcul sRGB pentru suprafețele CSS, nu o măsurare a ecranelor fizice.

Verificări implementate în `scripts/education-review.mjs`: cele patru categorii, trei etape, stări inițiale și confirmate, constructor intermediar, cinci posturi, tutorialul de salut și finalul; A/B, focus independent, input nativ, zero overflow, ținte ≥64 px, text 1,3×, contrast sporit pe postul 5, opt teme, explicații deschise, pixeli WebGL colorați reali, context pierdut/restaurat și echivalența faptelor în 2D. Verifică și că rotirea nu schimbă revizia misiunii, iar scenele statice nu desenează continuu la mișcare redusă.

`scripts/education-tutorial-review.mjs` verifică toate cele patru tutoriale: 26 de capturi cu pașii, pauza, alegeri greșite neconfirmate și confirmări reale. Inputul și starea sunt reale; ACK-urile ecranului pentru narator sunt sintetice și respectă durata clipului. Acest raport nu pretinde audiție.

Separat, `scripts/experience-renderer-review.mjs` a verificat rendererul TV cu filmul, GLB-ul și naratorul reale, tutorialul, finalurile celor patru categorii la 4K/windowed și a rulat `npm run smoke:renderer`. Proba `--final-only` a verificat și redarea naturală unică a narațiunii de final după terminarea show-ului. Dovezi în `runs/debug/tutorial-final/`, plus `runs/renderer-smoke-avatar.png`.

Comenzi reproductibile:

```powershell
npm run check
node scripts/education-review.mjs
node scripts/education-tutorial-review.mjs
node scripts/experience-renderer-review.mjs
```

Ultima comandă pornește un mediu izolat și include obligatoriu `npm run smoke:renderer`. Testele unitare includ 11 cazuri noi pentru semantica diagramelor, proveniență, imutabilitate, intervale, mandat, buget, selecție/confirmare și locuri neincluse. Nu sunt teste care deduc înțelegerea unui participant dintr-un click.

## Ce rămâne pentru instalație și public

Mini-PC-ul nu a fost ales și topologia exactă a ecranelor tactile nu a fost fixată. Mai trebuie verificate maparea Windows a fiecărui touchscreen, două atingeri simultane în A/B, încărcarea cumulată cu filmul/TV-urile, stabilitatea pe o zi de funcționare, lizibilitatea și volumele reale din sală. Testele locale nu certifică aceste condiții.

Pilotul cu cele patru grupe verifică dacă participanții pot explica ce au observat și o limită a modelului. Pentru 5–10 ani, verificați separat 5–7 și 8–10. Revizia AI și sursele NASA/ESA sprijină proiectarea; nu reprezintă validare pedagogică umană.

Predicția introdusă separat, justificările libere salvate, un test de transfer și simulările fizice noi de zgomot sau ecosistem rămân extensiile distincte din plan. Nu au fost introduse prin schimbarea grafică și nu sunt pretinse ca existente.
