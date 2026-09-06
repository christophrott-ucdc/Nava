# EXODUS7 — Dincolo de lumi

Suită orchestrală de fundal, durată cerută 6 minute. Compoziție originală propusă, fără voce. Nu este o partitură notată; orchestrația și motivul sunt indicații pentru generare și necesită audiție.

Tema: Re–La–Si–Fa diez, fraze ample, aproximativ 68 BPM, Re major cu culori lidiene. Coarde calde, harpă, celestă, corn francez discret și suflători de lemn. Dinamică reținută, fără cor, lovituri bruște sau percuție de trailer. Muzica lasă spațiu dialogului.

1. 0:00–1:00 — Portul stelelor: tema apare la harpă și celestă; îmbarcare liniștită.
2. 1:00–2:00 — Aripi de lumină: tema trece la corn și coarde; desprindere grațioasă.
3. 2:00–3:00 — Grădina dintre lumi: suflători, pizzicato și întrebări muzicale jucăușe.
4. 3:00–4:00 — Întrebarea: orchestra se rarefiază, armonii suspendate; mister fără amenințare.
5. 4:00–5:00 — Împreună: tema revine amplificată orchestral, cu căldură, fără climax agresiv.
6. 5:00–6:00 — Acasă, printre stele: revenire la harpă și celestă; cadență și stingere naturală.

Plan exact: assets/music/symphony/composition-plan.json. Script: scripts/symphony-produce.mjs. Schema urmează documentația oficială https://elevenlabs.io/docs/eleven-api/guides/how-to/music/composition-plans . Duratele, notele și orchestrația sunt cerințe, nu caracteristici confirmate ale unui audio produs.

Stare 2026-09-05: prima cerere a fost respinsă HTTP 401. După actualizarea credentialului la cererea utilizatorului, generarea ElevenLabs music_v2 a reușit. MP3: assets/music/symphony/exodus7-dincolo-de-lumi-v1.mp3. Receipt cu hash și identificatorul piesei în același folder; respingerea inițială este arhivată. Durată solicitată: 6 minute; conținutul muzical și durata efectivă nu au fost validate prin audiție. Cheia este exclusiv în configurația locală ignorată de Git. Fără retry automat.

Coloana sonoră existentă și manifestul show-ului nu au fost modificate. Piesa este destinată inițial audiției; nu se suprapune automat peste muzica existentă. După generare sunt necesare audiție, mixaj și alegerea ferestrelor de redare, cu ducking sub dialog. Fără teste, build sau rularea aplicației.

## Integrare în primirea publicului — 2026-09-06

La cererea utilizatorului, suita este integrată ca muzică de primire, pe screensaver și pe selecția personajelor înainte de tutorial. Consultarea agentului în rol de compozitor/orchestrator recomandă această fereastră deoarece cele șase secțiuni nu au sincronizare muzicală confirmată cu filmul. Nu este pretinsă o relație personală cu Hans Zimmer și nu este pretinsă audiția piesei.

Fișier runtime: assets/music/M11-simfonie.mp3; metadate/hash: assets/music/waiting.json. Serverul oferă /api/music/waiting și servește numai fișierul permis, cu verificarea hash-ului la încărcare. Pachetul celor zece cue-uri ale filmului rămâne intact. Lipsa suitei nu blochează show-ul. Asseturile sunt incluse de configurația de packaging existentă.

Redarea este rezervată ieșirii audio configurate și folosește busul ambiental, volumul/mute și duckingul comun. La tutorial sau show, suita se retrage, fără suprapunere cu M01–M10. Durata buclei provine din audio decodat, nu din cele șase minute cerute generatorului. Confirmările personajelor nu repornesc piesa.

Implementare în surse, fără teste, build, aplicație sau audiție. De verificat ulterior pe hardware: nivelul față de dialog, începutul și finalul muzical al buclei, pause/reset, pornirea tutorialului și o singură ieșire audio.
