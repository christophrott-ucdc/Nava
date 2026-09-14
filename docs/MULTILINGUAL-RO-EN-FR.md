# Experiențe RO / EN / FR — 13 septembrie 2026

## Operare

În consola operatorului, **Înainte de show → Limba experienței**, alegeți Română, English sau Français. Alegeți limba înainte de tutorial. Se aplică aceleiași sesiuni, pe toate tabletele și ecranele, inclusiv subtitrărilor, vocilor și diplomelor. Personajele și participanții confirmați sunt păstrați. Selectorul original din Instrumente folosește aceeași comandă.

Limba nu se schimbă în timpul tutorialului, redării sau recuperării suspendate. Pentru un grup nou, încheiați/resetați sesiunea, apoi selectați limba. Serverul verifică pachetul de dialog, naratorul și fișierele audio înainte să accepte schimbarea. Un pachet incomplet sau o traducere care nu mai corespunde sursei românești este refuzată; nu se pornește deliberat un amestec de limbi.

Aplicația Electron deja pornită nu a fost repornită în această intervenție. Opriți-o normal după sesiune și porniți sursele reconstruite. EXE-urile portable/NSIS anterioare trebuie refăcute separat de responsabilul împachetării. Nu s-a făcut commit, push, împachetare sau publicare.

## Conținut livrat

Aceleași scenarii, ramificații, jocuri, personaje, film, muzică și momente de declanșare în toate limbile:

| Pachet | MP3 EN | MP3 FR |
|---|---:|---:|
| Protocolul Acasă — original/legacy, inclusiv trei variante 7–9 | 57 | 57 |
| 5–10 ani — Steaua Omenirii | 55 | 55 |
| 10–15 ani — Semnalul fără semnătură | 44 | 44 |
| 15–18 ani — Dreptul de a schimba direcția | 43 | 43 |
| Adulți — Ce lăsăm deschis | 43 | 43 |
| Narator: introducere, tutoriale pe profil, cooperare, predare, final | 12 | 12 |
| **Total** | **254** | **254** |

**508 fișiere noi ElevenLabs `eleven_v3`**, cu distribuția vocală existentă. Redarea scenariilor și tutorialelor folosește fișiere locale și nu cere API ElevenLabs în timpul reprezentației. Variantele românești preexistente și fișierele sursă românești nu au fost regenerate în această intervenție.

Instrucțiunile jocurilor, alegerea personajelor, explicațiile, telemetria/harta, tutorialul, finalurile TV, subtitrările, certificatele și diplomele folosesc limba sesiunii. Login, consola, administrarea, depanarea, analitica, logurile, calibrarea și pagina de testare a clipurilor au același mecanism de localizare. Pagina `/clips/` avea build, dar lipsea din rutarea statică: ruta a fost conectată.

Textele tehnice brute (JSON, loguri, ID-uri de scene/comenzi, căi de fișiere) sunt păstrate pentru diagnostic. Câmpurile editorului de scenariu rămân sursa românească editabilă; localizarea etichetelor nu traduce sau rescrie automat conținutul introdus de operator. Mesajele libere ale participanților sunt păstrate ca date, fără traducere automată a contribuției.

Dialogul opțional al Căpitanului primește instrucțiunea limbii cerute, are istoric separat pe limbă și răspunsuri locale de rezervă EN/FR. Rezumatele dinamice au șabloane și enumerări localizate. Aceste funcții dinamice păstrează dependențele TTS/LLM existente; nu sunt incluse în cele 508 înregistrări fixe. Nu s-a făcut un apel LLM live pentru QA.

## Contract tehnic

