# Steaua Omenirii — integrare, 10 septembrie 2026

Ediția pentru copii `age-5-10` folosește documentul autorului din `docs/scenarii/surse/Steaua-Omenirii.docx`. Originalul și extragerea integrală sunt păstrate; copiile editoriale anterioare nu au fost suprascrise.

## Implementat

- 55 replici de scenariu, inclusiv variantele condiționate, cu subtitrări și aliniere vocală pentru GLB. Eticheta vizibilă este COMANDANTUL; identificatorul intern CAPITANUL rămâne compatibil.
- 12 fișiere de narator: 8 texte din noul document și cele 4 explicații existente pentru celelalte profiluri. Toate regenerate pe ElevenLabs `eleven_v3`, română, fără accelerarea vorbirii.
- 3 replici VR produse separat în `assets/experience/vr/ro`; nu declanșează hardware sau redare în programul principal. Indiciul naratorului este disponibil ca fișier, fără declanșare automată nouă. Ghidul rămâne o voce umană în sală.
- 11 montaje muzicale pentru copii, derivate din muzica existentă: crossfade la extindere, fără schimbarea tempoului. Muzica scade cu 12 dB sub voce; pauză dramatică la 368,9–382,2 s. Saturn primește un pasaj al simfoniei; aprinderea are un accent separat.
- Lumina: glob auriu și fragmente orbitale. Natura: insulă plutitoare cu arbori și râu. Cristal: atelier cu turnuri fațetate. Stea 3D, escortă de daruri, coadă de cometă și glob terestru cu lumini progresive. Geometrie procedurală Three.js, fără active externe noi.
- Tabletele au lumi mici animate, grafica stelei în instrumente și finalul «Trimite raza mea». Contribuțiile confirmate apar pe TV; demonstrația fără tablete folosește darurile poveștii și nu inventează participanți.
- Redare 3D limitată la 30 fps pe TV și 24 fps pe tablete, rezoluții limitate, mod static pentru mișcare redusă și alternativă grafică la indisponibilitatea WebGL. Avatarul GLB rămâne pe ecranul central.
- Corectată încărcarea muzicii: manifestul existent cu 11 piese era respins de o condiție rigidă de 10. Pachetele muzicale pot avea acum partituri specifice profilului.

## Partitură

Preshow 60 s; numărătoare 10 s; film 678,05 s; epilog 75 s: **13:43,05**, plus tutorialul și finalul interactiv. DEMO TV omite primirea și interacțiunile: **12:43,05**.

Filmul rămâne intact. Lumi: Lumina 60–144 s, Natura 144–246 s, Cristal 246–388 s, tunel 388–504 s, Saturn 504–610 s, Pământ 610–678,05 s. Câteva replici de rămas-bun continuă peste tăietură, înaintea următoarei prezentări.

Jocuri: găsește 106–129 s; potrivește 205–229 s; închide circuitul 323,5–355,5 s. Aprindere 356,5 s, întrebare 369,2 s, cometă 382,7 s, revelație 633 s. Instrucțiunile se încheie înaintea deschiderii jocurilor. Distanța minimă calculată între înregistrări este 0,68 s, inclusiv pe variantele alternative.

Globul cu orașe este etichetat ca ilustrație 3D. Nu pretindem că filmul real conține aceste lumini; «Steaua Omenirii» este metafora poveștii, nu o explicație fizică despre o stea reală.

## Adaptări editoriale explicite

- R13a: Spațiu tipografic eliminat înainte de punct.
- R27: Aplicată revizia explicită a autorului din nota de după R21.
- R28b: Diacritice normalizate.
- R41: Aplicată revizia explicită a autorului din nota de după R21.
- R50: Eliminată valiza rămasă în text după revizia către escorta de lumini.

## Operare și stare reală

Închide aplicația Electron veche și pornește `PREZENTARE.bat`; pentru instalație folosește `PREZENTARE.bat --live`. Butonul DEMO TV selectează pachetul pentru copii. Pentru o sesiune normală, resetează sala și selectează «5–10 ani · Steaua Omenirii». O sesiune salvată cu pachetul anterior necesită resetare, deoarece hashul conținutului s-a schimbat.

