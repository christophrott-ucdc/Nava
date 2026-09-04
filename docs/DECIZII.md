# Decizii de arhitectură

## ADR-01 — Electron și server Node într-un singur produs

Acceptat. Electron poate controla ferestre kiosk pe display-uri, reda video cu accelerare hardware și găzdui serverul LAN. Costul de memorie este acceptabil pe PC-ul de show.

## ADR-02 — Vanilla TypeScript și esbuild

Acceptat. Playerul, consola și tabletele folosesc DOM direct. Nu se adaugă un framework UI; suprafața este mică, build-ul rapid și distribuția rămâne simplă.

## ADR-03 — Media prin `file://`

Acceptat. Filmul mare rămâne lângă executabil și beneficiază de seek/range nativ. Serverul nu retransmite 4K.

## ADR-04 — H.264 High 4:2:0 pentru film

Acceptat. Sursa HEVC Rext 4:4:4 nu este redată sigur în Chromium. Transcodarea NVENC păstrează 3840×2052/60 fps și reduce fișierul la aproximativ 2,5 GB.

## ADR-05 — `show.json` ca sursă executabilă

Acceptat. Scenele, textele și timpii nu sunt hardcodate și se pot reîncărca. Id-urile cue-urilor sunt stabile și leagă scenariul de vocile pre-generate.

## ADR-06 — Ceas server-authoritative cu sursă video

Acceptat. Serverul decide comenzile și starea; ecranul central raportează timpul real al filmului. Follower-ele fac seek peste pragul de 0,25 s și ajustare de rată ±3% sub prag.

## ADR-07 — Lead-in negativ

Acceptat. `start` intră la `phaseTime = -launchLeadInSec`, cu filmul înghețat pe primul cadru. La zero începe redarea, păstrând numărătoarea în timeline-ul aceleiași faze.

## ADR-08 — Pista V3 este locală și strictă

Actualizat. Cele 51 de asset-uri V3 sunt pre-generate și preîncărcate din manifest înainte de lansare. Cue-urile spectacolului au `fallback: silent`: un asset lipsă produce subtitrare, tăcere temporizată și eroare în jurnal, niciodată TTS Windows/browser. TTS live rămâne numai pentru teste explicite. Nicio cheie nu intră în Git sau renderer.

## ADR-09 — Avatar și entități separate

Actualizat pentru scenariul V3. Numai `CAPITANUL` folosește GLB/TalkingHead și lip-sync, exclusiv pe ecranul configurat cu `showAvatar: true`. `AVATAR_AI` este vocea și interfața/HUD-ul navei, fără corp umanoid. Cele trei civilizații sunt randate procedural pe canvas, astfel încât nu cer asset-uri sau licențe suplimentare.

## ADR-10 — Aplicații web pe LAN

Acceptat. Consola și tabletele sunt pagini responsive servite de master, fără instalare. Rețeaua de show trebuie tratată ca privată; autentificarea nu face parte din această versiune.

## ADR-11 — Film extern pachetului

Acceptat. Installerul include codul, avatarul, show-ul și vocile existente, dar nu filmul de 2,5 GB. Operatorul copiază directorul `media/` lângă executabil.

## ADR-12 — Limitele integrării fizice

Actualizat. Experiența V3 nu presupune robot Unitree, capsulă VR sau mutarea publicului. NavaPlayer nu comandă DMX, fum ori podeaua; evenimentele `cueFired` și tema publicată oferă puncte de extensie viitoare.

## ADR-13 — Cinci posturi, două perspective per tabletă

Acceptat. Cele cinci tablete sunt legate anonim de posturile 1–5. Fiecare interacțiune are zone A/B independente și opțiunea „Doar privesc”, fără nume, scor, clasament sau consens obligatoriu. La întrebarea Tehnologicei, serverul selectează determinist una dintre cele trei replici pre-generate: perspective diferite, alegeri identice sau niciun răspuns înregistrat.

## ADR-14 — Durată publică deterministă

Acceptat. Fluxul este 50 s pre-show + 10 s lead-in + 465 s film + 75 s epilog = 600 s. Rendererul face tranziția locală la praguri și nu așteaptă un round-trip WebSocket; serverul primește ecoul stării fără să reseteze ceasul.
