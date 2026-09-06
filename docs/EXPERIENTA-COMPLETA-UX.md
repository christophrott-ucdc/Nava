# EXODUS7 — completarea experienței vizuale și UX

Implementare în surse: 5 septembrie 2026. Nu reprezintă validare runtime.

## Cele șapte intervenții

1. Identitate persistentă: portretul, numele și rolul personajului confirmat însoțesc jocurile, tutorialul și finalul. Codul fizic A/B rămâne secundar. Identitatea nu modifică sarcina postului sau scenariul.
2. Demonstrații: primul contact cu fiecare etapă afișează un gest finit, ancorat în controlul real. Butonul „Arată-mi” reia demonstrația. Interacțiunea participantului o închide. Nu se simulează input, nu se trimit răspunsuri și nu se consumă resurse. Preferința pentru mișcare redusă păstrează explicația statică.
3. Învățare vizibilă: după rezolvarea confirmată apare o explicație și o succesiune vizuală scurtă. Semnalul rămâne ipoteză până la probe; pilotul compară decizii; sonda prezintă limitele datelor. Observatorii nu primesc realizări inventate.
4. Final personal: contribuția existentă din sumar este afișată direct pe tabletă, alături de alegerea simbolului. TV-ul prezintă personaje și simboluri numai pentru participanții activi. Nava Three.js și fallback-ul SVG centrează 1–10 module, cu module mai mari pentru 1–3 participanți. Tutorialul păstrează pozițiile fizice.
5. Selecție arcade: 12 portrete, previzualizare mare, marcaj de selecție, marcaj separat pentru personaj rezervat și confirmare explicită. Conturul auriu este folosit consecvent în selecție și confirmări.
6. Participare flexibilă: tutorialul de cooperare are instrucțiuni distincte pentru un singur participant pe tabletă. Locurile libere din timpul călătoriei și finalului nu invită la apăsarea unor comenzi indisponibile.
7. Consolă contextuală: acțiune principală în funcție de etapa tutorialului, participanții așteptați nominal, conexiunile posturilor și motivele readiness. Comenzile suplimentare și jurnalele sunt în secțiuni dedicate.

## Jurnale și recuperare

PNG-ul se trimite automat după finalizarea alegerilor locurilor active de pe post. Butoanele tehnice de descărcare și retrimitere nu mai apar pe tabletă.

Operatorul deschide „Tutorial și echipaj” → „Jurnalele expediției”. Lista arată fișierele primite pentru grupul curent. „Cere retrimiterea” apelează POST /api/mission/journal/retry cu runId și post. Serverul verifică rolul, grupul curent, postul activ și starea finală nesuspendată. Contorul persistent este transmis tabletei prin snapshot; cererea acceptată nu înseamnă că PNG-ul a sosit.

Tableta reutilizează aceiași bytes PNG din memorie/IndexedDB, folosește tokenul și revizia curente după generarea imaginii și reîncearcă eșecurile cu întârziere progresivă. Dacă IndexedDB este indisponibil, cache-ul funcționează numai pe durata paginii. Protecția serverului împotriva înlocuirii cu un PNG diferit rămâne activă.

## Fișiere principale

- src/web/tablet/journey.css — identitate, gesturi, explicații, stări comune.
- src/web/tablet/gesture-guide.ts și discovery.ts — demonstrații și concluzii educative.
- src/web/tablet/play-board.ts, experience-ui.ts, crew-selection.ts, mission-ui.ts — integrarea pe tablete.
- src/renderer/ui/experience.ts, src/renderer/crew-relay.css, src/web/shared/crew-stage.ts — final TV adaptiv.
- src/web/control/experience-control.ts și experience.css — consola.
- src/server/index.ts și src/shared/mission.ts — contractul de retrimitere.

## Limite și validare ulterioară

Au fost citite sursele și inspectate livrările agenților. La cererea utilizatorului nu au fost rulate teste, typecheck, build, aplicația, browserul sau capturi runtime. Nu există capturi noi ale acestor schimbări. Încadrarea fără scroll, lizibilitatea, performanța și integrarea nu sunt declarate validate.

Pe hardware: tablete 1920×1080 cu A stânga/B dreapta; 12 personaje și distribuții 1–10; gesturi touch și tastatură; text mărit, contrast și mișcare redusă; TV 4K/windowed cu film, GLB și subtitrări; reconnect și retry jurnal; latență și GPU mini-PC. Cele opt teme și sunetele existente necesită verificare runtime când va fi autorizată.

Nu au fost modificate pentru aceste intervenții filmul, GLB-ul, vocile, replicile show-ului, show.json sau timingurile. Fără commit, push, merge, release sau deploy.
