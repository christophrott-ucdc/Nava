# Producția vocilor pentru cele patru experiențe

## Contract și surse

Producția folosește cele 163 de replici și alternative din `assets/scenarios/*/dialogue.ro.draft.json`, în română. Fișierele scenariului activ și vocile legacy rămân separate. Generarea este autorizată de cererea utilizatorului din 5 septembrie 2026.

Distribuția Căpitanului și Avatarului AI folosește vocile ElevenLabs furnizate de utilizator. Lumina, Natura și Tehnologic păstrează distribuția din `assets/show/voice-script-v3.json`. Cheia este citită exclusiv din mediul procesului sau `.env` local ignorat de Git; nu este inclusă în documente, manifeste sau frontend.

Model: `eleven_v3`, limba `ro`, MP3 44.1 kHz / 192 kbps. Viteza solicitată este naturală, `1`; nu se aplică `atempo`, tăierea replicii sau accelerarea redării. Stabilitatea este `0.5`; celelalte caracteristici ale fiecărei voci provin din distribuția existentă. Replicile sunt trimise exact, fără indicații scenice introduse în textul rostit.

Endpointul [ElevenLabs cu timestampuri](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps) furnizează alinierea. Conversia la cuvinte folosește `alignmentToWords` existent în proiect. Visemele folosesc exact `distributeWordVisemes` din renderer, încărcat prin esbuild; nu există o a doua implementare fonetică.

## Fișiere și reluare

Pentru fiecare profil, `assets/scenarios/<profil>/voice/ro/` conține:

- `<cue-id>.mp3`: înregistrarea generată pentru o singură replică sau alternativă;
- `<cue-id>.receipt.json`: textul, castingul, identificatorii răspunsului furnizorului, hashul SHA-256, durata, alinierea și visemele;
- `manifest.json`: indexul compatibil cu contractul vocal al playerului;
- `production-report.json`: inventarul disponibil și depășirile sloturilor editoriale;
- `preview-all-branches.mp3`: reel de ascultare care include succesiv **toate alternativele**, nu o rulare posibilă a show-ului;
- `preview-transcription.json` și `transcription-qa.json`: transcriere independentă și comparație automată cu textele, când se rulează QA.

Audio și receipt sunt salvate înaintea verificării FFprobe. Reluarea reutilizează un clip numai când textul, vocea și parametrii coincid și hashul audio este valid. Manifestul se salvează după fiecare clip. Un răspuns de autentificare/cotă sau o eroare de rețea oprește cererile ulterioare; scriptul nu repetă automat o cerere cu rezultat incert.

```powershell
node scripts/scenario-voices.mjs --dry-run
node scripts/scenario-voices.mjs
node scripts/scenario-voices.mjs --check
node scripts/scenario-voices.mjs --reels
node scripts/scenario-voices.mjs --transcribe
```

Primele două comenzi planifică și produc/reiau. `--check` este local și nu apelează furnizorul. `--reels` concatenează fără a modifica clipurile. `--transcribe` folosește Scribe v2, cu cache după hashul reelului; presupune acces și cotă la serviciul de transcriere.

## Criterii de verificare

FFprobe măsoară durata reală, codec și frecvența de eșantionare. Verificarea locală validează hashurile, castingul, textul, lungimile vectorilor de aliniere/viseme, monotonia timpilor și încadrarea lor în audio. O depășire a slotului editorial se raportează distinct: nu justifică alterarea filmului sau accelerarea vocii. Integrarea poate redistribui numai spațiul disponibil înaintea următoarei replici/interacțiuni din aceeași fază și trebuie verificată separat.

QA prin transcriere verifică toate alternativele, ignorând punctuația și majusculele. Pragul tehnic este WER 18%; acesta este un detector de diferențe mari, nu o certificare a interpretării. Ascultarea umană a pronunției, emoției, volumului și sincronizării GLB pe sistemul fizic rămâne obligatorie înaintea prezentării publice.

## Rezultat măsurat

Producția din 5 septembrie 2026 a generat efectiv **163/163 clipuri**, fără erori de furnizor. A doua execuție a reutilizat **163/163**, cu zero cereri noi de sinteză. Sunt disponibile 32.478.774 bytes de audio individual, 2.677 segmente de cuvinte aliniate și 14.466 viseme. Costul raportat de furnizor este de 16.820 caractere; acesta este un consum de caractere, nu o estimare monetară.

| Profil | Clipuri | Durată cumulată, toate alternativele | Caractere raportate | WER Scribe |
|---|---:|---:|---:|---:|
| 5–10 | 42 | 290,00 s | 3.599 | 0,33% |
| 10–15 | 41 | 365,12 s | 4.587 | 0,27% |
| 15–18 | 40 | 359,60 s | 4.539 | 0,28% |
| Adulți | 40 | 327,68 s | 4.095 | 0,31% |

Durata cumulată este 1.342,40 secunde și include toate alternativele incompatibile între ele. Nu reprezintă lungimea unei rulări a show-ului. Toate cele patru verificări Scribe au trecut. Primele trei transcrieri au câte două diferențe, la grafia numelor de lumi; pronunția acestor nume trebuie ascultată înaintea prezentării publice. La adulți, ASR a recunoscut „a oprit” în loc de „au oprit” și a omis pronumele contractat din „ce-i”; acestea sunt două puncte de ascultare, nu dovezi automate că sinteza este incorectă.

Au trecut verificarea de sintaxă a generatorului, reluarea fără noi sinteze, decodarea completă FFmpeg a tuturor celor 163 MP3, verificarea SHA-256, frecvenței 44,1 kHz, aliniamentelor și identității visemelor față de regulile rendererului. Cele patru reels de ascultare și transcrierile sunt disponibile în directoarele profilurilor.

**Diferența față de sloturile editoriale:** 52 de clipuri sunt mai lungi decât bugetul propus în draft, unele doar cu 40 ms. În majoritatea cazurilor există pauză disponibilă. Auditul brut al timpilor din draft identifică șase puncte concrete pentru integrare, fără modificarea fișierelor audio:

| Cue | Interval rostit în draft | Problemă de rezolvat în programarea runtime |
|---|---|---|
| `s1015-02` | preshow 10 → 22,88 | următoarea replică este la 21 |
| `s1015-25` | play 404 → 418 | următoarea replică este la 416 |
| `s1015-30` | play 456 → 465,04 | trece cu 40 ms de finalul filmului |
| `s1015-35` | epilogue 45 → 55,24 | următoarea replică este la 54 |
| `s1518-29` | play 454 → 466,24 | trece de finalul filmului |
| `s1518-37` | epilogue 72 → 75,76 | trece de finalul epilogului |

Aceasta este comparația cu sursele editoriale nemodificate. Programarea integrată trebuie să trateze și marjele înaintea schimbării fazei și deschiderea interacțiunilor; un test al existenței vocilor nu substituie verificarea acestor limite.
