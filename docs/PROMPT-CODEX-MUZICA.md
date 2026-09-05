# Prompt pentru Codex — coloana sonoră „A Patra Lume”

> **Cum se folosește:** dă-i lui Codex tot documentul acesta ca sarcină. Este autonom: conține contextul, cronologia exactă, prompturile de generare, specificația tehnică și criteriile de acceptare.

---

## 0. Sarcina, pe scurt

Generează, cu **Eleven Music**, întreaga coloană sonoră originală a experienței „A Patra Lume — Protocolul Acasă”: 10 piese, aproximativ 8 minute de muzică, plus integrarea lor în playerul existent. Muzica trebuie să sune ca un scor de film spațial contemplativ, nu ca muzică de fundal generică.

**O notă despre referință:** briefingul pornește de la limbajul muzical al filmelor spațiale contemplative din ultimul deceniu — orgă de biserică, ostinato minimalist, puls ca de ceas, tăcere folosită ca instrument. Prompturile de mai jos **descriu aceste caracteristici muzicale în loc să numească un compozitor**, pentru că termenii Eleven Music restricționează prompturile care cer stilul unui artist anume, iar descrierea concretă a instrumentației și a armoniei dă oricum rezultate mult mai bune decât un nume propriu.

---

## 1. Contextul pe care trebuie să-l cunoști

**Experiența:** 10 minute, pentru copii de 7–12 ani, într-o sală cu cinci televizoare 4K și cinci tablete. Un film de călătorie spațială realizat în SpaceEngine, peste care vorbesc două personaje: **CĂPITANUL** (voce masculină, avatar 3D) și **AVATARUL AI** (voce sintetică, va fi întruchipat de un robot). Copiii fac alegeri în perechi pe tablete. La final primesc un certificat.

**Povestea:** nava Exodus Șapte prinde un semnal fără coordonate, împărțit în cinci fragmente. Echipajul vizitează trei lumi — Lumina, Natura, Tehnologia — trece printr-un wormhole și descoperă că a patra lume, cea căutată, este Pământul. Tema de fond: ce ține o lume în viață și ce lăsăm în urmă.

**Ce există deja în audio:** voci pregenerate (51 de replici), efecte sonore sintetizate în Web Audio (`src/renderer/voice/sfx.ts`) și paturi ambientale procedurale pe temă (`src/renderer/voice/ambient.ts`, cu tranziție de 4 s și atenuare automată sub voce). **Muzica se adaugă peste acest strat, nu îl înlocuiește.** Filmul în sine este mut.

---

## 2. Cronologia exactă (din `assets/show/show.json`, versiunea `0.5.0-ro-stage`)

Faza `preshow` durează 50 s. Faza `play` începe la −10 s (numărătoare pe cadru înghețat), filmul rulează 0–465 s. Faza `epilogue` durează 75 s peste ultimul cadru înghețat. Total: 600 s.

| Scenă | Fază | Interval | Temă | Ce se vede |
|---|---|---|---|---|
| Prolog · Semnalul | preshow | 0–50 | `prologue` | video oprit pe cadrul 0, Pământul mare în fereastră |
| Decolarea | play | −10 → 60 | `launch` | numărătoare pe cadru înghețat; Pământul se îndepărtează 0–20; Calea Lactee 20–34; nebuloasa apare la 36 |
| Planeta Luminii (Siwarha) | play | 60–144 | `light` | apropiere 60–72; orbită 74–137; viraj 138–143 |
| Planeta Naturii (Kepler-186 d) | play | 144–246 | `nature` | câmp de stele 144–178; orbită 180–244 |
| Planeta Tehnologiei (Mann · Gargantua) | play | 246–356 | `tech` | warp 246–280; Mann și discul Gargantua 282–352 |
| Wormhole | play | 356–402 | `void` | traversare 360–402 |
| Revelația · Pământul | play | 402–465 | `home` | Pământul apare la 403; filmul îngheață la 465 |
| Epilog · Protocolul Acasă | epilogue | 0–75 | `white` | ultimul cadru persistă; certificat pe tablete |

