# Manual de operare

## Pregătirea PC-ului master

1. Puneți executabilul, `config.json` și folderul `media/` în același director. Filmul trebuie să fie `media/cinema_4k_h264.mp4`, dacă nu ați schimbat calea în config.
2. Conectați televizoarele, selectați modul desktop extins și confirmați ordinea display-urilor în Windows.
3. Porniți PC-ul și routerul dedicat. Permiteți NavaPlayer în Windows Firewall pe rețeaua privată.
4. Verificați sunetul pe ieșirea implicită și opriți notificările/sleep-ul Windows.
5. Lansați NavaPlayer. Ecranul tehnic poate fi identificat cu `I`.

Din checkout-ul de dezvoltare, varianta simplă este dublu-click pe `RUN.bat`. Aceasta pornește playerul în fereastră, serverul, consola și endpoint-ul tabletelor. Pentru rulare fullscreen/kiosk folosiți `RUN.bat --kiosk`; pentru diagnostic fără lansare, `RUN.bat --check`.

Consola este la `http://localhost:4321/control/`; de pe alt dispozitiv folosiți adresa LAN afișată în consolă. QR-ul duce copiii la `/tablet/`.

Consola din browser nu este ecranul spectacolului. Filmul și Căpitanul apar în fereastra Electron separată **A Patra Lume — Nava**. **PRE-SHOW**, **START**, **START EXPERIENCE**, `Space` și `Enter` aduc automat acea fereastră în față; folosiți **ARATĂ PLAYERUL** dacă a fost acoperită ulterior.

## Fluxul unei sesiuni

1. În starea `IDLE`, verificați: ecrane conectate, `videoReady`, cinci tablete și volumul. Pe ecranul master apare panoul de lansare; click oriunde, **PORNEȘTE EXPERIENȚA** sau `Space`/`Enter` pornește fluxul complet.
2. Pre-show-ul durează 50 s și oferă pe cele cinci tablete posturile NAVIGAȚIE, PROPULSIE, COMUNICAȚII, BIOSEMNALE și MEMORIE, câte unul pentru fiecare pereche de copii. Cele două jumătăți egale sunt DIRECȚIE/TRASEU, ENERGIE/STABILITATE, CUVINTE/SEMNAL, PULS/LEGĂTURĂ și AMINTIRE/TIMP. Replicile sunt la 4, 15, 24, 35 și 43 s.
3. Lansarea pornește automat după pre-show. Urmează countdown-ul T−10…0 pe cadrul înghețat, apoi filmul. Pentru a omite pre-show-ul, folosiți **SARI LA LANSARE** sau `S` pe ecranul master ori butonul mare **START EXPERIENCE** din consolă; în `IDLE`/`PRE-SHOW`, `Space` și `Enter` din consolă sunt shortcut-uri pentru același start imediat. `P` pornește explicit pre-show-ul.
4. Folosiți **PAUSE/PLAY** numai dacă este necesar. Pentru repetiții puteți muta sliderul, sări la o scenă sau declanșa un cue manual.
5. La întrebarea Planetei Tehnologiei, lăsați timp copiilor să răspundă pe tablete; răspunsurile apar în consolă.
6. Playerul oprește determinist masterul video la 465 s și continuă automat în epilog pe aceleași cinci ecrane și aceleași cinci posturi. Publicul nu se mută, iar Căpitanul rămâne numai în fereastra GLB de pe ecranul configurat.
7. După ultima replică, apăsați **RESTART** pentru următorul grup. Ștergeți răspunsurile tabletelor numai după ce nu mai sunt necesare.

## Taste pe ecranul master

| Tastă | Acțiune |
|---|---|
| `P` | pre-show |
| `S` | start |
| `Space` | din idle: pre-show; în film: pauză/reluare |
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
- **Se aude, dar nu se vede filmul/avatarul:** apăsați **ARATĂ PLAYERUL** în consolă; browserul de regie și fereastra spectacolului sunt suprafețe separate. La start direct există intenționat 10 s de countdown, iar prima apariție a Căpitanului este la aproximativ 19 s de la comandă. Statusul trebuie să treacă din `T−10 · ÎNCĂRCAT` în `RULEAZĂ`; `BLOCAT` indică lipsa progresului cadrelor.
- **Consola nu se deschide:** verificați `/api/health`, portul, firewall-ul și dacă rolul este `master`.
- **Tableta nu se conectează:** trebuie să fie în aceeași rețea; folosiți IP-ul LAN, nu `localhost`.
- **Avatar absent:** confirmați calea GLB și că ecranul are `showAvatar: true`. Show-ul continuă fără avatar.
- **Fără voce:** verificați `playAudio`, ieșirea Windows, volumul, `assets/voice/ro/manifest.json` și existența MP3-ului cue-ului. Vocile V3.3 de producție nu cad pe TTS Windows/browser; lipsa unui asset produce subtitrare + tăcere și o eroare explicită în jurnal.
- **Ecrane decalate:** cablați LAN-ul, verificați un singur `isClockSource`, evitați economisirea energiei și urmăriți driftul din OSD.
- **Proces blocat:** închideți NavaPlayer și porniți din nou. Jurnalele sunt în `runs/*.jsonl`.

## Înainte de public

Faceți o repetiție completă pe hardware-ul real. Verificați citirea subtitrărilor de la 17 m, volumul tuturor personajelor/SFX, ordinea celor cinci display-uri, scanarea QR și interacțiunile pe cinci tablete, precum și trecerea continuă la epilog fără mutarea copiilor. Ascultați cele trei montaje V3.3 înainte de public.
