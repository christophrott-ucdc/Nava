# Logo EXODUS7 — 2026-09-05

Asset comun: `src/web/shared/brand/exodus7-v1.png` — 2172×724 PNG, transparență alpha reală. Generat cu instrumentul imagegen integrat; fără CLI sau apeluri ElevenLabs. Originalul din `src/web/tablet/brand/exodus7-v1.png` a fost păstrat; copia comună este identică SHA-256.

Antetul folosește assetul la 266×72 px, respectiv 222×60 px în ferestre mai scurte. Un viewBox SVG încadrează marginile transparente fără să modifice PNG-ul. Etichetă accesibilă: „EXODUS7 · A Patra Lume”. Vechea inițializare a iconiței `brand-glyph` a fost eliminată pentru a păstra pornirea aplicației.

Verificări: npm run typecheck și npm run build trecute; tabletă reală în Electron conectată la serverul izolat, antet verificat la 1920×1080 și 1280×800. Capturi și geometrie: `runs/debug/exodus-logo/`. Această intervenție privește numai logo-ul; verificarea jocurilor oprită anterior nu este declarată finalizată.

## Identitate comună pe TV

Același logo apare pe cardul de pornire, pe mesajul de activare a redării, în tutorial și în finalul interactiv cu constelația. Materialul luminos din spatele logo-ului îi păstrează lizibilitatea și pe fundalul întunecat al finalului. În timpul filmului, aceste suprafețe de început/final sunt ascunse prin stările existente.

Tableta încarcă `/shared/brand/exodus7-v1.png`; rendererul încarcă `shared/brand/exodus7-v1.png`, distribuit automat de build. În panorama `span`, logo-ul urmează overlay-ul central și dimensiunile acelui TV, fără întindere peste perete. În modul cu ferestre separate, cardul de pornire păstrează ecranul sursă de ceas, iar tutorialul și finalul păstrează ecranul configurat cu `showAvatar`. Nicio schimbare a rutării, comenzilor, show-ului, vocilor sau timingului.

Finalul rămâne la z-index 35, sub subtitrările originale și GLB. Logo-ul nu are animație sau sunet nou. `prefers-reduced-motion` continuă să fie respectat de renderer.

## Promptul final folosit

```text
Use case: logo-brand.
Create a finished, distinctive logo asset for the name "EXODUS7", an immersive educational space expedition for children and adults, used in the top-left header of the existing premium bright Nava Glass tablet UI.
Asset: ONE horizontal logo lockup, icon on left, wordmark on right. Transparent background with genuine alpha, not a checkerboard. Request a very wide canvas around 1536 × 512; the logo should occupy almost all of its width with only small safe margins, centered vertically.
Design: memorable sculptural orbital / spacecraft symbol that subtly combines an X trajectory and a seven-shaped ascending flight path, followed by a beautifully drawn very legible uppercase EXODUS7 wordmark. Premium aerospace design with warmth, refined rounded geometric custom typography, confident generous letter spacing but compact silhouette. Letters E X O D U S in deep midnight navy #162E43 and a distinctive coral-orange 7. Symbol uses translucent sea-glass cyan, soft silver-white highlights and restrained warm coral accent; dimensional material only in the symbol, clean solid letterforms. An elegant forward diagonal in the symbol suggests discovery and motion, simple enough to read at 64px high.
Text verbatim: "EXODUS7". Absolutely no hyphen, no other words, no tagline, no watermark.
Keep it bright, joyful and genuinely designed for a contemporary science museum. Do not make a gamer badge, shield, generic stock rocket clipart, NASA copy, childish cartoon, neon cyberpunk wordmark, black background, photographic mockup, presentation sheet or multiple alternatives. Single isolated production-ready logo, crisp edges, balanced clear space, face-on orthographic composition. Strong contrast on cream and pale blue UI backgrounds.
```
