# SPEC SHEET DESIGN — „Nava Glass” (runda 5)

> Redesign complet al interfețelor NavaPlayer în stil **Apple Liquid Glass**: vesel, colorat, luminos, făcut pentru copii de 7–12 ani, fără să piardă lizibilitatea pentru operator. Înlocuiește HUD-ul întunecat actual („cavoul”: fundal `oklch(0.13 0.03 250)`, cyan, monospace).
> **Decizii luate de Christoph (2026-09-05):** tabletele sunt toate în **portret**; fiecare post are o **mascotă desenată** (descrieri pentru generare în §9); **confetti + sunete de bucurie: DA**; consola operatorului este la fel de veselă și glass ca restul, nimic sobru; vorbitorul `CAPITANUL` rămâne „CĂPITANUL”, iar `AVATAR_AI` devine **„AVATARUL AI”** (în sală va fi întruchipat de un robot Unitree H2, vezi §10).
> Document de aprobat ÎNAINTE de implementare. Nimic din protocol, state machine sau `show.json` nu se schimbă; se schimbă doar stratul vizual (HTML/CSS + mici ajustări de markup în TS).

---

## 0. Rezumat în trei fraze

Toate cele șase suprafețe (tablete, ecrane TV, consolă, login, depanare, analitică) primesc **un singur sistem de design**: carduri de sticlă translucidă cu blur, margini rotunjite mari, o linie de lumină pe muchia de sus, umbre moi colorate, pe **fundaluri luminoase cu gradiente vii** care își schimbă culoarea după tema scenei (prolog, lansare, lumină, natură, tehnologie, vid, casă, alb). Tabletele copiilor (toate în portret) sunt **suprafața principală**: butoane mari cât degetul mare, două zone clar colorate pentru cei doi copii (A sus, B jos), mascota postului, iconițe și cuvinte puține. Ecranele TV rămân cinematice (filmul e întunecat), dar overlay-urile devin sticlă luminoasă, caldă, nu HUD militar.

## 1. Principii

| # | Principiu | Ce înseamnă concret |
|---|---|---|
| P1 | **Sticlă, nu întuneric** | fundaluri deschise (L ≥ 0.85 în OKLCH) cu pete de culoare; cardurile sunt translucide (`backdrop-filter: blur(24px) saturate(1.4)`), fond alb 55–70 %, contur 1 px alb 60 %, „specular” pe muchia de sus |
| P2 | **Bucurie** | culori saturate dar calde: coral, soare, mentă, cer, lavandă, piersică; forme rotunde (raza 24–32 px); micro-animații elastice (spring), nimic care „pulsează ca o alarmă” |
| P3 | **Pentru copii** | text ≥ 20 px pe tabletă, ținte de atins ≥ 64 px, maximum 7 cuvinte pe buton, iconiță + cuvânt, feedback imediat (bump + confetti discret), fără jargon („SIGNAL”, „HUD” dispar) |
| P4 | **Tema scenei colorează totul** | cele 8 `SceneTheme` devin 8 palete de fundal; aceeași scenă arată la fel pe tablete, TV și consolă |
| P5 | **Filmul e vedeta pe TV** | overlay-urile ocupă puțin, apar/dispar cu fade; sticla pe TV e mai transparentă (35–45 %) și fără blur greu la 4K |
| P6 | **Operatorul vede repede, dar se bucură și el** | consola/depanarea păstrează densitatea de informație, pe aceeași sticlă luminoasă și colorată ca tabletele (nimic „sobru” sau „de regie”); stările critice au culoare + iconiță + text, nu doar culoare |
| P7 | **Accesibil** | contrast text/fond ≥ 4.5:1 (text închis pe sticlă deschisă), `prefers-reduced-motion` respectat, focus vizibil, `aria-pressed`/`aria-live` păstrate |
| P8 | **Ieftin la randare** | maximum 2 straturi cu `backdrop-filter` suprapuse; pe TV overlay-urile folosesc gradient pre-blurat (fără `backdrop-filter`) la 4K; tablete: blur 16–24 px, nu 40 |

