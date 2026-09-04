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