**Momente fixe de care muzica trebuie să țină cont:**

| Secundă | Ce se întâmplă |
|---|---|
| −10 | începe numărătoarea de 10 secunde |
| 0 | decolare, efect `launch-liftoff-sfx` |
| 20 | marcaj „stele” |
| 82 / 192 / 294 | apar entitățile Lumină / Natură / Tehnologic |
| 194 | efect de ploaie |
| **233** | **marcaj `nature-marker-silence` — momentul de tăcere. Muzica TREBUIE să dispară complet aici.** |
| 335 | ramificația adaptivă (alegerea copiilor schimbă cursul) |
| 360 | `wormhole-whoosh` |
| 400 | `wormhole-exit-swell` |
| 463,5 | `home-transmit-chime`, se transmite mesajul spre Pământ |
| 465 | filmul îngheață |

Există 51 de replici vorbite răspândite pe toată durata. **Muzica este întotdeauna subordonată vocii.**

---

## 3. Identitatea muzicală

**Principiul de bază:** un singur motiv, numit „Acasă”, traversează întreaga experiență și se transformă. Patru sau cinci note, simplu îndeajuns încât un copil să-l poată fredona la ieșire.

| Unde | Ce se întâmplă cu motivul |
|---|---|
| Prolog | doar sugerat, incomplet, ca o amintire pe care n-o poți fixa |
| Decolare | răsturnat, ascendent, transformat în ostinato |
| Lumina | ornamentat, luminos |
| Natura | fragmentat, respirat, apoi întrerupt de tăcere |
| Tehnologia | mecanizat, rigid, în puls de ceas |
| Wormhole | dizolvat, aproape absent |
| Revelația | **enunțat întreg, la pian, pentru prima dată** |
| Epilog | armonizat, cald, rezolvat |

**Palete instrumentale acceptate:** orgă de biserică (registru grav ca pedală, registru acut ca lumină), corzi susținute, pian solo, arpegii minimaliste, pad-uri fără cuvinte, tonuri sub-bas, texturi metalice cristaline, puls ritmic ca de ceas. Fără percuție de acțiune, fără tobe de trailer, fără sintetizatoare anilor '80, fără versuri.

**Reguli spectrale, ca vocile să rămână inteligibile:** nimic dens și continuu în zona 300–3000 Hz; energia muzicii stă în grav (sub 200 Hz) și în stralucirea de deasupra 4 kHz; nicio voce umană care pronunță cuvinte, doar pad-uri fără text.

**Gamă dinamică:** mare. Muzica are voie să se retragă până aproape de tăcere. Tăcerea e un instrument, nu un gol de umplut.

---

## 4. Cele zece piese, cu prompturi de generare

Prompturile se dau în engleză, așa cum funcționează cel mai bine modelul. Nu adăuga nume de compozitori sau de filme.

### Ordinea de generare este importantă

Generează **M08 primul**. Este enunțul cel mai pur al motivului „Acasă”. Apoi folosește-l ca **audio reference** (referința acceptă în jur de 30 de secunde) pentru M01, M05, M09 și M10, ca să păstrezi unitatea tematică. Restul se generează independent.

---

**M08 · REVELAȚIA — „A patra lume”** · 63 s · scena `revelation`, 402–465

> Intimate orchestral cue, 63 seconds. Solo piano states a simple five-note ascending motif, unhurried, with space between phrases. After the first statement, warm sustained strings enter underneath in slow harmonic motion over a pedal tone. A church organ swells very softly in the low register around the two-thirds mark, never dominating. The feeling is recognition and homecoming after a long journey — moving but restrained, hopeful rather than triumphant, no percussion, no fanfare. Ends open and unresolved on a sustained chord. Wide dynamic range, cinematic, spacious reverb.

---

**M01 · PROLOG — „Semnalul”** · 60 s, **buclă** · faza preshow, sub 4–5 replici

