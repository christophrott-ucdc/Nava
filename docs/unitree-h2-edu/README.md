# Unitree H2 EDU — research și integrare EXODUS7

Documentat la 11 septembrie 2026. Modelul instalației, confirmat de proprietar: **H2 EDU**. Versiunile firmware și serviciului audio instalat nu sunt încă identificate.

## Surse oficiale descărcate

În `references/unitree_sdk2/` sunt 11 fișiere de studiu din [Unitree SDK2](https://github.com/unitreerobotics/unitree_sdk2), la commitul `9754cd153af3da471b0fe5f3aa535e426fb11db3`. `references/provenance.json` păstrează URL-ul exact, dimensiunea și SHA-256 pentru fiecare; licența BSD-3-Clause originală este inclusă. Sunt extrase, nu un SDK complet instalat. Nu sunt incluse în build și nu au fost executate.

[Pagina H2](https://www.unitree.com/H2/) diferențiază varianta EDU prin posibilitatea dezvoltării secundare. [Centrul oficial de documentație](https://support.unitree.com/home/en/developer/) este punctul de intrare pentru ghidurile H2; portalul dinamic nu a fost arhivat integral.

La commitul inspectat, SDK2 include clienți H2 pentru locomoție și brațe. Nu există un director audio H2 în arborele SDK2 inspectat. Există audio pentru G1, A2 și R1: absența unui exemplu H2 public nu demonstrează că robotul nu poate reda audio.

Clientul G1 oferă `PlayStream`, `PlayStop`, volum și TTS. Exemplul G1 folosește WAV mono de 16 kHz și demonstrează TTS chineză/engleză; nu dovedește suport TTS românesc sau compatibilitate H2. Mai mult, exemplul trimite un stream ID la oprire, deși clientul numește parametrul `app_name`. Semantica opririi trebuie confirmată înainte de portare. Nu copiem automat exemplul: schimbă volumul la 100%, pornește microfonul și controlează LED-ul.

## Arhitectura aleasă

NavaPlayer rămâne autoritatea asupra scenariului și timpului. Numai replicile `AVATAR_AI` pot fi preluate de robot; Căpitanul rămâne GLB pe TV. Păstrăm fișierele românești produse și aprobate, fără regenerare TTS pe robot și fără schimbarea duratelor.

Acum există contractul local `RobotDriver` și simulatorul silențios. Identitatea replicii include sesiunea, epoca cronologiei, pachetul și limba; evenimentele duplicate sunt ignorate. Pauza și schimbarea cronologiei opresc observația. Durata necunoscută este afișată ca observație, nu ca o confirmare de redare fizică.

Etapa fizică: un serviciu separat pe un calculator Linux compatibil SDK, conectat la rețeaua robotului, va primi comenzile aplicației și va folosi API-ul audio H2 confirmat. Exemplele motorii descărcate sunt numai referințe: această integrare nu necesită mers, controlul articulațiilor sau microfon activ.

## Pașii pentru robotul real

1. Inventariem firmware-ul, sistemul de operare, SDK-ul și serviciile audio ale exemplarului H2 EDU. Documentația online nu poate determina versiunile acestui robot.
2. Confirmăm cu documentația livrată/Unitree API-ul audio, formatul PCM, bufferul, identificatorii stream/app și semantica stop. Nu presupunem că API-ul G1 funcționează.
3. Implementăm bridge-ul cu autentificare, heartbeat, cache audio verificat, deduplicare și ACK distincte pentru primit/pregătit/pornit/terminat/oprit. Nu expunem un endpoint arbitrar de comenzi SDK.
4. Măsurăm latența reală și folosim pornire programată pe ceas sincronizat. Un timeout de comandă nu înseamnă că robotul este mut: evităm reluarea automată peste un stream încă activ.
5. O singură rută de voce deține replica. Transferul spre boxele sălii se face după oprire confirmată sau prin alegerea explicită a operatorului. Căpitanul și muzica nu își schimbă ruta.
6. Verificăm pe hardware pauză, reluare, seek, crash/reconectare și întreruperea rețelei, inițial fără public. Abia apoi activăm selecția robotului fizic în administrator.

Aceste șase etape fizice nu sunt declarate implementate. În prezent nu se deschide nicio conexiune către robot.
