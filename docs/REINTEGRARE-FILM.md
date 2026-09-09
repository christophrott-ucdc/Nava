# Reintegrarea filmului panoramic — cronologia curentă

## Contract

Aprobat de Chris: sincronizare direct după imaginile filmului, inclusiv textele și vocile; nu se mai presupune un decalaj global față de scriptul SpaceEngine. Patru fișiere au 678,05 s; port-outer are 678,00 s. Toate sunt 3840×2160, 60 fps. Nu au fost modificate sau recodate.

`assets/show/show.json` este sursa cronologiei. `publicDurationSec()` din `src/shared/film-timing.ts` calculează durata: preshow + lead-in + film + epilog. Rezultatul actual este 813,05 s, aproximativ 13:33. Tutorialul, selecția echipajului și pauzele operatorului adaugă timp variabil.

## Repere vizuale

Cadre extrase individual din `Video/panels/center.mp4`, păstrate în `runs/film-reintegration/center-<secunda>.jpg`:

| Imagine | Observație măsurată | Scena / dialogul |
|---|---|---|
| Decolare | Pământul este vizibil la 10 s, ieșit la 20 s | launch −10…60 |
| Siwarha | sursă albă foarte luminoasă la 80–100 s, plecare înainte de 110 s | light 60…144; conversația continuă prin radio |
| Kepler | planetă recognoscibilă la 180 s, apropiere la 200 s, ieșire între 210 și 220 s | nature 144…246; conversația continuă prin radio |
| Mann | planetă la 280–310 s, plecare înainte de 320 s | tech 246…388 |
| Gargantua | discul intră între 344 și 345 s, prezent la 380 s | inclus în tech, înainte de viraj |
| Tunel | planetă cu inele vizibilă prin lentila tunelului la 420–440 s | wormhole 388…504 |
| Saturn | recognoscibil la 504 s, apropiere la 510–540 s, plecare înainte de 560 s | saturn 504…610; include drumul spre Pământ |
| Pământul | recognoscibil la 610 s, mare la 630–640 s, trecere apropiată la 650 s | revelation 610…678,05 |
| Final | stele la 677 s, fără hold pe Pământ | epilogul păstrează ultimul cadru |

Acestea sunt repere de montaj măsurate din cadre, nu măsurători sub-cadru ale comenzilor SpaceEngine. Primele trei scene își păstrează ferestrele radio/joc; de la Mann, timpii sunt remapați proporțional în interiorul fiecărui segment. Saturn este o inserție distinctă. Ordinea, ID-urile, ramurile adaptive și dialogurile celor patru vârste sunt păstrate.

## Vocile schimbate

Au fost generate numai patru înregistrări ElevenLabs, în română, cu distribuția existentă:

- `v3-cap-0501`, 3,20 s: „Ritmuri diferite. Un singur echipaj.” Elimină presupunerea obligatorie de zece participanți.
- `v4-saturn-01`, la 510 s, Căpitan, 8,00 s: „Priviți inelele! E Saturn. Suntem din nou în Sistemul Solar. De aici, drumul spre casă ne este cunoscut.”
- `v4-saturn-02`, la 527 s, Avatar AI, 11,36 s: „De departe, inelele par întregi. De aproape, sunt nenumărate bucăți de gheață și rocă. Fiecare se rotește în jurul lui Saturn.”
- `v4-saturn-03`, la 557 s, Căpitan, 7,44 s: „Lăsăm Saturn în urmă. Următoarea oprire este o lume cu oceane, nori și oameni care ne așteaptă.”

Cele trei replici educative Saturn sunt comune categoriilor de vârstă. Înregistrările sunt reutilizate, fără a plăti patru generări ale aceluiași text. Manifestele fiecărui profil includ SHA256, metadatele media și visemele românești. Toate vocile folosesc fallback silent. Transcrierea celor patru înregistrări: WER 0; indicațiile de regie nu apar în vorbire. Rezultate: `runs/film-reintegration/new-voices-qa.json`.

Regenerare selectivă, numai dacă se schimbă aceste texte:

```powershell
npm run tts -- --source assets/show/voice-script-v3.json --cue v3-cap-0501 --cue v4-saturn-01 --cue v4-saturn-02 --cue v4-saturn-03
node scripts/sync-saturn-voices.mjs
node scripts/qa-voice-transcription.mjs v3-cap-0501 v4-saturn-01 v4-saturn-02 v4-saturn-03
```