## 2. Sistem de design (tokens)

Fișier nou partajat: `src/web/shared/glass.css` (importat de tablet, control, login, debug, analytics) și `src/renderer/glass-tv.css` (varianta TV, fără blur). Tokenurile sunt CSS custom properties; **niciun framework**, nicio dependență nouă.

### 2.1 Culori de bază (OKLCH, cu fallback hex)

| Token | Valoare | Rol |
|---|---|---|
| `--ink` | `oklch(0.25 0.04 260)` `#1f2440` | text principal |
| `--ink-soft` | `oklch(0.45 0.04 260)` `#5b6182` | text secundar |
| `--paper` | `oklch(0.98 0.01 90)` `#fdfcf7` | alb cald de bază |
| `--coral` | `oklch(0.72 0.17 30)` `#ff7a6b` | acțiune primară, zona A |
| `--sun` | `oklch(0.88 0.16 90)` `#ffd166` | bucurie, lumină |
| `--mint` | `oklch(0.85 0.13 160)` `#7be0b5` | succes, natură |
| `--sky` | `oklch(0.82 0.11 230)` `#7cc4ff` | informație, zona B |
| `--lavender` | `oklch(0.78 0.12 300)` `#c2a8ff` | mister, vid |
| `--peach` | `oklch(0.9 0.09 60)` `#ffcfa8` | căldură, casă |
| `--rose` | `oklch(0.8 0.13 350)` `#ffa6d2` | accent jucăuș |
| `--danger` | `oklch(0.62 0.2 25)` `#e5484d` | erori (rar, doar operator) |

### 2.2 Palete pe tema scenei (`data-theme` pe `<html>`)

Fiecare temă definește `--bg-a`, `--bg-b`, `--bg-c` (gradient de fundal), `--accent`, `--accent-ink`.

| Temă | Fundal (gradient mesh) | Accent | Senzație |
|---|---|---|---|
| `prologue` | lavandă → cer → paper | `--lavender` | așteptare, mister blând |
| `launch` | cer → alb → soare | `--sky` | energie, decolare |
| `light` | soare → piersică → alb | `--sun` | aur cald, Planeta Luminii |
| `nature` | mentă → cer palid → alb | `--mint` | verde-umed, respirație |
| `tech` | cer → lavandă → alb rece | `--sky` (rece) | cristal, ordine |
| `void` | lavandă profundă → indigo pal → alb | `--lavender` | tăcere, adâncime (cea mai închisă, L ≈ 0.8) |
| `home` | cer → piersică → alb | `--peach` | acasă, cald |
| `white` | alb → alb cald | `--sun` (moale) | epilog, lumină |

Fundalul este un **gradient mesh** (3 `radial-gradient` suprapuse, animat lent 40 s, oprit la reduced-motion) plus **bule/stele moi** (SVG, 8–12 forme, opacitate 20 %) — niciodată negru.

### 2.3 Sticla (componenta de bază `.glass`)

```
background: color-mix(in oklab, white 62%, transparent);
backdrop-filter: blur(24px) saturate(1.4);      /* TV: fără backdrop-filter, bg alb 40% */
border: 1px solid color-mix(in oklab, white 70%, transparent);
border-radius: var(--r-lg);                       /* 28 px */
box-shadow: 0 1px 0 rgba(255,255,255,.9) inset,   /* specular sus */
            0 12px 40px -12px color-mix(in oklab, var(--accent) 35%, transparent),
            0 2px 6px rgba(20,30,60,.06);
```
Variante: `.glass-strong` (alb 78 %, pentru text lung), `.glass-tint` (colorat cu `--accent` 18 %), `.glass-dark` (doar TV, negru 28 % pentru subtitrări peste film).

### 2.4 Raze, spații, umbre

`--r-sm 12px`, `--r-md 20px`, `--r-lg 28px`, `--r-pill 999px`; spațiere pe grilă de 8 px (`--s-1 8` … `--s-6 48`); umbre colorate (nu gri) derivate din `--accent`.

### 2.5 Tipografie

