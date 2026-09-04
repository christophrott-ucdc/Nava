# Cue sheet — show 0.2.0-aligned

Sursa executabilă este întotdeauna `assets/show/show.json`; acest document este o vedere pentru regie și operare. Timpii `play` sunt secunde din film, cu excepția lead-in-ului negativ. Timpii au fost aliniați pe planșele de cadre din `media/analysis/`.

| Cue | Fază | La (s) | Tip | Conținut |
|---|---:|---:|---|---|
| `pre-theme` | preshow | 0 | theme | prologue |
| `pre-tablet-roles` | preshow | 0 | tablet | role-pick |
| `pre-01` | preshow | 8 | voice | CĂPITANUL — bun venit |
| `pre-02` | preshow | 28 | voice | AVATAR AI — prezentare; beam-in |
| `pre-03` | preshow | 48 | voice | CĂPITANUL — așezarea echipajului |
| `launch-theme` | play | -10 | theme | launch |
| `launch-tablet` | play | -10 | tablet | waiting |
| `launch-countdown` | play | -10 | countdown | 10→0 |
| `launch-01` | play | -9.5 | voice | AVATAR AI — inițierea lansării |
| `launch-liftoff-sfx` | play | 0 | sfx | liftoff-rumble; pornește filmul |
| `launch-02` | play | 9 | voice | CĂPITANUL — „Priviți” |
| `launch-marker-stars` | play | 20 | marker | Pământul dispare |
| `light-theme` | play | 60 | theme | light |
| `light-01` | play | 66 | voice | AVATAR AI — prima civilizație |
| `light-entity-show` | play | 82 | entity | LUMINA show |
| `light-02` | play | 84 | voice | LUMINA — comunicare prin trăire |
| `light-03` | play | 100 | voice | LUMINA — iubire, minciună, înțelegere |
| `light-entity-hide` | play | 118 | entity | LUMINA hide |
| `light-04` | play | 130 | voice | CĂPITANUL — mai departe |
| `nature-theme` | play | 144 | theme | nature |
| `nature-01` | play | 172 | voice | AVATAR AI — planeta-organism |
| `nature-entity-show` | play | 192 | entity | NATURA show |
| `nature-rain` | play | 194 | sfx | rain, 40 s |
| `nature-02` | play | 195 | voice | NATURA — nimeni nu este singur |
| `nature-03` | play | 216 | voice | NATURA — amintirea legăturii |
| `nature-entity-hide` | play | 232 | entity | NATURA hide |
| `nature-marker-silence` | play | 233 | marker | tăcere și plecare |
| `tech-theme` | play | 268 | theme | tech |
| `tech-01` | play | 274 | voice | AVATAR AI — civilizația perfectă |
| `tech-entity-show` | play | 294 | entity | TEHNOLOGIC show |
| `tech-02` | play | 296 | voice | TEHNOLOGIC — calcul și lipsa durerii |
| `tech-03` | play | 312 | voice | TEHNOLOGIC — întrebarea-pivot |
| `tech-tablet-question` | play | 324 | tablet | question, max 80 |
| `tech-entity-hide` | play | 328 | entity | TEHNOLOGIC hide |
| `tech-04` | play | 344 | voice | CĂPITANUL — pregătirea întoarcerii |
| `tech-05` | play | 349 | voice | AVATAR AI — coordonate confirmate |
| `void-theme` | play | 356 | theme | void |
| `wormhole-whoosh` | play | 359 | sfx | wormhole-whoosh |
| `wormhole-marker` | play | 360 | marker | wormhole 360–402 |
| `wormhole-exit-swell` | play | 396 | sfx | low-swell |
| `rev-01` | play | 398 | voice | AVATAR AI — „priviți a patra” |
| `home-theme` | play | 402 | theme | home; apare Pământul |
| `rev-02` | play | 420 | voice | CĂPITANUL — cineva întreabă despre voi |
| `rev-03` | play | 438 | voice | AVATAR AI — puterea de a se minuna |
| `rev-tablet-message` | play | 448 | tablet | message, max 100 |
| `rev-04` | play | 456 | voice | CĂPITANUL — întoarcerea schimbată |
| `rev-hold-marker` | play | 465 | marker | hold pe Pământ până la 741,78 |
| `epi-theme` | epilogue | 0 | theme | white |
| `epi-fade` | epilogue | 0 | sfx | white-fade |
| `epi-01` | epilogue | 5 | voice | AVATAR AI — coborârea |
| `epi-02` | epilogue | 50 | voice | AVATAR AI — casa și întrebarea |
| `epi-03` | epilogue | 95 | voice | AVATAR AI — lumea văzută întâia dată |
| `epi-tablet-thanks` | epilogue | 100 | tablet | thanks |

## Editare sigură

Păstrați id-urile stabile: ele denumesc și fișierele de voce. Ordonați cue-urile crescător în fiecare fază, nu mutați un cue în afara intervalului fazei și rulați `npm run validate:show`. După schimbări, folosiți `reloadShow` în consolă. Dacă se schimbă un text vocal, regenerați clipul respectiv cu `npm run tts`.

La seek înainte, vocile/SFX-urile trecute se marchează fără redare, iar ultima temă și stare de entitate se aplică. La seek înapoi, cue-urile viitoare se rearmează.