Cheia se citește din mediul local / `.env`, niciodată din documentație. Vocile existente cu text neschimbat nu se regenerează pentru simpla mutare a timpului.

## Redarea și integrarea

Configurația Samsung și profilul local de perete folosesc `videoWall.mode: panorama` și `video.panelsDir`. Se selectează `<screenId>.mp4` numai dacă setul necesar este complet. În lipsa directorului ori a unui fișier se păstrează redarea filmului unic. Modul cinema păstrează decupajul și ambianța laterală existente.

Cele cinci decodoare muted folosesc același ceas derivat de la server. Rendererul central își păstrează rolul autorizat pentru audio/tutorial/fotografie; rapoartele sale actualizează readiness fără a rescrie ceasul filmului panoramic. Panourile deja decupate nu mai trec prin încă o decupare geometrică. Avatarul și subtitrările rămân pe panoul showAvatar.

Corecție configurabilă `video.panelSync`: deadband 0,025 s, salt de la 0,12 s, corecție de viteză ±5%. Salturile folosesc latența de seek măsurată separat pe fiecare decoder, pentru a evita urmărirea repetată a unui ceas care avansează în timpul decodării. Canvasul păstrează ultima imagine în timpul seekului.

Muzica M06–M08 urmează noile segmente; pasajul Saturn reutilizează discret tema de întoarcere M08 ca M11, cu loop și fade. Tăcerea din prima parte rămâne la fereastra inițială. Ferestrele jocurilor din toate cele patru profiluri sunt remapate împreună cu dialogul. Limitele editorului, epilogul și repetiția tehnică folosesc durata curentă. `sync:voices` nu mai poate reinstala accidental cronologia de 465 s.

## Verificări și probe

Rezultatele și capturile sunt în `runs/film-reintegration/`; captura smoke cu avatar este `runs/renderer-smoke-avatar.png`. `docs/CUE-SHEET.md` este regenerat din cronologia actuală. Verificările hardware necesare: redare continuă pe PC-ul final cu toate cele cinci ieșiri 4K60, deriva efectivă pe îmbinări, cadre pierdute, audibilitatea și nivelul muzicii în sală, potrivirea fizică a geometriei.

Nu s-au modificat scripturile SpaceEngine, filmul, autentificarea sau rolurile. Nu s-a regenerat MANUAL-UTILIZARE.docx și nu s-a făcut push, deploy sau release.

## Documente cu durată istorică

