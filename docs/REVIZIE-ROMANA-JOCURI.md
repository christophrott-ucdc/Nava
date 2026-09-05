# Revizia limbii române și a jocurilor

**Document al iterației anterioare.** Interfața implicită a fost înlocuită cu [jocurile prin explorare](JOCURI-EXPLORARE.md). Capturile și numerele de mai jos documentează această revizie istorică; interfața ei rămâne accesibilă pentru regresie cu `interaction=classic`.

2026-09-05. Implementare în `/tablet/`, pentru cinci posturi, fiecare cu A în stânga și B în dreapta, la 1920×1080 landscape.

## Ce s-a schimbat

Textele interfeței se adresează participantului: scop, acțiune, rezultat. Tutorialul, instrucțiunile, indiciile, răspunsurile la greșeli, explicațiile diagramelor, finalul și jurnalul au fost revizuite. Mesajele de tip „gest neînregistrat” sau „loc neinclus” au fost înlocuite cu formulări concrete. Dialogul deja înregistrat, subtitrările corespunzătoare și timpii filmului nu au fost rescrise în această revizie.

| Vârstă | Sarcina participantului | Ce învață prin acțiune |
|---|---|---|
| 5–10 | Găsește conturul, rotește piesa până când semnul auriu ajunge sus, apoi urmărește unul dintre trei drumuri spre felinar. | Recunoaștere, orientare spațială, continuitatea unui traseu și cooperare. |
| 10–15 | Propune o explicație, compune două ritmuri diferite, compară răspunsurile și alege observația care susține concluzia. | Diferența dintre presupunere și test; două explicații pot fi deosebite experimental fără a identifica sursa. |
| 15–18 | Stabilește libertatea pilotului automat și când cere acordul; testează senzori concordanți și contradictorii; păstrează sau schimbă regula. | Efectele unei reguli de decizie, autonomia și verificarea umană. Nu există un punctaj moral pentru alegere. |
| Adulți | Cheltuiește două credite pentru acoperire sau detaliu și verificare; citește documentele produse și trimite unul următorului echipaj. | Compromisul dintre acoperire, detaliu, incertitudine și utilitatea informației transmise. |

Copiii primesc indicii diferite pentru piesa nealiniată, drumul întrerupt și bucla care revine la început. Greșelile nu modifică progresul. Rotația are semn vizual și explicație textuală, inclusiv atunci când ghidajul 3D este oprit.

Rezultatele adulților sunt date pregătite pentru exercițiu, nu măsurători din film. Documentele arată efectiv trei citiri/zone, informațiile lipsă și limitele cercetării. Rezerva este afișată separat, inclusiv după alegere. A și B iau decizii independente despre același subiect al postului. Documentele înlocuiesc diagrama decorativă când rezultatele pot fi citite.

## Integrare

- `scenario-engine.ts` rămâne autoritatea pentru acțiuni. `ZoneProgress.game` este opțional și păstrează orientarea și istoricul celor două teste; salvările vechi rămân compatibile. Nu este necesară o migrare SQLite.
- `ZoneView` furnizează `goal`, `feedback`, `guidance`, `documents`, `resourceLabel` și tipul traseelor. Frontendul nu deduce validitatea din desen sau din text.
- `game-content.ts` conține documentele simulate și subiectele comune postului, astfel încât titlul, citirile și rezumatul să corespundă.
- ACK-ul WebSocket are un `reason` opțional pentru explicații precise la reîncercare; `status` și contractele existente rămân compatibile.
- Three.js și SVG folosesc aceeași orientare autoritativă a piesei. Glisarea pentru inspectarea obiectului nu confirmă o alegere.
- La final, alegerile din călătorie se pot deschide separat. Jurnalul PNG își adaptează înălțimea la text, pentru a nu tăia rapoartele mai lungi.
- Efectele și sunetele rămân legate de confirmări, cu deduplicarea și controlul `tabletSfx` existente. Nu s-au introdus dependențe npm.

## Verificare

Galeria acestei revizii este `runs/debug/romanian-games/index.html`; comparația anterioară rămâne în `runs/debug/education-3d/`. Fișierele `FAIL-*` păstrează iterații intermediare, nu certifică rezultatul final. Rapoartele JSON ale rulărilor reușite sunt sursa pentru matricea efectiv verificată.

Comenzi: `npm run check`, `npm run smoke:scenarios`, `node scripts/education-review.mjs`, `node scripts/education-tutorial-review.mjs`, `node scripts/experience-renderer-review.mjs`. Ultima pornește rendererul real și include `npm run smoke:renderer`.

Testele verifică rezultatele acțiunilor, reîncercarea, persistența, afișarea scopului și a datelor, A/B, lipsa depășirilor, țintele tactile, textul mărit, temele și fallback-ul 2D. Testele tutorialelor sintetizează ACK-urile naratorului și nu reprezintă o audiție. Rendererul are separat proba cu filmul, GLB-ul și narațiunea reale.

Mai sunt necesare proba pe mini-PC-ul și ecranele tactile finale, maparea Windows, atingerea simultană A/B, volumele și lizibilitatea în sală, plus sesiuni cu participanți reali din fiecare categorie. Testele automate și revizia agenților AI nu demonstrează singure că un copil a înțeles activitatea.

Rezultatul reviziei: `npm run check` trecut, **179/179 teste**; QA reală cu **205 stări**, **32 verificări de teme**, **108 capturi** în galeria principală și **26 stări/capturi** ale tutorialelor. Server smoke a trecut cu verificări ale motivelor de respingere, reîncercării și persistenței. Logul complet al verificării este `runs/debug/romanian-games/check-final.log`.
Verificarea finală a rendererului a trecut: tutorial cu narator real, finalurile celor patru categorii la 4K/windowed și npm run smoke:renderer cu filmul în redare (1,06 → 2,36 s, 69 → 147 cadre) și GLB vizibil fără context pierdut. Log: runs/debug/romanian-games/renderer-final.log.
