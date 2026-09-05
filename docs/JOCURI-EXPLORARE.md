# Jocuri prin explorare — 5 septembrie 2026

Aceasta este interfața implicită pentru cele patru profiluri din `/tablet/`. Înlocuiește grilele de răspunsuri din revizia română anterioară. Fiecare participant manipulează un instrument, încearcă o idee și vede rezultatul. Reușita se păstrează, iar instrumentul rămâne disponibil până la sfârșitul ferestrei existente din show.

## Cele patru experiențe

| Profil | Ce face participantul | Ce poate observa |
|---|---|---|
| 5–10 | Alege sau trage forma potrivită, rotește și montează piesa, apoi rotește două coturi ale circuitului felinarului. | Forma rămâne aceeași prin rotație; becul are nevoie de un circuit închis, cu legătură dus și întors la baterie. Poate întrerupe din nou circuitul după aprindere. |
| 10–15 | Orientează antena, schimbă ordinea a trei intervale, trimite două ritmuri și duce o înregistrare lângă explicația propusă. | Semnalul slab poate împiedica recepția. La recepție clară, răspunsul urmărește intrarea schimbată; comparația cu predicția 2–2–2 distinge modelele exercițiului. Identitatea expeditorului rămâne necunoscută. |
| 15–18 | A stabilește libertatea pilotului, B stabilește când cere acordul. Ambii pornesc probe cu senzori concordanți sau contradictorii și pot revizui regula. | Vehiculul propune, așteaptă acordul sau execută. Ultima etapă arată simultan rezultatul regulii inițiale și al celei revizuite. Senzorii concordanți nu garantează că informația este corectă. |
| Adulți | Mută fereastra instrumentului, alege ansamblu sau detaliu din două credite, traversează norul cu obturatorul închis sau deschis și trimite un document într-o capsulă. | Detaliul unei zone lasă celelalte necercetate. Obturatorul închis produce o întrerupere de trei secunde; deschis, produce citiri marcate ca incerte. Documentul transmis păstrează limitele observației. |

La adulți, alegerea plătită este definitivă pentru etapa curentă; mutarea ferestrei înainte de scanare este gratuită. Reluarea trecerii sondei nu consumă din nou energie. Cele două jumătăți pot compara strategii diferite. „Doar privesc” permite revenirea la joc și nu șterge o contribuție anterioară.

Ferestrele de joc nu au fost prelungite: 24/20/25 s pentru copii, 28/30/26 s pentru 10–15, 28/30/28 s pentru 15–18 și 24/27/25 s pentru adulți. Tutorialul vocal și replicile existente sunt păstrate. Fiecare instrucțiune principală spune acțiunea; explicația suplimentară este în „Ce descoperim”.

## Implementare

- `src/shared/play-engine.ts`: stare JSON opțională `ZoneProgress.play`, vederi tipizate și evaluarea gesturilor pe server. Acțiunile folosesc prefixul `play:` în contractul existent. Limite, etapă, post, rol și identificarea rulării sunt validate prin mecanismele existente.
- `play-board.ts`: panou persistent pe zonă. Snapshotul colegului actualizează datele fără a înlocui elementul care ține un gest sau focusul. Suspendarea, pierderea legăturii și schimbarea etapei blochează/anulează interacțiunile corespunzător.
- `play-toys.ts` și `play-older.ts`: scene SVG interactive și alternative prin atingere/tastatură. Jocul propriu-zis nu necesită WebGL. Three.js rămâne în tutorial și final; oprirea ghidajului decorativ nu ascunde instrumentele necesare jocului.
- O încercare validă, dar nereușită, este înregistrată cu feedback și poate fi repetată. Rezultatele importante rămân în câmpurile deja folosite de vocile condiționale, final, certificate și telemetrie.
- SQLite existent salvează structura suplimentară în checkpoint; nu este necesară o migrare. Reîncărcarea nu pornește din nou animațiile unei acțiuni istorice. Recuperarea unei rulări după repornirea serverului cere continuare explicită.
- SFX-ul de confirmare și confetti urmăresc prima contribuție confirmată a etapei, cu controlul `tabletSfx` existent. Încercările nereușite și repetarea aceleiași realizări nu declanșează din nou recompensa. O ipoteză este etichetată „Idee păstrată”, nu răspuns demonstrat.
- Mișcarea redusă oprește deplasările decorative. Durata de trei secunde a obturatorului rămâne reprezentată prin temporizare și text; pauza și ascunderea paginii opresc temporizarea locală. Revenirea după o reîncărcare arată rezultatul salvat.

Jurnalul folosește documentele și rezultatele noului instrument. Nu atribuie rotirii antenei o măsurătoare veche de 12° și nu numește golul de date „raport verificat”.

## Limitele modelelor

Numerele sunt pregătite pentru exercițiu, nu extrase din film sau măsurate în spațiu. Graficele adulților afișează un indice simulat 0–100 și mărimea reprezentată. Modelul semnalului compară două explicații definite de exercițiu; nu identifică viață sau distanță. Traseul pilotului vizualizează executarea unei reguli, inclusiv când postul lucrează cu un mesaj sau o arhivă. Felinarul este o schemă simplificată a unui circuit închis, nu o simulare electrică numerică.

Principiul de proiectare este încercare–observare–revizuire. Cadrul [Exploratorium pentru învățarea prin explorare](https://www.exploratorium.edu/sites/default/files/pdfs/Curator%2058.2%20Gutwill_Tinkering.pdf) ajută la formularea observațiilor pentru pilot, dar nu validează aceste jocuri. Reprezentarea circuitului a fost confruntată cu [explicația NASA despre circuitul închis](https://pwg.gsfc.nasa.gov/Electric/-E3-circuit.htm). Revizia a folosit agenți AI; nu reprezintă consultanță umană acreditată.

## Verificare și operare

Configurație: cinci suprafețe de post la 1920×1080 landscape, A în stânga, B în dreapta. Interfața operatorului selectează aceleași patru profiluri. Nu există activare suplimentară pentru noile jocuri.

Comenzi:

```powershell
npm run check
npm run smoke:scenarios
node scripts/play-review.mjs
node scripts/experience-renderer-review.mjs
```

Ultima comandă include `npm run smoke:renderer` cu filmul și GLB-ul reale. Galeria nouă: `runs/debug/play-experience/index.html`; raportul: `review.json`. Testul jocurilor folosește Chromium/Electron, Hono, WebSocket și SQLite reale. Salturile controlate în timeline permit verificarea tuturor interacțiunilor; nu demonstrează că un participant le finalizează în timpul disponibil. Capturile `FAIL-*` și `failure.json`, dacă există, sunt diagnostice ale iterațiilor, excluse din galerie.

Revizia anterioară rămâne comparabilă în `runs/debug/romanian-games/`. Parametrul `interaction=classic` este doar pentru regresia acelei interfețe, inclusiv `scripts/education-review.mjs`; nu este modul implicit pentru public. Tutorialul și finalul au propriile probe existente.

Înainte de public sunt necesare: mini-PC-ul ales împreună cu toate TV-urile, maparea touch Windows, gesturi simultane A/B, lizibilitate și volum în sală. Pilotul cu persoane din toate cele patru grupe trebuie să urmărească dacă încep fără explicația operatorului, fac voluntar o a doua încercare și pot spune ce s-a schimbat și de ce. Buildul și capturile nu dovedesc singure că activitatea este distractivă sau înțeleasă.
