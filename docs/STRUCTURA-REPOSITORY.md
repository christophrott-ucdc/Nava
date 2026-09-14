# Organizarea repository-ului

## Fișierele necesare produsului

| Director / fișier | Rol |
| --- | --- |
| `src/` | Codul aplicației, teste și resursele interfețelor |
| `scripts/` | Build, QA, depanare, generarea vocilor și asseturilor |
| `assets/` | Scene, voci, manifesturi, muzică și modele 3D |
| `docs/` | Documentația funcțională și operațională, scenariile-sursă |
| `production/` | Unelte și surse pentru exporturile SpaceEngine |
| `build/` | Iconurile folosite la împachetarea Electron |
| `config.*.example.json` | Configurații de instalare, fără datele locale |
| `README-INSTALARE.md`, `MANUAL-UTILIZARE.docx` | Manuale incluse în distribuția EXE |

Scripturile care nu apar în package.json nu sunt automat redundante: multe sunt unelte de producție sau QA lansate explicit. Ele rămân versionabile. Manifesturile vocale și receipt-urile folosite la reproducerea asseturilor nu au fost eliminate.

## Date locale și arhivă

`AI/` este ignorat de Git. La curățarea din 14 septembrie 2026 au fost mutate, fără ștergere, **62 de fișiere** în `AI/archive/cleanup-2026-09-14/`:

- `reports/`: 11 rapoarte datate QA/debug/testare;
- `authoring/`: 22 prompturi ale ilustrațiilor și portretelor, cu structura originală păstrată;
- `notes/`: nota istorică de integrare a agentului D;
- `retired/`: fostul director Old, deja scos din uz;
- `generated/`: compilări temporare ale probelor media;
- `distributions/`: ZIP-ul de distribuție care se afla în rădăcină.

`move-plan.json` înregistrează mutările; `manifest.json` include calea originală, calea arhivată, dimensiunea și SHA-256 pentru fiecare fișier. Toate hashurile au fost verificate după mutare. Arhiva ocupă aceiași aproximativ 2,94 GB; mutarea nu eliberează spațiu pe disc. Pentru restaurare, consultă manifestul și mută numai fișierul necesar la calea originală, fără suprascrierea unui fișier existent.

Arhiva rămâne locală și **nu va fi inclusă într-o clonare nouă din Git**. Rapoartele păstrează textul și căile istorice; manifestul permite identificarea locațiilor noi. HANDOFF.md și HANDOFF-LIVE.md rămân la locul lor în AI; istoricul nu a fost rescris.

`dist/`, `dist-app/`, `node_modules/`, `cache/`, `runs/`, configurațiile locale și SQLite rămân la căile folosite de aplicație și uneltele sale. Nu se mută directoarele active pentru a cosmetiza rădăcina. `.gitignore` exclude și compilările temporare `.tmp-*`, coverage și cache-urile Python.

## QA și continuitate

Rapoartele detaliate din sesiunile anterioare sunt în arhiva locală de mai sus. Cele mai recente verificări înainte de cleanup: 256 teste, check complet și renderer smoke, plus probele separate descrise în [prim-planuri și mixer](PLANETE-SI-MIXER-2026-09-14.md). Dovezile rămân în `runs/debug/`.

Pentru validarea surselor: `npm run check`. Pentru renderer, folosește harnessul izolat `node scripts/experience-renderer-review.mjs --smoke-only`; acesta rulează și `npm run smoke:renderer` fără a modifica sala activă.

Curățarea nu reprezintă o certificare pe hardware și nu actualizează automat executabilele deja împachetate. Nu presupune că modificările preexistente ale worktree-ului trebuie eliminate ca să obții un git status gol.
