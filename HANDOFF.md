# HANDOFF — „A Patra Lume" · Nava (player 4K sincronizat + avatar AI + server tablete)

> Documentul de predare al proiectului. Este scris pentru orice AI sau inginer care preia lucrul **fără acces la conversațiile anterioare**.
> Fiecare afirmație de aici este verificabilă într-un fișier din repo; calea este dată între paranteze.
> Limba documentației: română. Limba codului și a identificatorilor: engleză.
> Ultima actualizare: 2026-09-04 (agentul F, documentație). Secțiunea 12 („STARE") se actualizează de orchestrator la fiecare integrare.

---

## 0. Citește asta întâi

**Ce este acest fișier.** Punctul de intrare unic în proiect. Spune ce construim, de ce, cum funcționează, ce spune scenariul, ce s-a decis, în ce stadiu suntem și ce urmează. Restul documentelor detaliază; acesta rezumă tot.

**Ordinea de citire recomandată** (≈ 40 minute pentru un AI, o oră pentru un om):

| # | Fișier | Ce afli | Obligatoriu? |
|---|---|---|---|
| 1 | `HANDOFF.md` (acesta) | tot, la nivel de ansamblu | da |
| 2 | `docs/BRIEF.md` | brief-ul de lucru ratificat: arhitectura, regulile tehnice, împărțirea pe agenți, structura reală a video-ului | da — **sursa de adevăr pentru arhitectură** |
| 3 | `src/shared/types.ts`, `src/shared/protocol.ts`, `src/shared/contracts.ts` | contractele TypeScript (tipuri, protocol WS/IPC, interfețe între module) | da — **sursa de adevăr pentru cod** |
| 4 | `assets/show/show.json` | scenariul executabil: scene + cue-uri cu timpi | da |
| 5 | `docs/SCENARIU.md` | scenariul literar curat, cu diacritice și id-uri de cue | da, dacă atingi textele sau timpii |
| 6 | `docs/CUE-SHEET.md` | tabelul tuturor cue-urilor + cum editezi și reîncarci `show.json` | da, dacă aliniezi cue-urile pe video |
| 7 | `docs/SPEC-SHEET.md` | cerințe FR/NFR, interfețe, referință de configurare și de schemă, plan de test | da, înainte de acceptanță |
| 8 | `docs/OPERARE.md` | manualul operatorului (instalare, rularea show-ului, depanare) | pentru cine rulează show-ul |
| 9 | `docs/DECIZII.md` | deciziile de arhitectură (ADR) cu context și consecințe | înainte să propui o schimbare de arhitectură |
| 10 | `docs/reference/scenariu-docx.txt` | textul brut al scenariului clientului (fără diacritice) | referință |
| 11 | `docs/reference/spaceengine-script.txt` | scriptul de cameră SpaceEngine care a produs filmul | referință |
| 12 | `docs/reference/EXODUS_SUMMARY.md` | proiectul-sursă „Exodus" din care vin avatarul și codul de referință | referință |

**Reguli de aur pentru cine preia:**
1. Contractele din `src/shared/*.ts` nu se schimbă unilateral; orice modificare se propune în raport și se anunță aici (§12).
2. Nu se citesc, nu se copiază și nu se comit chei API. Cheile trăiesc doar în `.env` (ignorat de git; vezi `.gitignore`).
3. `assets/show/show.json` este singura sursă a textelor și a timpilor. Nu se hardcodează replici în cod.
4. Fiecare agent lucrează doar în folderele pe care le deține (§6.6, tabelul de proprietate din `docs/BRIEF.md` §5).

---

## 1. Ce este proiectul

**Elevator pitch.** „A Patra Lume" este o experiență imersivă de ~10 minute pentru 10 copii, într-o sală de 17 × 7 m amenajată ca nava spațială **EXODUS-7**, la **UCDC HUB AI** (Universitatea Creștină „Dimitrie Cantemir", București). Copiii pleacă să caute alte civilizații, vizitează trei lumi — una de lumină, una vie ca un singur organism, una perfectă ca un diamant rece — și descoperă la întoarcere, prin fereastra cockpitului, „a patra lume": Pământul. (`docs/reference/scenariu-docx.txt`, §1–2)

**Elementele fizice ale sălii** (din scenariu, `docs/reference/scenariu-docx.txt` §2 și §4):

| Element | Rol în experiență | Rolul software-ului nostru |
|---|---|---|
| 5 televizoare 4K | „cockpit panoramic": ecranul central = fereastra frontală; 4 laterale (2 babord, 2 tribord) | redă filmul sincronizat pe toate cele 5; suprapune avatarul, subtitrările, entitățile |
| Căpitanul — robot umanoid Unitree | personaj fizic, „impunător", vorbește cu voce gravă | **doar vocea + subtitrarea** replicilor lui (robotul nu este controlat de noi; vezi §11) |
| 2 roboți mici Unitree | „ofițeri" la marginile sălii | nimic (în afara scopului) |
| Avatarul AI al navei | „siluetă de lumină", ghidul copiilor | **avatarul 3D GLB cu lip-sync**, în colțul din stânga-jos al ecranului |
| Avatarele celor 3 civilizații (Lumină, Natură, Tehnologic) | „se conturează pe ecranul central" | entități procedurale (canvas), animate de amplitudinea vocii |
| Tablete (10 copii) | interacțiune: rol în echipaj, întrebare, mesaj | aplicația web `/tablet` servită de executabil |
| Capsula VR | re-entry-ul final, ~2 minute | doar replicile epilogului (opțional, pe ecran alb cald) — conținutul VR nu e al nostru |
| Lumini, fum, sunet ambiental de sală | atmosferă | nu (în afara scopului; vezi §11) |

**Publicul:** copii, 10 per sesiune. **Durata:** ~10 minute (intro în sală ≈ 1 min + film ≈ 7 min + epilog VR ≈ 2 min). Filmul real durează însă **12:21** — vezi §5 pentru cum se împacă asta.

---

## 2. De ce există acest software

Alternativa trivială ar fi fost un player video obișnuit pe fiecare televizor. Nu ajunge, pentru că experiența cere:

1. **Replici rostite la momente exacte din film**, de un avatar 3D care mișcă buzele sincron cu vocea — un player nu știe nimic despre scenariu.
2. **Cinci ecrane în sincron** (același cadru pe toate), cu posibilitatea de pauză, reluare, salt la scenă, fără să „fugă" unul de altul.
3. **O consolă pentru operator** (pre-show → start → pauză → epilog → restart), pentru că rularea este dirijată de un om din sală.
4. **Tabletele copiilor** conectate la aceeași cronologie (alegerea rolului, întrebarea-pivot, mesajul către Pământ).
5. **Un singur executabil**, instalabil pe un PC de show fără dependențe, care merge **offline** (excepție: vocea live opțională).

De aici: un player orchestrat (Electron) + avatar vorbitor (TalkingHead) + server Node încorporat (Hono + WebSocket) pentru consolă și tablete, într-un singur `.exe`. (`docs/BRIEF.md` §0, §3)

---

## 3. Ce livrăm

Un executabil Windows, **`NavaPlayer`** (Electron 44 + Node), cu următoarele roluri și componente (`docs/BRIEF.md` §3; `package.json`):

| Livrabil | Descriere | Unde în cod |
|---|---|---|
| **Rol `master`** | deschide ferestre kiosk pe fiecare ecran configurat, pornește serverul, ecranul `center` este sursa de ceas | `src/main`, `config.role = "master"` |
| **Rol `follower`** | același executabil pe alt PC; deschide ferestrele lui, se conectează la `masterUrl` prin WS și urmărește ceasul | `src/main`, `config.role = "follower"` |
| **Player** | `<video>` 4K H.264 + overlay-uri: subtitrări, numărătoare inversă, entități, temă de culoare, OSD | `src/renderer` |
| **Avatar** | TalkingHead + `assets/avatar/avatar-ai.glb`, colț stânga-jos, lip-sync pe audio pre-generat, efect „transporter" la apariție | `src/renderer/avatar` |
| **Voce** | redare audio pre-generat (`assets/voice/<lang>/manifest.json`) → TTS live (`/api/tts`) → vocea browserului; efecte per vorbitor; SFX sintetizate | `src/renderer/voice` |
| **Server** | Hono + `@hono/node-server` + `ws`, `http://<ip>:4321`: `/control`, `/tablet`, `/ws`, `/api/*` | `src/server` |
| **Consola operatorului** | pagină web `/control`: stare, comenzi, lista cue-urilor, tablete și răspunsuri, QR | `src/web/control` |
| **Aplicația tabletelor** | pagină web `/tablet`: nume, rol, subtitrare curentă, întrebare/vot/mesaj, „mulțumim" | `src/web/tablet` |
| **Pipeline TTS** | `npm run tts` → generează `assets/voice/ro/*.mp3` + `manifest.json` cu timpii cuvintelor | `scripts/tts-generate.mjs`, `src/server/tts-providers.ts` |
| **Utilitare media** | transcodare NVENC și planșe de cadre | `scripts/media-transcode.mjs`, `scripts/media-contact-sheet.mjs` |
| **Build / packaging** | esbuild → `dist/`; electron-builder → `dist-app/NavaPlayer-portable.exe` + installer | `scripts/build.mjs`, `electron-builder.yml` |

Scripturi npm (`package.json`): `build`, `build:watch`, `start`, `dev`, `dist`, `typecheck`, `tts`, `media:transcode`, `media:sheet`.

---

## 4. Scenariul, complet

Sursa: `docs/reference/scenariu-docx.txt` (extras din `docs/reference/A_Patra_Lume_Scenariu.docx`, fără diacritice). Replicile de mai jos sunt **cele din `assets/show/show.json`** (cu diacritice restaurate, sursa executabilă); indicațiile de regie sunt din docx, cu diacritice restaurate de noi. Coloana „Cue" dă id-ul din `show.json`; timpii sunt în `docs/CUE-SHEET.md` și sunt **provizorii** (vezi §5).

**Personaje vorbitoare** (`src/shared/types.ts`, `SPEAKERS`):

| Id în cod | Etichetă afișată | Cine | Culoare | Efect audio | Lip-sync pe GLB |
|---|---|---|---|---|---|
| `CAPITANUL` | CĂPITANUL | robotul Unitree din sală | `#e2e8f0` | `clean` | nu |
| `AVATAR_AI` | AVATAR AI | avatarul navei (GLB-ul nostru) | `#7dd3fc` | `hologram` | **da** |
| `LUMINA` | AVATAR LUMINĂ | civilizația I | `#fcd34d` | `choir` | nu |
| `NATURA` | AVATAR NATURĂ | civilizația II | `#86efac` | `forest` | nu |
| `TEHNOLOGIC` | AVATAR TEHNOLOGIC | civilizația III | `#a5f3fc` | `crystal` | nu |

### Prolog · Înainte de scenă *(nu are cue-uri; e starea `idle`/`preshow` a playerului)*
În sală, înainte de intrarea copiilor, domnește o tăcere calculată. Luminile sunt aproape stinse. Aerul este rece, cu un fum subtil la nivelul solului. Cele cinci ecrane pulsează cu o singură imagine: o stea îndepărtată, respirând. Căpitanul — robotul umanoid Unitree — este deja acolo, nemișcat, în fața ecranului central. Nu întâmpină. Nu se întoarce. Este prezent așa cum este prezentă o statuie dintr-o catedrală.

> Notă de implementare: în player, „steaua care respiră" nu există în film; în faza `preshow` video-ul stă pe cadrul 0 (Pământul cu Calea Lactee). Vezi §14, întrebarea 13.

### Scena 1 · Intrarea în navă — faza `preshow`, scena `intro`
*INT. NAVA EXODUS-7 · MODULUL DE COMANDĂ · ORA 0.* Ușa sigilată a sălii se deschide. Un culoar albastru, conturat de lumini la nivelul solului, ghidează cei zece copii în interior. Pașii lor devin din ce în ce mai rari pe măsură ce înțeleg unde au intrat. Lumina este adâncă, aproape acvatică. Stelele pe ecrane se mișcă abia perceptibil, ca și cum nava ar pluti deja. Copiii se opresc instinctiv, la câțiva pași de Căpitan. Căpitanul nu se întoarce imediat. Lasă tăcerea să se așeze. Apoi, cu o mișcare mecanică și calculată, întoarce capul către grup. Ochii lui se aprind într-un albastru calm.

| Cue | Vorbitor | Indicație | Replica |
|---|---|---|---|
| `pre-01` | CĂPITANUL | voce gravă, liniștită, fără grabă | Bine ați venit, exploratori. Ați fost selectați pentru o misiune unică: să descoperiți dacă suntem singuri în Univers. |

Liniște. Un acord grav, abia auzit, umple sala. Ecranul central se aprinde. Din el se desprinde, ca o siluetă de lumină, Avatarul AI al navei: o prezență stilizată, umanoidă, dar translucidă, ca o hologramă de cea mai bună calitate.

| Cue | Vorbitor | Indicație | Replica |
|---|---|---|---|
| `pre-02` | AVATAR AI | voce caldă, cu o undă de zâmbet; **avatarul GLB apare (beam-in) pe această replică** | Eu sunt ghidul vostru. Voi fi cu voi pe tot parcursul călătoriei. Sistemele sunt gata. Coordonatele sunt încărcate. |
| `pre-03` | CĂPITANUL | — | Așezați-vă. Nava este a voastră. |

Cei doi roboți mici Unitree se mișcă, discret, către marginile sălii, ca doi ofițeri care ocupă poziții de lucru. Nu distrag. Sunt acolo. Spațiul capătă echipaj.

Alte cue-uri ale fazei: `pre-theme` (tema `prologue`), `pre-tablet-wait` (tabletele afișează alegerea rolului: Navigator, Inginer de propulsie, Ofițer comunicații, Medic de bord, Cercetător, Cartograf stelar, Ofițer sisteme, Astro-biolog, Pilot secund, Cronicar de misiune).

### Scena 2 · Decolarea — faza `play`, scena `launch`
*INT. NAVA EXODUS-7 · COCKPIT ACTIV.* Cele cinci ecrane se unesc într-un singur cockpit panoramic. Ecranul central devine fereastra frontală. Cele patru ecrane mai mici devin laterale: două babord, două tribord. O numărătoare inversă pulsează în centru. Zece. Nouă. Opt. Ritmul scade. Inima copiilor începe să bată mai repede.

| Cue | Vorbitor | Indicație | Replica |
|---|---|---|---|
| `launch-01` | AVATAR AI | — | Inițiez secvența de lansare. Țineți-vă respirația. Plecăm de acasă, de pe Pământ. |

> **Abatere față de docx:** docx-ul spune „Plecam acasa de la Pamant" (formulare ambiguă, poate greșeală de tastare). `show.json` folosește „Plecăm de acasă, de pe Pământ." Versiunea veche din Exodus (`src/lib/showDirector.ts`) avea „Plecăm de acasă." De confirmat cu clientul (§14, întrebarea 5).