- `src/shared/localization.ts` și `src/shared/locales/{en,fr}.json`: cataloage locale; RO este sursa de referință. Textul românesc este returnat neschimbat când limba este RO.
- `src/web/shared/localization.ts`: actualizează nodurile de prezentare și atributele accesibile, păstrând sursa pentru revenirea EN → RO sau FR → EN. Nu schimbă ID-uri, valori de acțiune, focus sau ascultătorii de evenimente. Opțiunile fără `value` explicit își păstrează valoarea inițială la traducerea etichetei. Confirmările native sunt localizate.
- Tabletele, consola și rendererul primesc limba autoritativă prin mesajele existente. Paginile auxiliare folosesc `/api/locale`, care expune numai limba, inclusiv la login când `/api/state` este privat.
- `dialogue.en.json` / `dialogue.fr.json` sunt sidecar-uri cu versiune, limbă, SHA-256 al sursei și maparea exactă ID → replică. Nu conțin timpi sau comenzi. Sunt respinse sursele vechi, ID-urile lipsă/suplimentare și textele goale.
- `loadScenario(..., lang)` construiește pachetul limbii și validează manifestul, textele, fișierele și hash-urile. Pachetul legacy verifică și că dialogul efectiv încărcat corespunde sursei traducerilor. Reîncărcarea păstrează replicile limbii curente.
- `welcome.contentHash` și confirmarea pregătirii vocilor includ pachetul selectat, inclusiv legacy EN/FR. La schimbarea limbii se invalidează confirmările vechi ale ecranelor.
- Naratorul își schimbă manifestul și ruta audio odată cu sesiunea; răspunsurile asincrone vechi sunt ignorate. Pauza/reluarea și confirmarea o singură dată a încheierii sunt păstrate.
- Limba și hash-ul pachetului intră în checkpoint-ul SQLite. Recuperarea FR a fost verificată prin oprire/pornire de server izolat pentru toate cele patru profiluri de vârstă.
- Mesajele adaptorului H2 EDU păstrează `language`, textul localizat și identitatea pachetului. Nu s-au trimis comenzi unui robot fizic.

## Audio și sincronizare

`assets/localization/speech-reviewed*.json` conține traducerile de producție, revizuite în această intervenție pentru sens, acțiuni și durată. Nu este o certificare făcută de traducători sau actori umani.

Fiecare MP3 are manifest și receipt cu text, voce, model, hash, durată și alinierea cuvintelor. Visemele sunt calculate cu modulele TalkingHead EN/FR și distribuite în intervalele cuvintelor furnizate de ElevenLabs. Sunt o aproximare fonetică pentru animație, nu o captură facială.

Duratele au fost măsurate cu ffprobe și fiecare fișier a fost decodat integral cu ffmpeg. Pentru replicile puțin prea lungi s-a folosit `atempo` de cel mult 1,15, cu recalcularea cuvintelor/visemelor și a hash-ului. Originalele acestor fișiere și receipts sunt păstrate în `runs/debug/localization-2026-09-13/original-audio/`. Nu au fost mutate cue-urile, secvențele filmului sau muzica. Rapoartele finale EN/FR au **zero depășiri ale intervalelor dintre replici**.

Scripturi:

```powershell
# Verificare locală, fără apeluri și fără costuri ElevenLabs
node scripts/localization-voices.mjs en --check
node scripts/localization-voices.mjs fr --check

# Producție: necesită cheia existentă ELEVENLABS_API_KEY și consumă credite
node scripts/localization-voices.mjs en
node scripts/localization-voices.mjs fr
# --fit aplică numai ajustările mici descrise mai sus; nu mută cronologia
```

Generarea se reia după hash-ul cererii, fără să refacă fișiere identice. O cerere cu rezultat incert lasă un ledger `.pending.json`; scriptul se oprește și cere reconcilierea rezultatului, în loc să dubleze automat plata.

Pentru texte noi: modificați sursa RO, revizuiți ambele traduceri din `speech-reviewed*.json`, generați doar înregistrările schimbate și repetați verificările. Nu modificați manual hash-ul sursei pentru a ocoli controlul de consistență.

Catalogul UI de producție este versionabil în `src/shared/locales`. Corecțiile editoriale se păstrează în `assets/localization/ui-reviewed.tsv`. Scripturile `localization-inventory.mjs`, `localization-draft.py` și `localization-catalogs.mjs` sunt unelte de dezvoltare: inventariere, propuneri locale OPUS-MT, apoi aplicarea corecțiilor revizuite. Drafturile și proveniența sunt în directorul QA; modelul Python nu este o dependență a aplicației. Propunerile automate nu trebuie folosite direct pentru producția vocală: auditul inițial a găsit traduceri cu sens greșit.

