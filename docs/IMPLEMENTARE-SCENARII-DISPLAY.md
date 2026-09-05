# Scenarii, voci și display-uri — starea implementării

Actualizare 5 septembrie 2026. Această livrare pune în execuție planul tehnic și scenariile editoriale autorizate ulterior. Originalul V3 rămâne selectabil; `assets/show/show.json`, vocile originale, filmul și GLB-ul nu sunt înlocuite.

## Experiențele disponibile

| Profil | Ce face fiecare pereche | Rezultatul păstrat |
|---|---|---|
| 5–10 ani | Recunoaște zece forme, montează piesele, prinde separat capetele A/B | Proveniența pieselor, montajul și legăturile; lanternă comună pe TV |
| 10–15 ani | Formulează ipoteze, măsoară, construiește probe cu intervale distincte, leagă verdictul de dovezi | Probe distincte K/R, observații, verdict și limita dovezii |
| 15–18 ani | Împarte autoritatea și confirmarea, testează acord/conflict, revizuiește mandatul | Regulile inițiale/finale și comparația acelorași cazuri |
| Adulți | Alege întinderea observației, gestionează două unități de rezervă, transmite un document disponibil | Costuri, document transmis și documente păstrate local |

Observarea, abținerea, răspunsul lipsă și contribuția efectivă rămân distincte. Sunt cinci tablete cu A în stânga/B în dreapta și o tabletă operator, toate landscape 1920×1080. Nu există un Căpitan fizic și nu se integrează Unitree H2.

Consola selectează un pachet complet numai în pregătire. Serverul verifică textul, hashurile MP3, alinierea și durata înainte să accepte pachetul; rendererul confirmă încărcarea/decodarea vocilor înainte de pornire. Rezoluția unui profil nu amestecă replici cu fallback din altă categorie. Textele draft rămân sursele editoriale; starea runtime este dată de resolver, manifest și verificări, nu de vechiul `productionReady:false` editorial.

## Producția vocală

163 MP3 ElevenLabs reale: 42 + 41 + 40 + 40, patru manifeste, patru reels cu toate alternativele, receipt-uri, hashuri, aliniere pe cuvinte și 14.466 viseme. Căpitanul și Avatarul AI folosesc ID-urile furnizate de utilizator. Celelalte personaje păstrează castingul existent. Cheia rămâne numai în `.env` local ignorat; redarea scenariilor este offline.

Decodare integrală FFmpeg și transcriere independentă Scribe verificate. WER automat: 0,33%, 0,27%, 0,28%, 0,31%. Acestea verifică reproducerea textului, nu înlocuiesc audiția regizorală în sală. Detalii: [VOICE-PRODUCTION.md](scenarii/VOICE-PRODUCTION.md).

Resolverul folosește spațiile tăcute existente pentru vocile măsurate, fără accelerare și fără schimbarea filmului de 465 s, preshow-ului de 50 s, lansării de 10 s sau epilogului de 75 s:

| Replică | Moment draft → producție, secunde în fază |
|---|---|
| s1015-03 | preshow 21 → 23,2 |
| s1015-26 | play 416 → 418,3 |
| s1015-30 | play 456 → 455,5 |
| s1015-36 | epilogue 54 → 55,5 |
| s1518-04 | preshow 37 → 36,5, marjă suplimentară |
| s1518-29 | play 454 → 452,4 |
| s1518-37 | epilogue 72 → 71 |

## Persistență și recuperare

`data/nava.sqlite`, creat automat la pornire, folosește SQLite nativ din Node/Electron, WAL și `synchronous=FULL`. Starea și evenimentul acceptat se salvează în aceeași tranzacție înainte de ACK. Tabele: versiune schemă, misiuni/checkpoint-uri, evenimente și artefacte. Nu există serviciu DB separat de instalat.

`runId`, `serverEpoch`, `timelineEpoch` și `cueInstanceId` delimitează rulările și ferestrele de răspuns. Repetarea UUID-ului nu dublează contribuția. Tableta reia numai o cerere încă valabilă pentru aceeași misiune. Certificatele au token legat de rulare/post/revizia rezumatului, scriere idempotentă și evidență SQLite. Fotografia răspunde numai solicitării active; mesajele dintr-o rulare veche sau retransmiterile nu produc încă un efect.

