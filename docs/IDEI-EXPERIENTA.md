# Cum ducem „A Patra Lume” la cote înalte

**Data:** 5 septembrie 2026 · **Autor:** Claude · **Complement la:** `docs/RESEARCH-OPENSOURCE.md` (biblioteci) — acest document e despre **experiență**, nu despre cod.

**Premisa:** avem deja un show sincronizat pe 5 televizoare, un Căpitan care vorbește, 5 tablete cu alegeri în pereche, certificat, fotografie și o consolă de operator. Asta e mai mult decât are majoritatea atracțiilor pentru copii din România. Ce urmează sunt straturi care transformă „un film frumos cu tablete” în **o cameră care reacționează**.

Regula pe care am aplicat-o la selecție: **fiecare idee trebuie să se prindă de o infrastructură pe care o avem deja** (cue-uri în `show.json`, teme de scenă, WebSocket, adaptorul de lumini). Nimic care cere rescrierea proiectului.

---

## 0. Clasament: impact vs. efort

| # | Idee | Impact | Efort | Cost hardware | Verdict |
|---|---|---|---|---|---|
| 1 | Vibrație în podea/scaune la decolare | **Uriaș** | Mic | mic | **Fă-o prima** |
| 2 | Lumina camerei urmează tema scenei | **Uriaș** | Mic | mic | **Fă-o a doua** |
| 3 | Sunet care se mișcă prin cameră | Mare | Mediu | mediu | Fă-o |
| 4 | Bilet de îmbarcare tipărit + certificat fizic | Mare | Mic | mic | Fă-o |
| 5 | Un moment cu mâinile ridicate (cameră) | Mare | Mediu | mic | Pilot pe o scenă |
| 6 | Robotul H2 ca Avatarul AI | **Uriaș** | Mare | (deja cumpărat) | Etapa 2 |
| 7 | Card NFC de echipaj | Mediu-mare | Mediu | mic | Etapa 2 |
| 8 | Ceață, vânt, miros la momente-cheie | Mare | Mediu | mediu | Etapa 2 |
| 9 | Un moment în care copiii vorbesc cu nava | Mare | Mare | mic | Etapa 3, cu plasă |
| 10 | Mod „liniștit” pentru copii sensibili | Mediu | Mic | zero | Fă-o, diferențiator |
| 11 | Pagina de după show pentru părinți | Mediu | Mediu | zero | Etapa 3, cu grijă GDPR |

---

## 1. Vibrația — cel mai bun raport emoție/leu din tot documentul

**Ideea:** transductoare de bas (bass shakers) montate sub platforma pe care stau copiii sau sub bancheta lor. La numărătoare, podeaua începe să tremure. La „zero”, o lovitură. În timpul călătoriei, un vuiet subsonic continuu.

**De ce funcționează:** copiii nu *văd* decolarea, o **simt în corp**. E singurul canal senzorial pe care nu-l poate reproduce un telefon acasă. Industria 4D a construit exact pe asta: scaunele lor au „back shaker” și „bottom shaker” ca efecte separate de mișcare.

**De ce e ieftin la noi:** un sistem 4DX comercial pornește de la aproximativ 14.300 de dolari, iar cu apă, vânt și ceață de la circa 55.000. Noi nu avem nevoie de scaune care se mișcă. Avem nevoie de patru transductoare, un amplificator și un canal audio în plus. E o fracțiune din acei bani.

**Cum se leagă de codul nostru:** un canal audio separat, redat de același renderer care are deja ceasul serverului. Un tip nou de cue, `haptic`, cu intensitate și durată, pus pe aceleași momente ca `launch`. Nu atinge nimic din sincronizarea existentă.

**Atenție:** cere test cu copii mici. Ce e „wow” la 10 ani poate fi înspăimântător la 5. De aici și ideea 10, modul liniștit.

---

## 2. Camera devine nava

**Ideea:** benzi LED adresabile pe pereți și tavan, care se colorează după `SceneTheme`. Avem deja opt teme definite: prolog, lansare, lumină, natură, tehnologie, vid, casă, alb. Când Planeta Luminii apare pe ecran, **toată camera devine aurie**. Când intrăm în vid, lumina se stinge lent și rămâne o pulsație lavandă.