Inventarul de dinaintea actualizării este reprodus mai jos. Referințele din brief-uri/arhive descriu versiunea veche; cronologia curentă din acest document și JSON are prioritate. README-INSTALARE.md nu conținea efectiv „10 minute” în versiunea găsită, deși brief-ul îl indica; a primit o trimitere la noul contract. Manualul Word rămâne de actualizat ulterior, în două locuri: sumarul capitolului 1 („Ce trăiesc copiii, în zece minute”) și primul paragraf al experienței („experiență de zece minute”).
README.md:3:NavaPlayer este playerul și serverul local al experienței imersive „A Patra Lume" de la UCDC HUB AI: un singur executabil Windows (Electron + Node) redă filmul 4K sincronizat pe cinci ecrane, suprapune Căpitanul 3D cu lip-sync și subtitrările, rulează scenariul V3.3 pe cue-uri (600 s: pre-show 50 s + lead-in 10 s + film 465 s + epilog 75 s) și servește consola operatorului, pagina de depanare și cele cinci tablete ale celor zece copii.
AI\PROMPT-CODEX-REINTEGRARE-FILM.md:165:`50 preshow + 10 lead-in + 678 + 75 epilog = 813 s = 13:33`, nu 10:00.
AI\PROMPT-CODEX-REINTEGRARE-FILM.md:172:- listează în raport **fiecare** loc unde apare „10 minute" și care trebuie actualizat;
AI\PROMPT-CODEX-REINTEGRARE-FILM.md:210:- Lista completă a locurilor unde „10 minute" trebuie actualizat.
docs\SCENARIU.md:5:Experiența durează exact 10:00: pre-show 0:00–0:50, lead-in de lansare 0:50–1:00, film 1:00–8:45 și epilog continuu 8:45–10:00. Cei zece copii rămân tot timpul în cinci perechi, la cinci posturi și cinci tablete.
docs\SCENARIU.md:33:## 7. Protocolul Acasă — 8:45–10:00
docs\SCENARIU-REGIZORAL-10-MIN.md:5:### Scenariu cinematografic imersiv · versiunea 3.3 · adaptare scenică românească · 10:00 exact
docs\SCENARIU-REGIZORAL-10-MIN.md:86:Experiența se desfășoară de la 0:00 la 10:00 în aceleași cinci posturi, pe aceleași cinci ecrane și cinci tablete. Copiii nu se ridică, nu schimbă locul și nu primesc alt echipament. Denumirea tehnică `epilog` din contractul temporal indică numai schimbarea sursei vizuale la 8:45; pentru public nu începe un modul nou.
docs\SCENARIU-REGIZORAL-10-MIN.md:117:| 9:55–10:00 | epilog 70–75 | Tăcerea finală | 0:05 |
docs\SCENARIU-REGIZORAL-10-MIN.md:119:**Total: 600 de secunde.** Filmul este oprit determinist la secunda video 465; porțiunea 465–741,78 nu face parte din masterul de zece minute. Ultimul cadru, HUD-ul și rezonanța sonoră persistă peste schimbarea tehnică de fază, astfel încât nu există tăietură, negru sau reset vizibil la 8:45.
docs\SCENARIU-REGIZORAL-10-MIN.md:457:## 8:45–10:00 · PROTOCOLUL ACASĂ
docs\SCENARIU-REGIZORAL-10-MIN.md:491:Între 9:55 și 10:00 dispare orice sunet. Rămâne albul cald.
docs\SCENARIU-REGIZORAL-10-MIN.md:493:### 10:00 · SFÂRȘIT
docs\scenarii\15-18-DREPTUL-DE-A-SCHIMBA-CURSUL.md:15:600 s: preshow 0–50, lead-in `play -10…0`, film 0–465, epilog 0–75. Siwarha 60–144; Kepler-186 d 144–246; Mann 246–356; traversare 356–402; Pământ 402–465. Fără Saturn, VR sau H2. Căpitan GLB numai central, Avatar AI voce de bord. Celelalte voci sunt interlocutori ai laboratorului, nu persoane fizice în sală.
docs\scenarii\05-10-BUCATILE-DE-ACASA.md:15:Ancorele provin din [planul tehnic](../PLAN-TEHNIC-AUTOMATIZARE-SCENARII.md) și din `assets/show/show.json`: preshow 50 s; lead-in `play -10…0`; film 465 s; epilog 75 s. Total 600 s. Film: lansare 0–60, Siwarha 60–144, natură 144–246, Mann 246–356, tunel 356–402, Pământ 402–465. Nu adăugăm Saturn. Planetele sunt numite după apariția lor, nu imediat la schimbarea temei.
docs\scenarii\05-10-BUCATILE-DE-ACASA.md:126:42 de replici cu ID-uri unice; 598 cuvinte rostite însumând toate variantele și 479–484 cuvinte pe o rulare. Sloturile nu se suprapun pe ramura activă, rămân în fazele celor 600 s și bugetează maximum 120 cuvinte/minut. Acestea sunt calcule de text și slot, nu durate audio măsurate.
AI\docs\ASTRA-IMPLEMENTARE-GLASS.md:31:NavaPlayer este o aplicație locală Windows/Electron pentru experiența imersivă „A Patra Lume”. Un master redă un film 4K pe până la cinci ecrane, suprapune un Căpitan GLB, subtitrări și entități procedurale, rulează o cronologie de exact zece minute și servește prin Hono/WebSocket consola operatorului și cinci tablete folosite de zece copii în perechi.
docs\scenarii\10-15-SEMNALUL-FARA-SEMNATURA.md:15:600 s total: preshow 0–50; lead-in `play -10…0`; film `play 0…465`; epilog 0–75. Siwarha 60–144, Kepler-186 d 144–246, Mann 246–356, traversare 356–402, Pământ 402–465. Nu introducem Saturn. Replicile de mai jos înlocuiesc viitoarea pistă vocală a acestui profil, nu se suprapun peste dialogul legacy.
docs\OPERARE.md:218:Misiunile sunt în `data/nava.sqlite`; certificatele și fotografiile rămân în `runs/`. Nu șterge baza pentru a rezolva o recuperare: continuă explicit sau pregătește un grup nou. Rulările tehnice sunt separate de public. Repetiția completă durează aproximativ zece minute și poate fi anulată din dialog; nu dovedește singură audibilitatea sau alinierea fizică.
AI\docs\BRIEF.md:7:> **Actualizare V3 (2026-09-04):** pentru scenariu, timing și operare, secțiunile istorice de mai jos sunt înlocuite de `docs/SCENARIU-REGIZORAL-10-MIN.md`, `assets/show/show.json`, `docs/OPERARE.md` și ultima secțiune din `HANDOFF.md`. Configurația actuală are cinci tablete pentru cinci perechi, Căpitan digital exclusiv în fereastra GLB `center`, fără personaj fizic/Unitree și fără capsulă VR. Masterul video este tăiat determinist la 465 s, apoi urmează epilogul continuu până la durata publică totală de 10:00. Toate cele 51 de asset-uri V3 sunt pre-generate (49 redate într-o rulare, fiindcă una dintre trei ramuri adaptive este aleasă); cue-urile de producție nu folosesc TTS Windows/browser.
AI\docs\BRIEF.md:15:Publicul: copii (10 per sesiune), în cinci perechi la cinci posturi și cinci tablete, într-o sală de 17×7 m amenajată ca navă spațială, la UCDC HUB AI (Universitatea Creștină „Dimitrie Cantemir", București). Durata experienței este exact 10 minute, într-un flux continuu în aceeași sală.
AI\docs\DECIZII.md:57:Acceptat. Fluxul este 50 s pre-show + 10 s lead-in + 465 s film + 75 s epilog = 600 s. Rendererul face tranziția locală la praguri și nu așteaptă un round-trip WebSocket; serverul primește ecoul stării fără să reseteze ceasul.
AI\docs\PLAN-TEHNIC-AUTOMATIZARE-SCENARII.md:49:Show-ul curent folosește 50 s preshow + 10 s lead-in + 465 s film + 75 s epilog = **600 s**. Cele **61 de instrucțiuni explicite `Wait`** din TXT însumează **625,5 s**. Suma nu certifică durata unui export SpaceEngine: trebuie verificată semantica comenzilor și apoi filmul efectiv. Nu se adună mecanic și valorile `Time` ale mișcărilor, deoarece acestea pot suprapune așteptările.
AI\docs\PLAN-TEHNIC-AUTOMATIZARE-SCENARII.md:341:Praguri propuse pentru calificare, de confirmat pe PC-ul sălii: răspuns confirmat LAN p95 ≤250 ms; drift software p95 ≤40 ms în modul cu renderere separate; cadre video pierdute sub 1% într-o redare susținută de zece minute, după warm-up. Măsurăm separat pauzele/seek-urile intenționate. Apoi rulăm minimum trei misiuni consecutive pentru a verifica acumularea de resurse. Acestea sunt criterii viitoare, nu rezultate deja obținute.
AI\docs\PLAN-TEHNIC-AUTOMATIZARE-SCENARII.md:387:| Timp | Legacy exact 600 s; lead-in negativ; import TXT provizoriu; niciun reper provizoriu convertit tacit; seek/rate/pauză/epilog |
AI\docs\PROMPT-CODEX-MUZICA.md:17:**Experiența:** 10 minute, pentru copii de 7–12 ani, într-o sală cu cinci televizoare 4K și cinci tablete. Un film de călătorie spațială realizat în SpaceEngine, peste care vorbesc două personaje: **CĂPITANUL** (voce masculină, avatar 3D) și **AVATARUL AI** (voce sintetică, va fi întruchipat de un robot). Copiii fac alegeri în perechi pe tablete. La final primesc un certificat.
AI\docs\PROMPT-CODEX-MUZICA.md:27:Faza `preshow` durează 50 s. Faza `play` începe la −10 s (numărătoare pe cadru înghețat), filmul rulează 0–465 s. Faza `epilogue` durează 75 s peste ultimul cadru înghețat. Total: 600 s.
AI\docs\reference\EXODUS_SUMMARY.md:177:- **Settings:** HUD preferences (audio level, alerts, grid overlay, HUD color, sensor range; these are cosmetic and not persisted), a controller status card with gamepad detection and profile selection, the **ARIA avatar panel** (upload a .glb, test the avatar, clear it), the **Event Simulation** panel (perturbation feed on/off, interval slider 10 to 600 seconds with ±25 percent jitter, DRILL NOW and CRITICAL DRILL buttons), and the **Audio Systems** mixer (master, ambient, UI clicks, alerts, hover, and system-voice categories with volumes, a "critical ops only" switch, voice previews "SARAH" and "BRIAN," a UI sound preview row, and an ambient-preset preview list for every route).
AI\docs\scenarii\README.md:42:Scenariile sunt montate editorial pe structura actuală de 600 s: preshow 50 s, lead-in 10 s, film 465 s și epilog 75 s. Timpul din faza `play` începe la −10 pentru numărătoare. Pentru citire continuă, timpul public este `play.at + 60`, respectiv `epilogue.at + 525`; preshow coincide cu timpul public.
AI\docs\scenarii\REVIZIE-SCENOGRAFICA.md:81:Ruta de 600 s și filmul de 465 s rămân baza. Nu se adaugă o scenă Saturn. Deciziile schimbă obiecte, dosare sau reguli în stratul interactiv, nu zborul din film. Căpitanul rămâne GLB central; cele cinci tablete păstrează A stânga și B dreapta, fără dependență de numărul televizoarelor.

## Tabel complet: timpi vechi → timpi noi

Include cele 42 de cue-uri de la 246 s încolo și restul evenimentelor play pentru audit.
| Cue | Vechi | Nou |
|---|---:|---:|
| launch-theme | -10 | -10 |
| launch-tablet | -10 | -10 |
| launch-countdown | -10 | -10 |
| launch-liftoff-sfx | 0 | 0 |
| v3-cap-0109 | 9 | 9 |
| launch-marker-stars | 20 | 20 |
| v3-ai-0125 | 25 | 25 |
| v3-ai-0136 | 36 | 36 |
| light-theme | 60 | 60 |
| v3-ai-0206 | 66 | 66 |
| light-entity-show | 82 | 82 |
| v3-light-0224 | 84 | 84 |
| v3-light-0236 | 96 | 96 |
| light-tablet-color | 103 | 103 |
| light-tablet-close | 115 | 115 |
| v3-light-0258 | 118 | 118 |
| light-entity-hide | 125.2 | 125 |
| v3-cap-0310 | 130 | 130 |
| nature-theme | 144 | 144 |
| v3-ai-0352 | 172 | 172 |
| nature-entity-show | 192 | 192 |
| nature-rain | 194 | 194 |
| v3-nature-0415 | 195 | 195 |
| v3-nature-0433 | 213 | 213 |
| nature-tablet-pulse | 219 | 219 |
| nature-tablet-close | 231 | 231 |
| v3-nature-0453 | 233 | 233 |
| nature-marker-silence | 233 | 233 |
| nature-entity-hide | 239.2 | 239 |
| v3-cap-0501 | 241 | 241 |
| v3-ai-0512 | 252 | 253.5 |
| tech-theme | 268 | 274.5 |
| v3-ai-0534 | 274 | 282 |
| tech-entity-show | 294 | 308 |
| v3-tech-0556 | 296 | 310.5 |
| v3-cap-0604 | 304 | 321 |
| v3-tech-0606 | 306 | 323.5 |
| v3-tech-0610 | 310 | 328.5 |
| tech-tablet-perspectives | 317 | 337.5 |
| tech-tablet-close | 334 | 359.5 |
| v3-tech-0635-diverse | 335 | 361 |
| v3-tech-0635-observe | 335 | 361 |
| v3-tech-0635-same | 335 | 361 |
| tech-adaptive-select | 335 | 361 |
| v3-cap-0642 | 342 | 370 |
| v3-tech-0645 | 345 | 374 |
| tech-entity-hide | 350.5 | 381 |
| v3-ai-0651 | 351 | 381.5 |
| v3-cap-0654 | 354 | 385.5 |
| void-theme | 356 | 388 |
| wormhole-whoosh | 360 | 398 |
| wormhole-marker | 360 | 398 |
| v3-ai-0718 | 378 | 443.5 |
| v3-cap-0727 | 387 | 466 |
| v3-ai-0729 | 389 | 471 |
| v3-cap-0738 | 398 | 494 |
| wormhole-exit-swell | 400 | 499 |
| home-theme | 402 | 610 |
| v3-ai-0742 | 402 | 610 |
| v3-cap-0750 | 410 | 618.5 |
| v3-ai-0754 | 414 | 623 |
| v3-cap-0802 | 422 | 631.5 |
| v3-ai-0809 | 429 | 639 |
| v3-echo-0820 | 440 | 651 |
| v3-echo-nature-0824 | 443.8 | 655 |
| v3-echo-tech-0826 | 446.4 | 658 |
| v3-cap-0829 | 449 | 661 |
| v3-ai-0838 | 458 | 670.5 |
| v3-cap-0843 | 463 | 676 |
| home-transmit-chime | 463.5 | 676.5 |
| home-transmit-marker | 463.5 | 676.5 |
| rev-hold-marker | 465 | 678 |

## Copii optimizate pentru RTX 4080

În proba reală cu cinci fișiere 3840×2160 la 60 fps, `nvidia-smi` a indicat 99% utilizare a decodorului NVDEC (GPU general 6%). Au apărut întârzieri și seek-uri repetate. Au fost create separat copii 2560×1440 la 60 fps în `C:/Users/Chris/Documents/GitHub/Video/panels-playback-1440`, fără modificarea originalelor din `Video/panels`.

Rezoluția copiei corespunde dimensiunii fiecărui segment înainte de mărirea 1,5× descrisă în brief. Copia este totuși o nouă compresie H.264, nu un fișier identic bit cu bit. Ferestrele/canvasurile TV rămân 4K. Comanda reproductibilă este:

```powershell
node scripts/prepare-panel-playback.mjs ../Video/panels ../Video/panels-playback-1440
```

Setarea locală recomandată pentru această mașină este `video.panelsDir: ../Video/panels-playback-1440`. Originalele 4K pot fi selectate din nou prin schimbarea directorului. `port-outer` original are 40680 cadre / 678,00 s; celelalte patru au 40683 cadre / 678,05 s. Copiile păstrează fiecare durata sursei sale; panoul exterior stâng ține ultimul cadru în ultimele 0,05 s ale filmului.

## Verificare finală — 9 septembrie 2026

- `npm run check`: trecut; TypeScript, build, validatoare, 206 teste / 206 trecute, smoke core/auth/platform/media.
- `npm run smoke:wall` și `npm run smoke:experience`: trecute; experiența include tutorial, recuperare SQLite, patru profile și final interactiv.
- `npm run validate:scenarios`: fără fișiere lipsă sau replici peste fereastra disponibilă.
- Renderer Electron real: panorama cu cele cinci copii optimizate și regresia cinema cu filmul unic au trecut verificarea filmului, avatarului GLB și subtitrărilor.
- QA prin retranscriere pentru cele patru înregistrări noi/refăcute: WER 0 pentru fiecare. Cele 163 de înregistrări existente ale profilelor de vârstă au fost păstrate; cele trei înregistrări Saturn sunt reutilizate în toate cele patru profile.
- Proba continuă măsurată: diferență între panouri aproximativ 15 ms, NVDEC aproximativ 55%, fără seek-uri repetate. Aceasta este o măsurătoare pe o fereastră scurtă, nu o repetiție completă de 13:33.
- Salturi la 80, 200, 300, 360, 430, 527 și 630 s: diferențe de 35–48 ms după stabilizare. Salturile mari au necesitat până la aproximativ 5,5 s; nu se promite schimbare instantanee de scenă.

Dovezi locale în `runs/film-reintegration/`: `check-final.log`, `smoke-wall.log`, `smoke-experience.log`, `smoke-cinema.log`, `smoke-renderer-final.log`, `new-voices-qa.json`, `panel-playback.json`, `panel-playback-steady.json`; capturi `renderer-80.png` până la `renderer-630.png`, `renderer-cinema.png` și `renderer-panorama-final.png`.

Rămâne obligatorie repetiția integrală pe cele cinci televizoare fizice, cu ieșiri 4K, îmbinări/spații, refresh rate și întârzieri reale ale TV-urilor, sunetul în sală, nivelul vocilor față de muzică și tabletele fizice. Regresia cinema confirmă funcționarea căii vechi de redare; filmul vechi nu este remapat editorial la traseul nou. Nu s-au modificat filmele originale, scripturile SpaceEngine sau manualul DOCX; nu s-a făcut push, release ori deploy.