Fișierele vocale vechi ale pachetului copiilor și naratorului au fost înlocuite; reel-urile și rapoartele de transcriere vechi au fost eliminate din pachetele active. Arhiva de revenire este în `runs/steaua-production/retired-voices-*.zip`. Muzica sursă, așteptarea și vocile celorlalte scenarii sunt păstrate pentru funcționalitatea lor. Cheia furnizorului este exclusiv în `.env`, ignorat de Git.

Au trecut compilarea TypeScript și buildul. Producția media a confirmat 70/70 fișiere, integritatea SHA-256 și duratele reale; montajul a calculat lipsa suprapunerilor. La cererea utilizatorului nu au fost rulate teste, smoke-uri sau aplicația pentru verificare vizuală; nu există capturi noi. Nu s-a făcut audiție umană integrală sau certificare a pronunției. `productionReady: false` rămâne până la acceptare.

Pe instalație rămân de verificat audiția, nivelul muzicii față de voce, sincronizarea video/GLB/subtitrări pe cele cinci TV-uri, performanța GPU, încadrarea la 4K, atingerea pe tablete, pauza/reluarea și sesiunea cu un singur participant. Nu există commit, push sau deploy pentru această livrare.

## Repere vocale exacte

| Referință | Fază | Start (s) | Voce (s) | Condiție |
|---|---|---:|---:|---|
| R07 | preshow | 1 | 11.36 | always |
| R08 | preshow | 13.2 | 13.04 | always |
| R09 | preshow | 27.1 | 9.12 | always |
| R10 | preshow | 37 | 7.28 | always |
| R11 | preshow | 45.2 | 9.76 | always |
| R12 | play | -9 | 6 | always |
| R13 | play | 5 | 10.96 | always |
| R13a | play | 17 | 4.64 | always |
| R14 | play | 28 | 9.6 | always |
| R14a | play | 59 | 12.32 | always |
| R14b | play | 72 | 10.08 | always |
| R15 | play | 83 | 9.44 | always |
| R16 | play | 93.2 | 12.4 | always |
| R17 | play | 115 | 6.72 | always |
| R18 | play | 129.5 | 7.92 | find_complete |
| R19 | play | 129.5 | 9.52 | find_partial |
| R20 | play | 129.5 | 9.04 | find_none |
| R21 | play | 139.7 | 9.12 | always |
| R21a | play | 150 | 18.16 | always |
| R21b | play | 169 | 8.16 | always |
| R22 | play | 178 | 11.6 | always |
| R23 | play | 190.5 | 13.84 | always |
| R24 | play | 215 | 8.56 | always |
| R25 | play | 229.5 | 7.84 | fit_complete |
| R26 | play | 229.5 | 9.52 | fit_partial |
| R27 | play | 229.5 | 5.84 | fit_none |
| R28 | play | 239.7 | 11.36 | always |
| R28a | play | 254 | 14.08 | always |
| R28b | play | 270 | 11.28 | always |
| R29 | play | 295 | 11.6 | always |
| R30 | play | 309.5 | 12.8 | always |
| R31 | play | 337.5 | 14.4 | always |
| R32 | play | 356.5 | 11.76 | link_complete |
| R33 | play | 356.5 | 9.52 | link_partial |
| R34 | play | 356.5 | 9.52 | link_none |
| R34a | play | 369.2 | 12.56 | always |
| R35 | play | 382.7 | 11.92 | always |
| R36 | play | 397 | 9.44 | always |
| R37 | play | 453.5 | 11.28 | always |
| R38 | play | 510 | 7.84 | always |
| R39 | play | 527 | 15.04 | always |
| R40 | play | 557 | 8.8 | always |
| R40a | play | 599 | 10.96 | always |
| R41 | play | 613 | 8.08 | always |
| R42 | play | 623 | 8.8 | always |
| R42a | play | 633 | 11.04 | always |
| R43 | play | 645.5 | 8.96 | always |
| R44 | play | 663 | 7.44 | always |
| R45 | epilogue | 2 | 11.44 | always |
| R46 | epilogue | 15 | 10.64 | final_complete |
| R47 | epilogue | 15 | 10.88 | final_partial |
| R48 | epilogue | 15 | 12.56 | final_none |
| R49 | epilogue | 30 | 12.32 | always |
| R50 | epilogue | 46 | 10 | always |
| R51 | epilogue | 62 | 6.24 | always |
