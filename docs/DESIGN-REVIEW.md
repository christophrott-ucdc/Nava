# Nava Glass R5 — verificare de integrare

Data: 2026-09-05. Repository: NavaPlayer, HEAD de pornire `e20c506`, branch `board/nava-player`. Implementare directă în worktree, fără commit, push, merge, release sau deploy.

## 1. Domeniu și audit

Au fost citite brief-ul de implementare, specificația, intrările recente HANDOFF-LIVE, README, OPERARE și instrucțiunile aplicabile înainte de editări. Modificările de documentație existente la început au fost păstrate: HANDOFF-LIVE, HANDOFF, DESIGN-SPEC-GLASS și noul ASTRA-IMPLEMENTARE-GLASS. HANDOFF a primit numai un addendum.

Stack păstrat: Electron 44, TypeScript, esbuild, Hono/WebSocket, Three.js/TalkingHead, HTML/CSS și canvas. Niciun framework, font extern sau pachet npm nou. Rute reale: `/tablet/`, `/control/`, `/login/`, `/debug/`, `/analytics/`; renderer Electron separat. Buildul compilează aplicațiile existente și preview-ul, copiază CSS/SVG/PNG/SFX în dist și materialele TV în renderer. ID-urile și conexiunile DOM ale transportului, editorului, autentificării, preflight-ului și telemetriei sunt păstrate; noile ID-uri sunt pentru decor și controlul SFX.

Fundația comună a fost creată înaintea delegării. Agent T a editat numai tabletele, Agent R numai rendererul, Agent K numai suprafețele operatorului. Astra a deținut fundația, asseturile, contractele, buildul și integrarea. Livrările au fost inspectate; corecțiile integrate ulterior sunt descrise mai jos.

## 2. Implementare

- `src/web/shared/glass.css`: tokenuri sRGB/OKLCH, opt teme, mesh și decor SVG, materiale glass/strong/tint, controale, tabele, badge-uri, dialoguri, focus, reduced-motion și fallback fără blur.
- `src/web/shared/glass.ts`: teme comune, iconografie SVG, maparea mascotelor, efecte cu chei per eveniment și motorul audio local. `/shared/preview.html` prezintă componentele și toate temele.
- Șase mascote originale PNG RGBA în 1024×1024 și 256×256: NAVIGAȚIE, PROPULSIE, COMUNICAȚII, BIOSEMNALE, MEMORIE și Avatarul AI. Alpha verificat 0–255; fără fundal de tablă de șah. Variantele finale sunt în `src/web/shared/mascots/`.
- Cinci MP3 originale sintetizate reproductibil prin `scripts/generate-tablet-sfx.mjs`: tap, pick, confirm, start, thanks; fiecare sub 400 ms, volum de redare 35%. Tap este folosit la salvarea certificatului; erorile rămân silențioase.
- Tabletele au shell landscape, cinci carduri de post, mascote, gadgeturi de telemetrie, jurnal MEMORIE, subtitrări, numărătoare cu progres, start autoRun/readiness, A stânga/B dreapta, confirmări, fotografie și certificat cu salvare/reîncercare. Șase opțiuni = 3×2 în fiecare jumătate.
- Consola are trei coloane la 1920 și două la 1440, toate comenzile și formularele, editorul real, readiness/preflight, cinci mascote de post, mesaje, performanță și utilizatori. Loginul are tastatură 3×4. Debugul și analytics au materiale și tipografie comune, grafice reale și detaliile existente.
- Rendererul folosește `glass-tv.css`: materiale statice fără backdrop-filter, numărătoare, entități/halouri, OSD, identificare, erori, repetiție, fotografie, epilog și subtitrări. GLB-ul, playerul și vocile existente sunt păstrate. Coloana GLB este rezervată subtitrării, și în windowed.
- `AVATAR_AI` se afișează „AVATARUL AI”. Căpitanul rămâne singurul GLB pe TV-ul configurat. Unitree H2 nu este integrat în R5.

### Excepția autorizată tabletSfx

