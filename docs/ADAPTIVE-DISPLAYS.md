# TV-uri adaptive: 2, 3, 4 și 5 ecrane

Implementat la 13 septembrie 2026. Configurațiile locale `config.json`,
`config.wall.local.json` și `config.auto.local.json` activează detectarea adaptivă.
Modificarea intră în funcțiune la următoarea pornire a aplicației construite din
acest repository. Executabilul deja împachetat nu se actualizează prin editarea surselor.

## Comportament

- Electron numără ieșirile externe eligibile în ordinea Windows, stânga–dreapta.
  Ieșirile interne, virtuale și cele atribuite operatorului sunt excluse.
- Alege atomic configurația geometrică, filmele și ecranele cerute de readiness.
  Un profil salvat pentru cinci TV-uri nu mai obligă instalația adaptivă să aștepte cinci.
- La conectare/deconectare în pregătire: inventariere după stabilizarea evenimentelor,
  reconfigurarea ferestrelor și actualizarea serverului, fără schimbarea manuală a fișierelor.
- În timpul experienței: suspendare; numărul nu se schimbă sub film. Revenirea în
  pregătire prin resetarea experienței permite reaplicarea automată. Tutorialul,
  recuperarea și celelalte tranzacții active blochează temporar reaplicarea.
- Căpitanul, subtitrările și sunetul au un singur ecran. La număr par, implicit acesta
  este ecranul imediat din dreapta centrului. Harta rămâne pe ecranul prezentatorului.
- Un set lipsă/incomplet blochează aplicarea și pornirea DEMO prin automatizare;
  nu se înlocuiește cu un subset al filmelor pentru cinci ecrane.

| TV-uri | Ordinea fișierelor / ID-urilor | Director local |
| --- | --- | --- |
| 2 | port-inner, starboard-inner | ../Video/panels-2-1440 |
| 3 | port-inner, center, starboard-inner | ../Video/panels-3-1440 |
| 4 | port-outer, port-inner, starboard-inner, starboard-outer | ../Video/panels-4-1440 |
| 5 | port-outer, port-inner, center, starboard-inner, starboard-outer | ../Video/panels-playback-1440 |

Există și fallback pentru un singur TV extern: filmul `center.mp4` din setul optimizat.
Pentru mai mult de cinci, topologia generică există, dar această bibliotecă de filme
nu conține exporturi dedicate; modul adaptiv de film nu inventează aceste exporturi.

## Configurare

`autoDisplays.countMode: "adaptive"` selectează numărul conectat. `"fixed"` sau
absența câmpului păstrează politica anterioară pentru instalațiile fixate.
`expectedAudienceCount` este ignorat numai în modul adaptiv.

`video.panelsByCount` mapează numărul de TV-uri la directoare complete. Căile relative
se rezolvă față de rădăcina aplicației. `video.panelsDir` devine directorul activ și
este folosit și de pagina `/clips`. Cele patru exporturi ale lui Claude rămân intacte.

Un monitor extern de operator conectat la același PC trebuie exclus prin
`autoDisplays.operatorDisplayIds`; sistemul nu poate ghici rolul unui monitor extern.
Asocierea operatorului se păstrează prin identitatea hardware în profilul instalației.
Tableta operatorului care deschide consola prin browser nu este o ieșire video a PC-ului.

Pentru montajul declarat folosim `panelGapMm: 500`, aliniere pe centre și presetul
98–98–115–98–98 pentru cinci TV-uri. Pentru celelalte configurații se folosesc
dimensiunile EDID, cu estimare după raportul pixelilor dacă EDID lipsește. Geometria
este etichetată **estimată**, nu măsurată optic. Un profil optic se reutilizează numai
cât timp ordinea și identitățile ecranelor corespund. Schimbarea lor cere geometrie nouă.

Cu DPI identic se folosește o singură fereastră panoramică. Cu DPI diferit se folosesc
ferestre separate; recompunerea fizică a panoramei necesită în continuare sursele
învecinate. Pentru performanță pe peretele real se recomandă aceeași scalare Windows.

Pachetele de conținut semnate au prioritate față de fișierele locale. Nu se amestecă
filme din afara pachetului cu un pachet activ: configurația adaptivă este blocată
dacă pachetul activ nu furnizează seturile necesare. Nu s-a publicat un pachet nou.

Din 14 septembrie, manifestul semnat acceptă `video.panelsByCount`, cu chei `1`–`5`
și directoare relative din pachet, de exemplu `"3":"media/panels-3"`. Toate MP4-urile
canonice ale fiecărui set trebuie enumerate în `files`, cu dimensiune și SHA-256.
Un `panelsDir` vechi poate furniza numai setul său complet, fără subseturi artificiale.
Scriptul de configurare preferă variantele 1440p numai după verificarea întregului set.

## QA și limite

Script reproductibil: `npm run build`, apoi `node scripts/qa-adaptive-displays.mjs`.
Folosește Electron ascuns, rendererul și preload-ul reale, filmele și vocile reale,
servere loopback și SQLite temporare. Numărul de ieșiri OS este simulat explicit.
Verifică 2/3/4/5 TV-uri, DEMO copii, decodoare distincte, avans, pauză comună și seek,
precum și blocarea reconfigurării în timpul show-ului. Verifică și trecerea live 5→2 în pregătire, actualizarea readiness și repornirea demonstrației. Cadrele prezentate pe canvas au aceeași cheie de commit pe toate panourile. Capturi și rapoarte:
`runs/debug/adaptive-displays-2026-09-13/`.

Inventarul Windows a fost verificat separat pe singurul display fizic disponibil.
În sală mai trebuie verificate ordinea cablurilor, excluderea operatorului, golurile,
alinierea fizică și stabilitatea decodării pe întreaga durată. Exporturile pentru
2/3/4 TV-uri folosite acum sunt 1440p60, verificate la 678,05 s; variantele 4K rămân pe disc. În setul existent de
cinci, `port-outer` este mai scurt cu trei cadre (0,05 s); transportul comun limitează
toate panourile la durata minimă. Nu s-au modificat filmele pentru a ascunde diferența.
