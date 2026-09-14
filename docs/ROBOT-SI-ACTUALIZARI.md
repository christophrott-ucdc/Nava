# Robot și actualizări — starea implementării

11 septembrie 2026. În administrator, fila Instalație include acum panoul Robot și actualizări. Accesul API cere rolul `admin`. Configurarea, verificarea și descărcarea se fac între sesiuni, fără echipaj pregătit, tutorial, recuperare sau pornire TV în curs. Comenzile experienței sunt blocate pe durata operației de mentenanță.

## Narațiune

Mod implicit: vocea actuală a sălii. Modul simulator observă replicile reale AVATAR_AI fără audio suplimentar, fără comenzi motorii și fără conexiune la robot. Contractul transportă identitatea pachetului, sesiunii, replicii, limba, epoca cronologiei și durata când este cunoscută. Simulatorul nu măsoară latența robotului și nu înlocuiește un driver fizic.

Modelul confirmat este Unitree H2 EDU. Cercetarea, sursele descărcate și etapele rămase se află în [dosarul H2 EDU](unitree-h2-edu/README.md).

## Actualizarea aplicației

Implementare: electron-updater 6.8.9, Windows NSIS. Development și portable nu instalează actualizări. Sursa se configurează în administrator: GitHub Releases public (owner/repo) sau director generic HTTPS. Nu există verificare, descărcare sau instalare automată la pornire/ieșire. Nu sunt permise prerelease sau downgrade.

Instalația trebuie să aibă `NAVA_UPDATE_PUBLISHER` setat la numele exact al editorului certificatului Authenticode. Fără el updaterul este dezactivat. Installerul trebuie semnat de acel editor; electron-updater verifică integritatea și semnătura. Configurația de încredere este salvată local în userData, nu preluată din feed.

Pașii administratorului: verifică versiunea → descarcă → confirmă versiunea exactă → backup SQLite reușit → installer și restart. Un pachet multimedia activ trebuie să declare compatibilitatea cu noua versiune înaintea instalării.

Pentru distribuție trebuie pregătite separat certificatul de semnare, buildul NSIS semnat și metadatele electron-builder (`latest.yml`, installer și blockmap) pe sursa HTTPS/GitHub aleasă. Pentru GitHub poate fi folosit un repository public dedicat binarelor, fără publicarea codului. Nu puneți tokenuri GitHub private în aplicația distribuită. Niciun feed real sau certificat nu a fost configurat în această intervenție și nu s-a publicat/instalat nimic.

## Actualizarea conținutului

Conținutul se descarcă separat, în `data/content/<sha256-payload>/`, fără suprascrierea pachetului activ. Manifestul este un envelope JSON cu payload base64 și semnătură Ed25519. Cheia publică PEM este provisionată local prin `NAVA_CONTENT_PUBLIC_KEY_FILE`; cheia privată rămâne exclusiv pe calculatorul de producție. Semnătura acoperă prefixul binar `EXODUS7-CONTENT-V1\0` urmat de octeții payloadului.

Payload: `schema:1`, `id`, `appVersion`, opțional `compatibleAppVersions`, `video:{path,panelsDir?}`, `files:[{path,url,bytes,sha256}]`. Sunt acceptate doar fișiere multimedia/JSON sub assets și media, fără traversarea directoarelor, maximum 5000 fișiere, 64 GiB/fișier, 200 GiB/pachet. URL-urile trebuie HTTPS; redirecturile sunt refuzate. Release-ul este un snapshot complet, nu un patch.

Trebuie incluse show.json, manifestele și audio pentru toate cele patru grupe de vârstă, vocea de bază, tutorialul, muzica și muzica de așteptare, plus filmul și panourile configurate. Activarea verifică din nou hashurile, structura scenariilor, montajul compatibil cu aplicația, muzica și referințele vocale. Dimensiunile și checksumurile nu demonstrează sincronizarea artistică a unui nou montaj: aceasta trebuie validată înainte de publicare.

Pentru a crea envelope-ul fără upload:

```text
node scripts/sign-content-release.mjs release-plan.json <snapshot-root> <private-key.pem> <output.json>
```

Exemplu de plan, cu valori înlocuite înainte de utilizare:

```json
{
  "id": "exodus7-content-001",
  "appVersion": "VERSIUNEA_DIN_PACKAGE_JSON",
  "baseUrl": "https://downloads.example.org/exodus7/content-001/",
  "video": { "path": "media/cinema_4k_h264.mp4" }
}
```

Snapshotul pregătit conține numai fișierele de distribuție în assets/ și media/. Scriptul citește și semnează, nu copiază activele și nu publică. Serverul aplică validarea completă la descărcare/activare. Cheile nu se includ în snapshot sau repository. Pentru o tranziție de versiune, publicați întâi un pachet verificat care declară compatibilitate cu ambele versiuni.

La activare se cere confirmarea ID-ului și backup SQLite, se păstrează `previous.json`, apoi se schimbă atomic `active.json` și se repornește Electron. Pachetele anterioare sunt păstrate. La boot se reverifică semnătura și compatibilitatea pointerului; nu se recalculează toate hashurile filmelor la fiecare pornire. Scenariile gestionate astfel nu pot fi editate prin editorul live; modificările cer un pachet nou.

Recuperarea manuală a conținutului: cu aplicația oprită, păstrați o copie a pointerului actual și restaurați pointerul anterior numai dacă versiunea aplicației este compatibilă. Nu există încă buton de rollback și nici rollback automat al schemei SQLite. Backupul bazei nu include filmele sau cheile. Reîncercarea descărcării reutilizează fișierele valide; verificarea de spațiu este conservatoare și rezervă dimensiunea întregului pachet. Nu există încă curățare automată a pachetelor vechi.

## Verificări și limite

Ulterior, utilizatorul a autorizat toate testele. Runda completă și remedierile sunt documentate în [arhiva rapoartelor de verificare](STRUCTURA-REPOSITORY.md); aceasta nu înlocuiește verificarea integrării fizice sau a distribuirii reale. Semnarea/distribuția reală, instalarea NSIS, restartul pe versiunea următoare, activarea unui pachet real și comunicarea cu H2 EDU necesită verificare înainte de utilizare în sală. Aplicația deja pornită nu a fost repornită; modificările intră în vigoare la o pornire ulterioară.