`AppConfig.tabletSfx` este opțional, implicit `true`; starea/welcome-ul transportă valoarea. Comanda existentului canal autentificat `{ action: "tabletSfx", enabled: boolean }` este validată și accesibilă operator/admin. Viewer și anonimul sunt refuzați. Schimbarea se aplică în sesiune, nu rescrie config.json. Primul gest de pe fiecare tabletă deblochează audio; mute oprește și sunetele active. Nu se schimbă scenariul, replicile, fișierele vocale, timingul sau tranzițiile state machine-ului.

## 3. Matricea capturilor

Toate fișierele sunt în [`runs/debug/glass-r5/`](../runs/debug/glass-r5/). [Galeria locală](../runs/debug/glass-r5/index.html) permite compararea imaginilor. `before/` conține baseline-ul real; `after/` conține capturile integrate. Acestea sunt artefacte locale ignorate de Git, nu asseturi de producție.

| Suprafață | Dimensiuni și vederi | Dovezi în after/ |
|---|---|---|
| Alegerea postului și waiting | 1920×1080, cinci mascote | `tablet-post-assign.png`, `tablet-waiting-1.png` |
| Start și numărătoare | 1920×1080, autoRun și countdown | `tablet-start-autorun.png`, `tablet-countdown.png` |
| Toate cele cinci telemetrii | 1920×1080 | `tablet-telemetry-1.png` … `tablet-telemetry-5.png` |
| MEMORIE plus subtitrare | șase extrase existente, 1920×1080 | `tablet-memory-subtitle.png` |
| Alegeri și confirmări | color, pulse, perspective 3×2; A/B selectate | `tablet-color.png`, `tablet-pulse.png`, `tablet-six-options.png`, `tablet-selected-A.png`, `tablet-selected-AB.png` |
| Perechi pentru toate posturile | 1920×1080, 12 ținte, A stânga/B dreapta | `tablet-six-options-post-1.png` … `tablet-six-options-post-5.png` |
| Certificat și fotografie | succes, eroare 503 simulată, reîncercare, cadru test | `tablet-thanks-certificate.png`, `tablet-certificate-error.png`, `tablet-certificate-retry-success.png`, `tablet-photo-test-frame.png` |
| Accesibilitate tabletă | focus, reduced-motion, avertizare portret | `tablet-keyboard-focus.png`, `tablet-reduced-motion.png`, `tablet-portrait-message.png` |
| Consolă și login | 1920×1080 și 1440×900 | `control-1920.png`, `control-1440.png`, `login-1920.png`, `login-1440.png` |
| Editor, regie, utilizatori | ambele rezoluții, modificare nesalvată/anulare | `control-editor-*.png`, `control-direction-*.png`, `control-users-*.png`, `control-editor-unsaved.png` |
| Debug și analytics | 1920×1080 și 1440×900 | `debug-1920.png`, `debug-1440.png`, `analytics-1920.png`, `analytics-1440.png` |
| Opt teme web | preview și tablete, propagare în toate consolele | `preview-{theme}.png`, `tablet-theme-{theme}.png`, `*-theme-void.png`, `*-theme-nature.png` |
| Fallback blur | material opac forțat în preview | `preview-blur-fallback.png` |
| TV, film real | 3840×2160, cadre succesive și Captain GLB | `tv-film-frame-a-3840.png`, `tv-film-frame-b-3840.png`, `tv-captain-3840.png` |
| Subtitrare TV | cea mai lungă replică, cadre luminos/întunecat, 4K și 1600×900 | `tv-subtitle-{bright,dark}-{3840,1600}.png` |
| TV, teme și overlay-uri | opt teme, countdown, identify/rehearse | `tv-theme-{theme}.png`, `tv-countdown-3840.png`, `tv-identify-rehearse-3840.png` |

Rapoarte numerice: `tablet-metrics.json`, `tv-metrics.json`, `accessibility-operator-results.json`, `themes-pairs-results.json`, `effects-results.json`, toate în `after/`. Capturile folosesc cue-uri reale declanșate manual, uneori cu filmul în pauză; de aceea o temă testată separat poate apărea lângă numele scenei la care s-a făcut seek. Nu sunt mockupuri de producție.

## 4. Accesibilitate și layout

