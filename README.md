# NavaPlayer — „A Patra Lume”

NavaPlayer este playerul și serverul local al experienței imersive „A Patra Lume” de la UCDC HUB AI. Un singur executabil Windows redă filmul 4K sincronizat pe cinci ecrane, suprapune Căpitanul 3D și subtitrările, rulează scenariul pe cue-uri și servește consola operatorului și cele cinci tablete folosite de zece copii în perechi.

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

În starea inițială, click oriunde pe ecran, butonul **PORNEȘTE EXPERIENȚA** sau `Space`/`Enter` pornește fluxul complet, de la primirea publicului. După 50 de secunde, lansarea continuă automat. **SARI LA LANSARE** sau `S` omit primirea și pornesc direct numărătoarea T−10. `P` pornește explicit primirea publicului. În timpul filmului, `Space` pune pauză/reia; săgețile fac salt ±5 secunde, `E` intră în epilog, `R` revine în idle și `I` identifică ecranele. `Esc` de două ori închide doar în modul windowed/dezvoltare.

Pentru test rapid din consola operatorului, butonul mare **START EXPERIENCE** pornește direct numărătoarea T−10 și filmul; în `IDLE` sau `PRE-SHOW`, `Space` și `Enter` din consolă fac același lucru. Acest shortcut de test nu schimbă fluxul complet al butonului de pe ecranul master.

Consola din browser este numai pentru regie; filmul și Căpitanul sunt randate în fereastra Electron separată **A Patra Lume — Nava**. Comenzile de pornire aduc automat playerul în față. Butonul **ARATĂ PLAYERUL** îl readuce manual dacă operatorul revine în browser.

## Verificare și distribuție

```powershell
npm run check          # tipuri + show.json + build + smoke tests
npm run dist           # executabil portabil + installer în dist-app/
```

Pentru verificarea vizuală live a compositorului Electron (overlay, cadre video și avatar), porniți aplicația cu DevTools Protocol și apoi rulați testul în alt terminal:

```powershell
.\node_modules\.bin\electron.cmd --remote-debugging-port=19191 . --config config.json --windowed
npm run smoke:renderer
```

Testul păstrează capturile diagnostice în `runs/` și confirmă faptul că două cadre succesive diferă, `currentTime`/contorul de cadre avansează, overlay-ul ascuns nu acoperă filmul și canvasul GLB este vizibil la prima replică a Căpitanului.

Filmul de 2,5 GB nu intră în Git și nu este inclus în installer. Copiați `media/cinema_4k_h264.mp4` lângă executabil, păstrând structura `media/`. Avatarul și scenariul sunt incluse în pachet.

Pista vocală V3.3, adaptată scenic în limba română, este pre-generată și face parte din spectacolul executabil. Pentru toate cue-urile de producție, `fallback: "silent"` interzice vocea Windows/browser: dacă un MP3 lipsește, playerul păstrează subtitrarea, notează eroarea și folosește tăcere temporizată. Fallback-ul TTS rămâne disponibil numai pentru cue-uri ad-hoc/de test care îl cer explicit. Pentru regenerare, copiați variabilele necesare din `.env.example` într-un fișier local `.env`, apoi rulați `npm run tts`. Nu comiteți `.env`.

Setul expresiv este definit în `assets/show/voice-script-v3.json` și sincronizat integral în `assets/show/show.json`: 17 replici ale Căpitanului, 18 ale Vocii Navei și 16 asset-uri ale civilizațiilor/ecourilor. Manifestul conține 51 de clipuri; într-o reprezentație se redau 49, deoarece la 6:35 serverul alege exact una dintre cele trei variante ale Tehnologicei în funcție de cele zece perspective. Fișierele și timpii de lip-sync sunt în `assets/voice/ro/manifest.json`. Comenzi utile:

```powershell
npm run validate:voices
npm run sync:voices
npm run voice:reels
npm run qa:voices
npm run tts -- --source assets/show/voice-script-v3.json --provider elevenlabs
```

Generarea și controlul de dicție cer `ELEVENLABS_API_KEY` numai în mediul local. Montajele de audiție sunt `assets/voice/ro/preview-capitan-v3.mp3`, `assets/voice/ro/preview-avatar-v3.mp3` și `assets/voice/ro/preview-civilizatii-v3.mp3`. După orice modificare de text sau timing vocal, regenerați clipurile afectate, rulați `npm run voice:reels`, `npm run qa:voices`, `npm run sync:voices` și apoi `npm run check`.

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
