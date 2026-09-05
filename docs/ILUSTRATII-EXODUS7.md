# Ilustrații EXODUS7 — implementare

2026-09-05. Pachet creat la cererea „DO IT, cât mai cute”, folosind imagegen integrat. Cele zece imagini sunt PNG-uri locale, cu prompturile și proveniența păstrate în fișierele `.prompt.md` alăturate. Nicio cheie API și niciun apel ElevenLabs nu au fost necesare.

Galerie locală: `src/web/shared/illustrations/exodus7/index.html`. După construirea aplicației, aceeași galerie este disponibilă la `/shared/illustrations/exodus7/`. Folderul este copiat de buildul existent atât pentru tablete, cât și pentru rendererul TV.

## Unde sunt folosite

| Imagine | Integrare |
|---|---|
| `ship-boarding-v1.png` | Primire și așteptare înaintea plecării, pentru profilurile copiilor; păstrează identificarea postului. |
| `ship-cruise-v1.png` | Așteptarea dintre activități, cu nava în hublou. |
| `tutorial-pair-v1.png` | Antetul tutorialului 5–10 și 10–15: doi exploratori împart aceeași tabletă landscape. |
| `lantern-shell-v1.png` | Carcasa felinarului în jocul de montare; forma, conturul și manipularea sunt desenate de cod. |
| `signal-receiver-shell-v1.png` | Carcasa receptorului; antena, semnalele și valorile rămân calculate de joc. |
| `keepsake-light-v1.png` | Opțiunea „O lumină” din finalul copiilor. |
| `keepsake-care-v1.png` | Opțiunea „Grijă pentru ceilalți” din finalul copiilor. |
| `keepsake-compass-v1.png` | Opțiunea „Curaj de explorator” din finalul copiilor. |
| `expedition-emblem-v1.png` | Jurnalele copiilor și certificatul fluxului original; logo-ul EXODUS7 este compus separat. |
| `homecoming-v1.png` | Colțul superior al încheierii TV pentru copii, după dezvăluirea întoarcerii acasă. |

Fișierele de integrare sunt `src/web/shared/illustrations.ts`, `src/web/tablet/experience-ui.ts`, `experience.css`, `mission-ui.ts`, `index.ts`, `certificate.ts`, `styles.css`, `play-toys.ts`, `play-toys.css`, respectiv `src/renderer/ui/experience.ts` și `src/renderer/experience.css`.

## Comportament

Imaginile noi folosesc forme rotunjite, sticlă turcoaz, suprafețe sidefate și accente portocalii. Mascotele anterioare rămân disponibile. Profilurile de adolescenți și adulți păstrează prezentarea lor; ilustrațiile pentru copii nu li se aplică automat.

Imaginile sunt statice. Nu adaugă sunete, temporizări sau animații continue. Setările de stimuli reduși și ghidaj vizual controlează decorul în interfață. Controalele și textele rămân elemente reale ale paginii, iar coordonatele pieselor și ale gesturilor se păstrează. Carcasele au alternativă vectorială dacă imaginea nu se încarcă.

Jurnalele încarcă imaginile locale înainte de desenarea lor în canvas; absența unui asset păstrează exportul textual. Rezultatele din jurnal provin din rulare. Emblema reprezintă participarea, fără a inventa ranguri, punctaje sau învățare confirmată.

Pământul și nava sunt ilustrații stilizate; proporțiile lor nu reprezintă o scară astronomică. Filmul, GLB-ul, replicile, vocile, scenariul și timingul show-ului nu sunt schimbate de acest pachet. Mecanica finalului rămâne cea existentă, acum cu opțiuni ilustrate.

## Limita acestei livrări

Implementare în surse și generare de asseturi. La cererea explicită a utilizatorului nu au fost rulate teste, builduri, aplicația sau capturi noi. Nu se declară o validare vizuală în aplicație ori pe hardware. Originalele și prompturile sunt livrabile de producție, nu capturi ale interfeței.

La următoarea pornire normală din `RUN.bat`, proiectul este construit prin fluxul său existent. Nu s-au făcut commit, push, merge, release sau deploy.
