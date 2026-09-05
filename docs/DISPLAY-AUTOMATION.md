# Detectarea și împărțirea automată a display-urilor

Implementarea este în `src/main/display-inventory.ts`, `src/shared/display-topology.ts` și helperul read-only `scripts/display-inventory.ps1`. Se activează explicit prin secțiunea `autoDisplays` din configurație; configurațiile manuale existente rămân valide. Filmul, vocile și show-ul nu sunt modificate.

```json
{
  "autoDisplays": {
    "enabled": true,
    "installationId": "nava-sala",
    "layout": "samsung-5",
    "expectedAudienceCount": 5,
    "allowEstimatedGeometry": true
  }
}
```

Pentru alt număr de ieșiri, `layout: "generic"` calculează 1–16 viewport-uri. La prima instalare, `expectedAudienceCount` poate lipsi; numărul detectat devine numărul persistent așteptat după aplicare. Pentru sala confirmată, `samsung-5` păstrează geometria nominală 98″–98″–115″–98″–98″ și Căpitanul central. Tabletele de browser nu sunt display-uri Windows și nu intră în inventar.

`operatorDisplayIds`, `audienceDisplayIds` și `centerDisplayId` acceptă ID-uri native Electron din inventar, **nu indici Windows sau indici Nava**. Un rol de operator salvat este exclus ulterior prin identitatea hardware, inclusiv după schimbarea identificatorului runtime. Ecranele interne și cele identificate drept virtuale/remote nu sunt atribuite automat publicului. Pe o instalație nouă, un monitor extern obișnuit nu poate fi deosebit semantic de un TV doar prin OS: rolul operatorului trebuie declarat dacă acel monitor este conectat ca ieșire Windows. Tableta separată a operatorului nu are această problemă.

## Ce face automat

Inventarul Electron furnizează ID, geometrie DIP, scalare, rotație, frecvență și origine nativă. Helperul Windows folosește `QueryDisplayConfig`, `DisplayConfigGetDeviceInfo` și WMI pentru traseul fizic, model, serie și dimensiuni EDID. Asocierea se face numai când geometria nativă identifică exact o ieșire, nu prin ordinea listelor. Seria unică are prioritate; în lipsa ei se folosește traseul conectorului, apoi ID-ul Electron, cu proveniență explicită. [Electron Display](https://www.electronjs.org/docs/latest/api/structures/display), [Microsoft QueryDisplayConfig](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-querydisplayconfig).

Helperul rulează ascuns, cu timeout de 8 s, ieșire limitată și argumente fixe. Nu modifică registry, execution policy sau moduri video. Dacă helperul nu este disponibil ori politica Windows îl blochează, se păstrează inventarul Electron și se raportează cauza. Datele EDID nu sunt prezentate drept măsurători optice.

Un singur panou primește GLB, subtitrări, entități și audio. În topologia generică este ales panoul cel mai apropiat de centrul geometric; egalitățile folosesc o identitate stabilă. Modul span este folosit la scalare uniformă; scalarea mixtă produce ferestre separate, care trebuie verificate pentru sincronizare. Desktopul clonat/suprapus, rotația, identitățile ambigue, lipsa ecranelor cerute și zero/peste 16 ieșiri blochează aplicarea.

La pornire, configurația activată se detectează și se aplică înainte de crearea ferestrelor. `--wall-preview` și `--screen` păstrează explicit calea manuală de diagnostic. În aplicație, detectarea este separată de aplicare. Aplicarea permisă de server numai în idle creează ferestrele noi, așteaptă încărcarea lor și abia apoi le închide pe cele vechi. La eroare se revine la configurația anterioară. Reușita încărcării paginii nu certifică GLB-ul, filmul sau hardware-ul; readiness și probele rendererului rămân necesare.

Profilul se salvează atomic în `data/installations/<installationId>/wall-profile.json`, cu revizie, asocieri, geometrie, proveniență și numărul așteptat. Nu conține PIN sau token de ecran. Profilul invalid este raportat și nu este înlocuit automat. Un display nou nu se adaugă tacit unei instalații deja salvate; un TV scos nu reduce numărul așteptat. Hotplug-ul invalidează readiness imediat și cere suspendare serverului, apoi o nouă detectare. Reaplicarea se face în pregătire, nu prin mutarea ferestrelor în timpul filmului.

## Calibrarea fizică: limita explicită

Împărțirea logică și providerul optic sunt implementate. `scripts/calibrate-wall.py` citește o fotografie sau înregistrare locală a markerelor; atelierul validează rezultatul contra inventarului nativ, iar aplicarea salvează `videoWall.optical` și redeschide rendererele. Compositorul WebGL aplică homografia fiecărui panou în același spațiu proiectat. Raportul folosește `camera-projected` când această observație este salvată. Fără imagine/profil măsurat, rămâne `blocked-no-camera`; zero între panouri în geometria inițială este estimare, nu măsurătoare. Detalii: [OPTICAL-CALIBRATION.md](OPTICAL-CALIBRATION.md).

Un profil local validat poate declara `geometryStatus: "measured"` numai împreună cu `measurementSource`, descrierea măsurătorii efectuate. Geometria metrică salvată și proiecția optică sunt păstrate separat. Proiecția poate corecta montajul în arc pentru poziția de referință fotografiată; nu reconstruiește camera/sala în 3D și nu este reverificată automat după o mutare fizică. `allowEstimatedGeometry: false` blochează geometria estimată fără profil optic salvat. Nu se activează automat desktop extins, HDR, overscan sau uniformizare de culoare.

## API și verificări

- `GET /api/wall/inventory`: inventar și proveniență, candidat, stare fizică și probleme; necesită viewer.
- `POST /api/wall/detect`: detecție nouă, fără rearanjare de ferestre; necesită operator.
- `POST /api/wall/apply`: aplicare în pregătire, cu rol admin și blocarea comenzilor concurente de show.

Testele pure verifică toate numerele 1–16, un singur GLB/audio, sala Samsung, rolul operatorului după schimbarea ID-urilor, unplug fără micșorare, adăugare fără însușire automată, DPI mixt, desktop clonat, rotire, identități duplicate și validarea profilului. Comandă: `npm test -- display-topology`.

Probele de integrare locale au folosit Electron real și helperul Windows pe un Dell 4K. Profilul logic a fost aplicat și reîncărcat într-un director temporar, păstrând corect `blocked-no-camera`. Proba optică separată a verificat respingerea unei topologii vechi și persistența/reîncărcarea unui rezultat sintetic contra identității native reale. Shaderul a reconstruit cinci cropuri ale filmului real cu eroare de pixeli zero. Acestea nu verifică cinci TV-uri Samsung, camera sălii, ieșirea GPU simultană sau sincronizarea scanării; aceste probe rămân pe instalația reală.