## Diplome și QR public

QR-ul include limba sesiunii în payload, fără să depindă de LAN sau de PC-ul navei. Portalul static poate genera PDF-ul local în browser. QR-urile RO păstrează formatul anterior cu cinci câmpuri; EN/FR adaugă limba în al șaselea câmp. Portalul nou citește ambele formate.

**Trebuie publicat separat `dist/public-diploma/` pe domeniul HTTPS și configurat `DIPLOMA_PUBLIC_URL`.** Nu există în această livrare o publicare nouă sau un domeniu activ verificat. Un portal vechi trebuie actualizat pentru QR-urile EN/FR. Testul a încărcat portalul prin `file://` cu payload EN/FR și a verificat generarea fără API-ul navei. Prima deschidere a portalului public cere internet; PDF-ul descărcat poate fi păstrat offline.

## Dovezi și limite

Director: `runs/debug/localization-2026-09-13/`.

- `check-final.log`: `npm run check`, 236 teste, 0 eșecuri; typecheck, validare show/voci, build, core/auth/platform/media.
- `server-parity-final.log`: toate profilurile RO/EN/FR, păstrarea echipajului, preflight, refuzul schimbării în timpul show-ului, recuperare SQLite FR și reload legacy localizat.
- `audio-check-en.log`, `audio-check-fr.log`, `voice-timing-{en,fr}.json`: toate cele 508 fișiere decodate și verificate; zero depășiri.
- `ui-en/`, `ui-fr/`: câte 140 de stări de tabletă (4 profiluri × 3 etape × 5 posturi × înainte/după confirmare, plus finalurile). Jocurile au fost rezolvate prin controalele UI. A stânga/B dreapta, 1920×1080, text 130%, fără overflow, păstrarea focusului și certificate primite. Runda vizuală a corectat și suprapunerea explicației instrumentului peste raport: graficul se adaptează spațiului, iar după confirmare explicația comună din raport înlocuiește legenda redundantă. Testul verifică explicit această limită.
- `tv-en/`, `tv-fr/`: tutorial cu audio real, pauză/reluare, predare către Căpitan și cele patru finaluri 3840×2160 și windowed/reduced-motion. Fiecare rundă a rulat și `npm run smoke:renderer` cu filmul și avatarul GLB reale; logurile sunt `tv-en.log`, `tv-fr.log`. Repetarea finală, după integrare: `smoke-renderer-en-final.log` și `smoke-renderer-fr-final.log`, ambele PASS.
- `pages/`: 24 de capturi auxiliare EN/FR (login, consolă, admin, debug, analytics, logs, wall, clips și diploma offline), plus cele 10 vederi legacy de tabletă în fiecare limbă, pe postul 1. Debug/analytics/logs au și variante 1100×760. Schimbarea limbii se face prin selectorul real al consolei, inclusiv revenirea la RO; opțiunile și valorile selectoarelor sunt verificate. Vederile legacy sunt declanșate manual pentru auditul UI, nu constituie o a doua cronologie de producție.

QA-ul s-a făcut pe servere și instanțe Electron temporare; nu a întrerupt sesiunea utilizatorului. Fixture-urile de sincronizare din testele de server și tabletă sunt sintetice; testele TV folosesc media reală. Nu se pretinde sincronizare hardware de tip genlock.

Rămân verificări fizice: ordinea celor cinci TV-uri, cadrele și audio pe instalația reală, nivelurile și inteligibilitatea vocilor EN/FR în sală, pronunția numelor proprii, dispozitivele tabletă, H2 EDU și pachetele portable/NSIS refăcute. S-au verificat toate fișierele prin decodare și durată, dar nu s-a făcut o audiție umană integrală a celor 508 replici și nici o certificare lingvistică de vorbitori nativi.