- Familie: `"SF Pro Rounded", "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif` (fără fonturi din rețea; pe Windows cade pe Segoe UI, rotunjit vizual prin `letter-spacing` normal și greutăți 600–700).
- Scală tabletă: titlu 40/44, subtitlu 28, corp 22, buton 24 (600), etichetă 16 (uppercase ușor, tracking 0.06em, doar pentru etichete mici).
- Scală consolă/depanare: titlu 24, corp 15, monospace `"Cascadia Mono", Consolas` DOAR pentru valori tehnice (id-uri, timpi, loguri).
- Numere mari (ceas, numărătoare): 96–240 px, `font-variant-numeric: tabular-nums`.

### 2.6 Mișcare

- Curbă „spring”: `cubic-bezier(.34,1.56,.64,1)` pentru apariții (280 ms), `ease-out` 180 ms pentru hover/press.
- Apariția cardurilor: scale .96→1 + opacitate; butonul apăsat: scale .97.
- Feedback la alegere pe tabletă: bump + 12 particule confetti în culoarea zonei (600 ms), o singură dată, plus un **sunet scurt de bucurie** (vezi 2.8).
- Fundalul respiră (gradient mesh 40 s). Totul oprit la `prefers-reduced-motion: reduce`.

### 2.8 Sunete de interfață (tabletă)

Redate de tabletă (nu în sală), volum 35 %, durată ≤ 400 ms, fișiere OGG/MP3 în `src/web/tablet/sfx/`: `tap` (clic moale de sticlă), `pick` (clopoțel ascendent, 2 note, la alegerea unei opțiuni), `confirm` (acord vesel de 3 note, la confirmarea perechii), `start` (fanfară scurtă la butonul de start), `thanks` (sclipire la certificat). Fără sunet la erori. Sunetul se poate opri din consolă (opțiune `tabletSfx` în config, implicit pornit). Sunetele se redau numai după prima atingere (politica de autoplay a browserului).

### 2.7 Iconografie

Set propriu de ~24 iconițe SVG inline, linie 2.5 px, capete rotunde (rachetă, planetă, stea, inimă/puls, undă, ochi, mână, cronometru, difuzor, lumină, tabletă, ecran, steag, check, avertizare). Fără emoji în UI-ul de producție (randare inconsistentă pe TV/tablete), cu excepția confetti-ului decorativ.

## 3. Componente

| Componentă | Specificație |
|---|---|
| **Buton primar** | pill, 64 px înălțime pe tabletă (48 consolă), fundal `--accent`, text `--accent-ink`, umbră colorată, iconiță stânga; stări: hover (luminozitate +4 %), apăsat (scale .97), dezactivat (alb 40 %, text 45 %) |
| **Buton secundar** | `.glass` cu text `--ink`, contur 1 px |
| **Tile de alegere** (tabletă) | card sticlă 1:1 sau 4:3, ≥ 160 px, iconiță/culoare mare sus, etichetă jos (≤ 3 cuvinte), selectat = contur 3 px `--accent` + bifă în colț + bump |
| **Zonă A / Zonă B** | tableta e în portret: A este **jumătatea de sus** cu `--coral`, B este **jumătatea de jos** cu `--sky`, despărțite de o linie de lumină; fiecare cu eticheta perspectivei (ex. „DIRECȚIE” / „TRASEU”) + iconiță; opțiunile stau pe un rând de 3–4 tile-uri late (înălțime ≥ 120 px); „Doar privesc” ca tile gri deschis cu ochi la capătul rândului |
| **Card de post** | sticlă `--accent`, **mascota postului** (PNG cu fundal transparent, §9) mare, numele (NAVIGAȚIE…), lentila (DIRECȚIE · TRASEU) |
| **Subtitrare (TV)** | `.glass-dark` pill jos-centru, text alb 48 px, eticheta vorbitorului ca pastilă colorată deasupra (culoarea din `SPEAKERS`) |
| **Subtitrare (tabletă)** | card sticlă luminos, text `--ink` 24 px, eticheta vorbitorului ca pastilă |
| **Numărătoare (TV)** | cifră 240 px albă cu contur sticlă, inel de progres colorat cu tema, fără roșu |
| **Ceas / cronometru** | tabular, într-un card sticlă |
| **Badge stare** | pill mic, iconiță + text (Gata / Nu e gata / În redare); culori: mint / sun / coral |
| **Progres** | bară 12 px rotunjită, gradient `--accent`; inel pentru readiness |
| **Toast** | sticlă, jos-centru, apare cu spring, 3 s |
| **Tabel (consolă)** | rânduri pe sticlă, zebră alb 30 %, capete `--ink-soft` |
| **Câmp text / select** | 48 px, sticlă, contur 1 px, focus = inel `--accent` 3 px |
| **Tastatură PIN** | 3×4 butoane sticlă 80 px, cifre 32 px, puncte colorate cu tema |

