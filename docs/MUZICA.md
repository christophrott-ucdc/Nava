# Coloana sonoră „A Patra Lume — Protocolul Acasă”

Producție și integrare: 5 septembrie 2026. Cererea executată este [PROMPT-CODEX-MUZICA.md](PROMPT-CODEX-MUZICA.md). Zece piese Eleven Music reale, zece mastere WAV, zece MP3 de rulare, bonuri individuale și manifest complet în `assets/music/`. Nu există generare muzicală sau cost ElevenLabs în timpul spectacolului.

## Producția

Model: **music_v2**. M08 a fost generat primul. M01, M05, M09 și M10 au primit efectiv `conditioning_ref` cu `song_id` al M08 și intervalul 0–30 s. M09 folosește intensitatea `high`; celelalte `medium`. Referința ghidează muzica, dar recunoașterea motivului necesită audiție; nu este garantată prin simpla trimitere a referinței. Niciun prompt nu numește un artist sau film.

API-ul documentează PCM lossless, nu un enum WAV. S-a cerut `pcm_48000`; răspunsurile stereo sunt păstrate byte-for-byte în `masters/*.api-pcm`. Masterele WAV adaugă numai containerul RIFF, fără modificarea eșantioanelor, resampling, normalizare sau compresie. Bonul păstrează separat hashul răspunsului și al containerului WAV. Surse verificate: [Compose Music](https://elevenlabs.io/docs/api-reference/music/compose), [Music / Audio Reference](https://elevenlabs.io/docs/eleven-creative/products/music).

Cheia se citește exclusiv din mediul procesului sau `.env` ignorat. Bonurile conțin prompt, cerere, model, dată, hashuri, referință și identificatorii furnizorului. Nu conțin cheia. Un registru pending previne repetarea automată a unei cereri cu rezultat incert. La reluare sunt reutilizate masterele existente; re-normalizarea nu regenerează muzica.

## Durate și abateri explicite față de estimările brief-ului

Duratele solicitate însumează **621 s**, nu aproximativ opt minute. MP3-urile însumează **619 s** după pregătirea buclelor. Suprapunerile și limitarea pe scene fac ca acestea să nu adauge timp show-ului.

| ID | Piesa | Master WAV | MP3 | Redare efectivă | LUFS măsurat |
|---|---|---:|---:|---|---:|
| M01 | Semnalul | 60 s | 59 s | preshow 0–50 | −26,26 |
| M02 | Zece | 21 s | 12 s | play −10–0, offset MP3 2 s | −20,30 |
| M03 | Decolarea | 70 s | 70 s | play 0–60 | −20,26 |
| M04 | Planeta Luminii | 84 s | 84 s | play 60–144 | −26,25 |
| M05 | Planeta Naturii | 88 s | 88 s | play 144–232 | −26,27 |
| M06 | Planeta Tehnologiei | 110 s | 110 s | play 246–356 | −26,23 |
| M07 | Wormhole | 46 s | 46 s | play 356–402 | −20,26 |
| M08 | A patra lume | 63 s | 63 s | play 402–465 | −20,26 |
| M09 | Protocolul Acasă | 80 s | 79 s | epilogue 0–75 | −26,26 |
| M10 | Certificat | 8 s | 8 s | la cue-ul `thanks`, limitat la sfârșitul fazei | −20,27 |

Furnizorul a returnat **21 s pentru cererea M02 de 12 s**. Răspunsul a fost păstrat integral; nu s-a plătit o nouă generare. Derivatul folosește ultimele 12 s, iar playerul ultimele zece din derivat, pentru ca finalul să cadă la zero. Recuperarea acestui răspuns este consemnată în bon; identificatorul HTTP nu a fost recuperat. M03 păstrează coada în asset, dar playerul o taie cu fade la limita de 60 s. M10 începe la epilogue 68 în legacy și are șapte secunde de redare până la 75; masterul de opt secunde rămâne disponibil.

M01 și M09 au derivate cu suprapunere tail/head de o secundă, niveluri complementare și fade de 500 ms. Masterele rămân intacte. Sunt pregătite înregistrări de trei repetări pentru audiție. Îmbinările MP3 decodate sunt în toleranța numerică de trecere prin zero: −95,48 dBFS și −113,08 dBFS; acest rezultat nu certifică inexistența unei cusături muzicale perceptibile.

## Integrare

`AmbientCue` primește `source.type: "file"`, cu fișier, hash, durată, fereastră de redare, offset, loop și gain. Manifestul se convertește în cue-uri suplimentare în memorie. Fișierul `show.json` și replicile nu sunt editate. Cue-urile de fișier nu înlocuiesc ambientul procedural sau tema; sursele ajung în aceeași magistrală duck → silence → master ca paturile existente.

Playerul furnizează ceasul fazei deja sincronizat de server, inclusiv rata repetiției. Buffer-ele sunt verificate SHA256 și decodate înainte de folosire. Pauza oprește sursele; reluarea, seek-ul și reconectarea folosesc offsetul fazei, nu repornirea melodiei de la început. Fiecare sursă are oprire programată la limita scenei. Ecranele cu `playAudio: false` nu cer manifestul și nu construiesc graful muzical. Comanda existentă **ambient** controlează și muzica. Nivelul master moștenește `ambient.volume × sfxVolume`.

Atenuarea este **−9 dB în 300 ms**, cu revenire în **800 ms**, atât pentru vocile show-ului cât și pentru narator. Proprietarii voice/narrator sunt independenți pentru a nu elibera prematur duck-ul. Valoarea istorică `ambient.duck` este înlocuită în motor de această regulă cerută de brief; restul configurației rămâne intact. Layer-ele procedurale și SFX-ul sintetizat sunt păstrate. Noua poartă de tăcere afectează numai magistrala ambientală, nu vocile/SFX.

**La secunda 233 există o contradicție în brief:** show-ul programează chiar atunci replica `v3-nature-0453`, plus o replică a Căpitanului la 241. Muzica se termină la 232; ambientul ajunge la gain exact zero la 232 și rămâne zero până la 246. Vocile originale rămân audibile. A numi întregul mix „tăcere absolută” ar fi incorect; mutarea sau anularea acelor replici ar încălca cerința explicită de păstrare a show-ului.

Cele patru scenarii pe vârste folosesc aceleași nouă cue-uri de partitură, pe timeline-ul comun. M10 se leagă strict de o interacțiune `thanks` existentă; dacă profilul nu include această interacțiune legacy, nu inventează una și nu redă flourish-ul. Finalul interactiv și naratorul acelor profiluri își păstrează logica.

Serverul validează pachetul și servește numai MP3-urile din manifest prin `/assets/music/:file`; `/api/music` expune metadatele. Dacă pachetul lipsește sau este invalid, logul avertizează, iar vocile și ambientul procedural rămân disponibile. Nu este adăugat un gate nou de readiness. Pentru modificarea pachetului după pornire, repornește aplicația, astfel încât manifestul și buffer-ele să fie revalidate.

## Regenerare și QA

```powershell
node scripts/music-produce.mjs --check
node scripts/music-produce.mjs
node scripts/music-audio-qa.mjs
node scripts/music-audio-qa.mjs --transcribe
node scripts/experience-renderer-review.mjs --music-only
npm run check
npm run smoke:scenarios
```

Prima comandă este offline. A doua poate genera piese lipsă folosind cheia autorizată; piesele cu master și bon valide sunt reutilizate. Nu există retry plătit automat. Pentru o variantă artistică nouă, arhivează explicit asseturile/bonurile acelei piese, modifică un singur parametru și păstrează legătura cu varianta anterioară. Nu șterge pending-uri fără reconcilierea istoricului furnizorului. `--transcribe` trimite mixurile QA către Scribe, reutilizând transcrierile dacă hashurile nu s-au schimbat.

Verificări executate: decodare MP3 integrală, mastere stereo 48 kHz, hashuri, ținte LUFS în toleranță de 0,3 dB și toate vârfurile sub −3 dBTP; bucle numerice și export de trei repetări; renderer Electron cu zece buffer-e reale, cinci mixuri voce+muzică, tranziții, pauză/relansare, mute, seek în tăcere, M10 și oprirea la final. `npm run check` trece cu **162 teste**, `smoke:scenarios` cu cele patru profiluri, iar `npm run smoke:renderer` a trecut cu filmul și GLB-ul reale. Nu există dependențe noi în `package.json`.

Rapoarte: `runs/debug/music/audio-qa.json`, `renderer.json`, `intelligibility.json`; audiții și trei bucle în același director. Galeria audio este `runs/debug/music/index.html`. Transcrierea nu înlocuiește audiția: diferențele de nume proprii sau cifre sunt păstrate în raport, nu ascunse ca potriviri perfecte.

## Ce rămâne pentru audiție

Toate piesele au `needsReview: true`, pentru aprobarea artistică a lui Christoph: recognoscibilitatea motivului, naturalețea buclelor, discreția spectrală și gustul muzical. Producția și verificarea tehnică sunt efectuate; nu se pretinde audiție umană. În sală trebuie ascultate cele cinci exemple și o rulare completă, cu verificarea inteligibilității celor 51 de replici, a nivelului sub-bas și a ieșirii audio unice. Acești pași împiedică declararea acceptanței artistice/fizice drept încheiată doar pe baza testelor automate.

## Prompturile efectiv folosite

Textele de mai jos sunt cele din brief. Cererile adaugă explicit instrumental, fără cuvinte sau tobe, și spațiu spectral pentru dialog. Cererea exactă și parametrii de referință sunt în bonul fiecărei piese.


### M01 · M01-prolog.mp3

Ambient orchestral bed, 60 seconds, seamless loop. Very low church organ pedal tone, barely moving. Distant, sparse metallic pings with long decay, like a signal arriving from far away, irregular and unhurried. High sustained strings enter and fade, almost inaudible. A fragment of a piano motif appears once, incomplete, then dissolves. Mysterious and patient, not threatening, suitable under spoken dialogue. Extremely wide dynamic range, mostly quiet. No percussion, no melody in the mid frequencies.

Referință audio: M08, 0–30 s.


### M02 · M02-numaratoare.mp3

Rising tension cue, 12 seconds. A ticking pulse begins steady and slowly accelerates. Underneath, a low organ tone and strings build in a continuous rising motion that seems to climb without ever settling. The final second resolves into a single deep impact and immediate silence. Precise, mechanical, exciting rather than frightening. No melody, no vocals.

Referință audio: fără referință.


### M03 · M03-decolare.mp3

Cinematic orchestral cue, 70 seconds. Opens immediately at full power: church organ in ascending arpeggiated ostinato, repeating and building, with sustained strings above in long rising lines. The first twenty seconds are the emotional peak — vast, uplifting, a sense of leaving something enormous behind. From around thirty seconds the texture gradually thins, the organ recedes, and only shimmering high strings and a distant pedal tone remain, opening into vastness. Minimalist and repetitive rather than melodic. No drums.

Referință audio: fără referință.


### M04 · M04-lumina.mp3

Warm ambient orchestral cue, 84 seconds. Golden and shimmering: high strings in slow suspended harmony, delicate harp-like arpeggios drifting in and out, wordless choral pad very soft in the background. A sense of standing in warm light, awe without grandeur. Very sparse in the middle frequencies so speech can sit on top. Slow harmonic rhythm, long sustains, gentle. No percussion, no words.

Referință audio: fără referință.


### M05 · M05-natura.mp3

Organic ambient cue, 88 seconds. Built on the rhythm of slow breathing: a low woodwind-like tone swells and recedes about every eight seconds. Beneath it a wet, resonant drone and occasional distant low notes like something large and calm. A fragment of a piano motif appears twice, unfinished. Living, humid, unhurried. The last ten seconds thin out until almost nothing remains. No percussion, no melody in the mid range.

Referință audio: M08, 0–30 s.


### M06 · M06-tehnologie.mp3

Cold minimalist cue, 110 seconds. A relentless metronomic tick, absolutely steady, like a clock that cannot be stopped. Above it crystalline metallic tones in a narrow, unresolved harmony with close intervals that never settle. A very low organ pedal underneath. Around the two-thirds point the tension increases: the tick stays constant but the harmony tightens and a rising line appears, then cuts off unresolved. Precise, beautiful and slightly wrong. No drums, no warmth.

Referință audio: fără referință.


### M07 · M07-wormhole.mp3

Abstract tension cue, 46 seconds. Begins in near silence with only a sub-bass tone felt more than heard. A continuous tone slides slowly and seems to fall forever without descending. Metallic textures stretch and distort. Around the last eight seconds a swell rises out of the noise and opens into clarity. Disorienting but not violent. No rhythm, no melody, no vocals.

Referință audio: fără referință.


### M08 · M08-revelatia.mp3

Intimate orchestral cue, 63 seconds. Solo piano states a simple five-note ascending motif, unhurried, with space between phrases. After the first statement, warm sustained strings enter underneath in slow harmonic motion over a pedal tone. A church organ swells very softly in the low register around the two-thirds mark, never dominating. The feeling is recognition and homecoming after a long journey — moving but restrained, hopeful rather than triumphant, no percussion, no fanfare. Ends open and unresolved on a sustained chord. Wide dynamic range, cinematic, spacious reverb.

Referință audio: fără referință.


### M09 · M09-epilog.mp3

Warm ambient orchestral bed, 80 seconds, seamless loop. The five-note motif is now stated fully and harmonized by strings and soft church organ, calm and settled. Piano echoes it gently. The mood is arrival, gratitude and quiet pride. Gentle enough to sit under speech and under a room of children talking. Slow, sustained, resolved, no tension. No percussion, no words.

Referință audio: M08, 0–30 s.


### M10 · M10-certificat.mp3

Short celebratory flourish, 8 seconds. A bright ascending figure on bells and harp-like strings, warm and childlike, ending on a clear sustained major chord with a soft shimmer. Joyful and gentle, not fanfare-loud. No percussion, no vocals.

Referință audio: M08, 0–30 s.
