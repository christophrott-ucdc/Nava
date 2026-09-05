# Naratorul tutorialului și al finalului interactiv

Producție realizată la 5 septembrie 2026, la cererea explicită a utilizatorului. Audio separat de film, Căpitan, Avatar și de cele 163 de replici ale scenariilor. Nu s-au modificat fișierele vocale legacy sau timpii show-ului.

## Casting documentat

Catalogul oficial disponibil contului ElevenLabs a fost consultat prin `GET /v2/voices`. Trei voci profesionale masculine cu limba nativă `ro` au primit aceeași probă românească, inclusiv „direcție”, „împreună”, „Pământul” și predarea către Căpitan:

| Probă | Voce | Durata |
|---|---|---:|
| `auditions/narrator-1.mp3` | Mihai — Voice That Inspires Confidence | 11,52 s |
| `auditions/narrator-2.mp3` | Nick — Professional Radio and TV Spots | 10,32 s |
| `auditions/narrator-3.mp3` | Daniel Mihai — Native Romanian Voice | 13,36 s |

Vocea de producție este **Mihai**, ID `bgVGH727uJ1Qj9P9egUj`. Selecția are drept bază descrierea verificată în catalog: bariton grav, cald, expresiv, potrivit narațiunii și explicațiilor. Metadata exactă este păstrată în `assets/experience/voice/ro/auditions/catalog-evidence.json`. Selecția nu reprezintă o audiție umană sau o certificare a timbrului în sală. Cele trei probe sunt disponibile pentru comparație pe sistemul fizic. Nu s-a clonat și nu s-a solicitat imitarea lui Răzvan Exarhu.

## Contractul de redare

`assets/experience/voice/ro/manifest.json` conține `voiceId`, `voiceName` și `clips`, indexat după cue ID. Fiecare clip are `file` relativ la directorul manifestului, `durationSec`, textul exact pentru subtitrare și `sha256`.

Sunt produse **12 clipuri**, total **99,68 secunde** incluzând toate variantele, între 3,92 și 10,96 secunde fiecare:

- `intro`, `touch`;
- `age-5-10-practice`, `age-10-15-practice`, `age-15-18-practice`, `adults-practice`, `legacy-v3-practice`;
- `cooperate`, `ready`, `handoff`, `hint`, `finale`.

Durata totală a inventarului nu este durata tutorialului: fiecare rulare folosește o singură variantă de practică și așteaptă acțiunile participanților. `ready` cere privirea către TV, nu o confirmare suplimentară inexistentă. `finale` este o invitație generică pentru interacțiunea de după show și trebuie redat după terminarea replicilor existente din epilog. Clipurile nu se lansează simultan pe posturi; runtime-ul orchestrează o singură voce în sală.

## Generare și reluare

```powershell
node scripts/experience-voices.mjs --auditions
node scripts/experience-voices.mjs
node scripts/experience-voices.mjs --check
node scripts/experience-voices.mjs --transcribe
```

Primele două comenzi pot genera audio contra consumului de caractere al contului. `--check` nu face cereri către furnizor. `--transcribe` reutilizează audio și apelează Scribe numai dacă hashul reelului s-a schimbat. Parametri: `eleven_v3`, limba `ro`, `mp3_44100_192`, stabilitate 0,5, similarity 0,75, viteză 1. Nicio coborâre artificială de tonalitate, accelerare, decupare sau schimbare de tempo.

Fiecare clip are un receipt cu hashul cererii, hashul audio, textul, vocea, parametrii, alinierea furnizorului și identificatorii răspunsului. La reluare, același clip valid este reutilizat fără sinteză nouă. Un ledger `.pending.json` este scris înaintea cererii; un rezultat de rețea incert blochează repetarea până la reconcilierea manuală cu istoricul ElevenLabs. Cheia este citită exclusiv din mediu sau `.env` ignorat de Git; nu este inclusă în manifeste, documente sau frontend. Nu există generare plătită automată în timpul show-ului.

## Verificări efectuate

- Toate cele 15 MP3 individuale (12 producție + 3 probe): FFprobe și decodare FFmpeg integrală, MP3 44,1 kHz, fără eroare.
- Producția repetată prin verificare: **0 clipuri generate, 12 reutilizate**; hashuri și manifest concordante.
- Reel `preview-all-clips.mp3`, transcris independent prin ElevenLabs Scribe v2: **216 de cuvinte așteptate, 216 transcrise, distanță de editare 0, WER 0%**. Punctuația și majusculele sunt ignorate în comparație.
- `transcription.json` și `transcription-qa.json` păstrează rezultatul; alinierea TTS nu este confundată cu transcrierea independentă.

Rămân audiția umană comparativă și verificarea volumului, dicției percepute, expresivității și inteligibilității peste ambianță în instalația reală. WER 0% verifică textul recunoscut, nu calitatea interpretării sau potrivirea cu toate grupele de vârstă.

Surse API: [generare cu timestampuri](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps), [practici de sinteză și setări](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices).