## 4. Specificații pe suprafețe

### 4.1 Tableta copiilor (`/tablet/`) — prioritate 1

Orientare: **portret, blocată** (rotația e ignorată prin layout fluid, fără mesaj „rotește tableta”). Ecran împărțit în: **bara de sus** (sigla navei + numele postului + semnal), **conținut** (o singură idee pe ecran; mascota postului apare în vederile de așteptare și mulțumiri), **bara de jos** (starea misiunii: scena curentă cu iconiță și culoare).

| Vedere | Design |
|---|---|
| Alegerea postului (`post-assign`) | coloană de 5 carduri late (portret: unul sub altul, ~150 px fiecare) cu mascota, nume și lentilă; la atingere: bump + confetti + sunet `pick`; textul „Atinge postul vostru” |
| Așteptare | mascota postului plutind ușor (PNG + animație CSS de levitație 4 s), text mare „Așteptăm decolarea…”, respirație lentă a fundalului; fără „loading spinner” |
| Numărătoare | cifre uriașe colorate, inel de progres, fundal `launch` |
| Consola de post (telemetrie) | 4 instrumente ca „gadgeturi” rotunde de sticlă (nu voltmetre): busolă, baterie-inimă, undă, puls; MEMORIE = carduri-notițe cu replicile |
| Subtitrare | card sticlă sus, apare cu fade; pastilă cu vorbitorul |
| Alegere în pereche (`paired-choice`) | întrebarea sus (≤ 12 cuvinte, 28 px), zona A în jumătatea de sus și zona B în jumătatea de jos, 3–4 tile-uri late per zonă pe un rând, „Doar privesc” la final; confirmare = bifă mare + „Mulțumim!” + confetti + sunet `confirm`; cronometru discret ca inel dacă `timeoutSec` |
| Butonul de start (postul 1, autoRun) | pill uriaș `--coral` „PORNEȘTE MISIUNEA” cu rachetă; dedesubt lista de readiness ca bife verzi/portocalii |
| Mulțumiri + certificat | card certificat pe sticlă cu sigiliu colorat, buton „SALVEAZĂ” și „TRIMIS OPERATORULUI” ca badge mint; confetti la apariție |
| Fotografie | fotografia într-o ramă sticlă rotunjită, cu text „Echipajul EXODUS-7” |

Reguli: doar portret (lățimi 768–834 px, înălțimi 1024–1194 px), zoom blocat, fără scroll în vederi (totul încape), textul nu se rotește pentru niciun copil (ambii citesc din același sens; zonele diferă doar prin poziție sus/jos și culoare).

### 4.2 Ecranele TV (renderer overlays) — prioritate 2

