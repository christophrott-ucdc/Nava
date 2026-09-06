# EXODUS7 — de la tabletă la nava de pe ecran

Implementare în surse, 5 septembrie 2026. Cererea: fiecare participant apasă un buton cu grafică Three.js, iar gestul apare pe ecranul central; începutul experienței primește o compoziție nouă.

## Ce vede publicul

- Pornire TV: hangar luminos, nava ilustrată existentă, logo EXODUS7, mesaj de bun venit și traseu vizual. Butoanele și scurtăturile existente sunt păstrate.
- Primire pe tablete: nava are mai mult spațiu, iar cele două locuri sunt identificate prin număr și literă. A rămâne în stânga, B în dreapta.
- Tutorial: „Salut, navă!” și „Aprinde lumina mea” sunt butoane HTML cu o față 3D sidefată. Confirmarea aprinde modulul corespunzător pe nava centrală. Două confirmări la același post aprind și o punte între module.
- Proba educativă din mijlocul tutorialului păstrează instrumentul, explicațiile și diagrama existente. Nava TV arată confirmările acestei probe.
- Final: participantul selectează mai întâi ce vrea să transmită, apoi apasă „Trimite simbolul meu”. Alegerea locală poate fi schimbată până la trimitere. Pe TV apare simbolul asociat alegerii, la modulul 1A–5B, iar legenda păstrează textul complet.

Simbolurile folosesc stea, inimă, busolă, semnal, întrebare, legătură și scut. Alegerile și sensul lor rămân cele ale profilului selectat: daruri pentru 5–10, întrebări pentru 10–15, reguli pentru 15–18, posibilități/întrebări/legături pentru adulți. Nu s-a uniformizat conținutul scenariilor.

„Prefer să privesc” rămâne disponibil. Locurile neocupate, observarea, așteptarea și confirmarea sunt stări separate. Numărul simbolurilor primite nu include observatorii sau locurile libere. Nava este o reprezentare a participării, nu un indicator de punctaj, competență sau pregătire tehnică a instalației.

## Legătura tehnică

Nu există un nou canal de mesaje. Butoanele folosesc `missionAction`, cu `runId`, `cueInstanceId`, `eventId` și zona A/B:

1. Salutul trimite `tutorial:touch`; cooperarea trimite `tutorial:link`.
2. În final, selectarea unui card schimbă numai un draft local pe zonă. Butonul mare trimite `finale:<valoare>`.
3. Serverul existent validează și persistă evenimentul în SQLite, apoi transmite snapshotul misiunii.
4. Ambele suprafețe derivă aceeași stare prin `crewRelay()`. Numai o contribuție confirmată aprinde un modul. Un draft sau un mesaj în așteptare nu apare ca succes pe TV.

Confirmarea finală rămâne ireversibilă conform regulii existente. Reîncercările păstrează mecanismul existent de deduplicare. Drafturile sunt separate pentru A/B și se resetează la schimbarea misiunii, profilului, postului sau instanței etapei. Nu se păstrează după reîncărcarea paginii; alegerile deja confirmate și evenimentele în așteptare folosesc persistența existentă.

Jurnalele și exporturile continuă să folosească alegerile confirmate. Nu s-au modificat schema SQLite, API-urile, autentificarea, regulile de readiness, show.json, filmul, GLB-ul, vocile, muzica sau timpii show-ului.

## Randare și confort

`src/web/shared/crew-stage.ts` construiește procedural nava, modulele și simbolurile cu Three.js deja instalat. Un canvas cu două viewporturi deservește butoanele A/B. TV-ul folosește aceeași implementare, cu nava completă, numai în overlay-ul central existent. Poziționarea în panorama span folosește în continuare viewportul de focus al instalației; acest pachet nu recalibrează peretele.

Randarea este cerută la schimbarea stării, redimensionare și pentru sosirea de aproximativ 1,1 secunde. Nu există animație continuă de fundal. Prima stare primită devine reper: contribuțiile deja prezente nu își repetă intrarea. Epoca misiunii și a tutorialului separă rundele. Pauza, ascunderea paginii și mișcarea redusă opresc efectele tranzitorii.

Canvasul decorativ este limitat la aproximativ 2,4 milioane de pixeli, fără umbre sau postprocesare. Geometriile și materialele vederilor înlocuite sunt eliberate. Aceasta este o limită de implementare, nu o măsurătoare de performanță pe mini-PC.

SVG-ul alternativ păstrează starea și simbolurile când WebGL lipsește, contextul se pierde, este activ `graphics=2d`, ghidajul decorativ este oprit ori sunt solicitați stimuli reduși. Preferința OS `prefers-reduced-motion` și confortul din snapshot sunt respectate. Pe TV, snapshotul fără post folosește setările globale existente; o preferință individuală a unui post nu este propagată automat pe toate TV-urile.

Butoanele rămân HTML, cu etichete, focus, stare în așteptare și activare prin tastatură. Canvasul nu captează gesturi și nu trimite comenzi. Niciun sunet nou nu a fost adăugat; feedbackul sonor folosește confirmările și controlul `tabletSfx` existente.

## Fișiere principale

- `src/web/shared/crew-relay.ts`, `crew-stage.ts`, `crew-stage.css` — stare derivată, geometrie și randare comună.
- `src/web/tablet/experience-ui.ts`, `mission-ui.ts`, `crew-relay.css`, `index.html` — butoane, drafturi, primire și layout A/B.
- `src/renderer/ui/experience.ts`, `crew-relay.css`, `index.html` — nava centrală și noul început.

Buildul existent copiază CSS-ul comun și include modulele importate. Nu sunt necesare pachete npm noi sau descărcări în timpul experienței.

## Starea livrării

Implementat și revizuit prin lectura surselor. **Fără teste, typecheck, build, pornirea aplicației, verificare în browser sau capturi noi**, conform interdicției explicite a utilizatorului. Nu se declară validare vizuală ori funcțională în runtime.

La următoarea pornire normală prin `RUN.bat`, fluxul existent construiește sursele. Rămân neconfirmate pe instalație: aspectul la 1920×1080 și 4K, încadrarea cu subtitrări lungi/text mărit, atingerea simultană A/B, latența percepută tabletă–TV, vizibilitatea etichetelor de la 4–5 metri, performanța mini-PC-ului și sincronizarea cu filmul și GLB-ul. Nu s-au făcut commit, push, merge, release sau deploy.
