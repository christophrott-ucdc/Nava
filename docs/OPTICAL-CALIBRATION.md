# Calibrare optică a peretelui TV

## Ce este implementat

`scripts/calibrate-wall.py` detectează efectiv markere ArUco dintr-o fotografie sau dintr-un fișier video de calibrare. Nu simulează rezultate și nu deschide niciodată un dispozitiv de cameră sau un URL. Intrarea este un fișier local ales explicit. `src/shared/optical-calibration.ts` produce modelele SVG pentru ecrane și validează rezultatul înainte de import.

Providerul calculează **geometrie proiectată din poziția camerei**, nu distanțe fizice: ordinea aparentă, cele patru colțuri active ale fiecărui panou, homografii, goluri proiectate și indicatori de calitate. Panourile pot avea dimensiuni fizice diferite; nici diagonala, nici milimetrii dintre ele nu sunt deduși dintr-o fotografie necalibrată. Câmpul `metric` este întotdeauna `false`. Pentru un montaj în arc, rezultatul este valabil din poziția de referință fotografiată; nu este o reconstrucție 3D a sălii.

Biblioteca este [OpenCV ArUco](https://docs.opencv.org/4.12.0/de/d67/group__objdetect__aruco.html), dicționar `DICT_4X4_250`, ID-uri 0–63. Sunt folosite patru markere distincte pentru fiecare dintre maximum 16 panouri. Nu sunt coduri QR sau desene care doar seamănă cu markere.

## Flux operațional

1. Aplicația identifică explicit ieșirile TV și exportă mappingul. Identitatea hardware trebuie să fie reală și distinctă; un număr de ordine Windows nu este suficient pentru reutilizarea calibrării după reconectare.
2. Se afișează modelul fiecărui display pe **întreaga zonă activă**, la rezoluția înscrisă în mapping. Nu se fotografiază un preview mic în interiorul unei pagini: aceasta ar calibra dreptunghiul preview-ului. Modelele au fundal alb, patru markere în colțuri și identificatorul ecranului în centru.
3. Din poziția de referință se salvează o fotografie în care sunt vizibile toate cele patru markere ale tuturor TV-urilor. Alternativ se salvează un video cu camera fixă. Nu se mută camera între cadrele folosite.
4. Providerul primește fotografia/video și mappingul; opțional primește intrinsecii deja măsurați ai camerei, pentru corectarea distorsiunii lentilei.
5. Rezultatul acceptat este verificat cu `validateOpticalCalibration(result, currentMarkerMap)`. Orice nepotrivire a topologiei, hardware-ului, rezoluției, markerelor sau pozițiilor lor blochează importul.
6. Integrarea aplică profilul doar în modul de pregătire, apoi afișează o grilă continuă și verifică instalația din poziția de referință. Acceptarea fișierului de observație nu certifică singură montajul sau capacitatea GPU-ului.

Niciun pas al providerului nu schimbă automat aranjarea Windows, nu pornește un show și nu modifică `config.json` sau un profil activ.

## Instalare și comenzi

Versiuni testate: Python 3.12, `opencv-contrib-python-headless==4.12.0.88`, `numpy==2.2.6`. O instalare izolată evită schimbarea bibliotecilor altor aplicații:

```powershell
python -m venv .venv-optical
.venv-optical\Scripts\python.exe -m pip install opencv-contrib-python-headless==4.12.0.88 numpy==2.2.6
.venv-optical\Scripts\python.exe scripts/calibrate-wall.py --mapping marker-map.json --input wall-photo.jpg --output calibration.json
```

Pe stația de dezvoltare pachetele sunt instalate separat în `%LOCALAPPDATA%\NavaPlayer\optical-python-packages`; scriptul poate încărca acel director. `NAVA_OPTICAL_PYTHON_PATH` poate indica alt director de pachete. Runtime-ul Python și dependențele trebuie furnizate explicit pe PC-ul instalației; existența Electron nu presupune existența OpenCV.

```powershell
python scripts/calibrate-wall.py --mapping marker-map.json --patterns patterns
python scripts/calibrate-wall.py --mapping marker-map.json --input wall-video.mp4 --output calibration.json
python scripts/calibrate-wall.py --mapping marker-map.json --input wall-photo.jpg --intrinsics camera-intrinsics.json --output calibration.json
python scripts/calibrate-wall.py --self-test --test-output optical-qa
npm test -- optical
```

`--patterns` exportă PNG-uri `display-00.png`, `display-01.png` etc. în ordinea mappingului. Modelele SVG din browser sunt echivalente; paritatea celor 64 de coduri binare cu dicționarul OpenCV este testată. Fișierele de intrare nu pot fi suprascrise prin `--output`. Codurile de ieșire sunt `0` acceptat, `2` observație respinsă cu motive în JSON și `1` intrare/execuție invalidă.

## Contractul mappingului

`createOpticalMarkerMap(displays, topologyHash, referencePosition?)` primește:

```ts
Array<{ displayId: string; hardwareKey: string; pixelWidth: number; pixelHeight: number }>
```

Rezultatul are `schemaVersion:1`, `kind:'nava-optical-marker-map'`, `dictionary:'DICT_4X4_250'`, `topologyHash`, `referencePosition` și `displays`. Fiecare display păstrează identitatea și dimensiunile, plus:

```json
{
  "displayId": "tv-center",
  "hardwareKey": "identity-returned-by-the-display-inventory",
  "pixelWidth": 3840,
  "pixelHeight": 2160,
  "markerIds": [8, 9, 10, 11],
  "markerSizePx": 388,
  "marginPx": 97
}
```

Ordinea markerelor este stânga-sus, dreapta-sus, dreapta-jos, stânga-jos. `markerSizePx` este latura pătratului, iar `marginPx` distanța până la marginea activă. `topologyHash` este un fingerprint opac al inventarului, nu o dovadă criptografică. Validatorul compară mappingul complet, nu numai acel șir.

## Ce verifică detecția

Din patru markere se obțin 16 colțuri. Providerul calculează o homografie pentru fiecare panou și cere toate cele 16 observații compatibile. Pentru o verificare independentă, elimină pe rând câte un marker, estimează din celelalte trei și verifică poziția celui exclus. Atât RMS-ul fitului complet, cât și cel mai mare RMS al markerelor excluse trebuie să fie cel mult **2 pixeli în imaginea camerei**. Acest prag nu reprezintă 2 pixeli pe TV.

Se resping ID-uri duplicate/reflexii observate, markere necunoscute, panouri incomplete, markere prea mici, contururi neconvexe, colțuri active în afara fotografiei, geometrie inconsistentă și scor de calitate sub 0,6. Scorul `confidence` este o euristică documentată, **nu o probabilitate statistică**; fără intrinseci este plafonat la 0,85.

Pentru video se eșantionează maximum 15 cadre și se cer minimum 3 cadre complete. Geometria nu se compune din câte un display văzut la momente diferite. Mișcarea colțurilor între cadre mai mare de 2 pixeli respinge rezultatul. Cadrul complet cu cea mai mică eroare de validare este păstrat; numărul cadrelor și deviația temporală sunt în rezultat.

Intrinsecii opționali au forma:

```json
{
  "imageSize": { "width": 3840, "height": 2160 },
  "cameraMatrix": [[3000, 0, 1920], [0, 3000, 1080], [0, 0, 1]],
  "distCoeffs": [0, 0, 0, 0, 0],
  "reprojectionErrorPx": 0.5
}
```

Valorile de mai sus ilustrează schema și **nu sunt calibrarea camerei instalației**. Sunt necesare măsurători reale la aceeași rezoluție. Hashul intrinsecilor este păstrat separat. Chiar și cu intrinseci, acest provider nu emite milimetri sau poziții 3D.

## Rezultat și compositor

Rezultatul are `kind:'nava-optical-calibration'`, `status:'accepted'|'rejected'`, mappingul sursă, dimensiunea fotografiei, poziția de referință și motivele respingerii. Fiecare display acceptat conține:

- `activeCorners`: cele patru colțuri în pixeli de cameră, în ordine TL/TR/BR/BL;
- `normalizedCorners`: aceleași puncte împărțite la lățimea/înălțimea fotografiei;
- `uvToCamera`: matrice 3×3, row-major, care transformă UV local al panoului în coordonate normalizate ale fotografiei;
- `rmsPx`, `independentRmsPx`, `coverage:1`, `confidence` și identitatea markerelor.

`order` sortează panourile după centrul proiectat pe axa X. `gaps` măsoară distanța semnată dintre mijloacele marginilor vecine, în unități `normalized-camera-width`. Aceste valori nu sunt centimetri; un gol negativ înseamnă suprapunere în proiecție, nu o distanță fizică negativă.

După validare, `opticalWallGeometry(calibration)` elimină marginile camerei din jurul peretelui și oferă `bounds` plus `uvToWall` pentru fiecare panou. În shader, pentru UV local `(u,v)`, se calculează `p = uvToWall * vec3(u,v,1)` și se eșantionează filmul la `p.xy/p.z`. Orientarea verticală trebuie adaptată convenției texturii compositorului. Golurile observate rămân incluse în imaginea comună. Acest helper nu modifică singur rendererul sau profilul activ.

## Verificări efectuate și limita lor

Au trecut 12 cazuri Python cu OpenCV real: detecție, ordine/gol, marker lipsă, marker duplicat, perspectivă, geometrie inconsistentă, mapping duplicat, paritate SVG, intrinseci, 16 panouri, video static și video cu mișcare respins. Testele TypeScript verifică importul, mappingul pentru 1/3/4/5/6/7/8/9/10/16 panouri, respingerile, proveniența și transformarea pentru compositor. O execuție CLI pe o fotografie sintetică în perspectivă a fost importată cu succes prin validatorul TypeScript.

Artefactele de dezvoltare sunt în `%LOCALAPPDATA%\NavaPlayer\optical-qa`: fotografie normală/perspectivă, cazuri missing/duplicate, mapping, rezultat JSON și SVG de display. Acestea sunt **fixture-uri sintetice**, nu imagini ale instalației Samsung. Acceptarea fizică rămâne de făcut cu toate TV-urile reale, camera de referință, reflexiile/overscanul și grila continuă văzută din zona publicului.