Cue-uri nevocale: `launch-countdown` (10 → 0, vizual, nevorbit), `launch-liftoff-sfx` („La zero, un val sonor jos trece prin sală." — `liftoff-rumble`). La zero, podeaua vibrează. Pe ecrane, Pământul se îndepărtează — întâi încet, apoi brusc. Continentele devin o minge albastră. Atmosfera se subțiază. Se face tăcere. Stelele nu mai sunt puncte. Sunt o mulțime. Un oraș infinit care se deschide în fața lor.

| Cue | Vorbitor | Indicație | Replica |
|---|---|---|---|
| `launch-02` | CĂPITANUL | aproape șoptit | Priviți. Nimeni de pe Pământ nu a văzut asta așa. |

Copiii se așază mai aproape de ecrane. Umerii li se relaxează. Misiunea a început.

### Scena 3 · Prima civilizație · Planeta Luminii — scena `light` (Siwarha)
*EXT. SPAȚIU PROFUND · SISTEM NECUNOSCUT.* Nava iese dintr-un nor de praf stelar. În fața lor, o planetă fără contur ferm, ca un glob de aur lichid. Razele ei nu iluminează; vorbesc. Sala se schimbă. Luminile ambientale se transformă, treptat, într-o aurie caldă. Cele cinci ecrane pulsează cu fluxuri de lumină, ca și cum întreaga planetă ar fi un singur ochi.

| Cue | Vorbitor | Indicație | Replica |
|---|---|---|---|
| `light-01` | AVATAR AI | — | Prima civilizație. Nu au corp așa cum îl știm noi. Sunt făcuți din lumină. Vorbesc cu ea. |

Pe ecranul central se conturează Avatarul Luminii (`light-entity-show`). Nu este o siluetă. Este o formă care se destramă și se reface, ca o flacără care gândește.

| Cue | Vorbitor | Indicație | Replica |
|---|---|---|---|
| `light-02` | AVATAR LUMINĂ | voce fără vârstă, ca un cor foarte îndepărtat | Nu înțelegeți prin cuvinte. Înțelegeți prin ceea ce simțiți acum. |

Sala devine, pentru câteva secunde, un corp viu de lumină. Culorile se schimbă în ritmul emoțiilor sugerate. Când este liniște, sala este aurie. Când este întrebare, sala devine violet. Când este speranță, devine albă.

| Cue | Vorbitor | Indicație | Replica |
|---|---|---|---|
| `light-03` | AVATAR LUMINĂ | — | La noi, cine iubește strălucește. Cine minte se stinge. Cine înțelege devine lumină pentru ceilalți. |

Copiii tac. Un prim moment de descoperire. Ceva se schimbă în chipul lor. (`light-entity-hide`)

| Cue | Vorbitor | Indicație | Replica |
|---|---|---|---|
| `light-04` | CĂPITANUL | — | Mai departe. Mai sunt lumi. |

### Scena 4 · A doua civilizație · Planeta Naturii — scena `nature` (Kepler-186 d)
*EXT. SPAȚIU · PLANETA VERDE-ALBASTRĂ.* Nava coboară către o lume care pare, la prima vedere, o versiune a Pământului. Dar cu cât se apropie, cu atât este mai clar: aici nu sunt orașe. Nu sunt drumuri. Pădurile se mișcă. Sala se răcește puțin. Lumina devine verde-umed, de pădure adâncă. Se aude respirația unei planete. Un sunet jos, continuu, ca și cum ceva imens și blând tocmai a inspirat.

| Cue | Vorbitor | Indicație | Replica |
|---|---|---|---|
| `nature-01` | AVATAR AI | — | Aici, planeta gândește. Rădăcinile sunt nervi. Râurile sunt sânge. Fiecare copac este o celulă a unei ființe unice. |

Pe ecranul central apare Avatarul Naturii (`nature-entity-show`): o siluetă formată din ramuri și ape, cu ochi ca două frunze noi. Nu este amenințător. Este vechi.

| Cue | Vorbitor | Indicație | Replica |
|---|---|---|---|
| `nature-02` | AVATAR NATURĂ | grav, blând | La noi, nimeni nu este singur. Nu se poate. Dacă un copac suferă, toată pădurea știe. Dacă un râu moare, tot oceanul plânge. |

Pe ecranele laterale, o ploaie fină începe să cadă peste pădure. Ploaia este și sunet în sală (`nature-rain`, SFX `rain`, 40 s). Câțiva copii întind mâna, instinctiv, ca să o prindă.

| Cue | Vorbitor | Indicație | Replica |
|---|---|---|---|
| `nature-03` | AVATAR NATURĂ | — | Voi, de pe planeta voastră, sunteți și voi așa. Doar că, încă, nu v-ați amintit. |

Tăcere. Tăcere lungă (`nature-marker-silence`). Apoi, încet, sala începe să se închidă. Nava reia zborul. (`nature-entity-hide`)

### Scena 5 · A treia civilizație · Planeta Tehnologiei — scena `tech` (Mann, sistemul Gargantua)
*EXT. SPAȚIU · PLANETA DE CRISTAL.* În fața lor, o planetă care nu mai are nimic natural. Totul este geometrie. Orașe suspendate. Turnuri înalte cât lunile. Lumina trece prin ele ca printr-un diamant. Sala devine, pe dinăuntru, o catedrală rece. Albastru-oțel. Ascuțită. Frumoasă într-un fel aproape insuportabil.

| Cue | Vorbitor | Indicație | Replica |
|---|---|---|---|
| `tech-01` | AVATAR AI | — | A treia civilizație. Au învins boala. Au învins moartea. Au învins distanța. Trăiesc de milioane de ani. |

Pe ecranul central se formează Avatarul Tehnologic (`tech-entity-show`): o siluetă de cristal, perfect simetrică, cu ochi ca două oglinzi. Vorbește calm. Niciodată nu ridică tonul. Niciodată nu coboară.

| Cue | Vorbitor | Indicație | Replica |
|---|---|---|---|
| `tech-02` | AVATAR TEHNOLOGIC | clar, precis, aproape muzical | Știm totul. Calculăm totul. Niciun lucru nu ne mai surprinde. Niciun lucru nu ne mai doare. |

Un moment. Copiii îl privesc cu un amestec de admirație și teamă.

| Cue | Vorbitor | Indicație | Replica |
|---|---|---|---|
| `tech-03` | AVATAR TEHNOLOGIC | **întrebarea-pivot** | Dar, spuneți-mi voi, care ați venit de departe: dacă nimic nu te mai surprinde și nimic nu te mai doare, ce mai rămâne viu în tine? |

Liniște. Copiii nu răspund. Nu au cum să răspundă. Întrebarea rămâne, suspendată, ca un ac de cristal în aer. *(În player: ~25 s de tăcere intenționată; tabletele primesc întrebarea — `tech-tablet-question` — iar răspunsurile copiilor apar în consola operatorului. Tema trece la `void` — Gargantua.)*

| Cue | Vorbitor | Indicație | Replica |
|---|---|---|---|
| `tech-04` | CĂPITANUL | după o pauză lungă | Avatar AI, pregătește întoarcerea. |
| `tech-05` | AVATAR AI | — | Coordonate spre casă. Confirmate. |

*(Urmează, fără replici: apropierea și traversarea wormhole-ului — `wormhole-marker`, `wormhole-whoosh` — apoi tema `home`.)*

### Scena 6 · Revelația — scena `revelation` (Pământul)
*INT. NAVA EXODUS-7 · COCKPIT.* Nava se întoarce. Pe ecranul central, în depărtare, apare un punct. Mic. Albastru. Viu. Sala își reia lumina albastră-adâncă din început. Dar nu mai este aceeași lumină. Este lumina casei. Copiii o recunosc fără să fie nevoie să li se spună.

| Cue | Vorbitor | Indicație | Replica |
|---|---|---|---|
| `rev-01` | AVATAR AI | încet | Am văzut trei lumi. Una făcută din lumină. Una făcută dintr-un singur suflet. Una făcută din perfecțiune. Și acum, priviți a patra. |

Pământul crește pe ecran. Norii se învârt încet peste oceane. Luminile orașelor încep să se aprindă pe partea întunecată, una câte una.

| Cue | Vorbitor | Indicație | Replica |
|---|---|---|---|
| `rev-02` | CĂPITANUL | grav, aproape emoționat — atât cât poate fi emoționat un robot | Voi ați căutat dacă suntem singuri. Răspunsul nu este ce credeați. Undeva, cineva, întreabă același lucru despre voi. |

Pe ecran, un prim-plan cu Pământul. O furtună. O țară. Un oraș. O fereastră luminată.

| Cue | Vorbitor | Indicație | Replica |
|---|---|---|---|
| `rev-03` | AVATAR AI | — | Ceea ce ați văzut astăzi sunt forme de inteligență. Ceea ce vă așteaptă jos este ceva mai rar: ceva ce poate să se minuneze. |

Pentru prima dată, Căpitanul se îndreaptă către grup. Face un singur pas, mic, în față. Îi privește unul câte unul. *(Tabletele: `rev-tablet-message` — „Trimite un mesaj Pământului, de sus.")*

| Cue | Vorbitor | Indicație | Replica |
|---|---|---|---|
| `rev-04` | CĂPITANUL | — | Acum vă întoarceți acasă. Dar nu la fel cum ați plecat. Niciodată nu ne întoarcem la fel. |

*CUT TO — CAPSULA.* *(În player: video-ul continuă pe Pământ încă ≈ 5 minute — **hold** — până când operatorul declanșează epilogul; copiii trec în capsula VR în acest timp.)*

### Scena 7 · Capsula VR · Re-entry — faza `epilogue`, scena `reentry`
*INT. CAPSULA SPAȚIALĂ VR · ATMOSFERA SUPERIOARĂ.* Copiii pășesc, în grupuri mici, în capsula VR. Casca. Brațele pe genunchi. Se aud clickurile scaunelor care se fixează. Prin vizieră se vede, pentru ultima dată, negrul spațiului. Apoi, curbura Pământului umple câmpul vizual.

| Cue | Vorbitor | Indicație | Replica |
|---|---|---|---|
| `epi-01` | AVATAR AI | în cască, apropiat, ca o voce de lângă tâmplă | Coborâm. Respirați. Simțiți. |

Capsula începe re-entry-ul. Particule de foc se revarsă pe lângă vizieră. Sala din jur, deși copiii sunt în VR, își coordonează vibrațiile și sunetul. Aerul pare mai dens. Furtuna de plasmă durează câteva secunde lungi. Apoi, brusc, totul se liniștește. Din norii calzi apare Pământul, de aproape. Câmpuri. Mare. Oraș.

| Cue | Vorbitor | Indicație | Replica |
|---|---|---|---|
| `epi-02` | AVATAR AI | — | Aici sunteți voi. Aici este casa. Aici este, dintre toate lumile pe care le-am văzut, singura unde cineva poate să privească cerul și să întrebe: sunt singur? |

Capsula atinge, simbolic, solul. Un val moale de lumină albă trece peste vizieră.

| Cue | Vorbitor | Indicație | Replica |
|---|---|---|---|
| `epi-03` | AVATAR AI | șoptit, aproape un cânt | Ați plecat ca să găsiți alte lumi. V-ați întors cu a voastră, văzută pentru prima dată. |

Tăcere. Casca se ridică. Copiii deschid ochii. Lumina din sală s-a întors la un alb cald, de început de zi. Căpitanul stă din nou în centru, imobil, ca la început. Dar acum copiii știu cine este. *FADE TO WHITE.* (`epi-theme` = `white`, `epi-fade`, `epi-tablet-thanks`)

### Arcul emoțional (docx §5) și structura pe minute (docx §3)

| Minute (docx) | Secvență | Mișcare emoțională | Ton / culoare | Tema în `show.json` |
|---|---|---|---|---|
| 0:00–1:00 | Intrarea în navă | Curiozitate | albastru adânc, tăcere | `prologue` |
| 1:00–2:00 | Decolarea | Curiozitate → entuziasm controlat | albastru + alb, energie | `launch` |
| 2:00–4:00 | Planeta Luminii | Uimire | auriu cald (violet la întrebare, alb la speranță) | `light` |
| 4:00–5:30 | Planeta Naturii | Descoperire și emoție, aproape meditativ | verde-umed, ploaie | `nature` |
| 5:30–7:00 | Planeta Tehnologiei | Tensiune filozofică (disconfort, nu pericol) | albastru-oțel, cristal | `tech` → `void` |
| 7:00–8:00 | Revelația | Reconectare emoțională | albastru „de casă" | `home` |
| 8:00–10:00 | Capsula VR | mirare + recunoștință | alb cald | `white` |

Bilanț: **24 replici vocale** (3 + 2 + 4 + 3 + 5 + 4 + 3), toate prezente în `show.json` ca `VoiceCue`; 54 cue-uri în total.

---

## 5. Filmul

### 5.1 Fapte tehnice

| | Sursa (client) | Fișierul redat de player |
|---|---|---|
| Cale | `C:\Users\Chris\Documents\GitHub\Video\Cinema.mp4` (în afara repo-ului) | `media/cinema_4k_h264.mp4` (în repo local, **ignorat de git**) |
| Container / codec | MP4 / **HEVC, profil Rext 4:4:4** | MP4 / **H.264 High, yuv420p (4:2:0)** |
| Rezoluție | 3840 × 2052 (raport **1,87:1**, nu 16:9) | 3840 × 2052 (neschimbată) |
| Cadență | 60 fps | 60 fps |
| Bitrate | ≈ 76 Mbps | ≈ 27 Mbps mediu (VBR; `ffprobe` raportează 27 000 796 b/s) |
| Durată | 741,77 s (12:21) | 741,78 s |
| Audio | **nu are pistă audio** | nu are |
| Mărime | 7,09 GB | 2,50 GB (2 504 162 463 B) |
| Keyframes | la fiecare 1 s | (setare NVENC) |

Sursa: `docs/BRIEF.md` §1, `media/transcode_4k.log` (s-a terminat cu `EXIT 0`, ≈ 10 min la 1,22× pe RTX 4080), `ffprobe media/cinema_4k_h264.mp4`.

**De ce transcodăm.** HEVC Rext 4:4:4 nu are decodor hardware pe GPU-urile obișnuite și Chromium (deci Electron) nu îl redă deloc. H.264 High 4:2:0 se decodează hardware peste tot, permite `seek` instant și rulează 4K60 fără efort pe RTX 4080. Pierderea de 4:4:4 → 4:2:0 este invizibilă pe un film de spațiu (cer negru, planete). Transcodarea se face o dată, cu NVENC (`scripts/media-transcode.mjs`, `npm run media:transcode`). (`docs/DECIZII.md`, ADR-05)

**Raportul de aspect.** Video-ul are 2052 px înălțime, nu 2160. Pe un TV 4K 16:9, `video.fit`:
- `cover` (implicit în `config.example.json`): scalează ×1,053 și taie ≈ 101 px la stânga și la dreapta;
- `contain`: păstrează tot cadrul, cu benzi negre de 54 px sus și jos (pe fond negru de spațiu nu se observă).

### 5.2 Structura REALĂ a filmului (înlocuiește cronologia scriptului SpaceEngine)

Din `media/analysis/contact_sheet_10s.png` (1 cadru / 10 s) și `media/analysis/sheet_c_385-415s_1s.png` (1 cadru / s, între 6:25 și 6:55). Valorile sunt ±5 s. Copiat din `docs/BRIEF.md` §6 și completat cu observația din planșa de 1 s.

| Interval video | Ce se vede | Scenă / temă | Replici care trebuie să cadă aici |
|---|---|---|---|
| 0:00–0:20 | Pământul cu Calea Lactee în fundal, se îndepărtează | `launch` | numărătoare inversă, `launch-01`, `launch-02` |
| 0:20–1:05 | spațiu întunecat; o galaxie/nebuloasă îndepărtată crește | zbor interstelar spre Lumea I | — |
| **1:10–2:15** | **planetă cu inele uriașe într-o nebuloasă turcoaz (Siwarha)** — orbită | `light` | `light-01`, `light-02`, `light-03`, `light-04` („Mai departe") |
| 2:20–2:55 | câmp de stele, zbor | tranziție | — |
| **3:00–4:05** | **planetă albastră, oceanică, cu nori (Kepler-186 d)** — orbită | `nature` | `nature-01`, `nature-02` + ploaie, `nature-03` |
| 4:10–4:35 | dungi de stele (warp) | tranziție | tăcere lungă |
| **4:40–5:50** | **planetă întunecată cu inele în fața unei stele foarte strălucitoare și a discului de acreție (Mann + Gargantua)** | `tech` | `tech-01`, `tech-02`, `tech-03` (pivot), tăcere, `tech-04`, `tech-05` |
| 5:50–6:42 | apropiere + traversare wormhole (dungi de stele) | `void` | `wormhole-whoosh` |
| **6:43–12:21** | **Pământul**, semilună albastră, orbită lentă până la final (≈ 5 min 38 s) | `home` / `revelation` | `rev-01`…`rev-04` în primele ~1:20, apoi **hold pe Pământ** |

**Saturn** (prezent în scriptul SpaceEngine între wormhole și Pământ) **nu apare distinct** la eșantionarea de 10 s; cadrul de 5:50 arată la dreapta o structură noroasă maro (probabil discul lui Gargantua sau o nebuloasă), nu inelele lui Saturn. Cue-ul `saturn-marker` și scena `saturn` din `show.json` sunt probabil de eliminat sau de redus la un simplu marker informativ.

### 5.3 Discrepanța față de scriptul SpaceEngine și starea alinierii

- `docs/reference/spaceengine-script.txt` are `Wait`-uri care însumează **≈ 625 s**; filmul real are **741,77 s** și o structură diferită (planetele apar mai devreme, iar ultimele ≈ 5:40 sunt orbită pe Pământ).
- `assets/show/show.json` (versiunea `0.1.0-provisional`, `timingStatus: "provisional"`) are timpii fazei `play` **derivați din script**, nu din film. Consecințe concrete, vizibile comparând §5.2 cu `docs/CUE-SHEET.md`: `nature-03` (254 s) ar cădea în warp, după plecarea de la Kepler; `tech-02`/`tech-03` (358/373 s) ar cădea în apropierea de wormhole; `tech-04`/`tech-05` (412/417 s) ar cădea **după** ce Pământul e deja vizibil (403 s); `wormhole-whoosh` (466,5 s) și `home-theme` (474,5 s) sunt cu ≈ 70 s prea târziu; `rev-01` (535,5 s) vine ≈ 2 min după apariția Pământului.
- **Orchestratorul realiniază** cue-urile pe cadre reale (rafinare la 2 s din `sheet_a_000-216s.png`, `sheet_b_216-432s.png`), actualizează `at`, scenele, `version` și setează `timingStatus: "aligned"`. `docs/CUE-SHEET.md` conține o **propunere de aliniere** (±5 s) ca punct de plecare.

### 5.4 Cum refaci alinierea (procedura)

1. Generează planșe de cadre: `npm run media:sheet` (`scripts/media-contact-sheet.mjs`; parametri: intervalul de secunde și pasul). Echivalentul ffmpeg direct, pentru 1 cadru / s între 385 și 415 s:
   `ffmpeg -ss 385 -t 30 -i media/cinema_4k_h264.mp4 -vf "fps=1,scale=384:-1,drawtext=text='%{pts\:hms}':x=8:y=8:fontcolor=yellow:fontsize=22,tile=6x5" media/analysis/sheet_c_385-415s_1s.png`
2. Deschide planșa și notează secundele la care fiecare lume apare / dispare și la care începe/termină warp-ul.
3. În `assets/show/show.json`: mută `at` pentru cue-urile afectate (regula regizorală din script: dialogul de sosire **se suprapune** apropierii, nu așteaptă oprirea); ajustează `scenes[].start/end`; păstrează ordinea `at` crescătoare în fișier; șterge sau păstrează ca marker beat-ul Saturn.
4. Setează `"timingStatus": "aligned"`, incrementează `"version"`.
5. În consola operatorului: `reloadShow` (sau pornește playerul din nou); verifică cu `seek` la fiecare cue.
6. Dacă textele s-au schimbat: `npm run tts` regenerează doar clipurile lipsă/schimbate (cheia = hash pe text + vorbitor).

---

## 6. Arhitectura

### 6.1 Diagrama (text)

```
                          ┌──────────────────────────────────────────────────────────────┐
                          │  NavaPlayer.exe  (Electron 44 + Node)  — rol: master         │
                          │                                                              │
   tastatură ecran master │  ┌─ main (src/main) ────────────────────────────────────┐    │
   Space/S/P/R/E/←/→/I/F  │  │ config.json + .env loader · screen.getAllDisplays()   │    │
                          │  │ ferestre kiosk per ecran · IPC · log JSONL (runs/)    │    │
                          │  │ startServer(...) dacă role=master                     │    │
                          │  └───────────────────────┬──────────────────────────────┘    │
                          │      preload (window.nava, contextBridge)                    │
                          │                          │                                   │
                          │  ┌─ renderer × N ecrane (src/renderer) ──────────────────┐   │
                          │  │ <video file:///media/cinema_4k_h264.mp4>              │   │
                          │  │ timeline (cue engine) · sync (WS client + drift)      │   │
                          │  │ ui: subtitles · countdown · entities · theme · osd    │   │
                          │  │ avatar/ (TalkingHead + GLB)   voice/ (clips, SFX)     │   │
                          │  └───────────────────────┬──────────────────────────────┘   │
                          │                          │ ws://localhost:4321/ws (hello: screen)
                          │  ┌─ server (src/server) ─┴──────────────────────────────┐   │
                          │  │ Hono + @hono/node-server + ws · http://<ip-lan>:4321  │   │
                          │  │ state machine + ceas (clockHz) · retransmitere cmd    │   │
                          │  │ /control  /tablet  /ws  /api/{state,show,cmd,qr,tts,health}
                          │  │ cache/ (tts pe disc) · runs/*.jsonl                   │   │
                          │  └───┬───────────────┬───────────────────┬──────────────┘   │
                          └──────┼───────────────┼───────────────────┼──────────────────┘
                                 │               │                   │
                      ┌──────────┴───┐   ┌───────┴────────┐   ┌──────┴──────────────────────┐
                      │ /control     │   │ /tablet × 10   │   │ NavaPlayer.exe role=follower │
                      │ consola      │   │ tabletele      │   │ (alt PC, aceleași ecrane)    │
                      │ operatorului │   │ copiilor       │   │ renderer-e → ws://master/ws  │
                      └──────────────┘   └────────────────┘   └──────────────────────────────┘
```

Detalii și reguli tehnice: `docs/BRIEF.md` §3. Pe scurt: TypeScript strict; **fără framework UI** (vanilla TS + DOM); bundling cu **esbuild** (`scripts/build.mjs`: `main`/`preload` → CJS cu `external: electron`; `renderer`/`web/*` → IIFE); renderer-ul se încarcă cu `loadFile(dist/renderer/index.html)`, iar video-ul/asset-urile prin **URL-uri `file://` absolute** (range requests native → seek); Electron cu `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false`, switch-uri `autoplay-policy=no-user-gesture-required`, `ignore-gpu-blocklist`.

### 6.2 Mașina de stări (`PlaybackState`, `src/shared/types.ts`)

```
 idle ──(cmd preshow)──▶ preshow ──(cmd start)──▶ playing ◀──(play)── paused
  ▲                        │                        │  ▲              ▲
  │                        │(cmd start)             │  └──(pause)─────┘
  │                        ▼                        │
  │                     playing        (video ended) │ (cmd epilogue)
  │                                                 ▼
  └──────────(cmd restart)────────────────────── epilogue ──▶ ended
```

| Stare | Ce face playerul | Cine declanșează cue-urile |
|---|---|---|
| `idle` | video pe cadrul 0, fără cue-uri, avatar ascuns | — |
| `preshow` | video **în pauză pe cadrul 0**; copiii intră; tabletele primesc alegerea rolului | timer pornit la `preshow` (cue-uri cu `phase: "preshow"`: 8 s, 28 s, 48 s) |
| `playing` | video rulează de la 0 | `video.currentTime` (cue-uri cu `phase: "play"`) |
| `paused` | video oprit; cue-urile nu avansează | — |
| `epilogue` | ecran alb cald (fade), replicile capsulei VR; **opțional**, se poate sări | timer pornit la intrarea în epilog (`phase: "epilogue"`) |
| `ended` | după ultimul cue al epilogului | — |

Comenzi disponibile oricând (`Command`, `src/shared/protocol.ts`): `preshow`, `start`, `play`, `pause`, `seek`, `skipToScene`, `restart`, `epilogue`, `fireCue`, `stopVoice`, `setVolume`, `setLang`, `reloadShow`, `testAvatar`, `identifyScreens`. `preshowAutoStart: false` în `show.json` → intrarea în preshow este manuală.

### 6.3 Regulile motorului de cue-uri (renderer, `docs/BRIEF.md` §4)

1. La fiecare frame (`requestAnimationFrame`), toate cue-urile fazei curente cu `at <= phaseTime` și încă nedeclanșate se declanșează, **în ordinea `at`**.
2. **Seek înapoi:** cue-urile cu `at > phaseTime` redevin nedeclanșate (se vor redeclanșa).
3. **Seek înainte:** cue-urile sărite se marchează declanșate **fără a rula**, cu două excepții: `theme` (se aplică ultima temă sărită) și `entity` (se aplică starea finală show/hide).
4. **O singură voce simultan:** o voce nouă o oprește pe cea anterioară (și subtitrarea ei).
5. `manual: true` → cue-ul nu se declanșează automat; operatorul îl lansează cu `fireCue`.
6. `fireCue` rulează cue-ul acum, indiferent de `at`.

### 6.4 Protocolul de sincronizare (rezumat; complet în `src/shared/protocol.ts` și `docs/SPEC-SHEET.md` §5)

- Un singur endpoint WS: `ws://<host>:4321/ws`. Fiecare client trimite `hello { client: "screen"|"control"|"tablet", id, isClockSource? }` și primește `welcome { serverTimeMs, state, show, config.sync }` — inclusiv **show-ul întreg**, ca follower-ii să nu depindă de fișiere locale.
- **Serverul este autoritatea.** Comenzile (`cmd`) vin de la consolă sau de la tastatura ecranului master (prin IPC → `ServerHandle.dispatchCommand`) și sunt **retransmise** tuturor ecranelor ca `applyCmd { cmd, serverTimeMs }`.
- **Ceasul:** ecranul `center` al masterului este sursa de ceas (`isClockSource: true`) și raportează `report { state, phaseTime, rate, videoReady, sceneId }` la 4 Hz. Serverul difuzează `clock { state, phaseTime, serverTimeMs, rate }` la `sync.clockHz` (implicit 4 Hz).
- **Corecția driftului (fiecare ecran ne-sursă):** țintă = `phaseTime + (now − serverTimeMs)/1000 × rate`; dacă `|video.currentTime − țintă| > sync.seekThresholdSec` (0,25 s) → `seek`; altfel `playbackRate = 1 ± sync.rateNudge` (3 %) până la convergență.
- Consola și tabletele primesc `state` (la orice schimbare + 1 Hz), `cueFired`, `tabletView`, `tablets`.
- REST (`/api/*`): `state`, `show`, `cmd` (POST), `qr` (PNG cu URL-ul `/tablet`), `tts` (POST, live cu cache pe disc), `health`.

### 6.5 IPC Electron (`NavaBridge`, expus ca `window.nava`)

`getBoot()` → `{ config, screen, wsUrl, videoUrl, avatarUrl, voiceBaseUrl, showUrl, isDev, appVersion }` (URL-uri `file://` absolute); `log(level, msg, data?)` → `runs/<run>.jsonl`; `sendCommand(cmd)` → serverul; `quit()` (Esc ×2 în modul `dev.windowed`).

### 6.6 Harta folderelor și proprietatea (`docs/BRIEF.md` §5)

```
Nava/
├─ HANDOFF.md, README.md                    F  (documentație)
├─ docs/  SPEC-SHEET.md SCENARIU.md CUE-SHEET.md OPERARE.md DECIZII.md      F
│  ├─ BRIEF.md                              Orchestrator (sursa de adevăr a arhitecturii)
│  └─ reference/  scenariu-docx.txt, A_Patra_Lume_Scenariu.docx, spaceengine-script.txt, EXODUS_SUMMARY.md
├─ src/shared/  types.ts protocol.ts contracts.ts     Orchestrator (contracte; nu se schimbă unilateral)
├─ src/main/**, src/preload/**              A  (Electron main, ferestre, config, IPC, log, pornire server)
├─ scripts/build.mjs, media-transcode.mjs, media-contact-sheet.mjs, electron-builder.yml, build/   A
├─ src/renderer/**  (fără avatar/, voice/)  B  (player: index.html, styles.css, index.ts, timeline.ts, sync.ts, ui/*)
├─ src/renderer/avatar/**, src/renderer/voice/**     C  (avatar TalkingHead + lipsync-ro; motor de voce + SFX)
├─ src/server/tts-providers.ts, scripts/tts-generate.mjs, assets/voice/**    C
├─ src/server/**  (fără tts-providers.ts)   D  (Hono + ws, state machine, /api, QR, run-log)
├─ src/web/control/**, src/web/tablet/**    D  (consola operatorului, aplicația tabletelor)
├─ assets/show/show.json                    Orchestrator (scenariul executabil; alinierea pe video)
├─ assets/avatar/avatar-ai.glb              (copiat din Exodus; 14 302 780 B)
├─ media/  cinema_4k_h264.mp4 (ignorat de git), transcode_4k.log, analysis/*.png (ignorate), source/
├─ config.example.json, .env.example, package.json, tsconfig.json, .gitignore     Orchestrator
└─ runs/ (JSONL, ignorat), cache/ (TTS, ignorat), dist/ și dist-app/ (build, ignorate)
```

### 6.7 Contracte (unde sunt, ce conțin)

| Fișier | Conține |
|---|---|
| `src/shared/types.ts` | `Speaker`, `SPEAKERS`, `Lang`, `Phase`, `CueKind`, `Cue` (7 tipuri), `SceneTheme` (8 teme), `Scene`, `ShowFile`, `ScreenConfig`, `AppConfig`, `PlaybackState`, `ShowState`, `VoiceClipMeta`, `VoiceManifest` |
| `src/shared/protocol.ts` | mesaje client→server (`hello`, `report`, `cmd`, `tablet`), server→client (`welcome`, `clock`, `applyCmd`, `state`, `cueFired`, `tabletView`, `tablets`, `error`), `Command`, `NavaBridge` (IPC) |
| `src/shared/contracts.ts` | `VoiceEngine`, `AvatarController`, `VoiceClip`, `PlaybackHandle`, fabricile `CreateVoiceEngine` / `CreateAvatarController` |
| `docs/BRIEF.md` §9 | semnături fixe inter-agent: `startServer(opts) → ServerHandle`, `synthesize(opts) → TtsResult`, `resolveVoiceId` |

### 6.8 Build și packaging

`npm run build` → `node scripts/build.mjs` (esbuild) → `dist/main/main.js`, `dist/preload/*.js`, `dist/renderer/{index.html,styles.css,index.js}`, `dist/web/{control,tablet}/`. `npm run dev` → build + `electron . --dev --config config.json` (fereastră, DevTools la nevoie). `npm run dist` → build + `electron-builder --win` → `dist-app/NavaPlayer-portable.exe` + installer (`electron-builder.yml`). `npm run typecheck` → `tsc --noEmit` (strict; `tsconfig.json` cu alias `@shared/*`). Node folosit: v24.19.0; npm 11.17. **Nu rula `npm install` în paralel cu alt agent** (`docs/BRIEF.md` §3).

### 6.9 Fișierele de lângă executabil, la rulare (`appRoot`)

```
<folderul exe>/            (în dezvoltare: rădăcina repo-ului; packaged: dirname(exe) sau resourcesPath)
├─ NavaPlayer.exe
├─ config.json             ← copiat din config.example.json și editat (rol, ecrane, căi)
├─ .env                    ← chei API (opțional; doar pentru /api/tts live)
├─ assets/show/show.json   ← scenariul executabil
├─ assets/avatar/avatar-ai.glb
├─ assets/voice/ro/manifest.json + <cueId>.mp3   ← voci pre-generate (npm run tts)
├─ media/cinema_4k_h264.mp4                       ← filmul transcodat (2,5 GB)
├─ runs/<data-ora>.jsonl   ← jurnal per rulare (creat automat)
└─ cache/                  ← cache TTS live pe disc (creat automat)
```

Toate căile relative din `config.json` sunt față de acest folder (`config.example.json`, `$comment`).

---

## 7. Avatarul

- **Fișier:** `assets/avatar/avatar-ai.glb` (14 302 780 B ≈ 13,6 MB). Este **același GLB** ca `avatars/avatar.glb` din proiectul Exodus, cunoscut acolo ca **„BiologV2.glb"**, generat cu **Avaturn**. Are cele **15 viseme Oculus** (`sil PP FF TH DD kk CH SS nn RR aa E I O U`), blendshape-uri **ARKit** și rig **Mixamo**, deci este compatibil direct cu TalkingHead. (`docs/BRIEF.md` §1; `docs/reference/EXODUS_SUMMARY.md` §7.5)
- **Nu există un GLB numit „Christoph"** — s-a căutat pe tot discul. Calea este configurabilă: `config.avatar.glb`. Dacă apare un alt avatar, se schimbă doar config-ul (cerință: viseme Oculus + ARKit pentru lip-sync).
- **Bibliotecă:** `@met4citizen/talkinghead` ^1.7.0 peste `three` ^0.184 (`package.json`). Codul de referință de portat din Exodus: `src/components/ship/AvatarStage.tsx`, `src/lib/talkingHead.ts` (inițializare, import static al modulelor lipsync, `speakAudio` cu `words/wtimes/wdurations`, recuperare la pierderea contextului WebGL, diagnosticul viseme-lor), `src/components/ship/Transporter.tsx` + keyframes `aria-materialize`/`aria-dematerialize` (efectul de teleportare).
- **Comportament în player** (`docs/BRIEF.md` §7; `AvatarController` în `src/shared/contracts.ts`): canvas transparent peste video, colț **stânga-jos** (`corner`), lățime `widthPercent` = 22 % din ecran, margine 40 px; **beam-in la prima replică AVATAR_AI** (`pre-02`), apoi permanent vizibil; `setAttention("idle")` (privire ușor laterală) când vorbesc alții; `lipsync(clip, startAtMs)` mișcă doar gura (audio-ul audibil îl redă `VoiceEngine`); `lipsyncSynthetic(durationMs)` când nu avem timpi (vocea browserului); `setMood`, `setVisible(visible, animate)`, `resize`, `dispose`.
- **lipsync-ro:** modul propriu (agentul C) care mapează textul românesc în viseme Oculus, folosind cuvintele și timpii lor din manifest (ElevenLabs). Exodus rutează româna prin procesorul englez ca aproximație; aici facem o mapare proprie pentru română.
- Afișat doar pe ecranele cu `showAvatar: true` (implicit doar `center`).

---

## 8. Vocile

### 8.1 Pre-generare (calea normală)
`npm run tts` → `scripts/tts-generate.mjs` citește `assets/show/show.json`, ia toate `VoiceCue`-urile, apelează `synthesize({ text, speaker, lang, provider })` din `src/server/tts-providers.ts` și scrie `assets/voice/<lang>/<cueId>.mp3` + `assets/voice/<lang>/manifest.json` (`VoiceManifest`: pentru fiecare clip `durationMs`, `words[]`, `wtimes[]`, `wdurations[]`, opțional `visemes/vtimes/vdurations`, `provider`, `generatedAt`). Clipurile pre-generate **se comit** în git (`.gitignore`: „pre-generated voices under assets/voice ARE committed"); `assets/voice/ro/` este momentan gol.

### 8.2 Furnizori
| Furnizor | Avantaj | Dezavantaj | Variabile `.env` |
|---|---|---|---|
| **ElevenLabs** (recomandat, `TTS_PROVIDER=elevenlabs`) | returnează **timestamps per caracter** → `words/wtimes/wdurations` exacte → lip-sync precis | cost per caracter | `ELEVENLABS_API_KEY`, `ELEVENLABS_MODEL_ID` (implicit `eleven_multilingual_v2`), `ELEVENLABS_VOICE_AVATAR_AI`, `_CAPITANUL`, `_LUMINA`, `_NATURA`, `_TEHNOLOGIC` |
| **Gemini TTS** (alternativă) | gratuit în limite | **fără timestamps** → timpii cuvintelor se estimează proporțional cu lungimea | `GEMINI_API_KEY` |

Dacă lipsesc ID-urile de voce per personaj, `scripts/tts-generate.mjs` folosește vocile publice implicite (`resolveVoiceId`). Modelul din Exodus: `backend/src/routes/tts.ts` (proxy dual, cache sha256 pe disc, rate-limit, PCM→WAV).

### 8.3 Lanțul de fallback la rulare (`VoiceEngine.getClip`, `src/shared/contracts.ts`)
1. `assets/voice/<lang>/manifest.json` → clipul pre-generat (offline, determinist, cu timpi).
2. `POST /api/tts` pe serverul master → sinteză live cu **cache pe disc** în `cache/` (necesită chei în `.env` și internet).
3. `null` → `speakFallback(text, speaker, lang)` = vocea browserului (`speechSynthesis`, Windows ro-RO) + `lipsyncSynthetic`.

Fără nicio cheie, playerul funcționează complet (cu vocea Windows). Ecranele cu `playAudio: false` nu emit sunet (`audible: false`), dar raportează timpii pentru subtitrare/lip-sync.

### 8.4 Efecte per vorbitor și SFX
`SPEAKERS[].fx`: `hologram` (AVATAR_AI), `clean` (CĂPITANUL), `choir` (LUMINĂ), `forest` (NATURĂ), `crystal` (TEHNOLOGIC) — lanțuri Web Audio (model: `useRadioTts.ts` din Exodus, fără filtrul „radio"). SFX sintetizate, fără fișiere (`SfxCue.sfx`): `liftoff-rumble`, `low-swell`, `wormhole-whoosh`, `arrival-chime`, `rain`, `white-fade` (model: `src/lib/audio-synth.ts` din Exodus). Volume: `config.audio.voiceVolume`, `sfxVolume`; comanda `setVolume`.

### 8.5 Unde stau cheile. Niciodată în repo.
Doar în `.env` (lângă exe sau în rădăcina repo-ului), încărcat de un loader propriu în `main` (fără pachetul `dotenv`), citit prin `process.env` **numai** de `tts-providers.ts` și de `scripts/tts-generate.mjs`. `.env` și `.env.*` sunt în `.gitignore`; `.env.example` este șablonul. Cheile nu ajung niciodată în renderer sau în paginile web.

---

## 9. Tabletele și consola

### 9.1 Consola operatorului (`/control`, `src/web/control`)
Flux: deschide `http://<ip-lan>:4321/control` pe laptop/telefon → vede starea (`state`, `phaseTime`, scena, tema, ecrane conectate, tablete conectate, `videoReady`) → butoane pentru fiecare `Command` → lista cue-urilor cu `fireCue` per rând și evidențierea ultimului `cueFired` → lista tabletelor (`tablets`) cu răspunsurile (întrebarea-pivot, mesajele către Pământ) → QR-ul pentru `/tablet` (`GET /api/qr`) → `reloadShow`, `testAvatar`, `identifyScreens`, `setVolume`, `setLang`.

### 9.2 Tabletele (`/tablet`, `src/web/tablet`)
Flux pentru un copil: scanează QR-ul (sau tastează URL-ul) → introduce numele (`tablet { event: join }`; id persistent în `localStorage`) → în `preshow` primește `tabletView { interaction: role-pick }` și alege rolul (`event: role`) → în `play` vede subtitrarea curentă (`subtitle { speaker, text, color }`) colorată după tema scenei → la `tech-tablet-question` primește întrebarea-pivot și scrie un răspuns (`event: answer`, max 80 caractere) → la `rev-tablet-message` scrie un mesaj Pământului (`event: message`, max 100) → în epilog primește `thanks`. `ping` ține conexiunea vie; deconectarea/reconectarea păstrează id-ul.

Interacțiuni disponibile (`TabletCue.interaction`): `waiting`, `role-pick`, `question`, `vote`, `message`, `thanks`. `vote` nu este folosit încă în `show.json` (există în contract pentru viitor).

### 9.3 Rețea
Tabletele și consola au nevoie de **aceeași rețea LAN/Wi-Fi** ca PC-ul master (portul 4321, `bindHost: 0.0.0.0`). Firewall-ul Windows trebuie să permită portul. Recomandat: un router dedicat sălii, fără internet obligatoriu.

---

## 10. Decizii luate și motivele (rezumat; detalii în `docs/DECIZII.md`)

| ADR | Decizie | Motiv scurt |
|---|---|---|
| 01 | **Electron + Node într-un singur executabil** | kiosk offline, control total al ferestrelor pe N ecrane, decodare video hardware în Chromium, server încorporat |
| 02 | **Vanilla TypeScript + DOM, fără framework UI** | kiosk simplu, zero dependențe în plus, pornire rapidă |
| 03 | **esbuild** pentru bundling | rapid, o singură configurație pentru main/preload/renderer/web |
| 04 | **Video prin `file://` absolut, nu prin HTTP propriu** | range requests native → seek instant, fără overhead de server |
| 05 | **Transcodare HEVC Rext 4:4:4 → H.264 High 4:2:0 cu NVENC** | Rext 4:4:4 nu se decodează în Chromium; H.264 e hardware peste tot |
| 06 | **Voci pre-generate** (`npm run tts`), TTS live doar ca fallback | determinism, latență zero, offline, cost o singură dată, timpi de cuvinte pentru lip-sync |
| 07 | **ElevenLabs preferat față de Gemini** | timestamps → lip-sync precis |
| 08 | **Ceas server-authoritative; ecranul `center` al masterului = sursă** | un singur adevăr; consola și tabletele văd aceeași cronologie |
| 09 | **Corecție drift: seek > 0,25 s, altfel `playbackRate` ±3 %** | seek-urile mici produc sacadări vizibile; nudge-ul e invizibil |
| 10 | **PC-uri follower suportate pe lângă un PC cu multe ieșiri** | RTX 4080 are 4 ieșiri, sunt 5 TV-uri; nu știm încă hardware-ul sălii |
| 11 | **Hold pe Pământ până când operatorul declanșează epilogul** | filmul are ≈ 5:40 de orbită pe Pământ la final; copiii trec în VR în acest timp |
| 12 | **`show.json` = date, reîncărcabil la cald (`reloadShow`)** | alinierea pe video și modificările de text nu cer rebuild |
| 13 | **Reguli fixe pentru seek în motorul de cue-uri** (temă/entitate aplicate, vocile sărite) | comportament predictibil la salturi |
| 14 | **Căpitanul = doar voce + subtitrare în player** | robotul Unitree nu e controlat de acest software (viitor) |
| 15 | **Entități procedurale pentru Lumină/Natură/Tehnologic** | fără asset-uri noi; animate de amplitudinea vocii |
| 16 | **SFX sintetizate în Web Audio, fără fișiere** | fără dependențe de licență; model existent în Exodus |
| 17 | **Hono + ws pentru server; un singur endpoint WS cu `hello`** | continuitate cu Exodus; simplu de rutat pe rol |
| 18 | **`contextIsolation: true`, `nodeIntegration: false`, `sandbox: false`** | securitate + WebGL pentru TalkingHead |
| 19 | **Fără secrete în repo; loader `.env` propriu** | siguranță; fără `dotenv` |
| 20 | **Textele cu diacritice în `show.json`** | docx-ul nu are diacritice; TTS-ul pronunță corect doar cu ele |
| 21 | **Tabletele = pagină web în LAN, fără aplicație nativă** | zero instalare pe 10 tablete; QR |
| 22 | **Filmul nu se comite în git** | 2,5 GB; se regenerează cu `npm run media:transcode` din sursă |
| 23 | **Documentație în română, cod în engleză** | clientul și echipa sunt români; identificatorii rămân universali |

---

## 11. Ce NU face (și unde s-ar agăța în viitor)

| În afara scopului | Ce spune scenariul | Hook existent pentru viitor |
|---|---|---|
| **Controlul robotului Unitree** (Căpitanul: întoarcerea capului, „pasul către grup", ochii albaștri) și al celor doi roboți mici | docx §6: „Roboți Unitree — AI invizibil, prezență" | `cueFired` pe WS (un client nou `client: "robot"` ar putea asculta cue-urile CAPITANUL); `MarkerCue` pentru gesturi |
| **Luminile sălii (DMX), fum, vibrații de podea** | docx: sala devine aurie / verde / albastru-oțel; „podeaua vibrează" | `ThemeCue` + `state.theme` difuzate pe WS → un bridge DMX/Art-Net extern |
| **Conținutul capsulei VR** (re-entry, particule de foc, aterizare) | docx Scena 7 | replicile epilogului sunt în `show.json` (`epi-*`); pot fi exportate ca audio pentru căști |
| **Dialog live cu copiii (STT + LLM + TTS cu latență mică)** | docx §6 „Interacțiune în timp real" | `POST /api/tts` există; Exodus are un client Gemini Live complet (`docs/reference/EXODUS_SUMMARY.md` §7.4) |
| **Muzică / sound design compus** | docx §6 „Voce și sound design" | `SfxCue` (6 SFX sintetizate); filmul nu are pistă audio — o pistă ambientală ar putea fi adăugată ca `<audio>` sincron |
| **Conținut diferit pe ecranele laterale** (ploaia „pe ecranele laterale") | docx Scena 2 și 4 | `ScreenConfig` per ecran (`showEntities`, `showAvatar`); un `entity` „rain" ar putea fi randat doar pe laterale |
| **Analitică / „AI ca memorie", personalizare per grup** | docx §6 | `runs/*.jsonl` (jurnal per rulare); `setLang` (voci `en`/`fr` în tipuri, dar negenerate) |
| **Autentificare pe consolă** | — | consola e în LAN privat; de adăugat un PIN dacă rețeaua e partajată |

---

## 12. STARE / UNDE AM RĂMAS

> Actualizat de **agentul F la 2026-09-04**, înainte ca agenții A–D să livreze cod. **Orchestratorul bifează** la fiecare integrare și scrie data. Legenda: `[x]` gata și verificat · `[~]` în lucru · `[ ]` neînceput.

### 12.1 Repo și infrastructură
- [x] Repo local `C:\Users\Chris\Documents\GitHub\Nava` inițializat (branch `main`, **fără niciun commit încă**; totul e untracked). Orchestratorul comite pe `board/nava-player`.
- [x] `package.json` (deps: electron 44, electron-builder 26, esbuild 0.25, typescript 5.8, hono 4.6, @hono/node-server 1.13, ws 8.20, qrcode 1.5, three 0.184, @met4citizen/talkinghead 1.7), `tsconfig.json` (strict, alias `@shared/*`), `.gitignore`, `config.example.json`, `.env.example`.
- [~] `npm install` — rulează în fundal (nu porni un al doilea).
- [x] Contracte: `src/shared/types.ts`, `protocol.ts`, `contracts.ts`.
- [x] `docs/BRIEF.md` (brief ratificat), `docs/reference/*` (scenariu, script SpaceEngine, rezumat Exodus).

### 12.2 Media
- [x] Sursa analizată (`ffprobe`): HEVC Rext 4:4:4, 3840×2052, 60 fps, 741,77 s, fără audio.
- [x] Transcodare NVENC → `media/cinema_4k_h264.mp4` (H.264 High 4:2:0, 2,50 GB, ≈ 27 Mbps, `EXIT 0` în `media/transcode_4k.log`).
- [x] Planșe de cadre: `media/analysis/contact_sheet_10s.png` (1/10 s, tot filmul), `sheet_a_000-216s.png`, `sheet_b_216-432s.png`, `sheet_c_385-415s_1s.png` (1/s).
- [ ] `scripts/media-transcode.mjs`, `scripts/media-contact-sheet.mjs` (A) — **încă nu există** în `scripts/` (folderul este gol la data scrierii).

### 12.3 Scenariu / show.json
- [x] `assets/show/show.json` v0.1.0-provisional: 10 scene, 54 cue-uri, 24 replici vocale cu diacritice, indicații de interpretare (`direction`), note.
- [ ] **Aliniere pe cadre reale** → `timingStatus: "aligned"` (Orchestrator). Propunere în `docs/CUE-SHEET.md` §3.
- [ ] Decizie asupra beat-ului Saturn (scena `saturn`, `saturn-marker`) — absent în film.
- [ ] Confirmarea formulării `launch-01` cu clientul (§14, Q5).

### 12.4 Cod per componentă (la data scrierii toate folderele sunt goale)
| Componentă | Agent | Stare | Verificare rapidă |
|---|---|---|---|
| `src/main` (ferestre kiosk, config, `.env` loader, IPC, log, `startServer`) | A | [ ] | `npm run dev` deschide o fereastră pe fiecare ecran din `config.screens`; `window.nava.getBoot()` răspunde |
| `src/preload` (`window.nava`) | A | [ ] | în DevTools: `await window.nava.getBoot()` |
| `scripts/build.mjs`, `electron-builder.yml`, `build/` | A | [ ] | `npm run build` produce `dist/`; `npm run dist` produce `dist-app/NavaPlayer-portable.exe` |
| `src/renderer` player (index, timeline, sync, ui/*) | B | [ ] | video-ul pornește la `start`; subtitrările apar la cue-uri; `I` afișează id-ul ecranului |
| `src/renderer/avatar` (TalkingHead + GLB + transporter + lipsync-ro) | C | [ ] | `testAvatar` din consolă: avatarul apare și vorbește cu buzele sincron |
| `src/renderer/voice` (manifest → /api/tts → speechSynthesis; FX; SFX) | C | [ ] | fără `.env`: se aude vocea Windows; cu manifest: se aude mp3-ul |
| `src/server/tts-providers.ts`, `scripts/tts-generate.mjs` | C | [ ] | `npm run tts` scrie `assets/voice/ro/manifest.json` + 24 mp3 |
| `assets/voice/ro/` voci generate | C / Orchestrator (are nevoie de chei) | [ ] | 24 clipuri, `words/wtimes` prezente |
| `src/server` (Hono + ws, state machine, /api, QR, run-log) | D | [ ] | `curl http://localhost:4321/api/health`; `/api/qr` dă PNG |
| `src/web/control` | D | [ ] | consola comandă `preshow/start/pause/seek/epilogue/restart` |
| `src/web/tablet` | D | [ ] | o tabletă intră, alege rol, răspunde la întrebare; răspunsul apare în consolă |
| Integrare + build + test pe 1 ecran | Orchestrator | [ ] | rularea completă preshow → play → hold → epilog → restart, fără erori în `runs/*.jsonl` |
| Test multi-ecran (5 ferestre sau 2 PC-uri master+follower) | Orchestrator | [ ] | drift < 40 ms între ecrane (măsurat cu `identifyScreens` + un cronometru pe cadru) |
| Commit pe `board/nava-player` | Orchestrator | [ ] | `git log` |
| Documentație (HANDOFF, README, docs/*) | F | [x] | acest fișier + `docs/` |

### 12.5 Cum verifici că merge (checklist de acceptanță scurt; complet în `docs/SPEC-SHEET.md` §8)
1. `npm run typecheck` → 0 erori. `npm run build` → `dist/` complet.
2. `cp config.example.json config.json`; setează `dev.windowed: true`, `dev.openDevTools: true`; `npm run dev`.
3. Se deschide fereastra playerului cu video-ul pe cadrul 0 și OSD „idle". Fără video → mesaj clar „video lipsă: <cale>" (nu crash).
4. `http://localhost:4321/control` → stare `idle`, 1 ecran conectat. Apasă **PRE-SHOW**: la 8 s se aude Căpitanul (subtitrare), la 28 s apare avatarul cu efect transporter și vorbește, la 48 s Căpitanul.
5. **START**: video-ul pornește; numărătoarea inversă 10→0; rumble; subtitrări la cue-uri; tema se schimbă pe scene.
6. `seek` la 6:40 → Pământul; replicile revelației; apoi video-ul continuă (hold). **EPILOG**: ecran alb, 3 replici. **RESTART** → `idle`.
7. Pe telefon (aceeași rețea): scanează QR-ul din consolă → `/tablet` → nume → rol → în `tech-tablet-question` scrie un răspuns → apare în consolă.
8. Al doilea PC cu `role: "follower"`, `masterUrl: ws://<ip-master>:4321/ws` → același cadru; `pause`/`seek` pe master se reflectă în < 0,3 s.

---

## 13. Pași următori recomandați, în ordine

1. **Așteaptă finalizarea `npm install`**, apoi integrează livrabilele A, B, C, D (rapoartele lor spun ce s-a testat). Rezolvă erorile de `typecheck` la granițele contractelor.
2. **Prima rulare pe un ecran** (`dev.windowed: true`) cu vocea Windows (fără chei). Verifică state machine-ul complet (§12.5).
3. **Aliniază `show.json` pe video** (§5.4 + propunerea din `docs/CUE-SHEET.md` §3), setează `aligned`, actualizează `docs/CUE-SHEET.md` (coloana „Stare") și `docs/SCENARIU.md` (timpii).
4. **Obține cheile** (ElevenLabs / Gemini) de la Christoph, completează `.env`, alege vocile per personaj (Q4), rulează `npm run tts`, ascultă cele 24 de clipuri, comite `assets/voice/ro/`.
5. **Test pe 5 ferestre** pe un singur PC (`screens[]` cu 5 intrări, `kiosk: true`) și **test master + follower** pe două PC-uri. Măsoară driftul.
6. **`npm run dist`** → executabil portabil; test „curat" pe un PC fără Node: copiază exe + `config.json` + `assets/` + `media/`; pornire < 20 s.
7. **Repetiție tehnică în sală** cu operatorul (`docs/OPERARE.md`): QR, Wi-Fi, volum, poziția avatarului, lizibilitatea subtitrărilor de la 17 m.
8. **Răspunsuri de la client** la întrebările din §14; ajustează `show.json` și config-ul.
9. Commit pe `board/nava-player` (orchestratorul), actualizează §12 al acestui fișier.

---

## 14. Întrebări deschise pentru client (Christoph / UCDC HUB AI)

| # | Întrebare | De ce contează | Implicit, dacă nu răspunde |
|---|---|---|---|
| 1 | **Un PC cu 5 ieșiri video sau 5 PC-uri (1 master + 4 follower)?** Ce GPU are PC-ul de show? | RTX 4080 are 4 ieșiri; 5 TV-uri cer un al doilea GPU/hub MST sau follower-e | suportăm ambele; testăm cu master + follower |
| 2 | **Cele 4 TV-uri laterale oglindesc ecranul central sau arată altceva** (ex. doar filmul, fără avatar/subtitrări)? | `ScreenConfig.showAvatar/showSubtitles/showEntities` per ecran | laterale: doar film + temă; avatar și subtitrări doar pe `center` |
| 3 | **Replicile Căpitanului se aud din boxele PC-ului sau le redă robotul Unitree?** | dacă robotul are boxă proprie, cue-urile CAPITANUL trebuie mutate/redate de robot (sincronizare!) | din PC (`playAudio: true` pe `center`), cu subtitrare |
| 4 | **Care voci ElevenLabs pentru cele 5 personaje?** (ID-uri sau descrieri: Căpitan grav/robotic, AI cald, Lumină „cor", Natură grav-blând, Tehnologic precis) | `.env` `ELEVENLABS_VOICE_*`; regenerare `npm run tts` | vocile publice implicite din `scripts/tts-generate.mjs` |
| 5 | **Formularea exactă a replicii de lansare:** „Plecăm acasă de la Pământ" (docx) / „Plecăm de acasă, de pe Pământ." (show.json) / „Plecăm de acasă." (Exodus)? | textul se pre-generează; schimbarea cere regenerare | „Plecăm de acasă, de pe Pământ." |
| 6 | **Replicile epilogului (capsula VR) se aud în sală, doar în căștile VR, sau deloc din player?** | faza `epilogue` e opțională; audio-ul poate fi exportat pentru VR | se redau în sală pe ecran alb, la comanda operatorului |
| 7 | **Rețea:** există Wi-Fi dedicat în sală pentru tablete și consolă? Câte tablete, ce sistem/browser? | portul 4321, QR, `bindHost` | router dedicat, 10 tablete Android/iPad cu Chrome/Safari |
| 8 | **Sistemul audio al sălii:** boxele PC-ului master, un mixer, sau boxe pe fiecare TV? Volumul dorit? | `audio.outputDeviceId`, `voiceVolume`, `sfxVolume`; SFX-urile (rumble, ploaie) au nevoie de bas | ieșirea implicită a PC-ului master |
| 9 | **Filmul are 12:21, iar experiența e planificată la 10 min.** Confirmați hold-ul pe Pământ (≈ 5:40) drept timp de trecere în VR, sau tăiem filmul / accelerăm? | structura fazei `play` și `epilogue` | hold; operatorul declanșează epilogul |
| 10 | **Saturn lipsește din film** (era în scriptul SpaceEngine). E în regulă? | scena `saturn` din `show.json` | eliminăm scena, păstrăm un marker |
| 11 | **Planeta Luminii apare în film ca o planetă cu inele în nebuloasă turcoaz** (scenariul o descrie „glob de aur lichid"); Planeta Tehnologiei = planetă întunecată lângă Gargantua. Tema aurie/oțel rămâne? | culorile temei și ale entităților | păstrăm culorile din scenariu |
| 12 | **Ploaia „pe ecranele laterale"** — filmul nu are ploaie. Doar sunet, sau randăm un efect de ploaie pe laterale? | `entity`/overlay nou pe ecranele laterale | doar sunetul `rain` |
| 13 | **Pre-show:** ecranele ar trebui să arate „o stea îndepărtată, respirând" (docx); playerul arată cadrul 0 (Pământ + Calea Lactee). Acceptabil, sau vreți un ecran de așteptare propriu? | `preshow` afișează cadrul 0 | cadrul 0 |
| 14 | **Numărătoarea inversă:** filmul începe cu Pământul deja îndepărtându-se. O facem în `preshow` (înainte de `start`) sau în primele secunde ale filmului? | `launch-countdown.at` | în primele secunde ale filmului (cum e acum) |
| 15 | **Răspunsurile copiilor de pe tablete** se afișează undeva (pe ecran, la final) sau rămân doar în consolă? | UI nou pe `center`/laterale | doar în consolă + `runs/*.jsonl` |
| 16 | **Limbă:** doar română? (tipurile permit `en`/`fr`) | voci de generat, texte în `show.json` | doar `ro` |

---

## 15. Glosar

| Termen | Sens în acest proiect |
|---|---|
| **Cue** | un eveniment din `show.json` (`Cue`): replică (`voice`), numărătoare (`countdown`), efect sonor (`sfx`), entitate (`entity`), interacțiune pe tablete (`tablet`), temă (`theme`), marker informativ (`marker`) |
| **Fază** (`Phase`) | `preshow` (video pe cadrul 0, timer), `play` (video rulează; `at` = `video.currentTime`), `epilogue` (după video, timer) |
| **`phaseTime`** | secunde de la începutul fazei curente; pentru `play` = poziția video |
| **`at`** | momentul (s) din fază la care se declanșează cue-ul |
| **Scenă** (`Scene`) | interval `[start, end)` dintr-o fază, cu o temă și o etichetă; folosită de `skipToScene` și de consolă |
| **Temă** (`SceneTheme`) | paleta de culoare a momentului: `prologue`, `launch`, `light`, `nature`, `tech`, `void`, `home`, `white` |
| **Entitate** | reprezentarea procedurală (canvas) a unei civilizații: LUMINĂ, NATURĂ, TEHNOLOGIC; animată de amplitudinea vocii |
| **Master / Follower** | rolul executabilului: master = rulează serverul și sursa de ceas; follower = alt PC care urmărește masterul prin WS |
| **Sursă de ceas** (`isClockSource`) | ecranul `center` al masterului, al cărui `video.currentTime` este adevărul |
| **Drift** | diferența dintre poziția video a unui ecran și cea a sursei de ceas; corectată prin seek (> 0,25 s) sau `playbackRate` ±3 % |
| **Hold** | perioada de la finalul replicilor revelației până la epilog, în care filmul rămâne pe Pământ (≈ 5:40) |
| **Kiosk** | fereastră fără chenar, fullscreen, pe un anumit ecran (`ScreenConfig.kiosk`) |
| **OSD** | on-screen display: mesaje tehnice pe ecran (id-ul ecranului, „video lipsă", erori) |
| **TalkingHead** | biblioteca `@met4citizen/talkinghead` care animează un avatar GLB (viseme, dispoziții, privire) peste three.js |
| **Viseme (Oculus)** | cele 15 forme ale gurii (`sil PP FF TH DD kk CH SS nn RR aa E I O U`) folosite de TalkingHead pentru lip-sync |
| **ARKit blendshapes** | cele 52 de expresii faciale standard; avatarul le are, TalkingHead le folosește pentru dispoziții |
| **Mixamo** | rigul (scheletul) standard al avatarului; cerut de TalkingHead pentru poze |
| **GLB** | format binar glTF 2.0 pentru modele 3D; `assets/avatar/avatar-ai.glb` |
| **Avaturn** | serviciul cu care a fost generat avatarul („BiologV2.glb") |
| **lipsync-ro** | modulul propriu care mapează cuvinte românești + timpi în viseme |
| **`words/wtimes/wdurations`** | cuvintele unui clip, momentul de început (ms) și durata (ms) fiecăruia; din timestamps ElevenLabs |
| **Manifest de voce** (`VoiceManifest`) | `assets/voice/<lang>/manifest.json`: metadatele tuturor clipurilor pre-generate |
| **TTS** | text-to-speech; ElevenLabs (cu timestamps) sau Gemini (fără) |
| **`speechSynthesis`** | vocea încorporată a browserului/Windows (ro-RO), ultimul fallback |
| **SFX** | efecte sonore sintetizate în Web Audio, fără fișiere |
| **FX per vorbitor** | lanțul de filtre audio aplicat vocii: `hologram`, `clean`, `choir`, `forest`, `crystal` |
| **Transporter / beam-in** | efectul vizual de „teleportare" la apariția avatarului (din Exodus) |
| **Contact sheet / planșă de cadre** | imagine cu cadre eșantionate la interval fix, cu timecode; folosită la aliniere (`media/analysis/*.png`) |
| **HEVC Rext 4:4:4** | profilul „Range Extensions" al H.265 cu crominanță completă; nedecodabil hardware, nu merge în Chromium |
| **NVENC** | encoderul hardware NVIDIA folosit la transcodarea în H.264 |
| **Hono / `ws`** | micro-framework HTTP și biblioteca WebSocket din serverul încorporat |
| **esbuild** | bundlerul TypeScript folosit de `scripts/build.mjs` |
| **electron-builder** | împachetează aplicația în `.exe` portabil + installer |
| **`contextBridge` / preload** | mecanismul Electron prin care renderer-ul primește `window.nava` fără acces la Node |
| **IPC** | comunicarea main ↔ renderer în Electron (`NavaBridge`) |
| **JSONL run-log** | `runs/<data>.jsonl`: un eveniment JSON pe linie, per rulare |
| **QR** | codul afișat în consolă (`/api/qr`) cu URL-ul `/tablet` |
| **SpaceEngine** | simulatorul cu care a fost randat filmul; scriptul de cameră e în `docs/reference/` |
| **Siwarha / Kepler-186 d / Mann / Gargantua** | corpurile din SpaceEngine folosite ca Planeta Luminii / Naturii / Tehnologiei / gaura neagră |
| **Wormhole** | tunelul prin care nava se întoarce (dungi de stele în film) |
| **Unitree** | producătorul roboților umanoizi din sală (Căpitanul + 2 roboți mici) |
| **UCDC HUB AI** | clientul: hub-ul de AI al Universității Creștine „Dimitrie Cantemir", București |
| **EXODUS-7 / EXODUS 01** | numele navei în scenariul acesta / în proiectul-sursă Exodus (portalul de comandă cu ofițerul AI ARIA-7) |
| **Exodus** | proiectul-sursă (`C:\Users\Chris\Documents\GitHub\Exodus`) din care vin avatarul și codul de referință |
| **Orchestrator** | agentul principal care deține `src/shared`, `show.json`, integrarea și commit-urile |
| **Agenții A–D, F** | main+build · renderer · avatar+voce · server+web · documentație (`docs/BRIEF.md` §5) |

---

## 16. CONTINUARE APPEND-ONLY — integrare și finalizare (Codex, 2026-09-04)

> Această secțiune a fost **adăugată la final** la cererea utilizatorului. Conținutul anterior, inclusiv starea istorică din §12, nu a fost rescris. Pentru starea curentă se citesc în ordine toate addendum-urile de la §16 în jos.

### 16.1 Explorare și constatări inițiale

- A fost citit integral acest `HANDOFF.md`, apoi `docs/BRIEF.md`, contractele `src/shared/types.ts`, `src/shared/protocol.ts`, `src/shared/contracts.ts` și scenariul executabil `assets/show/show.json`.
- Repo-ul era pe branch-ul `board/nava-player`, fără niciun commit, iar toate fișierele erau untracked.
- Implementarea existentă era mult mai avansată decât starea istorică din §12, dar integrarea era întreruptă: lipseau `src/renderer/avatar/index.ts`, `src/renderer/voice/index.ts`, `src/server/tts-providers.ts`, `scripts/tts-generate.mjs` și ambele aplicații web din `src/web/`.
- `npm run typecheck` eșua din cauza modulelor lipsă și a celor două câmpuri noi absente din fallback-ul rendererului: `launchLeadInSec` și `epilogueOnVideoEnd`.
- `npm run build` eșua la aceleași importuri și sărea peste consola și aplicația tabletelor.
- S-a confirmat starea reală a show-ului: `0.2.0-aligned`, 8 scene, 53 cue-uri, dintre care 24 voce, 8 teme, 6 entități, 5 SFX, 5 tablete, 4 markere și un countdown.
- S-au confirmat local media H.264 de 2.504.162.463 B, avatarul GLB de 14.302.780 B și planșele de cadre.

### 16.2 Lucru paralel cu agenți

Utilizatorul a autorizat explicit folosirea mai multor agenți. Au fost pornite patru piste de lucru, cu proprietate de fișiere separată:

1. **avatar_voice** — avatar, motor voce, TTS providers și generatorul de voci;
2. **web_apps** — consola operatorului și aplicația tabletelor;
3. **platform_audit** — Electron main/preload, server, build, packaging și smoke tests;
4. **release_qa** — audit independent, fără editări, al produsului integrat.

### 16.3 Renderer: lead-in real la T−10 și epilog automat

- În `src/renderer/index.ts`, show-ul fallback a primit câmpurile obligatorii `launchLeadInSec: 10` și `epilogueOnVideoEnd: false`.
- În `src/renderer/player.ts` s-a reparat integrarea câmpului `launchLeadInSec`. Înainte, serverul pornea la `phaseTime=-10`, dar rendererul pornea imediat filmul la 0. Acum:
  - faza `play` poate avea timp negativ;
  - video-ul rămâne înghețat pe cadrul zero în lead-in;
  - pause/play îngheață și reia countdown-ul negativ;
  - seek la un timp negativ reintră în lead-in;
  - follower-ele urmăresc corect ceasul negativ;
  - filmul începe când ceasul ajunge la zero.
- Citirea vechiului câmp inexistent `autoEpilogue` a fost înlocuită cu contractul real `epilogueOnVideoEnd`.
- Tranziția locală automată spre epilog este întârziată 750 ms după evenimentul video `ended`, astfel încât ecranul-sursă să raporteze mai întâi serverului starea `ended`; serverul rămâne autoritatea și poate difuza simultan comanda `epilogue`. Într-o rulare offline, timeout-ul local păstrează comportamentul automat.
- A fost adăugat `scripts/smoke-core.mjs`, care verifică serverul și rendererul la T−10, filmul înghețat, pauza countdown-ului și pornirea filmului la zero. Testul trece.

### 16.4 Avatar, voce și TTS

Au fost create/completate:

- `src/renderer/avatar/index.ts` — `createAvatarController` cu TalkingHead, încărcare GLB, transporter, Romanian visemes, lip-sync pe un buffer mut sincronizat cu audio-ul real, fallback sintetic, mood/attention/resize/dispose și recuperare după pierderea contextului WebGL;
- `src/renderer/voice/index.ts` — `createVoiceEngine` cu lanț manifest offline → `/api/tts` → `speechSynthesis`, validare/decode/cache audio, efecte per personaj, amplitudine, SFX și ecrane follower mute;
- `src/server/tts-providers.ts` — ElevenLabs cu endpoint de timestamps și Gemini prin schema curentă `v1beta/interactions`, erori sigure când lipsesc cheile, WAV pentru PCM și estimare de timpi;
- `scripts/tts-generate.mjs` — generator reluabil cu `--lang`, `--provider`, `--cue`, `--force`, `--dry-run`, încărcare `.env` fără afișarea secretelor și păstrarea rezultatelor parțiale;
- `assets/voice/{ro,en,fr}/manifest.json` — manifeste offline valide, momentan goale.

În `.env.example` a fost documentat și `GEMINI_TTS_MODEL=gemini-3.1-flash-tts-preview`. Schema API a fost verificată față de documentația oficială curentă ElevenLabs și Google Gemini. `node scripts/tts-generate.mjs --dry-run` găsește toate cele 24 de replici. Nu au fost generate MP3/WAV deoarece nu există chei API; fallback-ul Windows rămâne funcțional.

### 16.5 Consola operatorului și tabletele

Au fost adăugate `index.html`, `styles.css` și `index.ts` în ambele directoare:

- `src/web/control/` — WebSocket cu reconectare și fallback HTTP, toate comenzile protocolului, ceas interpolat și timeline T−10…durată, scene, căutare/filtrare cue-uri, statusuri și fire manual, volume, limbă, QR/URL LAN, starea video/ecranelor/tabletelor, roluri și răspunsuri live;
- `src/web/tablet/` — identitate UUID persistentă, nume/rol, reconectare cu backoff și ping, coadă offline, teme/scene/subtitrări, alegere rol, întrebare, vot, mesaj, mulțumire și reset de sesiune.

Interfețele folosesc numai DOM și `textContent` pentru datele copiilor/serverului; nu a fost introdus un framework sau HTML nesigur.

### 16.6 Platformă, server și build

Auditul platformei a reparat și verificat:

- normalizarea completă a configurației și validarea URL-ului WebSocket;
- blocarea popup-urilor și navigării rendererului Electron;
- reconectarea followerului când constructorul WebSocket eșuează;
- validarea show-ului, rolurilor WS și a handshake-urilor duplicate;
- shutdown bounded și închiderea conexiunilor keep-alive;
- validarea strictă a interacțiunilor tabletelor și resetul sesiunii la restart;
- recomputarea corectă a subtitrării după seek/reload;
- build one-shot care eșuează dacă lipsesc entrypoint-uri sau fișiere runtime, în loc să livreze parțial;
- overwrite sigur pe Windows pentru utilitarele media.

Au fost adăugate `scripts/smoke-platform.mjs` și `scripts/smoke-media.mjs`. Testul de platformă acoperă HTTP, static assets, QR, roluri WS, state machine, tablete și shutdown. Testul media acoperă transcodarea CPU într-un director temporar, overwrite Windows-safe și contact sheet.

### 16.7 Validare show și comanda unică de verificare

- A fost adăugat `scripts/validate-show.mjs`: validează schema de bază, fazele, temele, scenele, suprapunerile, id-urile duplicate, ordinea cue-urilor, limitele lead-in/video, vorbitorii, entitățile și textul românesc.
- În `package.json` au fost adăugate scripturile `validate:show`, `smoke:core`, `smoke:platform`, `smoke:media` și `check`.
- `npm run validate:show` trece pentru 8 scene și 53 cue-uri.
- `npm run typecheck` trece fără erori.
- Build-ul normal și cel minificat trec pentru `main`, `preload`, `renderer`, `web/control` și `web/tablet`.
- `smoke-core`, `smoke-platform` și `smoke-media` trec.

### 16.8 Documentație creată

Au fost adăugate documentele care erau promise în acest handoff, dar lipseau efectiv:

- `README.md` — pornire, verificare, distribuție, configurare și structură;
- `docs/SPEC-SHEET.md` — cerințe funcționale/nefuncționale, configurație, interfețe și acceptanță;
- `docs/SCENARIU.md` — scenariul executabil pe scene și id-uri;
- `docs/CUE-SHEET.md` — tabelul celor 53 de cue-uri și regulile de editare;
- `docs/OPERARE.md` — pregătire, rularea sesiunii, follower, taste și depanare;
- `docs/DECIZII.md` — deciziile arhitecturale consolidate.

### 16.9 Rulare Electron reală

Aplicația a fost pornită în Electron 44.2.0, în mod windowed, pe configurația master reală. Au fost confirmate în log:

- server master pe portul 4321 și URL-ul LAN;
- încărcarea rendererului și conectarea WebSocket a ecranului `center` ca sursă de ceas;
- show-ul `0.2.0-aligned` cu 53 cue-uri;
- metadata filmului real `3840×2052`, `741.78 s`;
- încărcarea cu succes a avatarului GLB (`avatar ready`);
- `/control/` și `/tablet/` răspund HTTP 200;
- `/api/health` raportează `videoReady: true`, un ecran și clock source `center`;
- `start` răspunde la `phaseTime: -10`; timpul avansează negativ, `pause` îl îngheață, apoi s-au verificat seek la revelație, epilog și restart;
- lipsa cheilor face `/api/tts` să răspundă controlat cu fallback, fără crash;
- shutdown-ul serverului și al aplicației este curat.

### 16.10 Packaging și identitate vizuală

- `npm run dist` a produs cu succes:
  - `dist-app/NavaPlayer-0.1.0-x64-portable.exe` — 107.733.306 B;
  - `dist-app/NavaPlayer-0.1.0-x64-setup.exe` — 107.963.481 B.
- Conținutul ASAR include main/preload/renderer/control/tablet, iar `resources` include avatarul, show-ul, manifestele vocale și exemplul de config. Filmul mare rămâne intenționat extern.
- Packaging-ul a avertizat că lipsește iconul produsului. Pentru a elimina aspectul generic a fost generat un mark Nava/EXODUS-7 (fereastră de navă, Pământ și stea de navigație, cyan pe navy, fără text), salvat ca `build/icon.png` și convertit în `build/icon.ico` pentru Windows. Artifactele trebuie reconstruite după integrarea tuturor remedierilor finale.

### 16.11 Problemă găsită de auditul independent — în curs de remediere

Auditul `release_qa` a reprodus o problemă de fază pe follower: după terminarea epilogului, starea serverului `ended` era interpretată de `Player.follow()` ca sfârșit al fazei `play`, ceea ce putea muta followerul de la alb/epilog înapoi la ultimul cadru al filmului/tema `home`. Cauza este că `Player.phase()` asociază istoric orice `ended` cu `play`. Remedierea planificată este păstrarea explicită a fazei active (`play` sau `epilogue`) prin starea `ended`, plus un test de regresie. Starea finală a acestei remedieri va fi **adăugată** într-un addendum ulterior, fără rescrierea acestei secțiuni.

---

## 17. ADDENDUM FINAL APPEND-ONLY — remediere, QA și livrare (Codex, 2026-09-04)

> Această secțiune a fost adăugată după §16. Nicio secțiune anterioară din `HANDOFF.md` nu a fost rescrisă sau ștearsă.

### 17.1 Remedierea fazei `ended`

- `src/renderer/player.ts` păstrează acum separat faza activă în `phaseMode`, deoarece `PlaybackState="ended"` poate reprezenta fie finalul filmului, fie finalul epilogului.
- Toate tranzițiile setează explicit faza: `idle → null`, `preshow`, `play`, respectiv `epilogue`.
- `phase()` și `phaseTime()` nu mai deduc greșit faza exclusiv din `PlaybackState`.
- La `follow("ended", ...)`, un follower aflat deja în epilog oprește ceasul, se aliniază la timpul autoritar și păstrează timeline-ul și tema epilogului; nu mai repornește și nu mai caută filmul.
- Pentru un follower nou conectat direct într-o stare `ended`, faza este inferată prin apropierea timpului autoritar de capătul epilogului sau de durata filmului. O fază locală deja stabilită are întotdeauna prioritate.
- Pe calea finalului de film sunt oprite video-ul și timerul de auto-epilog, iar seek-ul mare actualizează împreună video-ul și timeline-ul.
- `scripts/smoke-core.mjs` conține testul de regresie complet: intrare în epilog, temă `white`, recepție `ended` la 120 s, fază păstrată `epilogue` și zero apeluri noi către `video.play()`.
- Testul țintit `npm run smoke:core` trece.
- Remedierea a fost salvată în commit-ul `ab3941b` — `fix: preserve epilogue phase after playback ends`.

### 17.2 Verificarea finală

După remediere s-a rulat din nou `npm run check`; toate etapele sunt verzi:

1. `tsc --noEmit`;
2. validarea show-ului: 8 scene, 53 cue-uri;
3. build pentru main, preload, renderer, control și tablet;
4. `smoke-core`, inclusiv regresia ended/epilog;
5. `smoke-platform`: HTTP, static, QR, WS, state machine, tablete și shutdown;
6. `smoke-media`: transcodare CPU, overwrite sigur pe Windows și contact sheet.

Agentul independent `release_qa` a reinspectat remedierea și a rulat separat aceeași suită. Verdictul lui: **verde, fără regresii sau blocante de cod**.

### 17.3 Reîmpachetarea Windows

- Prima reîncercare `npm run dist` după adăugarea iconului a eșuat cu `EPERM` la ștergerea `dist-app/win-unpacked/d3dcompiler_47.dll`.
- Cauza verificată a fost existența a patru procese `NavaPlayer.exe` care rulau din pachetul vechi și țineau DLL-ul deschis.
- Au fost închise numai procesele `NavaPlayer` cu calea exactă din `C:\Users\Chris\Documents\GitHub\Nava\dist-app\win-unpacked`; după confirmarea ieșirii lor, împachetarea a fost reluată.
- A doua rulare `npm run dist` a terminat cu exit code 0, fără avertismentul anterior despre icon generic.
- Artifactele finale, reconstruite după remedierea `ended`, sunt:
  - `dist-app/NavaPlayer-0.1.0-x64-portable.exe` — 108.042.526 B — SHA-256 `D6C3D1A81604FD3BF88C7C3ED6784C19E39C6EAD0D35D3CBEDEE7D3F8C8397A6`;
  - `dist-app/NavaPlayer-0.1.0-x64-setup.exe` — 108.336.891 B — SHA-256 `4BA6C0A8277AAC3BC8F5B101969A14BEA05CF28AB6C06988A0C181836FE5EF25`.
- Ambele executabile au fost verificate cu `Get-AuthenticodeSignature`: starea este `NotSigned`. Pentru distribuție publică fără avertismente SmartScreen va fi necesar ulterior un certificat de code-signing; acest lucru nu împiedică rularea locală în instalația dedicată.

### 17.4 Starea de livrare și limite externe

Codul, configurația exemplu, show-ul, avatarul, aplicațiile web, documentația, testele și pachetele Windows sunt finalizate. Rămân numai activități dependente de resurse sau de mediul fizic, nu lucrări de implementare:

- manifestele de voce sunt valide, dar goale; lipsesc cheile ElevenLabs/Gemini și aprobarea vocilor, deci în prezent se folosește fallback-ul `speechSynthesis`;
- este necesară repetiția de acceptanță pe hardware-ul real: cinci ieșiri video, routing audio, router dedicat și tablete;
- serverul de control nu are autentificare. Configurația este acceptabilă numai pe LAN privat/dedicat; pe Wi-Fi partajat, autentificarea/PIN-ul din lista istorică de TODO devine obligatoriu înainte de utilizare;
- executabilele nu au semnătură Authenticode, conform verificării de mai sus.

---

## 18. ADDENDUM APPEND-ONLY — scenariul regizoral de 10 minute (Codex, 2026-09-04)

> Această secțiune a fost adăugată la final. Nicio secțiune anterioară din `HANDOFF.md` nu a fost rescrisă sau ștearsă.

### 18.1 Consultanții creați

La cererea utilizatorului au fost creați trei agenți consultanți, fiecare lucrând independent și fără să editeze fișiere:

1. `scenarist` — structură dramatică, personaje, replici și cronometrare;
2. `regizor_film` — potrivirea cu montajul și imaginile reale, ritm, muzică și SFX;
3. `expert_copii` — limbaj, siguranță fizică și emoțională, incluziune, interacțiuni și operarea grupului.

Fiecare a citit documentele proiectului și show-ul executabil. După prima sinteză, toți trei au citit și auditat noul scenariu. Observațiile lor au fost integrate, iar versiunea corectată a fost trimisă încă o dată tuturor. Verdicturile finale au fost `VERDE`, `VERDE CA SCENARIU`, respectiv `VERDE`.

### 18.2 Constatarea comună de durată

- Cerința din brief este o experiență de 10:00.
- Configurația actuală, rulată integral, durează 15:31,78: 60 s pre-show + 10 s lead-in + 741,78 s film + 120 s epilog.
- Chiar dacă epilogul este declanșat după ultima replică, la video aproximativ 465 s, durata este aproximativ 10:55 cu structura actuală.
- Ultimele 276,78 s ale filmului după secunda 465 sunt aproape integral un hold pe Pământ. Nu sunt necesare pentru arcul principal.
- Consensul a fost construirea unui master regizoral de exact 600 s, care folosește filmul numai până la secunda 465 și pornește apoi epilogul.

### 18.3 Fișierul nou și structura lui

A fost creat `docs/SCENARIU-REGIZORAL-10-MIN.md`. Este primul livrabil de conținut, pentru aprobare, și nu schimbă încă `assets/show/show.json` sau codul aplicației.

Contractul temporal este:

| Timp public | Conținut | Durată |
|---|---|---:|
| 0:00–0:50 | activarea echipajului | 0:50 |
| 0:50–1:00 | countdown T−10 | 0:10 |
| 1:00–8:45 | film video 0–465 s | 7:45 |
| 8:45–9:55 | epilog / re-entry simbolic | 1:10 |
| 9:55–10:00 | alb cald și tăcere | 0:05 |

Suma a fost verificată automat: 600 s. Documentul are 28 de replici, 389 de cuvinte și aproximativ 180 s de vorbire la 130 de cuvinte/minut; circa 70% din spectacol rămâne pentru imagine, sound design, reacții și pauze.

### 18.4 Deciziile dramaturgice și de public

- Firul central este explicit la început și revine în revelație: echipajul caută alte lumi și se întreabă dacă suntem singuri.
- Copiii sunt echipaj, nu „selectați”; participarea și rolurile sunt opționale, iar statutul de observator este la fel de valid.
- Indicația „țineți-vă respirația” a fost eliminată. Instrucțiunile corporale nu presupun picioare pe podea, scaun cu spătar sau o anumită mobilitate.
- Există două semnale echivalente pentru oprire: copilul spune „pauză” sau face semn. Un facilitator dedicat stă lângă ieșire și vede toate cele zece locuri.
- Traseul low-sensory este operaționalizat: loc în grup aproape de ieșire, protecție auditivă, fără cască/efect fizic, însoțire discretă și revenire într-un moment vizual stabil.
- Singura interacțiune pe tabletă în timpul filmului este un vot printr-o atingere, cu cinci opțiuni și „Trec mai departe”. Nu există răspuns corect, clasament sau confirmări sonore în sală.
- Tabletele rămân întunecate în revelația Pământului. Copilul alege în gând ceva de ocrotit; nu este obligat să tasteze sau să vorbească.
- Formulările anxiogene, moralizatoare sau absolute din versiunea inițială au fost reformulate: nu se mai folosesc „cine minte se stinge”, „au învins moartea”, „nimic nu te mai doare” sau garanția „sunteți în siguranță”.
- Responsabilitatea pentru Pământ este colectivă, nu pusă pe umerii copilului.

### 18.5 Deciziile de imagine și sunet

- Scenariul descrie numai ce există în film: Pământul, Siwarha cu inele în mediul turcoaz, Kepler-186 d albastră cu nori, Mann lângă discul Gargantua, wormhole și Pământul-semiiună de la final.
- Nu mai pretinde că filmul arată păduri, râuri, orașe de cristal, țări, ferestre sau Saturn. Metaforele pot aparține vocilor și entităților, dar nu indicațiilor de cadru.
- Re-entry-ul vizual nu este pretins ca material existent; epilogul poate rula pe alb în sală sau într-un conținut VR separat, confirmat ulterior.
- Partitura cere o ambianță continuă, ducking cu aproximativ 8–10 dB sub voce și trei tăceri deliberate: după dispariția Pământului, după Natură și după întrebarea Tehnologică.
- Rumble-ul este anticipat prin puls, ploaia nu acoperă vocea, swell-ul coboară înaintea revelației și nu există stroboscop.

### 18.6 Cerințe înainte de implementare

Acestea sunt menționate în scenariu și nu au fost implementate în această etapă, deoarece utilizatorul a cerut mai întâi scriptul:

1. tranziția automată la epilog la video 465 s — aplicația actuală așteaptă finalul real de la 741,78 s, iar un marker nu poate schimba faza;
2. repoziționarea/redimensionarea entităților, care pot acoperi acum planeta din centrul cadrului;
3. producerea ambianței continue și implementarea ducking-ului automat al efectelor;
4. adaptarea votului de pe tabletă la opțiunile și regulile scenariului;
5. alegerea operațională pentru VR: echipament deja pregătit și utilizare simultană sau extensie post-show. Mutarea și echiparea a zece copii nu pot fi comprimate în 75 s în siguranță.

### 18.7 Verificări efectuate

- suma celor zece segmente temporale: 600 s exact;
- conversia dintre timpul public și video: corectă pentru intervalul video 0–465 s;
- estimarea dialogului: 389 de cuvinte, aproximativ 180 s la 130 cuvinte/minut;
- `git diff --check` pentru document: fără erori de whitespace;
- audit final separat al tuturor celor trei consultanți: verde.

### 18.8 Erată append-only

În §18.5, forma `semiiună` este o eroare de tastare; se citește `semilună`. Corecția este adăugată aici, fără modificarea textului anterior.

---

## 19. ADDENDUM APPEND-ONLY — reconstrucția creativă „Protocolul Acasă” (Codex, 2026-09-04)

> Această secțiune este adăugată la final. Nicio secțiune anterioară, inclusiv scenariul de lucru descris în §18, nu a fost rescrisă. Pentru direcția creativă actuală, §19 înlocuiește concluziile artistice din §18 fără să le șteargă din istoricul proiectului.

### 19.1 Motivul reconstrucției

Utilizatorul a respins explicit prima versiune de zece minute ca fiind prea simplă și a cerut creativitate totală, un scenariu mult mai bun și mai complex. Diagnosticul acceptat a fost că versiunea anterioară funcționa ca un tur ghidat, corect și sigur, dar nu avea suficient mister, cauzalitate, transformare de personaj sau un rol indispensabil pentru public.

Cei trei consultanți `scenarist`, `regizor_film` și `expert_copii` au primit un nou mandat: reconcepere de la zero, nu cosmetizare. Au propus independent motor dramatic, structură vizual-sonoră, participare cu payoff și limite de siguranță. Agentul principal a sintetizat ideile, a scris versiunea 2 integrală și a trecut-o prin trei runde de audit dur. Fiecare problemă raportată a fost corectată înainte de verdictul final.

### 19.2 Conceptul nou

Titlul complet este **„A PATRA LUME — PROTOCOLUL ACASĂ”**. Misterul central este **Semnalul fără adresă**:

- EXODUS-7 primește înaintea misiunii un mesaj spart în zece fragmente: `GĂSIȚI A PATRA LUME`;
- cele zece fragmente corespund celor zece stații ale copiilor;
- Lumina dă semnalului o culoare;
- Natura îi dă un ritm;
- Tehnologica îi dă cele zece perspective pe care nu le poate reduce la un singur răspuns;
- în wormhole se descoperă clar că mesajul a călătorit înapoi în timp și a ajuns înainte de a fi trimis;
- la apariția Pământului, echipajul înțelege că el este chiar expeditorul;
- la 8:39 Avatarul reatașează explicit mesajul inițial, iar la 8:43 Căpitanul spune `Trimite`; aceasta este singura transmisie și închide cauzal bucla;
- a patra lume nu este o planetă necunoscută, ci prima lume pe care echipajul a învățat s-o privească din nou.

### 19.3 Complexitatea reală adăugată

- Un inel periferic cu patru arce și un motiv muzical de patru note acumulează memoria călătoriei. Al patrulea arc și ultima notă apar numai la Pământ.
- Fiecare dintre cele zece roluri primește automat o lentilă narativă distinctă: direcție, energie, undă, puls, anomalie, traseu, coerență, viață, traiectorie sau memorie. Rolul are payoff fără a adăuga sarcini.
- Există trei interacțiuni scurte: culoare, puls paralel și o alegere despre ce păstrează o lume vie. Toate au `Doar observ`, timeout și fallback complet.
- Replica Tehnologicei este adaptivă pentru trei situații reale: alegeri diverse, o singură alegere sau numai observație. Scenariul nu pretinde un rezultat care nu s-a produs.
- Tehnologica anticipează comic replica `Scanați sursa`; Căpitanul o rostește, iar ea răspunde sec `Știm`.
- Căpitanul are acum un arc complet: protocol → observație → îndoială → alegere → apartenență. Punctul lui de transformare este `Atunci sunt autentice`, iar în wormhole înțelege înaintea sistemului: `Atunci noi suntem expeditorul`.
- Climaxul elimină HUD-ul și lasă Pământul neacoperit. Efectul final este o diagramă schematică ce părăsește cadrul, nu un wormhole fotorealist inventat peste film.

### 19.4 Textul Căpitanului

Noul scenariu conține 17 intervenții ale Căpitanului și o anexă separată `TEXTUL INTEGRAL AL CĂPITANULUI`, pentru actor, TTS sau programarea robotului. Textul din anexă a fost comparat automat cu replicile din scenariul principal și este identic, inclusiv timecode-urile.

Indicația de interpretare este că nu joacă un robot fără emoție, ci o ființă care și-a organizat emoția sub forma disciplinei. Căldura apare prin pauze, volum și direcția privirii, nu printr-o schimbare bruscă de voce.

### 19.5 Corecțiile rezultate din audit

Auditurile succesive au reparat:

- două transmisii contradictorii ale semnalului — a rămas una singură, la 8:43;
- lipsa mesajului `GĂSIȚI A PATRA LUME` din semnalul final;
- confuzia dintre punctul de origine și momentul transmiterii;
- formulări care presupuneau zece răspunsuri diferite chiar dacă publicul nu participa;
- afirmația falsă că o mașină nu poate reproduce semnătura; ideea actuală este că mașina nu putea **alege** semnătura în locul copiilor;
- o explicație prea abstractă a buclei temporale; textul spune acum direct că semnalul a trecut prin wormhole înapoi în timp și a ajuns înainte să fie trimis;
- promisiunea falsă că rolurile văd lucruri diferite, prin definirea lentilelor lor automate;
- trei coliziuni de voce și un whoosh prea apropiat de dialog;
- un trigger sonor rămas legat de cuvântul eliminat `far`; acum primul arc se aprinde pe `adâncime`;
- lipsa instrucțiunii finale de a rămâne pe loc până la aprinderea luminilor și indicația facilitatorului;
- formulări care amenințau involuntar, invadau intimitatea emoțională sau transformau finalul într-o lecție morală.

### 19.6 Verificări finale

- contract temporal: 600 s exact;
- film: video 0–465 s, cu offset public constant de +60 s, aliniat pe toate corpurile și tranzițiile reale;
- 48 de intervenții vocale în scenariul principal, 477 de cuvinte;
- 17 replici ale Căpitanului, cu anexă verificată automat ca identică;
- verificare la o rostire lentă de 120 cuvinte/minut plus minimum 1 s buffer: zero coliziuni între ferestrele vocale;
- `git diff --check`: fără erori de whitespace;
- verdict final `VERDE` de la scenarist;
- verdict final `VERDE CA SCENARIU` de la regizorul de film;
- verdict final `VERDE` de la expertul pentru copii.

### 19.7 Fișierul autoritativ pentru etapa creativă

Scenariul curent este `docs/SCENARIU-REGIZORAL-10-MIN.md`, versiunea 2. `assets/show/show.json` și codul aplicației nu au fost încă schimbate după această versiune, deoarece utilizatorul a cerut mai întâi scenariul. Cerințele de producție și implementare sunt enumerate la finalul documentului.

---

## 20. ADDENDUM APPEND-ONLY — cinci posturi, continuitate și Căpitan exclusiv GLB (Codex, 2026-09-04)

> Această secțiune a fost adăugată la final. Nicio secțiune anterioară din `HANDOFF.md` nu a fost rescrisă sau ștearsă. Pentru configurația fizică actualizată, §20 înlocuiește informațiile de producție incompatibile din §18–§19 fără a le elimina din istoric.

### 20.1 Corecțiile cerute

Utilizatorul a precizat trei date de producție care devin autoritative:

1. instalația are **cinci posturi și cinci tablete**, nu zece posturi/tablete;
2. experiența este una continuă, fără mutarea publicului, schimbarea echipamentului sau un modul separat perceput la 8:45;
3. Căpitanul este exclusiv personajul GLB din fereastra lui de pe ecran și nu are nicio prezență fizică în sală.

Cei zece copii din brief au fost păstrați ca cinci perechi egale, câte una la fiecare post. Conceptul rezultat este `5 posturi × 2 urme = 10 contribuții`, fără lider, ajutor sau consens obligatoriu în pereche.

### 20.2 Adaptarea dramaturgică

`docs/SCENARIU-REGIZORAL-10-MIN.md` a fost actualizat la versiunea 3:

- semnalul conține cinci fragmente, câte unul pentru fiecare post;
- fiecare fragment și sigiliu păstrează două urme egale, câte una pentru fiecare copil din pereche;
- există cinci lentile cauzale: NAVIGAȚIE, PROPULSIE, COMUNICAȚII, BIOSEMNALE și MEMORIE;
- rolurile nu sunt decorative: Comunicațiile reconstruiesc mesajul, Navigația confirmă direcția și originea, Biosemnalele autentifică urma vie, Propulsia confirmă coerența undei, iar Memoria descoperă anomalia temporală;
- cele cinci sigilii se curbează la Pământ și închid vizibil al patrulea arc; apoi se deschid în zece trasee luminoase egale;
- replica Căpitanului de la 5:01 este acum `Cinci posturi. Zece urme. Un singur echipaj.`;
- toate referințele narative la zece fragmente, zece stații sau zece tablete au fost eliminate.

### 20.3 Mecanica celor cinci tablete

Fiecare tabletă landscape este fixată între cei doi copii și are două zone egale. Fiecare copil poate atinge sau observa independent, iar răspunsurile pot fi identice sau diferite. Lentilele aparțin postului, nu exclusiv unui copil, pentru ca adultul să nu fie obligat să arbitreze rolurile.

Cele trei interacțiuni păstrează timpul fix și au fallback complet. La expirare, tableta cere ridicarea privirii și povestea continuă fără confirmare `5/5`, loading sau intervenție de operator. Dacă un dispozitiv se deconectează, perechea rămâne în poveste ca observator.

Cerințele de producție adăugate sunt: ținte de minimum 56 × 56 CSS px, spațiu de minimum 8 px, etichetă plus simbol, contrast verificat și cel puțin un suport reglabil ca înălțime și unghi. Dacă opțiunile nu încap, cele două jumătăți sunt prezentate succesiv; țintele nu sunt micșorate. Pentru traseul low-sensory, vibrația se reduce global la cerere dacă instalația nu o poate izola fizic pe un singur post.

### 20.4 Topologia ecranelor și Căpitanul

Scenariul definește o singură compoziție globală decupată pe cinci ecrane, nu cinci copii identice. Topologia logică este `left-outer`, `left-inner`, `center`, `right-inner`, `right-outer`, asociată în ordine celor cinci posturi.

Ecranul `center`, pe care configurația exemplu redă deja GLB-ul, conține unica fereastră a Căpitanului. Celelalte patru renderere trebuie să aibă `showAvatar: false` și să nu instanțieze modelul. Avatarul navei a devenit numai voce și HUD, fără al doilea corp umanoid; civilizațiile rămân forme non-umanoide. Indicațiile de robot fizic au fost înlocuite cu cue-uri realizabile de privire, cap, clipit, respirație, expresie, lip-sync și cadraj GLB.

### 20.5 Continuitatea de la 8:45

Eticheta tehnică `epilogue` nu mai reprezintă o schimbare vizibilă de experiență. La 8:45:

- publicul rămâne la aceleași cinci posturi, cu aceleași ecrane și tablete;
- ultimul cadru al Pământului persistă peste schimbarea fazei;
- marginea albastră se extinde continuu într-un alb cald;
- nota a patra și ambianța se suprapun fără oprire;
- HUD-ul și sigiliile se transformă, fără ramă neagră sau reset vizibil;
- tabletele pulsează automat și nu solicită o nouă acțiune;
- Căpitanul reapare numai în aceeași fereastră GLB pentru jurnal și încheiere.

Orice referire la VR, căști sau mutarea copiilor în timpul celor zece minute a fost eliminată din versiunea curentă a scenariului.

### 20.6 Audit și verificări

Cei trei consultanți existenți au fost reactivați și au auditat independent versiunea 3:

- `scenarist`: **VERDE** după ce cele cinci lentile au primit funcții cauzale și al patrulea arc a primit payoff vizual;
- `regizor_film`: **VERDE CA SCENARIU** după fixarea topologiei celor cinci ecrane și a rendererului GLB unic;
- `expert_copii`: **VERDE** după corectarea regulii de pereche, a ramurii adaptive, a accesibilității tactile și a vibrației low-sensory.

Verificările automate finale pentru document:

- durată totală: 600 s exact;
- 48 de replici și 475 de cuvinte;
- 17 intervenții ale Căpitanului;
- anexa Căpitanului este identică cu textul din scenariul principal, inclusiv timecode-urile;
- zero coliziuni la 120 cuvinte/minut plus minimum 1 s buffer;
- `git diff --check` fără erori de whitespace.

### 20.7 Limită de etapă

Această schimbare finalizează **scenariul**, nu implementarea lui în player. `assets/show/show.json`, interfața tabletelor și configurația efectivă cu cinci ecrane nu au fost încă rescrise după versiunea 3. Lista exactă a cue-urilor și cerințelor necesare implementării se află la finalul scenariului.

---

## 21. ADDENDUM APPEND-ONLY — vocile expresive V3 pentru Căpitan și Avatarul Navei (Codex, 2026-09-04)

> Această secțiune a fost adăugată la final. Nicio secțiune anterioară din `HANDOFF.md` nu a fost rescrisă sau ștearsă.

### 21.1 Rezultatul livrat

Au fost generate toate cele **35 de intervenții vocale** Căpitan/Avatar din scenariul regizoral V3:

- 17 fișiere pentru `CAPITANUL`, cu vocea profesională română „Paul Bogorin” furnizată de utilizator;
- 18 fișiere pentru `AVATAR_AI`, cu vocea profesională română „AGEIS-7 - AI Alignment == 4/10” furnizată de utilizator;
- 354 de cuvinte vorbite în total: 138 Căpitanul și 216 Avatarul Navei;
- MP3 mono, 44,1 kHz, 192 kbps, cu timpi de cuvinte pentru lip-sync în `assets/voice/ro/manifest.json`;
- durată vocală cumulată în manifest: 210,84 s.

Cheia API transmisă de utilizator a fost injectată numai în mediul proceselor de generare și QA. Nu a fost scrisă în `.env`, cod, manifest, documentație sau Git. O scanare finală după un marker intern al cheii a confirmat absența ei din proiect.

### 21.2 Sursa vocală și interpretarea

A fost creat `assets/show/voice-script-v3.json`, sursa deterministă pentru cele 35 de cue-uri. Fiecare cue conține:

- speaker, fază, timp public și timp intern de player;
- text românesc identic cu scenariul;
- direcție actoricească în limbaj natural;
- maximum de durată admis;
- ID de voce, model, seed și setări de interpretare;
- taguri expresive precum `thoughtful`, `warmly`, `whispers`, `precise`, `reassuring` sau `authoritative`, acolo unde modelul le suportă.

Modelul principal este `eleven_v3`, ales pentru controlul prin taguri audio, punctuație și inflexiuni. O singură replică foarte strânsă temporal, `v3-ai-0035`, folosește `eleven_multilingual_v2` cu parametri proprii de stabilitate, stil și viteză. Generatorul nu introduce tagurile în timpii de lip-sync și nu le lasă să fie citite ca text.

### 21.3 Generatorul și controlul ferestrelor temporale

`src/server/tts-providers.ts` acceptă acum control vocal per cue: `voiceId`, `modelId`, taguri audio, setări de voce, seed și format de ieșire. `scripts/tts-generate.mjs` acceptă `--source <json>`, include toate controalele în cheia de generație și salvează proveniența completă în manifest.

Dacă o interpretare expresivă depășește fereastra fixă, generatorul aplică automat `ffmpeg atempo`, recalculează timpii cuvintelor și notează factorul în `postprocessTempo`. Această protecție a fost necesară pentru patru cue-uri: `v3-ai-0035`, `v3-cap-0604`, `v3-ai-0651` și `v3-ai-0718`. Niciunul dintre cele 35 de fișiere finale nu depășește fereastra lui.

### 21.4 Corecția regizorală de la 1:09

Primul audit de film a blocat replica Căpitanului de la 1:09: versiunea inițială dura 8,40 s, dar avea aproximativ 153 cuvinte/minut, mai rapid decât prologul de aproximativ 110 cuvinte/minut, deși indicația cerea o rostire mai lentă și contemplativă. Fereastra de 15 s ar fi permis și intrarea peste dispariția Pământului și tăcerea de la 1:20.

Replica a fost rescrisă în scenariul principal, în anexa Căpitanului și în sursa vocală ca:

> Pământul se îndepărtează. Păstrați-i imaginea. Când îl vom revedea, noi vom fi alții.

Fereastra maximă a devenit 10,8 s, iar interpretarea regenerată durează 7,36 s, aproximativ 106 cuvinte/minut. Se termină la aproximativ 1:16,36 și lasă peste trei secunde curate înainte de momentul de la 1:20. După această corecție, regizorul a dat verdictul `VERDE`. Scenariul principal are acum 48 de replici și 467 de cuvinte.

### 21.5 Proprietatea corpului și lip-sync-ul

Contractul runtime a fost corectat pentru cerința fizică actuală:

- `CAPITANUL` este singurul speaker cu `lipsyncAvatar: true` și vorbește prin personajul GLB de pe ecranul central;
- `AVATAR_AI` este vocea și HUD-ul navei, cu `lipsyncAvatar: false`, fără corp umanoid;
- comanda de test din player folosește acum Căpitanul și o replică dedicată lui;
- aceeași decizie este consemnată în `docs/DECIZII.md` și în comentariile contractului `src/shared/types.ts`.

### 21.6 Instrumente de verificare și audiție

Au fost adăugate:

- `scripts/validate-voice-script.mjs`: compară automat textul, ordinea, speakerul, timecode-ul și faza tuturor cue-urilor cu scenariul V3; verifică fișierele, ferestrele și absența tagurilor din lip-sync;
- `scripts/build-voice-reels.mjs`: construiește două montaje cu pauze de 0,75 s între replici;
- `scripts/qa-voice-transcription.mjs`: retranscrie montajele cu ElevenLabs Scribe v2 și măsoară WER, fără a salva cheia;
- comenzile npm `validate:voices`, `voice:reels` și `qa:voices`; `validate:voices` face parte acum din `npm run check`;
- instrucțiuni de regenerare și audiție în `README.md`.

Montajele rezultate sunt:

- `assets/voice/ro/preview-capitan-v3.mp3`: 17 replici, 92,93 s;
- `assets/voice/ro/preview-avatar-v3.mp3`: 18 replici, 145,09 s.

QA-ul final de retranscriere a identificat româna (`ron`) și a obținut WER 2,9% pentru Căpitan și 6,5% pentru Avatar, mult sub pragul automat de 18%. Niciun tag actoricesc în limba engleză nu a fost rostit.

### 21.7 Audit și verificări finale

Verdictele consultanților după generare și corecție:

- `scenarist`: **VERDE** pentru concordanța integrală dintre scenariu, sursa vocală și manifest;
- `regizor_film`: a identificat blocajul de la 1:09, apoi **VERDE** după rescriere și regenerare;
- `expert_copii`: **VERDE** pentru ton, claritate, ritm și siguranța ferestrelor.

Verificări tehnice finale:

- `npm run check`: trecut integral — TypeScript, show existent, cele 35 de voci V3, build și toate cele trei smoke tests;
- `npm run validate:voices`: 35/35 cue-uri identice cu scenariul, 17 Căpitan și 18 Avatar;
- `npm run qa:voices`: trecut pentru ambele montaje;
- `git diff --check`: fără erori de whitespace;
- toate fișierele audio sunt ne-goale și se încadrează în durata maximă alocată;
- markerul cheii API lipsește din fișierele proiectului.

### 21.8 Limită de integrare rămasă

Vocile V3, manifestul și timpii de lip-sync sunt finalizate și pregătite pentru player, dar nu au fost amestecate în `assets/show/show.json`, care execută încă vechea versiune de scenariu. `voice-script-v3.json` rămâne intenționat separat până când cue-urile vizuale, interactive și vocale ale întregului scenariu V3 sunt migrate împreună; astfel aplicația nu redă simultan două versiuni incompatibile ale poveștii.

---

## 22. ADDENDUM APPEND-ONLY — fișă completă de preluare pentru următorul agent (Codex, 2026-09-04)

> Această secțiune a fost adăugată la final la cererea expresă a utilizatorului, pentru ca un agent ulterior, inclusiv Fable 5.1, să poată continua fără reconstrucția contextului. Nicio secțiune anterioară din `HANDOFF.md` nu a fost rescrisă sau ștearsă. Cheia API nu este reprodusă aici, chiar dacă utilizatorul a permis folosirea ei, deoarece nu este necesară preluării și este un secret temporar.

### 22.1 Starea Git exactă la predare

- repository: `C:\Users\Chris\Documents\GitHub\Nava`;
- branch: `board/nava-player`;
- commit de scenariu V3 și configurație cu cinci posturi: `f742047 docs: adapt screenplay to five continuous stations`;
- commit cu toate vocile, generatorul, validările și §21: `b09e747 feat: generate expressive V3 character voices`;
- înainte de acest addendum, working tree-ul era curat;
- acest §22 trebuie comis separat după verificare.

### 22.2 Ordinea autorității — important pentru a nu reveni accidental la o versiune veche

La continuare, adevărul curent trebuie citit în ordinea următoare:

1. cerințele utilizatorului consemnate în §20: cinci posturi, cinci tablete, zece copii în cinci perechi, experiență continuă, Căpitan numai GLB pe ecranul central;
2. `docs/SCENARIU-REGIZORAL-10-MIN.md`, versiunea 3, inclusiv corecția replicii de la 1:09;
3. `assets/show/voice-script-v3.json` pentru cele 35 de cue-uri vocale Căpitan/Avatar;
4. `assets/voice/ro/manifest.json` pentru fișierele generate și alinierea pe cuvinte;
5. `assets/show/show.json` este încă implementarea executabilă **veche** și nu trebuie folosit ca sursă creativă pentru rescrierea V3.

Secțiunile mai vechi din `HANDOFF.md` au fost păstrate ca istoric, conform ordinului append-only. Dacă se contrazic cu §20–§22, prevalează addendumurile mai noi.

### 22.3 Ce a fost făcut în etapa de scenariu

Au fost folosiți trei consultanți separați: `scenarist`, `regizor_film` și `expert_copii`. Scenariul a fost reconstruit ca `Protocolul Acasă`, pe exact 10:00, apoi adaptat după clarificările utilizatorului:

- cinci posturi fizice și cinci tablete, fiecare post folosit de o pereche;
- două urme egale per post, fără lider impus și fără consens obligatoriu;
- cele cinci lentile funcționale NAVIGAȚIE, PROPULSIE, COMUNICAȚII, BIOSEMNALE și MEMORIE;
- o singură experiență fără mutarea copiilor, schimbarea dispozitivelor, căști sau VR;
- continuitate vizuală și sonoră peste limita tehnică `play`/`epilogue` de la 8:45;
- Căpitanul există numai ca GLB pe ecranul central, niciodată ca robot/actor în sală;
- Avatarul Navei este numai voce și HUD, fără al doilea corp umanoid;
- 48 de replici în scenariul complet, dintre care 17 ale Căpitanului;
- anexa `TEXTUL INTEGRAL AL CĂPITANULUI` este foaia de interpretare și trebuie să rămână identică cu replicile din corpul scenariului;
- după corecția vocală de la 1:09, scenariul are 467 de cuvinte vorbite.

### 22.4 Ce a fost făcut în etapa de voce

Utilizatorul a furnizat două ID-uri ElevenLabs:

- `Z1I8XGyUmANP9h72LN2z` — Căpitanul, vocea „Paul Bogorin”;
- `Q8ZbQAANLFvLw8uPBR8d` — Avatarul Navei, vocea „AGEIS-7”.

Metadatele vocilor au fost verificate prin API: ambele sunt voci profesionale verificate pentru limba română. Modelul expresiv principal este `eleven_v3`. S-a confirmat practic faptul că:

- v3 acceptă taguri audio în text și întoarce alignment de caractere;
- tagurile apar în alignment-ul brut, deci adaptorul trebuie să le elimine explicit din lista cuvintelor de lip-sync;
- v3 nu acceptă `use_pvc_as_ivc`; încercarea cu această opțiune a întors HTTP 400, iar opțiunea a fost eliminată;
- pauzele și ritmul pentru v3 se dirijează prin taguri, punctuație și structurarea textului, nu prin SSML break;
- `v3-ai-0035` a fost mai sigur temporal cu `eleven_multilingual_v2`, fără taguri, cu speed 1.2 și setări proprii.

Cheia API a fost pusă doar în `ELEVENLABS_API_KEY` pentru procesele care au făcut generare și retranscriere. Nu există `.env` creat pentru ea și nu a fost introdusă în istoricul Git.

### 22.5 Inventarul complet al cue-urilor generate

Coloanele sunt: ID, timpul public, faza/timpul intern, speaker, durata finală/fereastra maximă, model, factor `atempo`. Valoarea `—` înseamnă că nu a fost necesară postprocesarea; valoarea `1` pentru cue-ul regenerat de la 1:09 înseamnă niciun retiming efectiv.

| Cue | Public | Intern | Speaker | Durată / max | Model | atempo |
|---|---:|---|---|---:|---|---:|
| `v3-cap-0004` | 4 s | preshow@4 | CAPITANUL | 10,24 / 10,8 s | eleven_v3 | — |
| `v3-ai-0015` | 15 s | preshow@15 | AVATAR_AI | 8,32 / 8,8 s | eleven_v3 | — |
| `v3-cap-0024` | 24 s | preshow@24 | CAPITANUL | 8,72 / 10 s | eleven_v3 | — |
| `v3-ai-0035` | 35 s | preshow@35 | AVATAR_AI | 7,65 / 7,8 s | eleven_multilingual_v2 | 1,4812× |
| `v3-cap-0043` | 43 s | preshow@43 | CAPITANUL | 4,00 / 6 s | eleven_v3 | — |
| `v3-cap-0109` | 69 s | play@9 | CAPITANUL | 7,36 / 10,8 s | eleven_v3 | 1 |
| `v3-ai-0125` | 85 s | play@25 | AVATAR_AI | 7,60 / 10 s | eleven_v3 | — |
| `v3-ai-0136` | 96 s | play@36 | AVATAR_AI | 5,60 / 23 s | eleven_v3 | — |
| `v3-ai-0206` | 126 s | play@66 | AVATAR_AI | 8,00 / 17 s | eleven_v3 | — |
| `v3-cap-0310` | 190 s | play@130 | CAPITANUL | 5,36 / 13 s | eleven_v3 | — |
| `v3-ai-0352` | 232 s | play@172 | AVATAR_AI | 8,16 / 22 s | eleven_v3 | — |
| `v3-cap-0501` | 301 s | play@241 | CAPITANUL | 4,80 / 4,9 s | eleven_v3 | — |
| `v3-ai-0512` | 312 s | play@252 | AVATAR_AI | 6,00 / 21 s | eleven_v3 | — |
| `v3-ai-0534` | 334 s | play@274 | AVATAR_AI | 9,44 / 21 s | eleven_v3 | — |
| `v3-cap-0604` | 364 s | play@304 | CAPITANUL | 1,65 / 1,8 s | eleven_v3 | 1,1636× |
| `v3-cap-0642` | 402 s | play@342 | CAPITANUL | 1,76 / 2 s | eleven_v3 | — |
| `v3-ai-0651` | 411 s | play@351 | AVATAR_AI | 1,85 / 2 s | eleven_v3 | 1,6000× |
| `v3-cap-0654` | 414 s | play@354 | CAPITANUL | 1,84 / 2 s | eleven_v3 | — |
| `v3-ai-0718` | 438 s | play@378 | AVATAR_AI | 8,65 / 8,8 s | eleven_v3 | 1,1468× |
| `v3-cap-0727` | 447 s | play@387 | CAPITANUL | 1,36 / 1,7 s | eleven_v3 | — |
| `v3-ai-0729` | 449 s | play@389 | AVATAR_AI | 7,04 / 8 s | eleven_v3 | — |
| `v3-cap-0738` | 458 s | play@398 | CAPITANUL | 2,72 / 3 s | eleven_v3 | — |
| `v3-ai-0742` | 462 s | play@402 | AVATAR_AI | 2,16 / 7,8 s | eleven_v3 | — |
| `v3-cap-0750` | 470 s | play@410 | CAPITANUL | 2,00 / 3 s | eleven_v3 | — |
| `v3-ai-0754` | 474 s | play@414 | AVATAR_AI | 7,60 / 7,8 s | eleven_v3 | — |
| `v3-cap-0802` | 482 s | play@422 | CAPITANUL | 5,92 / 6 s | eleven_v3 | — |
| `v3-ai-0809` | 489 s | play@429 | AVATAR_AI | 10,16 / 10,8 s | eleven_v3 | — |
| `v3-cap-0829` | 509 s | play@449 | CAPITANUL | 7,20 / 8 s | eleven_v3 | — |
| `v3-ai-0838` | 518 s | play@458 | AVATAR_AI | 4,80 / 4,8 s | eleven_v3 | — |
| `v3-cap-0843` | 523 s | play@463 | CAPITANUL | 0,80 / 1,8 s | eleven_v3 | — |
| `v3-ai-0850` | 530 s | epilogue@5 | AVATAR_AI | 11,44 / 17 s | eleven_v3 | — |
| `v3-ai-0908` | 548 s | epilogue@23 | AVATAR_AI | 8,16 / 11 s | eleven_v3 | — |
| `v3-cap-0920` | 560 s | epilogue@35 | CAPITANUL | 4,56 / 9 s | eleven_v3 | — |
| `v3-ai-0930` | 570 s | epilogue@45 | AVATAR_AI | 8,24 / 12 s | eleven_v3 | — |
| `v3-cap-0943` | 583 s | epilogue@58 | CAPITANUL | 9,68 / 10 s | eleven_v3 | — |

Toate cele 35 de fișiere individuale se află în `assets/voice/ro/`, cu numele `<cue>.mp3`. Manifestul conține text, speaker, durată, `words`, `wtimes`, `wdurations`, provider, direcție, model, voice ID, taguri, setări, factor de postprocesare, generation key și data generării.

### 22.6 Fișiere create sau schimbate în commitul vocal

Surse și documentație:

- `assets/show/voice-script-v3.json` — nou; sursa celor 35 de replici;
- `docs/SCENARIU-REGIZORAL-10-MIN.md` — replica 1:09 corectată în corp și anexă;
- `docs/DECIZII.md` — ADR-09 actualizat: Căpitan GLB, Avatarul Navei numai voce/HUD;
- `README.md` — comenzile V3 și avertismentul privind separarea de `show.json`;
- `HANDOFF.md` — §21 și prezentul §22, numai prin adăugare la final;
- `package.json` — comenzile `validate:voices`, `voice:reels`, `qa:voices`; validatorul vocal inclus în `check`.

Cod:

- `src/server/tts-providers.ts` — controale ElevenLabs per cue, taguri v3, seed, output format, voice settings și curățarea tagurilor din alignment;
- `scripts/tts-generate.mjs` — `--source`, generation key dependent de setări, metadate extinse, retiming `ffmpeg atempo` și scalarea alignment-ului;
- `scripts/validate-voice-script.mjs` — validare screenplay ↔ source ↔ manifest/audio;
- `scripts/build-voice-reels.mjs` — două montaje de audiție cu 0,75 s pauză;
- `scripts/qa-voice-transcription.mjs` — Scribe v2, română, calcul WER și detecția tagurilor rostite;
- `src/shared/types.ts` — inversarea corectă a proprietății lip-sync: Căpitan `true`, Avatarul Navei `false`;
- `src/renderer/player.ts` — butonul/comanda `testAvatar` testează în realitate Căpitanul GLB cu replica `Căpitanul EXODUS-7 online. Vă aud, echipaj.`.

Audio:

- `assets/voice/ro/manifest.json` — 35 intrări V3;
- `assets/voice/ro/v3-cap-*.mp3` — 17 fișiere;
- `assets/voice/ro/v3-ai-*.mp3` — 18 fișiere;
- `assets/voice/ro/preview-capitan-v3.mp3` — 92,93 s;
- `assets/voice/ro/preview-avatar-v3.mp3` — 145,09 s.

### 22.7 Comenzi de lucru pentru agentul următor

Verificarea completă fără apeluri plătite:

```powershell
npm run check
```

Verificarea doar a contractului vocal:

```powershell
npm run validate:voices
```

Regenerarea montajelor locale, fără API:

```powershell
npm run voice:reels
```

Regenerarea tuturor vocilor, numai cu `ELEVENLABS_API_KEY` prezent în mediul procesului:

```powershell
npm run tts -- --source assets/show/voice-script-v3.json --provider elevenlabs --force
```

Regenerarea unui singur cue:

```powershell
npm run tts -- --source assets/show/voice-script-v3.json --provider elevenlabs --cue v3-cap-0109 --force
```

QA-ul de retranscriere, care face apeluri API și necesită cheia în mediu:

```powershell
npm run qa:voices
```

Pornirea aplicației în dezvoltare:

```powershell
npm run dev -- --windowed
```

Consola operatorului este la `http://localhost:4321/control/`; aplicația tabletelor este la `http://<IP-PC>:4321/tablet/`.

### 22.8 Rezultatele de QA care trebuie păstrate ca baseline

Ultima rulare completă `npm run check` a trecut:

- `tsc --noEmit`;
- validatorul `show.json`: 8 scene, 53 cue-uri, dintre care 24 voice în versiunea executabilă veche;
- validatorul V3: 35/35 cue-uri, 17 Căpitan și 18 Avatar;
- build-urile main, preload, renderer, control și tablet;
- `smoke:core`;
- `smoke:platform`;
- `smoke:media`.

Ultimul QA Scribe v2:

- Căpitanul: 136 cuvinte detectate din 138 așteptate, WER 2,9%;
- Avatarul Navei: 217 cuvinte detectate din 216 așteptate, WER 6,5%;
- pragul automat este 18%;
- niciun tag actoricesc nu a fost rostit.

Verificările suplimentare au confirmat:

- MP3 mono la 44,1 kHz și 192 kbps;
- zero depășiri ale ferestrelor de cue măsurate cu `ffprobe`;
- `git diff --check` fără erori;
- nicio urmă a markerului cheii API în fișierele proiectului;
- verdicte finale `VERDE` de la scenarist, regizor și expertul pentru copii.

### 22.9 Limitarea executabilă exactă — nu trebuie ratată

`assets/show/show.json` conține încă 24 de cue-uri vocale vechi, cu ID-uri precum `pre-01`, `launch-01`, `light-01`, `nature-01`, `tech-01`, `rev-01` și `epi-01`. Manifestul actual conține numai cele 35 de ID-uri `v3-*`. Prin urmare:

- rularea executabilului actual **nu redă automat noile fișiere V3**;
- pentru vechile ID-uri, sistemul va ajunge la fallback-ul live/cache/vocea Windows, în funcție de configurare;
- nu trebuie copiate doar vocile V3 peste vechiul `show.json`, fiindcă replicile ar intra într-o structură vizuală și interactivă incompatibilă;
- migrarea corectă este atomică: întregul scenariu V3, cue-urile vizuale, interacțiunile tabletelor, fazele și cele 35 de voci trebuie trecute împreună în sursa executabilă.

Această limitare este intenționată și a fost aleasă pentru a nu produce o demonstrație aparent funcțională, dar dramaturgic falsă.

### 22.10 Următorul pachet de lucru recomandat

Următorul agent trebuie să implementeze integral scenariul V3, nu să-l rescrie creativ. Ordinea sigură este:

1. citește complet `docs/SCENARIU-REGIZORAL-10-MIN.md`, §20–§22 și validatorul existent;
2. definește/migrează structura completă de scene și cue-uri V3 în sursa executabilă;
3. păstrează exact ID-urile vocale `v3-*`, astfel încât manifestul existent să fie folosit fără regenerare;
4. implementează cele cinci lentile și cele cinci tablete pentru perechi, cu două zone egale, timeout și fallback observator;
5. configurează topologia `left-outer`, `left-inner`, `center`, `right-inner`, `right-outer`, cu `showAvatar: true` numai pe `center`;
6. păstrează continuitatea la 8:45, chiar dacă motorul schimbă intern faza în `epilogue`;
7. validează că numai `CAPITANUL` mișcă GLB-ul și că `AVATAR_AI` produce sunet/HUD fără a deschide un corp;
8. testează redarea de la început, seek înainte/înapoi, reconnect tabletă, timeout fără input și trecerea play→epilogue;
9. rulează `npm run check`, apoi o audiție reală pe sistemul de sunet și un test pe toate cele cinci ecrane/tablete;
10. actualizează din nou `HANDOFF.md` numai prin adăugare la final și comite schimbarea.

### 22.11 Invariante și capcane pentru Fable 5.1 sau alt succesor

- Nu rescrie și nu curăța retroactiv `HANDOFF.md`; adaugă numai o secțiune nouă la final.
- Nu introduce cheia API în `.env`, source, documentație, manifest, output de test sau commit.
- Nu regenera vocile deja aprobate doar pentru că există acces API; păstrează asset-urile și seed-urile dacă textul nu se schimbă.
- Dacă o replică se schimbă, actualizează simultan scenariul, anexa Căpitanului dacă este cazul, `voice-script-v3.json`, audio, manifest și montajul relevant.
- Nu transforma Avatarul Navei într-un al doilea personaj GLB.
- Nu muta Căpitanul în sală și nu introduce robot fizic, actor sau voce off separată de fereastra lui GLB.
- Nu transforma cele cinci posturi în zece tablete sau zece stații.
- Nu cere consens în pereche și nu condiționa continuarea de participarea tuturor tabletelor.
- Nu face pauză vizibilă, loading sau reset la 8:45.
- Nu considera `show.json` vechi drept scenariu aprobat; este doar starea executabilă de migrat.
- Nu șterge fallback-urile TTS existente până când manifestul V3 este integrat și testat în scenariul executabil.
- `ffmpeg` trebuie să fie disponibil în PATH pentru retiming și montaje.
- `npm run qa:voices` consumă API; `npm run check` nu consumă API.

---

## 23. ADDENDUM APPEND-ONLY — launcher Windows end-to-end `RUN.bat` (Codex, 2026-09-04)

> Această secțiune a fost adăugată la final. Nicio secțiune anterioară din `HANDOFF.md` nu a fost rescrisă sau ștearsă.

La cererea utilizatorului a fost creat `RUN.bat` în rădăcina proiectului, astfel încât un dublu-click să pornească întregul stack local. Launcherul:

- își fixează working directory-ul la folderul în care se află, deci funcționează și când este lansat din Explorer;
- verifică existența `node.exe`, `npm.cmd` și impune Node.js 22+;
- verifică `package.json` și `package-lock.json`;
- creează `config.json` din `config.example.json` numai dacă lipsește și nu suprascrie niciodată configurația existentă;
- verifică înainte de pornire `assets/show/show.json`, `assets/avatar/avatar-ai.glb` și `media/cinema_4k_h264.mp4`;
- rulează `npm ci --no-audit --no-fund` numai dacă instalarea locală Electron lipsește;
- rulează build-ul prin comanda npm existentă și pornește Electron, serverul Hono/WebSocket, consola și endpoint-ul tabletelor în același proces de aplicație;
- așteaptă până la 45 s după răspunsul `http://localhost:4321/control/`, apoi deschide automat consola în browserul implicit;
- păstrează consola batch deschisă cât timp rulează aplicația, astfel încât logurile de startup să fie vizibile;
- la eroare păstrează fereastra deschisă prin `pause` și indică folderul `runs\` pentru loguri;
- la închiderea normală a aplicației termină cu exit code 0.

Modul implicit de dublu-click adaugă `--windowed`, pentru ca aplicația să poată fi închisă ușor în dezvoltare. Sunt disponibile:

```text
RUN.bat               pornire windowed + deschidere automată a consolei web
RUN.bat --kiosk       respectă kiosk/fullscreen din config.json
RUN.bat --no-control  nu deschide automat browserul
RUN.bat --check       rulează npm run check fără a lansa playerul
RUN.bat --help        afișează opțiunile
```

`README.md` și `docs/OPERARE.md` au fost actualizate cu această cale de pornire. Launcherul nu conține și nu solicită cheia ElevenLabs la pornirea obișnuită; folosește vocile pre-generate disponibile și mecanismele de fallback existente.

### 23.1 Verificarea launcherului

Au fost testate trei trasee reale:

- `cmd.exe /d /c RUN.bat --help`: exit 0 și afișarea corectă a tuturor opțiunilor;
- `cmd.exe /d /c RUN.bat --check --no-control`: exit 0 după TypeScript, ambele validatoare, build și cele trei smoke tests;
- `cmd.exe /d /c RUN.bat`: startup end-to-end reușit în modul windowed.

La testul complet, logul a confirmat:

- build reușit pentru main, preload, renderer, control și tablet;
- încărcarea `config.json` în rol master;
- găsirea filmului de 2,5 GB, a GLB-ului, a show-ului și a directorului de voci;
- server pe portul 4321 și WebSocket local conectat;
- fereastra `center` creată;
- `show.json` încărcat cu 53 de cue-uri;
- metadata filmului 3840×2052, 741,78 s;
- avatar GLB `ready`;
- `GET http://localhost:4321/control/` → HTTP 200, 6438 bytes;
- închiderea ferestrei a declanșat shutdown normal, deconectare WebSocket și oprirea serverului; portul 4321 a fost eliberat.

---

## 24. ADDENDUM APPEND-ONLY — remediere input pe ecran și taste în `IDLE` (Codex, 2026-09-04)

> Această secțiune a fost adăugată la final. Nicio secțiune anterioară din `HANDOFF.md` nu a fost rescrisă sau ștearsă.

Utilizatorul a raportat că apăsarea ecranului sau a tastelor nu producea nimic. Logul real `runs/app-20260904-202444.jsonl` a arătat că inputul de tastatură ajungea în renderer, dar `Space` trimitea comanda `play` în starea `idle`, iar serverul o respingea repetat cu `PLAY funcționează doar din PAUZĂ (folosește START)`. Clickul pe suprafața filmului nu avea niciun handler, iar singurul strat clickabil era veil-ul de autoplay, afișat doar când browserul refuza redarea. Problema era deci de contract și affordance, nu de focus sau de capturarea tastelor.

Remedierea aplicată:

- `src/server/state.ts`: `play` din `idle` este acum echivalent cu pornirea unei sesiuni noi; apelează `onRunStart`, intră în faza `play` la `-launchLeadInSec` și pornește countdown-ul;
- `src/renderer/index.html`: a fost adăugat un panou de lansare vizibil numai pe ecranul master/sursa de ceas în starea `idle`;
- panoul conține **PORNEȘTE EXPERIENȚA**, **PRE-SHOW**, plus indicațiile `Space`, `Enter`, `S`, `P`, `O` și `F`;
- click oriunde pe panou sau butonul principal trimite `start`; butonul secundar trimite `preshow`;
- `Space` în `idle` funcționează acum prin contractul `play`; `Enter` în `idle` trimite direct `start`;
- tastele `Space`/`Enter` pe un buton focalizat sunt lăsate browserului, evitând dublarea comenzii;
- panoul se ascunde automat la orice ieșire din `idle` și reapare după `restart`;
- textul veil-ului de autoplay a fost corectat: acel click activează sunetul și continuă, nu pretinde că inițiază nava;
- `src/renderer/styles.css`: a fost adăugată interfața responsive, cu ținte mari, focus vizibil, contrast și cursor activ;
- comentariul vechi care spunea că GLB-ul apare la prima replică `AVATAR_AI` a fost corectat la `CAPITANUL`;
- `scripts/smoke-core.mjs`: există acum regresie automată care cere ca `PLAY` din `IDLE` să înceapă show-ul și să creeze o singură sesiune;
- `README.md` și `docs/OPERARE.md` explică noul comportament click/Space/Enter.

Validare:

- `npm run check`: trecut integral;
- test real prin `RUN.bat --no-control`: aplicația, serverul, filmul și avatarul au pornit fără eroare;
- înainte de comandă `/api/state` a raportat `idle`;
- `POST /api/cmd` cu `{ "cmd": { "action": "play" } }` a răspuns `ok: true`;
- după comandă, `/api/state` a raportat `playing`, timp negativ în countdown și rată 1;
- rendererul a aplicat `play` și a declanșat cue-urile de launch/countdown;
- închiderea ferestrei a oprit curat serverul și procesul launcherului.

Pentru a vedea remedierea, orice instanță pornită înainte de acest commit trebuie închisă, apoi `RUN.bat` trebuie lansat din nou; build-ul este executat automat la fiecare pornire.

---

## 25. ADDENDUM APPEND-ONLY — curățenie vocală V3, experiență executabilă și tablete 5×2 (Codex + agenții scenarist/regizor/expert copii, 2026-09-04)

> Această secțiune a fost adăugată strict la final. Nicio secțiune anterioară din `HANDOFF.md` nu a fost rescrisă sau ștearsă.
>
> **Această secțiune înlocuiește operațional limitările și pașii rămași descriși în §22.9–§22.11 și comportamentul de start descris în §24.** Starea executabilă curentă este `show.json` v`0.4.0-v3-complete`, cu 87 cue-uri și 51 de asset-uri vocale V3. Clickul principal/`Space`/`Enter` din idle pornește acum pre-show-ul complet; `S` sau **SARI LA LANSARE** omit pre-show-ul.

### 25.1 Incidentul raportat și cauza reală

Utilizatorul a raportat că TTS-ul de la început este inacceptabil. Cauza nu era vocea V3 generată, ci faptul că sursa executabilă `assets/show/show.json` conținea încă 24 de ID-uri vocale legacy (`pre-01`, `launch-01` etc.), în timp ce manifestul local conținea ID-uri `v3-*`. Playerul nu găsea clipul local, încerca `/api/tts`, primea eroare deoarece nu există cheie la runtime, apoi cădea pe `speechSynthesis`/vocea Windows. Așadar pista V3 exista pe disc, dar era ocolită de show-ul executabil.

Remedierea este structurală, nu cosmetică:

- toate vocile legacy au fost scoase din `show.json`;
- toate asset-urile V3 sunt sincronizate cu aceleași ID-uri, texte, vorbitori și timpi;
- fiecare cue vocal de producție are `fallback: "silent"`;
- dacă un MP3 lipsește, rendererul afișează subtitrarea, păstrează fereastra de timp prin tăcere și scrie o eroare explicită; nu apelează browserul/Windows;
- fallback-ul browser rămâne în motor numai pentru cue-uri ad-hoc/de test care îl permit explicit;
- mesajele de startup nu mai afirmă înșelător că lipsa `.env` activează automat vocea browserului pentru spectacol.

### 25.2 Pista vocală completă

`assets/show/voice-script-v3.json` este acum v`3.2.0-adaptive-complete`. Conține 51 de asset-uri:

- 17 replici `CAPITANUL`;
- 18 replici `AVATAR_AI`;
- 16 replici/variante pentru LUMINA, NATURA, TEHNOLOGIC și ecourile finale.

Într-o reprezentație se redau 49 de clipuri, nu 51, deoarece la 6:35 serverul selectează exact una dintre cele trei variante TEHNOLOGIC. Toate cele 51 rămân în manifest și show pentru disponibilitate și operare manuală.

Vocile configurate sunt:

- Căpitan: ElevenLabs voice ID `Z1I8XGyUmANP9h72LN2z` (`Paul Bogorin`);
- Avatarul Navei: `Q8ZbQAANLFvLw8uPBR8d` (`AGEIS-7`);
- LUMINA: `GRHbHyXbUO8nF4YexVTa` (`Anca — Warm Voice for Every Story`);
- NATURA: `9nKRcmsd1bEJbszIZ2HO` (`Vasile Poenaru`);
- TEHNOLOGIC: `3z9q8Y7plHbvhDZehEII` (`Antonia`).

Cheia API oferită temporar de utilizator a fost folosită numai ca variabilă de proces pentru generare și QA. Nu a fost scrisă în `.env`, cod, manifest, loguri, documentație sau commit. O scanare după un fragment distinct al cheii a ieșit curată pe întregul proiect, inclusiv `runs/`.

Au fost adăugate cele 16 asset-uri care lipseau din setul inițial de 35:

- `v3-light-0224.mp3`, `v3-light-0236.mp3`, `v3-light-0258.mp3`;
- `v3-nature-0415.mp3`, `v3-nature-0433.mp3`, `v3-nature-0453.mp3`;
- `v3-tech-0556.mp3`, `v3-tech-0606.mp3`, `v3-tech-0610.mp3`, `v3-tech-0635-observe.mp3`, `v3-tech-0645.mp3`;
- `v3-echo-0820.mp3`;
- `v3-tech-0635-diverse.mp3`, `v3-tech-0635-same.mp3`;
- `v3-echo-nature-0824.mp3`, `v3-echo-tech-0826.mp3`.

Replica `v3-ai-0534` a fost simplificată pentru copii din „hazardul” în „riscul”, modificată simultan în scenariul regizoral, sursa vocală, show și audio, apoi regenerată. Toate vocile noi folosesc `eleven_v3`, indicații de joc/inflexiune, seed-uri stabile și retiming numai când durata depășea fereastra.

Montajele de audiție actuale sunt:

- `assets/voice/ro/preview-capitan-v3.mp3` — 17 cue-uri;
- `assets/voice/ro/preview-avatar-v3.mp3` — 18 cue-uri;
- `assets/voice/ro/preview-civilizatii-v3.mp3` — 16 cue-uri/variante.

QA final cu ElevenLabs Scribe v2, limba română:

- Căpitan: 136/138 cuvinte, WER 2,2%;
- Avatarul Navei: 214/216 cuvinte, WER 3,7%;
- civilizații/ecouri/ramuri: 165/165 cuvinte, WER 3,0%;
- niciun tag de performanță Eleven v3 nu a fost rostit ca text.

### 25.3 Ramura adaptivă TEHNOLOGIC și ecourile finale

Auditul agentului scenarist a descoperit că versiunea intermediară reda necondiționat „Ați ales să observați”, indiferent ce apăsau copiii. Au fost adăugate toate cele trei variante canonice:

- `v3-tech-0635-diverse`: există minimum două alegeri exprimate diferite;
- `v3-tech-0635-same`: toate alegerile exprimate sunt identice;
- `v3-tech-0635-observe`: nu există alegeri exprimate; include cazul în care toți aleg „Doar observ” sau nu răspund.

Cele trei cue-uri sunt `manual: true`, deci timeline-ul nu le poate reda împreună. Markerul automat `tech-adaptive-select` de la `play:335` cere serverului ramura prin `tablets.perspectiveBranch("tech-tablet-perspectives")`, apoi serverul difuzează un singur `fireCue` către toate ecranele. Ramurile returnate sunt literal `diverse | same | observe`.

Un raport video întârziat după seek putea muta ceasul serverului puțin înapoi și rearma markerul, producând două redări ale aceleiași replici. `src/server/cues.ts` distinge acum seek-ul explicit de jitterul unui raport de ceas: numai comanda de seek rearmează cue-uri. Există regresie automată și testul real a confirmat o singură redare.

Climaxul de la 8:20 conține acum toate cele trei ecouri, secvențiate fără suprapunere:

- LUMINA: „Vă recunoaștem lumina.”;
- NATURA: „Vă recunoaștem legătura.”;
- TEHNOLOGIC: „Nu încăpeți într-un singur răspuns.”

### 25.4 Cinci tablete, cinci posturi, zece perspective

Agentul cu experiență în lucrul cu copii a auditat și apoi a înlocuit modelul vechi „o tabletă = un copil cu nume și rol”. Contractul actual este anonim și corespunde scenariului:

- cinci tablete, fiecare legată de un post fix 1–5;
- posturile sunt NAVIGAȚIE, PROPULSIE, COMUNICAȚII, BIOSEMNALE și MEMORIE;
- posturile se pot fixa prin onboarding sau direct prin query `?post=N`, apoi persistă local;
- un post nu poate fi revendicat simultan de două tablete conectate;
- fiecare tabletă are două zone vizuale egale, A și B, pentru cei doi copii;
- fiecare zonă răspunde independent o singură dată per cue și nu poate suprascrie alegerea celeilalte;
- fiecare zonă oferă „Doar observ”; observația și lipsa inputului sunt stări valide;
- nu se colectează prenume, text liber, clasamente, procente sau consens;
- confirmarea A/B este privată pe tableta respectivă; celelalte tablete nu primesc răspunsurile;
- posturile persistă la restart, dar răspunsurile sesiunii se șterg;
- reconectarea recuperează postul și confirmările A/B din server.

Contractele noi sunt:

```text
post-assign { posts: string[5] }
paired-choice {
  mode: "color" | "pulse" | "perspective",
  prompt,
  options,
  allowObserve: true,
  timeoutSec?
}
set-post { post: 1..5 }
choice { cueId, zone: "A" | "B", value }
```

`options` acceptă string sau `{ value, label, symbol?, color? }`. Valoarea stabilă pentru observație este `TABLET_OBSERVE_VALUE = "observe"`.

Interacțiunile V3 executabile sunt acum:

- `light-tablet-color`, fereastră `play:103–115` / public 2:43–2:55;
- `nature-tablet-pulse`, fereastră `play:219–231` / public 4:39–4:51;
- `tech-tablet-perspectives`, fereastră `play:317–334` / public 6:17–6:34;
- `epi-tablet-thanks` la epilog 68 / public 9:53.

Au fost eliminate `tech-tablet-question` și `rev-tablet-message`; în revelație copiii privesc ecranele, nu scriu text. UI-ul tabletelor a fost refăcut cu două jumătăți simetrice, ținte de minimum 56 px, gap de minimum 8 px, simboluri/culori, mod reduced-motion și fără indicatori competitivi.

### 25.5 Continuitate vizuală și sonoră

Entity hide-urile legacy tăiau personajele în timpul ultimelor replici. Timpii actuali sunt:

- LUMINA hide la `play:125.2`, după finalul clipului de la 2:58;
- NATURA hide la `play:239.2`, după finalul clipului de la 4:53;
- TEHNOLOGIC hide la `play:350.5`, după replica de la 6:45.

Alte corecții de sunet/cue:

- ploaia NATURA durează 45 s și acoperă replica finală;
- `wormhole-whoosh` pornește la video 360 s / public 7:00;
- `wormhole-exit-swell` este limitat la 2 s, la video 400–402, înaintea următoarei replici;
- `home-transmit-chime` și `home-transmit-marker` marchează nota a patra și trimiterea semnalului la 463,5 s.

Nu s-a introdus un al doilea corp pentru Avatarul Navei. Numai `CAPITANUL` comandă GLB-ul și numai rendererul cu `showAvatar: true` îl instanțiază.

### 25.6 Preload audio și durată deterministă

Motorul vocal încarcă acum manifestul complet și face fetch + decode pentru toate clipurile înainte ca UI-ul de lansare să fie armat. Sunt folosite maximum șase operații concurente. La cue, clipul vine din memoria decodată, eliminând I/O-ul din ferestrele scurte dintre replici. Un asset care eșuează la preload este memorat ca indisponibil și nu mai este recitit/decodat pe muchia cue-ului; politica `fallback: silent` rămâne activă.

Contractul public este exact:

```text
0:00–0:50   pre-show
0:50–1:00   lead-in T−10
1:00–8:45   film video 0–465 s
8:45–10:00  epilog 0–75 s
TOTAL       600 s
```

Sursa video fizică rămâne 741,78 s, dar `Player.duration()` expune 465 s și rendererul oprește local la această limită. Tranziția play→epilogue se face imediat în renderer, fără a aștepta round-trip-ul WS; ecoul serverului nu resetează ceasul epilogului. Epilogul se oprește local exact la 75 s. Testele verifică masterul fizic lung, tăietura la 465 și finalul determinist.

### 25.7 Pornirea de pe ecran

§24 descrie o versiune intermediară în care clickul principal sărea direct la lansare. Comportamentul final este:

- click oriunde pe panoul idle, **PORNEȘTE EXPERIENȚA**, `Space` sau `Enter` → `preshow`;
- la 50 s, `preshowAutoStart: true` pornește automat lead-in-ul T−10;
- **SARI LA LANSARE** sau `S` → start direct la T−10;
- `P` → pre-show explicit;
- în timpul filmului, `Space` păstrează funcția pause/play.

Astfel, dublu-click pe `RUN.bat`, apoi o singură atingere pe ecran, pornesc fluxul continuu complet.

### 25.8 Automatizare și documentație

Au fost adăugate:

- `scripts/sync-v3-voices-to-show.mjs` / `npm run sync:voices`: migrează determinist toate vocile V3, tabletele V3, timpii entity/SFX și metadatele de durată în `show.json`; scriptul este idempotent și a fost rulat de două ori consecutiv fără duplicate;
- `scripts/build-cue-sheet.mjs` / `npm run docs:cues`: generează `docs/CUE-SHEET.md` direct din sursa executabilă; documentul nu mai conține cue-uri V2;
- validare extinsă în `scripts/validate-voice-script.mjs`: 51/51 asset-uri obligatorii, potrivire cu scenariul, manifest și show, durate maxime, tag-uri nerostite, cele trei ramuri manuale și fallback strict;
- validare extinsă în `scripts/validate-show.mjs`: contractele `post-assign`/`paired-choice`, exact cinci posturi, tipurile legacy interzise și invariantele V3;
- teste extinse în `scripts/smoke-core.mjs` și `scripts/smoke-platform.mjs`: 5×2 tablete, ramuri `observe/same/diverse`, imutabilitate A/B, confidențialitate, reconnect/restart, dispatch adaptiv, jitter fără dublare, preload/cache/failure și fallback silent;
- reel și QA pentru civilizații în `scripts/build-voice-reels.mjs` și `scripts/qa-voice-transcription.mjs`.

Au fost actualizate `README.md`, `docs/OPERARE.md`, `docs/SPEC-SHEET.md`, `docs/SCENARIU.md`, `docs/BRIEF.md`, `docs/DECIZII.md` și `docs/CUE-SHEET.md`. Documentele active spun acum cinci tablete pentru zece copii, fără Unitree fizic, fără VR, Căpitan numai în fereastra GLB `center`, 51 de asset-uri locale și tăietură la 465 s.

### 25.9 Verificări finale și probă reală

`npm run check` a trecut integral după toate modificările:

- TypeScript strict: PASS;
- show validator: 8 scene, 87 cue-uri (`countdown=1`, `entity=6`, `marker=6`, `sfx=6`, `tablet=9`, `theme=8`, `voice=51`);
- voice validator: 51 asset-uri, toate potrivite cu scenariul și show-ul;
- build Electron/main/preload/renderer/control/tablet: PASS;
- smoke core: timing de lansare, epilog determinist, preload audio, jitter și fallback silent: PASS;
- smoke platform: HTTP, static, QR, WS, state machine, posturi 5×2, ramură adaptivă și shutdown: PASS;
- smoke media: transcodare CPU, overwrite Windows-safe și contact sheet: PASS.

Proba reală a fost făcută cu `RUN.bat --no-control`, fără `.env` și fără cheie TTS la runtime. Logul `runs/app-20260904-205725.jsonl` și run-logul `runs/show-20260904-205746-2.jsonl` au confirmat:

- show `0.4.0-v3-complete`, 87 cue-uri;
- video 3840×2052 / 741,78 s încărcat, limită configurată 465 s;
- GLB ready;
- cue-ul de început `v3-cap-0004` redat din manifest;
- niciun request `/api/tts` și niciun 502/fallback browser;
- seek la `play:335` fără răspunsuri a selectat `v3-tech-0635-observe`;
- după corecția de jitter, ramura a fost declanșată o singură dată.

### 25.10 Starea exactă rămasă pentru instalarea fizică

Curățenia TTS, integrarea V3 și contractul tabletelor sunt finalizate în software. Pentru instalarea în locație rămân verificări care nu pot fi simulate pe PC-ul de dezvoltare:

- audiție pe sistemul real de sunet și reglarea volumelor pe sală;
- test cu cinci tablete fizice, fiecare fixată prin `?post=1` … `?post=5`;
- maparea indicilor Windows ai celor cinci display-uri și confirmarea că `showAvatar: true` există numai pe `center`;
- repetiție completă de 10 minute cu facilitator și zece copii/adulți-surogat;
- eventualul score/ambient muzical original și mixul cinematic final; filmul sursă nu are pistă audio, iar versiunea curentă folosește vocile și SFX-urile sintetizate descrise mai sus.

`config.json` local nu a fost suprascris: rămâne configurat pentru un singur display `center`, deoarece mașina de dezvoltare a raportat un singur monitor. În locație trebuie configurate display-urile reale după ordinea detectată; nu inventați indicii înainte de instalare.

---

## 26. 2026-09-04 — buton START EXPERIENCE pentru test rapid în consola operatorului

Utilizatorul a cerut un buton explicit de pornire deoarece controalele existente `PRE-SHOW` și `START` nu făceau suficient de clar care comandă începe imediat filmul. Verificarea efectivă în `http://localhost:4321/control/` a confirmat că vechiul `PRE-SHOW` intra corect în faza de 50 s, însă acest flux începe cu câteva secunde de liniște și putea fi perceput ca lipsă de răspuns. În plus, `Space` în consola web nu avea nicio acțiune din `IDLE`.

Au fost făcute următoarele schimbări, fără a modifica fluxul public continuu al playerului master descris în §25.7:

- `src/web/control/index.html`: a fost adăugat deasupra transportului un buton mare și vizibil **START EXPERIENCE**, cu explicația „Test: pornește imediat numărătoarea și filmul”;
- `src/web/control/styles.css`: butonul are stil primar cyan, țintă de 82 px, focus vizibil, hover și stare disabled;
- `src/web/control/index.ts`: clickul trimite comanda autoritativă `{ action: "start" }`, pornește direct la T−10 și butonul se dezactivează când show-ul nu mai este în `IDLE`/`PRE-SHOW`;
- în consola operatorului, `Space` sau `Enter` din `IDLE` ori `PRE-SHOW` execută același start imediat; în timpul filmului, `Space` continuă să facă pauză/reluare;
- `README.md` și `docs/OPERARE.md` documentează diferența dintre shortcut-ul de test din consolă și **PORNEȘTE EXPERIENȚA** de pe ecranul master, care păstrează experiența completă de la pre-show.

Verificarea a fost făcută prin interacțiune reală în browser, nu doar prin API: butonul era vizibil și activ în `IDLE`; clickul a schimbat starea în `ÎN REDARE`, ceasul în `T−00:09.x`, nota în `Start · HH:MM:SS` și a dezactivat butonul. A fost verificat separat și `Space`, cu aceeași tranziție. După teste, show-ul a fost readus în `idle`.

`npm run check` a trecut integral după build-ul final: TypeScript, validator show, validator voci, build Electron/web, smoke core, smoke platform și smoke media. Build-ul final păstrează comportamentul playerului master: clickul pe panoul său principal/`Space`/`Enter` pornește pre-show-ul continuu; numai noul buton **START EXPERIENCE** din consola operatorului este shortcut-ul evident pentru pornire imediată de test.
