> Actualizare film panoramic, 2026-09-09: cronologia curentă, sursele celor cinci panouri și vocile Saturn sunt descrise în [REINTEGRARE-FILM.md](docs/REINTEGRARE-FILM.md). Timpii istorici de 10 minute / 465 s nu mai sunt contractul filmului curent. Tutorialul adaugă timp variabil.

# EXODUS-7 · „A Patra Lume” — instalare

Acest fișier acoperă **doar instalarea**. Pentru folosirea de zi cu zi (pornirea unui spectacol, tablete, consolă, depanare) deschide `MANUAL-UTILIZARE.docx` din aceeași arhivă.

---

## 1. Ce primești în arhivă

| Fișier | Ce este |
|---|---|
| `NavaPlayer-0.1.0-x64-portable.exe` | aplicația completă, într-un singur fișier; nu se instalează, se rulează |
| `NavaPlayer-0.1.0-x64-setup.exe` | aceeași aplicație, ca instalator clasic (creează scurtătură în meniul Start) |
| `config.json` | configurația de pornire; se citește de lângă executabil |
| `video.panelsDir` / cinci fișiere `<screenId>.mp4` | filmul panoramic; separat de executabil. Copiile optimizate și configurarea sunt în `docs/REINTEGRARE-FILM.md` |
| `media/cinema_4k_h264.mp4` | filmul vechi, păstrat pentru fallback și modul cinema |
| `README-INSTALARE.md` | fișierul acesta |
| `MANUAL-UTILIZARE.docx` | manualul de utilizare, pe capitole |

Vocile, muzica, avatarul 3D și scenariile sunt deja **în interiorul executabilului**. Nu trebuie copiate separat.

---

## 2. Cerințe

- **Windows 10 sau 11**, pe 64 de biți.
- **Placă video cu accelerare hardware.** Filmul e 4K la 60 de cadre pe secundă. Pe un laptop de test merge și mai modest, dar în sală ai nevoie de o placă dedicată.
- **Spațiu pe disc:** aproximativ 3 GB (aplicația plus filmul).
- **Rețea locală (Wi-Fi sau cablu)** la care se conectează tabletele. Nu e nevoie de internet.
- Nu ai nevoie de Node.js, de Python sau de altceva instalat. Totul e în executabil.

---

## 3. Instalarea, pas cu pas

### Varianta portabilă (recomandată pentru test)

1. Creează un folder, de exemplu `C:\EXODUS7`.
2. Copiază în el `NavaPlayer-0.1.0-x64-portable.exe`, `config.json` și folderul `media`.
3. Structura trebuie să arate exact așa:

```
C:\EXODUS7\
   NavaPlayer-0.1.0-x64-portable.exe
   config.json
   media\
      cinema_4k_h264.mp4
```

4. Dublu clic pe executabil.

**Important:** fișierul `config.json` și folderul `media` trebuie să fie **lângă executabil**, în același folder. Aplicația le caută acolo.

### Varianta cu instalator

Rulează `NavaPlayer-0.1.0-x64-setup.exe`. După instalare, copiază `config.json` și folderul `media` în folderul unde s-a instalat aplicația, de obicei `C:\Program Files\NavaPlayer`.

---

## 4. Prima pornire

La prima pornire, Windows afișează două ferestre pe care trebuie să le accepți.

**Windows SmartScreen.** Executabilul nu are semnătură digitală, deci apare „Windows a protejat computerul”. Apasă **Mai multe informații**, apoi **Executați oricum**. Este normal pentru aplicații nesemnate.

**Paravanul de protecție (firewall).** Apare „Windows Defender Firewall a blocat unele caracteristici”. Bifează **Rețele private** și apasă **Permite accesul**. Fără asta, **tabletele nu se pot conecta**. Rețelele publice le poți lăsa nebifate.

Dacă ai apăsat din greșeală „Anulare”, poți repara din Panou de control, Paravan de protecție Windows Defender, Se permite unei aplicații să comunice prin paravan, și bifezi NavaPlayer pentru rețele private.

---

## 5. Ce porturi deschide aplicația

Aplicația pornește un server local și deschide **un singur port**:

| Port | Protocol | Pentru ce | Cine se conectează |
|---|---|---|---|
| **4321** | TCP (HTTP și WebSocket) | consola operatorului, tabletele, depanare, analitică, administrare | tabletele și orice browser din rețeaua locală |

Serverul ascultă pe toate interfețele de rețea ale calculatorului (`0.0.0.0`), ca tabletele să îl vadă. WebSocket-ul, prin care se sincronizează tabletele și ecranele, folosește **același port 4321**, nu unul separat.

Portul se poate schimba în `config.json`, la `server.port`, dacă 4321 e deja ocupat de alt program.

**Nimic nu iese în internet.** Aplicația nu trimite date în afară și nu are nevoie de conexiune la internet ca să ruleze spectacolul.

---

## 6. Verificare rapidă că totul merge

După prima pornire, în fereastra neagră de jurnal (sau în consola operatorului) apare un bloc de forma:

```
  Consola operatorului:  http://192.168.1.25:4321/control/
  Tablete:               http://192.168.1.25:4321/tablet/
  WebSocket:             ws://192.168.1.25:4321/ws   (LAN IP 192.168.1.25)
```

Cifrele `192.168.1.25` sunt adresa calculatorului tău în rețea și **vor fi diferite la tine**.

Ca să confirmi că merge, deschide pe calculator adresa consolei. Ți se cere un PIN. PIN-ul implicit este **4078**.

> **Schimbă PIN-ul înainte de primul spectacol cu public.** Se face din pagina de administrare, capitolul 7 din manualul de utilizare.

---

## 7. Dezinstalare

Varianta portabilă: șterge folderul. Nu lasă nimic în urmă, în afara datelor de lucru descrise mai jos.

Varianta cu instalator: Setări, Aplicații, NavaPlayer, Dezinstalare.

**Datele de lucru** (conturi, jurnale, baza de date a misiunilor) stau într-un folder `data` și `runs` lângă executabil, la varianta portabilă, sau în `%APPDATA%\NavaPlayer` la varianta instalată. Dacă vrei o repornire complet curată, șterge aceste foldere înainte de a porni din nou.

---

## 8. Dacă ceva nu merge

| Simptom | Cauză probabilă | Ce faci |
|---|---|---|
| Tabletele nu se conectează | firewall-ul blochează portul 4321 | vezi capitolul 4, permite aplicația pe rețele private |
| „Video neîncărcat” în consolă | filmul lipsește sau e în alt loc | verifică `media\cinema_4k_h264.mp4` lângă executabil |
| Aplicația nu pornește deloc | `config.json` stricat sau lipsă | copiază-l din nou din arhivă |
| Filmul merge sacadat | accelerare hardware inactivă | actualizează driverul plăcii video |
| Pagina cere PIN și nu îl știi | PIN implicit | 4078, dacă nu a fost schimbat |

Pentru orice altceva, manualul de utilizare are un capitol dedicat de depanare, cu pagina de diagnostic a aplicației.