**Tehnologia:** WLED pe ESP32, firmware open-source foarte matur, care primește Art-Net și sACN de la o consolă sau direct de la noi. Un ESP32 poate conduce până la 10 ieșiri separate de LED-uri. Costă zeci de euro, nu mii.

**De ce e aproape gratis pentru noi:** avem deja un tip de cue `lights` și un adaptor Art-Net schițat în server. Practic trebuie doar umplut cu o bibliotecă reală și mapate cele opt teme pe culori. Este **cea mai mare schimbare de atmosferă cu cel mai puțin cod nou** din tot proiectul.

**Bonus care nu costă nimic în plus:** aceleași LED-uri pot marca fizic cele cinci posturi. Postul Comunicații pulsează când vine semnalul. Copiii de la acel post știu că e rândul lor fără ca cineva să le spună.

---

## 3. Sunetul care se mișcă

**Ideea:** în loc de stereo dintr-un televizor, patru sau șase boxe în colțurile camerei. Semnalul misterios vine dinapoia copiilor. Nava trece de la stânga la dreapta. Vocea Căpitanului rămâne în față, ancorată la ecranul central.

**Tehnologia:** avem deja paturi de ambianță și un `routeAudioOutput` în renderer. Web Audio are panoramare spațială nativă. Pentru ceva mai serios există `libspatialaudio` (de la echipa VLC), care face ambisonics și randare pe configurații multicanal de boxe, sau Pure Data ca motor de redare multicanal, folosit exact așa în instalații.

**Recomandarea mea onestă:** nu începe cu ambisonics. Începe cu **patru canale și o hartă simplă**: care sunet iese din care colț, definit în `show.json`. Optzeci la sută din efect, zece la sută din efort. Ambisonics rămâne dacă mai târziu vrei o cameră fără poziție privilegiată.

---

## 4. Copilul pleacă acasă cu ceva în mână

**Ideea în două părți:**

- **La intrare:** o imprimantă termică scoate un **bilet de îmbarcare** pentru fiecare copil: numele echipajului, postul repartizat, ora misiunii, un cod QR. Copilul îl ține în mână de la început. Costă câțiva bani de hârtie.
- **La final:** certificatul pe care îl generăm deja pe canvas se tipărește fizic, cu alegerile lor reale pe el.

**Tehnologia:** `node-thermal-printer` sau `ReceiptPrinterEncoder` vorbesc ESC/POS, standardul imprimantelor de bonuri, prin USB sau rețea, cu text, imagini, coduri de bare și QR. Imprimantele astea costă cât o tabletă ieftină și sunt indestructibile.

**De ce contează comercial:** părinții fotografiază biletul. Copiii îl păstrează pe frigider. Este cea mai ieftină reclamă pe care o poți cumpăra, și transformă „am fost la un film” în „am fost în echipaj”.

---

## 5. Un moment în care corpul contează

**Ideea:** o singură scenă, nu tot show-ul. La momentul critic, Căpitanul spune „ridicați mâinile, avem nevoie de energia voastră”. O cameră montată deasupra ecranului central detectează câte mâini sunt ridicate, iar bara de energie de pe TV crește în timp real. Când toți zece copii ridică mâinile, nava pornește.

**Tehnologia:** MediaPipe rulează detecția de pose și de mâini **direct în browser**, pe client, fără server, la 60 de cadre pe secundă. Nu trimite imaginea nicăieri. Un singur laptop cu o cameră web.

**De ce doar o scenă:** interacțiunea corporală obosește repede și e greu de controlat cu zece copii agitați. Un singur moment coregrafiat, cu un rezultat vizibil pe ecran, e memorabil. Zece minute de „mișcă-te ca să se întâmple ceva” devine haos.

**Regulă de confidențialitate pe care o impun:** procesarea rămâne în browser, nu se salvează niciun cadru, iar camera se oprește fizic în afara acelei scene. Cu copii, asta nu e opțional.

---

## 6. Robotul ca personaj, nu ca gadget

Ai deja planul cu Unitree H2 pentru Avatarul AI. Câteva idei ca robotul să fie **dramaturgie**, nu demonstrație tehnică:

