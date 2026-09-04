# Manual de operare

## Pregătirea PC-ului master

1. Puneți executabilul, `config.json` și folderul `media/` în același director. Filmul trebuie să fie `media/cinema_4k_h264.mp4`, dacă nu ați schimbat calea în config.
2. Conectați televizoarele, selectați modul desktop extins și confirmați ordinea display-urilor în Windows.
3. Porniți PC-ul și routerul dedicat. Permiteți NavaPlayer în Windows Firewall pe rețeaua privată.
4. Verificați sunetul pe ieșirea implicită și opriți notificările/sleep-ul Windows.
5. Lansați NavaPlayer. Ecranul tehnic poate fi identificat cu `I`.

Din checkout-ul de dezvoltare, varianta simplă este dublu-click pe `RUN.bat`. Aceasta pornește playerul în fereastră, serverul, consola și endpoint-ul tabletelor. Pentru rulare fullscreen/kiosk folosiți `RUN.bat --kiosk`; pentru diagnostic fără lansare, `RUN.bat --check`.

Consola este la `http://localhost:4321/control/`; de pe alt dispozitiv folosiți adresa LAN afișată în consolă. QR-ul duce copiii la `/tablet/`.

## Fluxul unei sesiuni

1. În starea `IDLE`, verificați: ecrane conectate, `videoReady`, numărul tabletelor și volumul. Pe ecranul master apare panoul de lansare; click oriunde sau `Space`/`Enter` pornește direct experiența.
2. Apăsați **PRE-SHOW** când intră copiii. Tabletele oferă rolurile; replicile sunt la 8, 28 și 48 de secunde.
3. Apăsați **START** când sala este pregătită. Urmează countdown-ul T−10…0 pe cadrul înghețat, apoi pornește filmul.
4. Folosiți **PAUSE/PLAY** numai dacă este necesar. Pentru repetiții puteți muta sliderul, sări la o scenă sau declanșa un cue manual.
5. La întrebarea Planetei Tehnologiei, lăsați timp copiilor să răspundă pe tablete; răspunsurile apar în consolă.
6. După revelație există un hold lung pe Pământ. Declanșați **EPILOG** când copiii trec în capsula VR sau lăsați tranziția automată la finalul filmului.
7. După ultima replică, apăsați **RESTART** pentru următorul grup. Ștergeți răspunsurile tabletelor numai după ce nu mai sunt necesare.

## Taste pe ecranul master

| Tastă | Acțiune |
|---|---|
| `P` | pre-show |
| `S` | start |
| `Space` | pauză/reluare |
| `←` / `→` | seek −5/+5 secunde |
| `E` | epilog |
| `R` | restart |
| `I` | identifică ecranele |
| `T` | test avatar |
| `O` | diagnostic local |
| `F` | fullscreen |
| `Esc` ×2 | ieșire, doar în mod windowed |

## Follower pe alt PC

În `config.json`, setați `role: "follower"` și `masterUrl: "ws://IP_MASTER:4321/ws"`. Media și avatarul trebuie să existe și pe follower. Lăsați `playAudio: false` pe toate ecranele follower dacă sunetul vine numai de la master.

## Depanare

- **VIDEO LIPSĂ:** verificați calea, numele și codec-ul H.264 High 4:2:0. HEVC Rext 4:4:4 nu este acceptat.
- **Consola nu se deschide:** verificați `/api/health`, portul, firewall-ul și dacă rolul este `master`.
- **Tableta nu se conectează:** trebuie să fie în aceeași rețea; folosiți IP-ul LAN, nu `localhost`.
- **Avatar absent:** confirmați calea GLB și că ecranul are `showAvatar: true`. Show-ul continuă fără avatar.
- **Fără voce:** verificați `playAudio`, ieșirea Windows și volumul. Fără manifest/TTS se folosește `speechSynthesis`; instalați o voce română Windows dacă lipsește.
- **Ecrane decalate:** cablați LAN-ul, verificați un singur `isClockSource`, evitați economisirea energiei și urmăriți driftul din OSD.
- **Proces blocat:** închideți NavaPlayer și porniți din nou. Jurnalele sunt în `runs/*.jsonl`.

## Înainte de public

Faceți o repetiție completă pe hardware-ul real. Verificați citirea subtitrărilor de la 17 m, volumul tuturor personajelor/SFX, ordinea display-urilor, scanarea QR pe zece tablete și tranziția copiilor spre VR. Vocile sintetice și opțiunile artistice trebuie aprobate de client.
