# Echipajul EXODUS7 — selecție și sesiuni cu 1–10 participanți

Implementare în surse: 2026-09-05. Fără teste, typecheck, build, pornirea aplicației sau capturi runtime, conform instrucțiunii explicite a utilizatorului.

## Fluxul operatorului și al participanților

1. „Grup nou” / restart golește personajele, răspunsurile și progresul sesiunii. Posturile fizice ale tabletelor rămân atribuite.
2. Fiecare participant folosește jumătatea sa: A în stânga, B în dreapta, ambele citite normal la 1920×1080 landscape.
3. Alege un portret, apoi apasă „Gata de aventură! · [nume]”. Previzualizarea locală nu înscrie participantul. Cealaltă jumătate poate rămâne liberă.
4. Personajele confirmate apar pe TV-ul central și în „Tutorial și echipaj”. Un personaj este rezervat unui singur loc în sesiune; serverul arbitrează alegerile simultane.
5. Operatorul pornește tutorialul când grupul este pregătit. Un singur participant este suficient. Nu există pornire automată după prima selecție.
6. Pornirea fixează lista. Tutorialul și finalul așteaptă numai participanții confirmați. O deconectare nu șterge personajul sau progresul.
7. Înainte de show, „Redeschide alegerea personajelor” păstrează alegerile, reia pregătirea și golește confirmările tutorialului. „Eliberează locul” permite operatorului să scoată un participant plecat, inclusiv de pe o tabletă deconectată. Pe tabletă, „Schimbă personajul” eliberează propriul loc.
8. După începerea show-ului, lista nu se modifică. Pentru alt grup se folosește restart.

Exemple: 1A singur; 3B singur; 1A+1B; 1A+1B+4B; toate cele zece locuri. Nu este obligatoriu să fie ocupat postul 1 sau zona A. Personajul este identitatea ilustrată, nu schimbă postul fizic și nu selectează scenariul de vârstă.

## Personaje și asseturi

- **Nia** (`nia`): găsește direcția aventurii.

- **Nova** (`nova`): caută drumuri noi.
- **Luca** (`luca`): descoperă trasee.
- **Mira** (`mira`): citește hărțile stelare.
- **Leo** (`leo`): dă energie navei.
- **Iris** (`iris`): ocrotește viața.
- **Arin** (`arin`): deslușește semnale.
- **Tara** (`tara`): ține echipajul aproape.
- **Radu** (`radu`): păstrează descoperirile.
- **Zori** (`zori`): robotul curios.
- **Pipo** (`pipo`): exploratorul jucăuș.

Catalogul are acum 12 personaje: nouă personaje umane, robotul Zori, exploratorul vulpe Pipo și pinguinul Dori. Nia, fata din primul portret generat, a fost adăugată la cererea utilizatorului. Capacitatea sălii rămâne 1–10 participanți; selecția are două rânduri și șase coloane. Portrete individuale generate cu imagegen integrat, cu referința logo-ului existent EXODUS7. PNG-urile și prompturile exacte se află în `src/web/shared/crew/portraits/`. Galerie: `src/web/shared/crew/portraits/index.html`. Originalele generatorului au fost păstrate. Ilustrațiile reprezintă personaje fictive; accesoriile decorative nu sunt instrumente sau explicații științifice.

Buildul existent copiază directorul comun atât în dist/web/shared, cât și în dist/renderer/shared. Nicio dependență nouă. Nu s-a executat buildul în această intervenție.

## Contract și persistență

`src/shared/crew.ts` conține catalogul, ID-urile și funcțiile comune. `experience.crew = {open, characters}` păstrează asocierea loc→personaj. `experience.participants` și `progress.participants` derivă din locurile confirmate. Lipsa câmpului în înregistrările istorice păstrează semantica veche.

Evenimente tabletă: `crew:lock:<id>` și `crew:release`, prin missionAction existent. Se păstrează runId, cueInstanceId și eventId. Serverul verifică postul atribuit conexiunii, zona, faza idle, pauza, deschiderea înscrierii, identitatea personajului și unicitatea. Alegerile, lista și evenimentul se persistă atomic prin MissionStore.accept în SQLite existent. Retrimiterea aceluiași eventId nu produce o nouă înscriere. Nu sunt stocate numele reale ale copiilor.