Matricea tabletelor: `scrollWidth=1920`, `scrollHeight=1080`, fără depășiri ale cardurilor sau țintelor. Cele cinci perechi au 12 ținte, minimum 160 px înălțime și peste 64 px lățime; textul opțiunilor este 24 px. Salvare/reîncercare minimum 64 px. Textul destinat copiilor este minimum 20 px, cu excepția etichetelor tehnice de 16 px și a documentului-certificat scalat ca imagine. A este la stânga lui B și transformarea perechii este `none`. Consolele permit scroll vertical normal; nu au overflow orizontal la rezoluțiile verificate. Butoanele consolei au 48 px, keypad-ul login 80 px; markerii editorului au 32 px și control alternativ prin tastatură/câmp numeric.

Focusul are contur vizibil de 3 px. Mesajele de alegere și starea trimiterii rămân accesibile; update-urile de stare nu reconstruiesc inutil opțiunile. Reduced-motion: zero animații CSS în preview, fără gradient/levitație/spring/confetti pe tabletă; rendererul dezactivează animațiile decorative. Sunetul are control separat.

Contrastul a fost calculat WCAG prin liniarizarea sRGB pentru tokenurile efectiv rezolvate de browser, față de cel mai nefavorabil punct de culoare al mesh-ului. Fallbackul sRGB al textului secundar a fost verificat separat; materialul glass a fost compus cu alb 62%. Nu se revendică certificare pe toate versiunile de browser.

| Temă | Text secundar / mesh | Fallback sRGB / mesh | Text / accent |
|---|---:|---:|---:|
| prologue | 5.65 | 4.58 | 7.27 |
| launch | 5.78 | 4.70 | 8.86 |
| light | 5.97 | 4.85 | 10.51 |
| nature | 6.04 | 4.90 | 10.10 |
| tech | 5.77 | 4.69 | 8.86 |
| void | 5.07 | 5.07 | 7.27 |
| home | 5.80 | 4.71 | 10.76 |
| white | 7.01 | 5.69 | 10.51 |

Textul principal depășește 9.45:1 în toate temele; textul secundar pe glass depășește 6.7:1. Badge-urile succes/atenție/eroare: 9.12 / 8.31 / 7.04. Stările dezactivate nu sunt incluse în cerința contrastului textului activ. Pe TV, albul subtitrării este protejat de materialul întunecat static și shadow; inspectat peste film luminos și întunecat.

## 5. Funcțional și performanță

Testul integrat al SFX confirmă: mute prin butonul consolei ajunge pe tabletă, nicio redare audibilă înainte de gest sau când este oprit, exact două `pick` și un `confirm` pentru pereche, fără repetare la actualizările ulterioare. Fiecare burst are 12 particule/600 ms; cele 48 de particule înregistrate includ alegerea precedentă făcută cu sunetul oprit. `thanks`, `tap` la salvare și `start` sunt declanșate o dată. Eroarea de certificat a fost simulată numai în browserul de QA; reîncercarea a folosit API-ul real. Fotografia folosește un JPEG de test, a fost afișată și ascunsă după `showSec`; camera fizică nu a fost exercitată. Nu au apărut erori JavaScript în acest flux.

Loginul cu keypad, accesul protejat, butonul SFX, selecția/modificarea locală/anularea editorului au fost exercitate. Hashul/bytes ale show.json sunt neschimbate. Protecția rolurilor, API-urile, WebSocket-urile, readiness, preflight, editorul server și certificatele sunt acoperite și de suitele existente.

La 4K, filmul real a avansat 3.642645 → 5.870640 s; contorul de cadre 227 → 361, dropped 1 → 2 în intervalul capturat. WebGL nu și-a pierdut contextul. Veil ascuns: `display:none`, dreptunghi zero. Rendererul nu are elemente cu backdrop-filter activ. Subtitrarea maximă: două rânduri, 48 px la 4K / 24 px la 1600×900. Dreptunghiurile subtitrării și întregului canvas transparent GLB ocupă împreună 17.11% / 19.59%; suprafața pictată este mai mică. Entitățile sunt particule rare, iar planeta rămâne vizibilă în cadrele inspectate. Cele opt teme au fost schimbate fără flash negru observat. Aceste măsurători sunt locale, nu un benchmark al instalației cu cinci TV-uri.