La repornire, o misiune activă se reface suspendată, cu același conținut și aceleași alegeri. Operatorul verifică readiness înainte de continuare. Un pachet modificat/incomplet blochează recuperarea automată și cere pregătirea unui grup nou. Setările de confort pe post se păstrează la schimbarea grupului. Pentru backup, închide aplicația și copiază `data/nava.sqlite` împreună cu `runs/`; nu copia numai fișierul principal al unei baze WAL aflate în scriere.

## Display-uri și calibrare

`npm run auto:configure` a creat `config.auto.local.json` pentru sala 98–98–115–98–98, fără a modifica `config.json`. `npm run auto:start` pornește acest profil. Pentru o instalație nouă cu număr variabil, utilitarul acceptă `--generic`; refuză suprascrierea unui profil local existent. Secțiunea `autoDisplays` permite explicit 1–16 ieșiri, inclusiv 3/4/6/7/8/9/10. După prima aplicare, numărul așteptat este păstrat, astfel încât un cablu scos să nu micșoreze tacit panorama.

Inventar Windows/Electron, identitate EDID/conector, excluderea operatorului, DPI, detecție clone/hotplug, profil persistent și aplicare cu rollback. Mod automat nou: panoramă; modul cinema existent rămâne disponibil manual. O singură ieșire primește Căpitanul și audio. [DISPLAY-AUTOMATION.md](DISPLAY-AUTOMATION.md).

Atelierul optic exportă patru markere ArUco/display și protocolul legat de inventar. `scripts/calibrate-wall.py` detectează automat colțurile dintr-o fotografie sau înregistrare locală, verifică observația și produce homografiile. Importul verifică din nou identitatea/rezoluția/topologia; aplicarea în pregătire salvează profilul și redeschide ferestrele. Compositorul WebGL aplică proiecția comună, fără a trata marginile fotografiei drept marginile filmului. Căpitanul este atribuit panoului din centrul observat.

Calibrarea este proiectivă, valabilă din poziția fotografiată; nu inventează milimetri sau poziții 3D. Nu există captură automată permanentă a camerei, detectare a mutării fizice fără o nouă imagine ori sincronizare hardware a scanării televizoarelor. Python/OpenCV sunt dependențe explicite pentru calibrare, nu pentru redarea normală. [OPTICAL-CALIBRATION.md](OPTICAL-CALIBRATION.md).

## Instrumentele operatorului

Dialogul „Misiune și instalație” include profiluri, confort pe cinci posturi, recuperare, inventar și diagnostic. Editorul de pachete salvează text/moment cu hash de concurență și backup exact; modificarea textului invalidează audio pentru următoarea selecție, fără TTS plătit declanșat de editor. Debugul arată identitatea curentă; analytics citește contribuțiile persistente și exclude implicit rulările tehnice.

Verificarea rapidă produce un raport de preflight și telemetrie. Repetiția completă rulează misiunea la ritm normal, cu raport și anulare, fără a permite comenzi concurente. Datele sale sunt izolate de statisticile publicului. Raportul califică separat filmul și aspectele `not-tested`/`not-observable`; nu declară atingerea fizică, audibilitatea sau alinierea sălii pe baza telemetriei.

## Dovezi și acceptarea fizică

- `runs/debug/scenarios-new/`: 140 capturi/stări tabletă, filme/GLB și finaluri TV în 4K/windowed, rapoarte integrare și proiecție.
- `runs/debug/scenario-upgrade-operator/index.html`: consolă, dialoguri, debug, analytics și atelier la 1920×1080/1440×900.
- `npm run check`: 147 teste și smoke core/auth/platform/media trecute. `npm run smoke:scenarios`, `npm run smoke:wall` și `npm run smoke:renderer`: trecute. Optică: 12 cazuri OpenCV, 8 teste TS, import/persistență nativă și comparație GPU a cinci cropuri trecute.
- Repetiție reală, profil adulți, ritm normal: 601,116 s, 597 mostre de telemetrie, 27.965 cadre și 1 cadru pierdut (0,0036%). Raport: `runs/debug/scenarios-new/rehearsal-real.json`. Această probă folosește un renderer local real și clienți de tabletă de test, nu instalația completă.

Pe hardware rămân de validat: toate cele cinci Samsung simultan, desktop extins, cabluri/GPU, geometria observată din sală, unghiurile/overscanul, audibilitatea și lip-sync-ul perceput, cele șase tablete fizice, atingerea/lectura, camera și minimum trei misiuni consecutive. Probe cu public reprezentativ pentru fiecare categorie și audiție regizorală rămân necesare; agenții AI au oferit perspective editoriale, nu consultații umane. Nu s-a făcut commit, push, merge, release sau deploy.
