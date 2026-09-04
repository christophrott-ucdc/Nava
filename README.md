# NavaPlayer — „A Patra Lume”

NavaPlayer este playerul și serverul local al experienței imersive „A Patra Lume” de la UCDC HUB AI. Un singur executabil Windows redă filmul 4K sincronizat pe mai multe ecrane, suprapune avatarul 3D și subtitrările, rulează scenariul pe cue-uri și servește consola operatorului și aplicația celor zece tablete.

Documentul de intrare pentru dezvoltare și operare este [HANDOFF.md](HANDOFF.md). Arhitectura ratificată este în [docs/BRIEF.md](docs/BRIEF.md).

## Pornire în dezvoltare

Cerințe: Windows 11, Node.js 22 sau mai nou, npm și un fișier video H.264 4:2:0 la `media/cinema_4k_h264.mp4`.

Pentru pornirea completă pe Windows, dați dublu-click pe `RUN.bat`. Launcherul verifică mediul și asset-urile, instalează dependențele dacă lipsesc, construiește aplicația, pornește playerul și serverul local, apoi deschide consola operatorului. Implicit pornește în fereastră; pentru instalația fullscreen folosiți `RUN.bat --kiosk`. `RUN.bat --check` rulează toate verificările fără să deschidă playerul.

```powershell
npm install
Copy-Item config.example.json config.json
npm run check
npm run dev -- --windowed
```

În rolul `master`, după pornire:

- consola operatorului: `http://localhost:4321/control/`;
- tablete: `http://<ip-ul-PC-ului>:4321/tablet/`;
- stare: `http://localhost:4321/api/health`.

Comenzile principale pe ecranul master sunt `P` pre-show, `S` start, `Space` pauză/reluare, săgeți pentru ±5 secunde, `E` epilog, `R` restart și `I` identificarea ecranelor. `Esc` de două ori închide doar în modul windowed/dezvoltare.

## Verificare și distribuție

```powershell
npm run check          # tipuri + show.json + build + smoke tests
npm run dist           # executabil portabil + installer în dist-app/
```

Filmul de 2,5 GB nu intră în Git și nu este inclus în installer. Copiați `media/cinema_4k_h264.mp4` lângă executabil, păstrând structura `media/`. Avatarul și scenariul sunt incluse în pachet.

Vocile pre-generate sunt opționale. Fără chei sau manifest, playerul folosește vocea română disponibilă în Windows. Pentru generare, copiați variabilele necesare din `.env.example` într-un fișier local `.env`, apoi rulați `npm run tts`. Nu comiteți `.env`.

Setul expresiv pentru scenariul V3 este definit separat în `assets/show/voice-script-v3.json`: 17 replici ale Căpitanului și 18 ale Avatarului Navei. Fișierele generate și timpii de lip-sync sunt în `assets/voice/ro/manifest.json`. Comenzi utile:

```powershell
npm run validate:voices
npm run voice:reels
npm run tts -- --source assets/show/voice-script-v3.json --provider elevenlabs
```

Ultima comandă cere `ELEVENLABS_API_KEY` numai în mediul local. Cele două montaje de audiție sunt `assets/voice/ro/preview-capitan-v3.mp3` și `assets/voice/ro/preview-avatar-v3.mp3`. Sursa V3 rămâne separată de `show.json` până la migrarea integrală a cue-urilor vizuale și interactive, pentru a nu amesteca două versiuni de scenariu în aceeași experiență executabilă.

## Configurare

`config.json` este ignorat de Git. Porniți de la `config.example.json` și configurați rolul `master`/`follower`, ecranele, calea filmului, ieșirea audio și adresa masterului. Referința completă este în [docs/SPEC-SHEET.md](docs/SPEC-SHEET.md), iar procedura de show în [docs/OPERARE.md](docs/OPERARE.md).

## Structură

- `src/main`, `src/preload`: Electron, ferestre, căi, IPC;
- `src/renderer`: player, timeline, sincronizare și overlay-uri;
- `src/server`: server HTTP/WebSocket și mașina de stări;
- `src/web/control`: consola operatorului;
- `src/web/tablet`: interfața copiilor;
- `src/shared`: contractele TypeScript obligatorii;
- `assets/show/show.json`: singura sursă executabilă pentru scene, texte și timpi;
- `scripts`: build, verificări, TTS și utilitare media.

Proiect privat, fără licență de redistribuire (`UNLICENSED`).