- Fundalul rămâne filmul; **vignette-ul** devine colorat pe temă și subtil (max 35 %).
- **Subtitrări**: `.glass-dark` cu contur alb 30 %; culoarea vorbitorului doar pe pastila cu numele.
- **Numărătoare**: cifre albe cu inel colorat; la zero, un „flash” alb 300 ms (nu roșu).
- **Entități** (Lumină/Natură/Tehnologic): păstrează animațiile, dar paletele se aliniază la `--sun/--mint/--sky` și primesc un halou moale.
- **Avatarul Căpitanului**: colțul stânga-jos primește o platformă de sticlă rotunjită (disc luminos) sub personaj și o pastilă cu numele când vorbește.
- **OSD / identify / banner de eroare / rehearse**: carduri sticlă deschise cu text închis (vizibile pe orice fundal); eroarea = coral, nu roșu-alarmă.
- **Fade alb epilog**: gradient alb cald cu particule fine.
- **Veil „atinge pentru a porni”**: sticlă pe tot ecranul, o rachetă mare, text prietenos.
- Fără `backdrop-filter` pe TV (4K): sticla = gradient alb pre-blurat + zgomot fin la 3 % (SVG feTurbulence static).

### 4.3 Consola operatorului (`/control/`) — prioritate 3

- Aceeași bucurie ca pe tablete: fundal gradient pe temă la aceeași saturație, bule moi, carduri sticlă albe 70 %, butoane colorate, mascotele posturilor pe cardurile de tablete. Nimic „sobru”: consola e prima impresie a operatorului și trebuie să zâmbească și el.
- **Antet**: sigla, numele show-ului, ceasul mare, badge-uri (Ecrane, Tablete, Video, Readiness) ca pastile colorate; utilizatorul + ieșire.
- **Transport**: butoane mari pill: PRE-SHOW (lavandă), START (coral, uriaș), PAUZĂ/REDĂ (cer), EPILOG (piersică), RESTART (secundar); sub ele bara de timeline sticlă cu playhead colorat și scenele ca segmente colorate pe temă.
- **Panouri**: Readiness (inel + bife), Cue-uri (listă cu pastile de stare: gri/mint/soare), Editor timeline (piste colorate pe temă, marcatori ca perle), Ecrane/Perf (carduri per ecran cu inele), Tablete (5 carduri de post cu stare și alegeri), Mesaje, Utilizatori, Repetiție/Ambianță/Lumini/Spune/Variantă/Foto (grup „Regie”).
- Densitate: 2–3 coloane pe ≥ 1400 px, 1 coloană pe tabletă; textele tehnice rămân monospace.

### 4.4 Login (`/login/`)

Card sticlă centrat pe fundal `prologue`, sigla EXODUS-7 veselă (rachetă + stea), tastatură 3×4 mari, puncte care se umplu cu culoarea temei, mesaje prietenoase („PIN-ul nu e bun, mai încearcă” în loc de „PIN incorect”).

### 4.5 Depanare (`/debug/`) și Analitică (`/analytics/`)

Aceleași tokens și aceeași veselie (fundal gradient pe temă, nu alb plat), carduri sticlă 75 %, tabele pe sticlă, valorile tehnice monospace, culorile de stare mint/soare/coral. Graficele din analitică: bare rotunjite cu gradient pe temă, fără grilă grea.

## 5. Ce NU se schimbă

Protocolul WS/HTTP, `show.json`, state machine, id-urile DOM folosite de TypeScript (se păstrează sau se migrează cu grijă), textele replicilor, comportamentul comenzilor, testele existente. Redesign-ul este CSS + markup, plus TS doar unde structura vederii se schimbă (zone A/B sus/jos, gadgeturi telemetrie, confetti, sunete).

**Singura schimbare de date:** eticheta vorbitorului `AVATAR_AI` din `SPEAKERS` (`src/shared/types.ts`) trece de la „VOCEA NAVEI” la **„AVATARUL AI”**, cu culoarea `--sky`; id-ul `AVATAR_AI` și clipurile vocale rămân neschimbate. Etichetele apar pe pastilele de subtitrare de pe TV și tablete.

## 6. Plan de implementare (runda 5)