API operator: start, reopenCrew, releaseSeat și comenzile existente din /api/experience/control. Autentificarea operatorului rămâne obligatorie. Consola trimite și runId pentru a evita aplicarea unei comenzi pe un grup schimbat între timp. Bifarea manuală a participanților rămâne compatibilitate pentru înregistrările istorice; grupurile noi se bazează pe personajele confirmate.

## Adaptarea experienței

- **Readiness:** cerute doar posturile cu locuri confirmate, identificate efectiv prin conexiunile tabletelor. O tabletă conectată la alt post nu ține locul celei lipsă. Zero participanți blochează pornirea. Cerințele existente privind ecranele, video și voci rămân.
- **5–10 ani:** pragurile pentru piese găsite, montate și conectate folosesc numărul de participanți activi. Felinarul TV reprezintă numai piesele locurilor active, cu etichetele lor reale.
- **10–15 ani:** contribuțiile și majoritatea folosesc locurile active. O persoană poate transmite două ritmuri diferite; lipsa colegului nu produce probe fictive.
- **15–18 ani:** pe un post cu un singur participant, acesta stabilește explicit ambele reguli ale pilotului automat, prin două manete. Nu este inventat un răspuns pentru locul absent. Regulile inițiale și revizuite sunt păstrate separat, iar rezumatul le descrie pe ambele. Cu doi participanți, împărțirea A/B rămâne.
- **Adulți:** completarea cercetării/arhivei se raportează la participanții activi. Bugetele și documentele rămân individuale.
- **Original legacy:** selecția și tutorialul/finalul folosesc aceeași listă; zonele neocupate nu trimit alegeri. Mecanica și replicile originale sunt păstrate.
- **TV și tabletă:** identitatea ilustrată este afișată în pregătire, tutorial, jocuri și final; jurnalul include personajele confirmate. Sosirile 3D folosesc confirmările serverului și culorile personajelor.
- **Repetiția tehnică:** păstrează explicit locurile tehnice istorice, distincte de înscrierea publicului.

Filmul, GLB-ul, muzica, fișierele vocale, textele show-ului și timingurile nu au fost modificate. Înregistrările audio existente nu au fost regenerate pentru adresare la singular. Schimbarea aceasta adaptează rosterul, interacțiunile, pragurile și prezentarea; nu rescrie scenariile.

## Ce rămâne de verificat

Implementarea nu este validată runtime. Când testarea este autorizată din nou: typecheck/build și suitele relevante, apoi selecții concurente, retry după pierderea ACK-ului, restart și recuperare SQLite, fiecare distribuție de 1–10 participanți (inclusiv numai B), lipsa unui post confirmat, redeschiderea/eliberea locului, tutorialul și toate profilurile.

Pe instalație: touch A/B simultan, încadrare fără scroll la 1920×1080 și text mărit, contrast/focus, lizibilitatea portretelor și numelor de la 4–5 m, TV central 4K/windowed, SFX o singură dată și control tabletSfx, flux real cu film/GLB/subtitrări, fallback WebGL/reduced-motion și încărcarea imaginilor/GPU pe mini-PC. Nu sunt capturi noi ale aplicației pentru această intervenție.


### Selecție arcade și Dori

Dori este al doisprezecelea personaj: pinguin explorator cu scanner de gheață și costum EXODUS7 violet. Asset generat cu imagegen integrat; promptul exact este în dori-v1.prompt.md. Selecția are grilă 6×2 pe fiecare jumătate, podium cu portret mare, nume și rol, card activ cu contur auriu și buton „Gata de aventură!”. Previzualizarea nu rezervă locul; doar confirmarea serverului îl înscrie. Look inspirat de meniurile de selecție din jocurile de karting, cu identitatea EXODUS7. Fără scoruri sau abilități fictive. Efect scurt la schimbarea portretului, dezactivat la reduced-motion/reduced-stimuli. Capacitatea rămâne 1–10 participanți. Fără teste, build sau capturi runtime în această intervenție.

Completare 2026-09-05: identitatea confirmată însoțește jocurile și tutorialul. Finalul TV arată doar participanții activi, cu personaje și simboluri; nava adaptează modulele la 1–10. Vezi [EXPERIENTA-COMPLETA-UX](EXPERIENTA-COMPLETA-UX.md) pentru toate cele șapte intervenții și limitele nevalidate runtime.