> Ambient orchestral bed, 60 seconds, seamless loop. Very low church organ pedal tone, barely moving. Distant, sparse metallic pings with long decay, like a signal arriving from far away, irregular and unhurried. High sustained strings enter and fade, almost inaudible. A fragment of a piano motif appears once, incomplete, then dissolves. Mysterious and patient, not threatening, suitable under spoken dialogue. Extremely wide dynamic range, mostly quiet. No percussion, no melody in the mid frequencies.

---

**M02 · NUMĂRĂTOAREA — „Zece”** · 12 s · lead-in −10 → 0

> Rising tension cue, 12 seconds. A ticking pulse begins steady and slowly accelerates. Underneath, a low organ tone and strings build in a continuous rising motion that seems to climb without ever settling. The final second resolves into a single deep impact and immediate silence. Precise, mechanical, exciting rather than frightening. No melody, no vocals.

---

**M03 · DECOLAREA** · 70 s · 0–60 (plus coadă)

> Cinematic orchestral cue, 70 seconds. Opens immediately at full power: church organ in ascending arpeggiated ostinato, repeating and building, with sustained strings above in long rising lines. The first twenty seconds are the emotional peak — vast, uplifting, a sense of leaving something enormous behind. From around thirty seconds the texture gradually thins, the organ recedes, and only shimmering high strings and a distant pedal tone remain, opening into vastness. Minimalist and repetitive rather than melodic. No drums.

---

**M04 · PLANETA LUMINII (Siwarha)** · 84 s · 60–144

> Warm ambient orchestral cue, 84 seconds. Golden and shimmering: high strings in slow suspended harmony, delicate harp-like arpeggios drifting in and out, wordless choral pad very soft in the background. A sense of standing in warm light, awe without grandeur. Very sparse in the middle frequencies so speech can sit on top. Slow harmonic rhythm, long sustains, gentle. No percussion, no words.

---

**M05 · PLANETA NATURII (Kepler-186 d)** · 88 s · 144–232, **se oprește înainte de 233**

> Organic ambient cue, 88 seconds. Built on the rhythm of slow breathing: a low woodwind-like tone swells and recedes about every eight seconds. Beneath it a wet, resonant drone and occasional distant low notes like something large and calm. A fragment of a piano motif appears twice, unfinished. Living, humid, unhurried. The last ten seconds thin out until almost nothing remains. No percussion, no melody in the mid range.

---

**M06 · PLANETA TEHNOLOGIEI (Mann · Gargantua)** · 110 s · 246–356

> Cold minimalist cue, 110 seconds. A relentless metronomic tick, absolutely steady, like a clock that cannot be stopped. Above it crystalline metallic tones in a narrow, unresolved harmony with close intervals that never settle. A very low organ pedal underneath. Around the two-thirds point the tension increases: the tick stays constant but the harmony tightens and a rising line appears, then cuts off unresolved. Precise, beautiful and slightly wrong. No drums, no warmth.

---

**M07 · WORMHOLE** · 46 s · 356–402

> Abstract tension cue, 46 seconds. Begins in near silence with only a sub-bass tone felt more than heard. A continuous tone slides slowly and seems to fall forever without descending. Metallic textures stretch and distort. Around the last eight seconds a swell rises out of the noise and opens into clarity. Disorienting but not violent. No rhythm, no melody, no vocals.

---

**M09 · EPILOG — „Protocolul Acasă”** · 80 s, **buclă** · faza epilogue

> Warm ambient orchestral bed, 80 seconds, seamless loop. The five-note motif is now stated fully and harmonized by strings and soft church organ, calm and settled. Piano echoes it gently. The mood is arrival, gratitude and quiet pride. Gentle enough to sit under speech and under a room of children talking. Slow, sustained, resolved, no tension. No percussion, no words.

---

**M10 · CERTIFICAT** · 8 s · declanșat de interacțiunea `thanks`

> Short celebratory flourish, 8 seconds. A bright ascending figure on bells and harp-like strings, warm and childlike, ending on a clear sustained major chord with a soft shimmer. Joyful and gentle, not fanfare-loud. No percussion, no vocals.

---

## 5. Specificația tehnică