| Pas | Livrabil | Proprietar propus |
|---|---|---|
| 0 | Mascotele (5 PNG-uri + 1 pentru Avatarul AI) generate de Codex după §9, în `src/web/shared/mascots/` | Codex |
| 1 | `src/web/shared/glass.css` + `src/renderer/glass-tv.css` (tokens, `.glass`, butoane, teme) și un fișier de previzualizare `src/web/shared/preview.html` cu toate componentele | orchestrator |
| 2 | Tableta (markup portret + CSS + confetti + sunete + gadgeturi + mascote) | agent T |
| 3 | Overlay-uri TV (subtitrări, numărătoare, avatar, OSD, veil, fade) | agent R |
| 4 | Consola + login | agent K |
| 5 | Depanare + analitică | agent K (după 4) |
| 6 | Verificare vizuală pe 3 lățimi (tabletă 768/1024, consolă 1440, TV 3840) + capturi în `runs/debug/` + `docs/DESIGN-REVIEW.md` | orchestrator |

Estimare: 1 rundă de agenți (4–6 ore de agent), fără dependențe noi.

## 7. Criterii de acceptare

1. Niciun fundal cu L < 0.75 pe tablete/consolă/login/depanare/analitică; pe TV overlay-urile nu acoperă mai mult de 20 % din cadru.
2. Contrast text ≥ 4.5:1 măsurat pe 6 combinații (text pe sticlă, pe fiecare temă).
3. Toate țintele de atins pe tabletă ≥ 64 px; textele ≥ 20 px.
4. Schimbarea temei (8 valori) recolorează fundalul și accentele pe toate suprafețele în < 600 ms.
5. `prefers-reduced-motion` oprește gradientul animat, confetti și spring-urile.
6. `npm run check` rămâne verde; smoke-renderer trece; nicio schimbare în protocol.
7. Un copil de 8 ani înțelege fiecare ecran de tabletă fără explicații (test cu 2 copii, notat în `docs/DESIGN-REVIEW.md`).
8. Toate vederile de tabletă încap în portret 768×1024 fără scroll; mascota postului este vizibilă în așteptare și la mulțumiri.
9. Sunetele se aud la alegere și confirmare, nu se aud la erori, și pot fi oprite din consolă.

## 8. Decizii luate (Christoph, 2026-09-05)

| Întrebare | Decizie |
|---|---|
| Orientarea tabletelor | **Portret, toate.** Zona A sus, zona B jos. |
| Mascotă | **Da, desenată**, una per post + una pentru Avatarul AI. Codex generează imaginile după descrierile din §9. |
| Confetti + sunete | **Da**, ambele (specificate în 2.6 și 2.8). |
| Consola operatorului | **La fel de veselă și glass** ca tabletele. Nimic sobru, nicăieri. |
| Nume pe pastile | „CĂPITANUL” rămâne. „VOCEA NAVEI” devine **„AVATARUL AI”**. |

## 9. Mascotele posturilor — brief de generare pentru Codex

### 9.1 Stil comun (se pune în fața fiecărui prompt)

> Personaj-mascotă 3D stilizat, în stilul emoji-urilor Apple și al personajelor Pixar pentru copii: forme rotunde, moi, ca de jucărie din vinil lucios, cu lumini de tip „glass” (reflexii difuze, un highlight alb pe muchia de sus). Culori saturate dar calde, fără negru pur. Ochi mari, prietenoși, cu sclipire; zâmbet discret. Fără text, fără armă, fără dinți ascuțiți. Randare frontală-trei-sferturi, iluminare de studio moale, **fundal transparent** (PNG cu alpha), obiectul centrat și ocupând ~80 % din cadru. Rezoluție 1024×1024. Același stil pentru toate cele șase imagini, ca și cum ar fi din aceeași familie.

### 9.2 Cele cinci mascote (câte una per post)