## 6. Defecte găsite și corectate

1. MEMORIE cu șase extrase plus subtitrare: mascota se suprapunea. Layout compact dedicat, reverificat. Limita istorică a extraselor din jurnal a fost păstrată; subtitrarea principală afișează replica integrală.
2. Subtitrarea lungă trecea în spatele GLB-ului în windowed. Spațiu rezervat coloanei avatarului, verificat și în 4K.
3. Text secundar insuficient pe void; fallback sRGB prea apropiat de fundalul tech. Ink contextual mai puternic pentru void și lavender mai luminos pentru tech; toate combinațiile verificate ≥4.5.
4. Axele graficelor analytics erau tăiate. Padding calculat pentru axa Y și spațiu pentru etichetele înclinate X.
5. Markerii Glass de 32 px ai editorului se suprapuneau și erau tăiați la capete. Stivuire la distanță de 40 px dependentă de lățime, recalculare la resize, fără limită artificială de rânduri și focus/ținte vizibile la extremități. Verificare geometrică: zero intersecții între markeri la 1920 și 1440.
6. `smoke:renderer` trimitea comenzi fără autentificare. Testul folosește acum loginul normal și tokenul primit, fără slăbirea auth de producție.

## 7. Verificări și limite reale

**Au trecut comenzile obligatorii `npm run check` și `npm run smoke:renderer`**, după ultimele corecții de integrare. Logurile finale sunt `check-final.log` și `renderer-smoke-final.log` în directorul capturilor. Check include typecheck, validare show, validare voci, build, 90 teste Node, smoke core/auth/platform/media. Scripturile `scripts/glass-*-review.mjs` păstrează pașii de verificare vizuală; folosesc aplicația locală pe 4321, renderer CDP 19191 și browserul Electron de QA `scripts/glass-browser.cjs` pe 19192. Rulați-le secvențial, deoarece conduc aceeași fereastră. Configurația/PIN-ul de test se citesc local; credențialele nu sunt incluse în capturi sau rapoarte.

Nu sunt cunoscute defecte software R5 rămase în matricea verificată. Rămâne obligatorie repetiția fizică: cinci TV-uri concomitent, cinci tablete de copii și tableta operatorului, două persoane per post, atingeri simultane, politici autoplay ale browserelor reale, volum în sală, citire/subtitrări la 17 m, cameră și permisiuni, sincronizare LAN, performanță susținută și rulare completă până la epilog. Niciun test local nu este prezentat drept validare a acestui hardware. Funcțiile externe istorice care necesitau hardware sau servicii rămân în aceeași stare (lumini, TTS live, robot).


Curățenie finală: procesele Electron de QA au fost închise; porturile 4321, 19191 și 19192 nu mai au listener. `git diff --check` a trecut. Asseturile finale au fost reverificate (12 PNG RGBA și 5 MP3 ≤400 ms, `assets-results.json`). Galeria conține 6 capturi before și 87 after.

## Addendum — panorama și prezentarea finală,2026-09-05

Intervenția ulterioară cerută de utilizator adaugă videoWall pentru Samsung 98–98–115–98–98 pe același PC, un atelier real `/wall/`, profil separat și calibrare, plus consola ghidată și reconcilierea alegerilor pe tablete. Contractul anterior exclusiv tabletSfx descria starea primei livrări R5; noua configurație panoramică este autorizată de cererea ulterioară.

Raport și operare: [VIDEO-WALL.md](VIDEO-WALL.md). Verificări finale: check cu 109 teste, smoke:renderer în span și individual 4K, smoke:wall,11 verificări import, comparație de pixeli pe toate 5 panourile (eroare 0), matrice vizuală și regresie SFX/certificat/foto. A fost reparată și limita WebSocket 64 KB care împiedica fotografiile autentificate mai detaliate. Capturi: `runs/debug/final-wall/` și `runs/debug/children-final/`. Repetiția fizică rămâne necesară; fișierele show/voice/avatar/media nu au fost modificate.