**API:** Eleven Music, plan plătit. Durata acceptată este între 3 secunde și 5 minute, deci toate piesele intră. Ieșire în **WAV** pentru mastere. Cheia se citește din `.env`, exact ca la voci — **nu o scrie în cod, în manifest, în bonuri sau în commit**.

**Fișiere:**

```
assets/music/
  masters/M01-prolog.wav          ← ce vine de la API, neatins
  M01-prolog.mp3                  ← varianta de rulare
  M01-prolog.receipt.json         ← prompt, durată, referință, sha256, dată, model
  manifest.json                   ← lista completă
```

`manifest.json` conține, pentru fiecare piesă: `id`, `sceneId`, `phase`, `startSec`, `durationSec`, `loop`, `fadeInSec`, `fadeOutSec`, `gainDb`, `sha256`, `promptRef`. Bonurile urmează același tipar ca `assets/scenarios/*/voice/*.receipt.json`, care există deja în repo.

**Post-procesare obligatorie, cu ffmpeg:**

- normalizare la **−26 LUFS integrat** pentru piesele care stau sub replici (M01, M04, M05, M06, M09) și **−20 LUFS** pentru cele care rămân singure (M02, M03, M07, M08, M10);
- vârf real limitat la −3 dBTP;
- fade in și fade out de minimum 500 ms pe toate, cu excepția lui M02, care se termină tăiat exact;
- pentru M01 și M09, verifică bucla: taie la trecerea prin zero și confirmă că nu se aude cusătura la a treia repetare.

**Integrare în player:**

Muzica trece prin **magistrala ambientală existentă**, ca să moștenească atenuarea automată sub voce și tranzițiile. Extinde `AmbientCue` cu o sursă de tip fișier în loc să inventezi un tip nou de cue; protocolul rămâne astfel aproape neschimbat. Redarea se ancorează la ceasul serverului, la fel ca restul, iar pe ecranele cu `playAudio: false` muzica nu se construiește deloc.

**Atenuarea sub voce:** când o replică e activă, muzica scade cu 9 dB în 300 ms și revine în 800 ms după. Dacă mecanismul de duck existent folosește altă valoare, aliniază-le.

---

## 6. Ce NU ai voie să schimbi

- Cronologia din `show.json`: momentele replicilor, ale efectelor și ale marcajelor rămân exact unde sunt.
- Cele 51 de fișiere de voce și manifestul lor.
- Filmul din `media/`.
- Efectele sintetizate din `sfx.ts` — muzica se adaugă peste ele, nu le înlocuiește.
- Comportamentul mașinii de stări sau al ceasului.

Și, ca întotdeauna pe acest proiect: fără `git push`, commit doar pe `board/nava-player`, fără chei în repo.

---

## 7. Criterii de acceptare

1. Cele zece fișiere există, cu mastere WAV, variante MP3, bonuri și manifest complet.
2. Nicio piesă nu depășește intervalul scenei ei; M05 se termină înainte de secunda 233 și **la 233 se aude tăcere reală**.
3. M01 și M09 se repetă în buclă fără cusătură audibilă.
4. Cu muzica pornită, toate cele 51 de replici rămân perfect inteligibile la volumul normal al sălii. Verifică pe cel puțin cinci replici din scene diferite.
5. Motivul „Acasă” este recognoscibil în M08 și M09 și doar sugerat în M01 și M05.
6. `npm run check` rămâne verde; nu apar dependențe noi în `package.json`.
7. `docs/MUZICA.md` documentează fiecare piesă, promptul folosit, unde intră și cum se regenerează.
8. Adaugă o intrare în `HANDOFF-LIVE.md` cu ce ai generat și ce a rămas de făcut.

---

## 8. Dacă ceva nu iese

Generările nu sunt reproductibile identic. Dacă o piesă nu convinge după trei încercări, **nu insista pe același prompt**: schimbă un singur parametru pe rând, notează în bon ce ai încercat, și lasă piesa marcată `needsReview: true` în manifest, ca să o asculte Christoph. Mai bine o piesă marcată decât una proastă strecurată în show.