| Post | Fișier | Culoare dominantă | Descriere pentru generare |
|---|---|---|---|
| 1 · NAVIGAȚIE (DIRECȚIE · TRASEU) | `mascot-01-navigatie.png` | `--coral` #ff7a6b + auriu | O **mică planetă-busolă**: sferă coral cu un inel auriu înclinat ca un inel de Saturn, pe inel un ac de busolă în formă de steluță care indică înainte. Are doi ochi mari și curioși și o expresie de „știu drumul!”. În jurul ei plutesc 3 puncte-stele mici ca un traseu punctat. |
| 2 · PROPULSIE (ENERGIE · STABILITATE) | `mascot-02-propulsie.png` | `--sun` #ffd166 + portocaliu | O **rachetă dolofană** galbenă cu burtica rotundă, două aripioare portocalii și o flacără moale din trei limbi (galben, portocaliu, roz) care arată ca o coadă de vulpe. Ochi bucuroși, obraji roz. Stă dreaptă, stabilă, ca și cum ar fi gata să sară. |
| 3 · COMUNICAȚII (CUVINTE · SEMNAL) | `mascot-03-comunicatii.png` | `--sky` #7cc4ff + alb | Un **satelit-fluture**: corp rotund albastru-cer cu o antenă-farfurie albă ca o pălărie, două panouri solare ca aripi translucide de sticlă. Din antenă ies trei arce de semnal moi, alb-lăptoase, ca niște baloane de vorbire. Expresie atentă, „ascult”. |
| 4 · BIOSEMNALE (PULS · LEGĂTURĂ) | `mascot-04-biosemnale.png` | `--mint` #7be0b5 + roz | O **inimă-frunză**: formă de inimă rotunjită, verde-mentă, cu o nervură de frunză care devine o linie de puls (electrocardiogramă) roz-deschis. Două frunzulițe mici ca urechi. Ochi blânzi, zâmbet cald, „simt legătura”. |
| 5 · MEMORIE (AMINTIRE · TIMP) | `mascot-05-memorie.png` | `--lavender` #c2a8ff + auriu | O **clepsidră-lună**: corp de clepsidră translucid lavandă, în loc de nisip curg steluțe aurii mici; sus are o semilună ca coif. Ochi visători, pe jumătate închiși, zâmbet liniștit, „îmi amintesc”. Câteva particule aurii plutesc în jur. |

### 9.3 Mascota Avatarului AI (pastila de vorbitor și ecranul de așteptare)

| Fișier | Descriere |
|---|---|
| `mascot-ai-avatar.png` | Un **robot umanoid prietenos, mic și rotunjit**, inspirat din silueta unui robot Unitree H2 (cap oval cu vizieră luminoasă, corp alb-perlat, articulații albastru-cer), dar redat ca jucărie caldă, nu ca mașină: viziera afișează doi ochi albaștri mari și un zâmbet din puncte de lumină; pe piept o mică lumină `--sky` în formă de stea. Face un salut cu o mână. Același stil vinil/glass ca posturile. |

### 9.4 Unde apar și cum se livrează

- Card de post (alegerea postului), vederea de așteptare (levitație), mulțumiri/certificat (mascota ține sigiliul), consola operatorului (cardurile celor 5 tablete), pastilele de vorbitor pe tabletă (variantă mică 96 px, doar pentru Avatarul AI; Căpitanul are avatarul GLB).
- Livrare: PNG 1024×1024 cu alpha + variantă 256×256 pentru pastile, în `src/web/shared/mascots/`; copiate de `scripts/build.mjs` în ieșirea web și a rendererului. Imaginile sunt generate pentru proiect, fără licențe externe.

## 10. Avatarul AI — robotul Unitree H2 în scenariu (notă de design)

Christoph va integra un robot **Unitree H2** care întruchipează „Avatarul AI” în sală. Pentru UI asta înseamnă:

- Eticheta vorbitorului `AVATAR_AI` devine **„AVATARUL AI”** pe toate pastilele de subtitrare, cu culoarea `--sky`; pe TV pastila are doar textul și un mic icon de robot, ca să nu concureze cu robotul real din sală.
- Când vorbește Avatarul AI, TV-urile **nu** afișează un chip alternativ; rămâne efectul „hologram” actual pe subtitrare, iar mascota apare doar pe tablete (copiii se uită la robot).
- Tableta poate afișa, în vederea de așteptare, textul „Avatarul AI se pregătește…” cu mascota, când scena curentă are replici `AVATAR_AI` (opțional, pas ulterior).
- Nicio dependență tehnică în runda 5: controlul robotului nu face parte din acest redesign; se documentează separat când Christoph decide integrarea.
