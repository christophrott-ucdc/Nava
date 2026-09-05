# Tutorial interactiv și final colectiv

Implementat la 5 septembrie 2026. Extensie separată de film și de scenariile existente. Originalul `assets/show/show.json`, filmul, vocile personajelor și duratele preshow 50 s / lansare 10 s / film 465 s / epilog 75 s sunt păstrate.

## Experiența publicului

Înainte de preshow, nava recunoaște fiecare participant printr-o atingere în jumătatea proprie a tabletei. Urmează o probă adaptată categoriei, confirmarea legăturii cu echipajul și predarea către Căpitan. Nu există punctaj sau penalizare. Opțiunea „Prefer să privesc” permite continuarea fără obligarea participantului la răspuns. Cele cinci tablete rămân landscape 1920×1080, cu A în stânga și B în dreapta, fără text rotit.

| Profil | Proba tutorialului | Gestul final |
|---|---|---|
| 5–10 ani | Recunoaște steaua și confirmă | Lumină, grijă sau curaj |
| 10–15 ani | Distinge observația de interpretare | Sursă, verificare sau sens |
| 15–18 ani | Confirmă sau revizuiește o regulă | Voce, revizuire sau responsabilitate |
| Adulți | Alege observație cu cost sau rezervă | Întrebare, posibilitate sau conexiune |

La final, fiecare loc activ poate face un singur gest sau poate alege să privească. Contribuțiile apar pe TV-ul central și formează o constelație. Locurile libere, participanții care privesc și contribuțiile confirmate sunt reprezentate distinct; nu se inventează rezultate. Jurnalul combină rezultatul misiunii cu gestul de încheiere. Descărcarea locală este disponibilă în epilog; trimiterea către operator așteaptă răspunsurile finale ale locurilor active de la postul respectiv.

## Operare

1. Selectează profilul în consolă și deschide **Tutorial și echipaj**.
2. Bifează locurile ocupate și apasă **Aplică participanții**. Este necesar cel puțin un loc; lista se poate schimba înainte de tutorial și la recunoaștere, apoi se fixează pentru această probă.
3. Apasă **Începe tutorialul**. Pentru cele patru profiluri noi, Start obișnuit deschide automat tutorialul dacă acesta este încă neefectuat. Legacy V3 păstrează pornirea obișnuită și permite tutorial explicit.
4. Pașii avansează când participanții activi au răspuns sau au ales să privească și explicația s-a terminat pe rendererul de referință. Nu este necesară apăsarea sincronă A/B.
5. **Pauză**, **Continuă**, **Repetă explicația** și **Pasul următor** folosesc starea serverului. Pasul următor nu ocolește explicația sau răspunsurile necesare.
6. La „Echipaj pregătit”, apasă **Predă Căpitanului și pornește**. Predarea vocală se termină înainte de preshow; readiness și pregătirea vocilor sunt verificate din nou. **Sari peste tutorial** este alternativa explicită a operatorului, urmată de pornire.

Nu schimba locurile ocupate după proba de recunoaștere. Pentru un grup diferit, pregătește o sesiune nouă. Participantul care a ales să privească poate reveni înainte de ultimul pas, fără puncte sau resurse consumate.

## Voce și sunet

Narator de producție: **Mihai**, bariton român din catalogul ElevenLabs, separat de Căpitan și Avatar. Sunt incluse 12 MP3 și trei probe de casting. Castingul și verificările sunt descrise în [TUTORIAL-VOICE-PRODUCTION.md](TUTORIAL-VOICE-PRODUCTION.md). `hint` este disponibil ca asset, dar nu este programat automat; erorile de probă primesc îndrumare vizuală.

Audio se redă numai pe rendererul configurat ca proprietar audio, cu volumul vocal și ieșirea configurată. Explicația apare și ca subtitrare pe ecranul central. Tabletele folosesc SFX-ul existent, deblocat prin atingere și controlat de `tabletSfx`; nu multiplică naratorul în sală. Nu există generare ElevenLabs în timpul spectacolului. Servirea HTTP permite numai fișierele MP3 validate prin manifest și SHA256.