- **Intrarea lui e un eveniment.** Nu stă în cameră de la început. Apare exact când Avatarul AI vorbește prima dată, iar televizoarele se sting o secundă înainte. Copiii se întorc.
- **Robotul nu explică, ci întreabă.** Cel mai puternic moment posibil: robotul se apropie de un post și pune întrebarea din scenariu direct acelor doi copii, iar răspunsul lor apare pe toate cele cinci ecrane.
- **Salutul final.** La certificat, robotul dă mâna sau salută fiecare pereche. Aici se fac pozele pe care le pun părinții pe internet.

**Arhitectural, repet ce am scris în celălalt document:** un pod separat care ascultă cue-urile noastre pe WebSocket și cheamă SDK-ul oficial. Dacă robotul cade, se deconectează sau are nevoie de update, **show-ul trebuie să meargă mai departe fără el**. Niciodată invers.

---

## 7. Cardul de echipaj

Fiecare copil primește la intrare un card NFC. Îl apropie de tabletă la începutul misiunii. De aici încolo:

- tableta știe cine e la fiecare post, deci certificatul are numele lui;
- la a doua vizită, nava îl recunoaște: „Bine ai revenit, navigator”, și primește alt scenariu, din cele patru pe grupe de vârstă pe care le-ai generat deja;
- venue-ul are un program de fidelitate fără să construiască o aplicație.

Cardurile costă cenți, cititoarele zeci de euro. Cu SQLite pe care îl integrează Codex acum, partea de software e o tabelă.

---

## 8. Aer, ceață, miros

Efectele „4D” clasice, dar minimale și controlate prin DMX, adică prin aceeași infrastructură ca luminile:

- **vânt** la decolare, două ventilatoare pe un releu DMX;
- **ceață joasă** la aterizarea pe Planeta Naturii;
- **miros** la fiecare planetă: iarbă udă pentru Natură, ceva metalic-ozonat pentru Tehnologic, ceva cald și dulce pentru Acasă. Difuzoarele de aromă cu comandă electrică sunt ieftine.

Mirosul e canalul senzorial cel mai puternic legat de memorie și practic nefolosit de concurență. Atenție însă la alergii și la ventilație: un miros care persistă între reprezentații e mai rău decât niciun miros.

---

## 9. „Nava, mă auzi?”

**Ideea:** o singură replică în care un copil vorbește, iar nava răspunde.

**De ce e greu:** recunoașterea vorbirii copiilor este semnificativ mai slabă decât la adulți, în orice limbă, iar pentru română opțiunile offline sunt limitate. Vosk are modele mici de 50 MB și rulează chiar și pe Raspberry Pi, dar româna nu apare în lista oficială de limbi. Whisper acoperă peste 99 de limbi și rulează local prin whisper.cpp, dar modelele mici au rate de eroare care cresc mult pe voci de copii într-o cameră cu zgomot.

**Cum aș construi-o ca să nu eșueze niciodată:** buton de „ține apăsat ca să vorbești” pe tabletă, o listă scurtă de cuvinte așteptate (nu dictare liberă), și **un răspuns care funcționează și dacă nu s-a înțeles nimic**. Nava spune „te-am auzit” indiferent, apoi continuă. Copilul are momentul magic; noi nu avem risc de show blocat.

---

## 10. Modul liniștit — micul diferențiator care deschide uși

Un comutator în consolă care: reduce volumul cu 30 %, elimină bliț-urile și tranzițiile bruște, oprește vibrația puternică, încetinește subtitrările și dezactivează sunetele ascuțite.

**De ce merită:** copiii cu autism, cu hipersensibilitate senzorială sau pur și simplu foarte mici sunt excluși astăzi din majoritatea atracțiilor imersive. O „reprezentație liniștită” pe săptămână deschide un public întreg și e exact genul de lucru pe care școlile și primăriile îl caută când aleg unde duc copiii. Ne costă câteva ore de cod, pentru că avem deja `prefers-reduced-motion`, control de volum și teme.

---

## 11. După show

O pagină personală, deschisă prin codul QR de pe bilet: fotografia echipajului, alegerile lor, ce a devenit lumea din cauza deciziilor lor, certificatul descărcabil.

