# Bandă discretă și repere din film — 11 septembrie 2026

Această corecție înlocuiește panourile TV mari și modelul de propulsie presupus din documentele anterioare.

Pe fiecare TV, informațiile ocupă o bandă fixă la baza ecranului, 6% din înălțime, pe toată lățimea. Nu există scroll de text sau panouri plutitoare. Harta mare rămâne disponibilă pe tablete; pe TV banda îi ia locul. Subtitrările și avatarul central sunt ridicate deasupra benzii.

Au fost eliminate impulsurile presupuse ale motoarelor, masa inventată, consumul, delta-v și distanțele radar în kilometri. MP4-ul și timpii scenelor nu permit calcularea acestor mărimi. Afișajul folosește starea călătoriei, secvența, timpul petrecut în secvență, progresul secvenței/filmului și reperul următor. Valorile provin exclusiv din reperele montajului și timpul prezentat, fără sinusoide sau numere aleatoare. Scannerul de pe tabletă arată repere în următoarele 120/240/480 secunde, fără a pretinde distanțe spațiale.

TV-urile citesc timpul cadrului coerent prezentat de PanelFrames, iar în modul video simplu currentTime al elementului video disponibil. Nu folosesc ceasul-țintă care poate avansa în timp ce imaginea este blocată. Rendererul autorizat raportează presentedFilmTime; serverul îl trimite tabletelor prin MissionSnapshot, cu izolare după runId/timelineEpoch. Acest câmp conduce numai afișajul informativ, nu modifică motorul show-ului, jocurile, vocile sau muzica. Tabletele folosesc ultimul eșantion prezentat, fără extrapolare; rata efectivă de actualizare este cea a mesajelor de misiune.

Typecheck și build trecute. Fără teste sau lansare vizuală, conform instrucțiunii utilizatorului. Captura furnizată de utilizator a ghidat corecția. Electronul activ nu a fost oprit. Restart și reload tablete necesare. Verificarea fizică a benzii și a suprapunerilor rămâne de făcut.