Finalul interactiv apare în ultimele 15 secunde ale epilogului și rămâne în starea `ended`. Invitația vocală nouă începe numai după `ended`, pentru a nu suprapune replicile existente. Subtitrările show-ului rămân deasupra stratului final. Efectele sunt declanșate de confirmări, nu de fiecare snapshot, și respectă preferința pentru mișcare redusă.

## Contract și persistență

- `src/shared/experience.ts`: etape, starea participanților, probe și alegeri finale.
- `src/server/experience.ts`: validare pură, confirmare și gating temporal.
- `MissionSession` persistă experiența în SQLite împreună cu evenimentul înainte de ACK. Run ID, timeline/cue instance și event ID resping mesajele vechi și deduplicatează retransmisiile.
- `POST /api/experience/control` necesită rol operator. `GET /api/experience/voices` și MP3-urile validate sunt publice pe LAN.
- Evenimentele tabletelor reutilizează `missionAction`; `experienceAudio` acceptă confirmarea de sfârșit numai de la rendererul de referință. Durata minimă măsurată și ACK-ul real sunt ambele necesare.
- Tutorialul ține directorul în `idle`. Comenzile care ar muta filmul sunt blocate până la predare sau omiterea explicită; nu se schimbă timeline-ul show-ului.
- Recuperarea după restart rămâne suspendată până la readiness; reluarea reîncepe explicația curentă cu o instanță nouă. Reconectarea obișnuită folosește timpul serverului. Un renderer sosit după sfârșitul clipului confirmă expirarea, fără a pretinde că publicul a ascultat clipul.

Un pachet vocal absent sau invalid blochează începerea tutorialului vocal. Operatorul poate remedia pachetul și reporni aplicația ori poate omite explicit tutorialul. Dacă redarea nu se termină, pasul nu avansează: verifică ieșirea audio și rendererul, apoi repetă explicația. O eroare audio este jurnalizată; nu există simularea automată a unei redări reușite.

## Verificare reproductibilă

```powershell
npm run check
npm run smoke:scenarios
npm run smoke:experience
npm run review:experience
npm run review:experience-renderer
npm run validate:experience
```

`review:experience-renderer` creează un server și un renderer Electron izolate, folosește filmul/GLB/audio reale și rulează inclusiv `npm run smoke:renderer` înainte de închiderea fixture-ului. `smoke:experience` verifică protocolul și SQLite cu ACK-uri sintetice declarate explicit; nu este dovadă de redare. Rapoarte și capturi: `runs/debug/tutorial-final/`; matricea celor 20 de vederi ale tabletei: `runs/debug/tutorial-tablet/`. Galeria combinată este `runs/debug/tutorial-final/index.html`.

Verificat software: 157 teste unitare și smoke-urile de bază; patru profiluri × zece zone × trei etape existente; tutorial A/B, pauză, repetare, recuperare SQLite și alegeri finale; toate MP3-urile prin HTTP cu hash corect; interfața reală tabletă/consolă 1920×1080 și consolă 1440×900; TV 3840×2160 și windowed. Matricea tabletelor include text 1,3×, contrast și mișcare redusă, ținte de minimum 64 px și lipsa overflow-ului. Capturile de matrice sunt fixture-uri de UI, marcate separat de proba conectată la server.

## Acceptanță în sală

Mai sunt necesare audiția umană a timbrului și dicției, nivelul narator/muzică/SFX pe instalația reală, rutarea unei singure ieșiri audio, cinci Samsung simultan, șase tablete tactile, vizibilitatea de la 4–5 metri, comportamentul la pierdere Wi-Fi și trei sesiuni consecutive cu operator. Probele cu public din fiecare categorie validează înțelegerea și ritmul. Testele Electron nu certifică panourile fizice, acustica sau latența întregului perete. Căpitanul rămâne exclusiv GLB pe TV-ul central; robotul nu este integrat.