**Avertismentul meu, ferm:** aici intrăm în date despre copii, inclusiv fotografii. Asta cere consimțământ explicit al părintelui, ștergere automată după un termen scurt, fără nume de familie, fără indexare publică, și o politică scrisă. Recomand varianta minimă: **pagina trăiește 7 zile, apoi dispare singură**, iar fotografia nu pleacă de pe serverul din locație decât dacă părintele apasă un buton. Făcută prost, funcția asta e un risc juridic mai mare decât valoarea ei de marketing.

---

## 12. Ce NU aș face

**Nu rescrie în Unreal Engine sau TouchDesigner.** nDisplay este într-adevăr standardul pentru randare sincronizată pe mai multe display-uri, iar TouchDesigner e coloana vertebrală a instalațiilor mari. Dar amândouă sunt gândite pentru **conținut 3D generat în timp real, cu camere urmărite și volume LED**. Noi redăm un film fix și un avatar. Stack-ul nostru web face asta cu un consum de resurse de zece ori mai mic, iar tu ai deja un executabil care pornește singur. Trecerea acolo ar arunca luni de muncă pentru un câștig zero pe scenariul actual. Merită discutată doar dacă într-o zi vrei ca nava să fie **explorabilă în timp real**, nu filmată.

**Nu adăuga VR sau căști.** Zece copii, zece căști, dezinfectare, rău de mișcare, copii care nu se mai văd între ei. Experiența ta e colectivă. Asta e forța ei.

**Nu pune ecrane tactile în plus.** Mai multe suprafețe înseamnă mai puțină atenție pe povestea de pe cele cinci televizoare.

---

## 13. Cum aș eșalona

**Etapa 1, până la prima reprezentație publică** (cost mic, risc mic, impact mare)
1. Vibrație la decolare.
2. Lumina camerei pe teme, prin Art-Net.
3. Bilet de îmbarcare și certificat tipărit.
4. Modul liniștit.

**Etapa 2, după ce show-ul rulează stabil**
5. Sunet pe patru canale.
6. Robotul H2 ca Avatarul AI, prin pod separat.
7. Ceață, vânt, miros pe momentele-cheie.
8. Card NFC de echipaj, pe baza SQLite.

**Etapa 3, când vrei diferențiere pe piață**
9. Momentul cu mâinile ridicate.
10. Momentul „vorbește cu nava”, cu plasă de siguranță.
11. Pagina de după show, cu politica de date scrisă întâi.

---

## Surse

- [wled/WLED](https://github.com/wled/WLED) · [WLED DMX Output wiki](https://github.com/wled/WLED/wiki/DMX-Output/bd2a4bd16378528ee930b43139baaf2ad48f743e) · [ESP32 Art-Net node](https://github.com/mdethmers/ESP32-Artnet-Node-receiver)
- [MediaPipe](https://mediapipe.org/) · [MediaPipe în Node/browser](https://github.com/heyfoz/nodejs-mediapipe)
- [alphacep/vosk-api](https://github.com/alphacep/vosk-api) · [modele Vosk](https://alphacephei.com/vosk/models) · [comparație whisper.cpp vs faster-whisper 2026](https://www.promptquorum.com/power-local-llm/local-whisper-stt-comparison-2026)
- [Klemen1337/node-thermal-printer](https://github.com/Klemen1337/node-thermal-printer) · [NielsLeenheer/ReceiptPrinterEncoder](https://github.com/NielsLeenheer/ReceiptPrinterEncoder) · [escpos-printer-db](https://github.com/receipt-print-hq/escpos-printer-db)
- [videolan/libspatialaudio](https://github.com/videolan/libspatialaudio) · [unelte de spațializare open-source](https://github.com/darkjazz/qm-spatial-audio/wiki/Open-source-free-spatialisation-tools-around-the-web)
- [4D film — efecte și scaune](https://en.wikipedia.org/wiki/4D_film) · [4DX la AMC](https://www.amctheatres.com/4dx) · [costuri sisteme 4D](https://www.accio.com/plp/4dx-theater-moving-seats-effects-water-wind)
- [nDisplay în Unreal Engine](https://dev.epicgames.com/documentation/unreal-engine/rendering-to-multiple-displays-with-ndisplay-in-unreal-engine) · [TouchDesigner și randare multiscreen](https://derivative.ca/workshop/real-time-multiscreen-rendering-integrating-unreal-engine/70471)
