# FABLE — ghid frontend EXODUS7 / Nava Glass

## Direcția vizuală

Construiește o interfață luminoasă, calmă, tactilă și precisă, inspirată de materialele Apple: suprafețe translucide, muchii fine, spațiu generos și ierarhie clară. Identitatea rămâne EXODUS7, cu culori calde și personaje pentru copii. Nu copia aplicații Apple și nu importa asseturi sau fonturi proprietare. Acesta este un ghid de proiect, nu o specificație oficială Apple.

Citește docs/DESIGN-SPEC-GLASS.md, docs/ASTRA-IMPLEMENTARE-GLASS.md, apoi sursele suprafeței modificate. Pentru administrare citește și FABLE-ADMIN-RBAC-HANDOFF.md. Refolosește glass.css/glass.ts și asseturile existente. Instrucțiunile curente ale utilizatorului au prioritate. În această etapă sunt interzise testele, buildul, aplicația și capturile runtime; nu le rula fără schimbarea explicită a instrucțiunii. Nu commit/push/deploy.

## 1. Paleta autoritativă

Valorile de mai jos sunt fallbackurile sRGB existente în src/web/shared/glass.css. Fișierul conține și variante OKLCH; nu crea a doua paletă paralelă în admin/styles.css.

| Token | Hex | Utilizare |
| --- | --- | --- |
| --paper | #fdfcf7 | Fundal alb cald |
| --ink | #1f2440 | Titluri și text principal |
| --ink-soft | #5b6182 | Explicații și metadate lizibile |
| --coral | #ff7a6b | Accent cald, identitatea zonei A |
| --sky | #7cc4ff | Informație, identitatea zonei B |
| --sun | #ffd166 | Selecție, confirmare, lumină |
| --mint | #7be0b5 | Succes și natură |
| --lavender | #c2a8ff | Primire, mister blând |
| --peach | #ffcfa8 | Întoarcere și căldură |
| --rose | #ffa6d2 | Accent ilustrativ secundar |
| --danger | #e5484d | Eroare sau acțiune distructivă reală |

Pe un ecran folosește o culoare dominantă și una de sprijin. Culorile saturate ocupă porțiuni mici: butoane, stări, ilustrații. Păstrează text închis pe pasteluri; textul alb pe mentă/soare/cer nu este implicit lizibil. Pentru pericol, folosește token semantic cu pereche text/fond verificabilă, nu roșu pastel arbitrar. Starea trebuie să aibă și text/icon, nu numai culoare.

Teme existente: prologue (lavandă/cer), launch (cer/soare), light (soare/piersică), nature (mentă), tech (cer/lavandă), void (lavandă mai profundă), home (cer/piersică), white (alb cald). Selectorii comuni se bazează pe html[data-theme]; setarea exclusivă pe body nu activează acești selectori. Urmează helperul existent al suprafeței. Adminul poate rămâne în prologue stabil; nu inventa o legătură cu show-ul live fără cerință.

## 2. Materiale: trei niveluri, nu sticlă peste tot

- Fundal: mesh din maximum trei gradiente radiale largi, cu alb cald dominant. Decorația trebuie să rămână periferică.
- Navigare/carduri: .glass, alb aproximativ 62%, blur 16–24px, saturație 1.4, contur alb de 1px, reflexie discretă pe muchia de sus.
- Formulare, dialoguri și conținut dens: .glass-strong, alb aproximativ 78%; mărește opacitatea dacă fundalul compromite lectura. Tabelele nu au blur pe fiecare rând.

Maximum două straturi blur suprapuse. La TV 4K folosește glass-tv.css fără backdrop-filter. Pe hardware fără suport, păstrează fallbackul aproape opac. Nu anima blurul, filtrele sau umbre mari. Fără neon persistent, borduri multicolore, reflexii stridente ori text transparent. Nu adăuga o bibliotecă de shader pentru simple carduri.

Exemplu de extensie locală, fără duplicarea materialului:

```css
.admin-panel { padding: var(--s-3); min-width: 0; }
.admin-panel__title { margin: 0 0 var(--s-2); color: var(--ink); }
```

Aplică class="glass-strong admin-panel" în markup. Tokenurile comune definesc materialul. Extensiile locale definesc layoutul, nu o temă concurentă.

## 3. Spațiere, colțuri și tipografie

Grilă de 8px: 8,16,24,32,40,48. Distanța dintre secțiuni 24–32px; padding card 24–32px; spațiu între label și câmp 8px. Colțuri: 12px pentru câmpuri compacte, 20px pentru controale/carduri mici, 28px pentru panouri, pill pentru status și acțiuni scurte. Nu transforma fiecare rând de tabel într-o bulă.

Font: var(--font), care încearcă SF Pro Rounded numai dacă este instalat, apoi Segoe UI Variable Display/Segoe UI/system-ui. Nu descărca SF Pro. Greutăți 400/600/700; cifre tabulare pentru timpi și valori. Monospace exclusiv pentru informație tehnică utilă operatorului.

| Element | Admin/operator | Copii |
| --- | --- | --- |
| Titlu pagină | 36–42px | 32–40px |
| Titlu secțiune | 24–28px | 26–32px |
| Text curent | 18px | minimum 20px |
| Metadate | 15–16px | minimum 20px pentru informație necesară |
| Line-height | 1.4–1.5 | 1.25–1.4 |
| Control tactil | minimum 48px, preferabil 56px | minimum 64px |

Nu folosi majuscule în propoziții întregi. Etichetele scurte de categorie pot fi uppercase cu tracking moderat. Evită font-weight 900 peste tot și scăderea textului pentru a ascunde probleme de layout.

## 4. Layoutul paginii administratorului

Țintă principală 1920×1080 landscape; funcțional și în fereastră mai mică. Adminul poate avea scroll vertical. Interdicția de scroll privește vederile show-ului de pe tabletele participanților.

Propunere de dezvoltare pentru Fable:

- Navigare laterală 240px pe ecran larg: Prezentare, Utilizatori, Sesiuni, Instalație, Audit. Rutele neimplementate trebuie marcate clar sau omise; fără butoane care mimează funcționalitate.
- Header cu titlu, identitate autentificată, link către consolă și o acțiune principală contextuală.
- Conținut fluid, maximum aproximativ 1500px, spațiu exterior 32–40px. Pe ecran mic navigarea devine compactă fără a pierde etichetele.
- Utilizatori: tabel pentru comparație, nu grilă de carduri imense. Nume, rol, stare și meniu de acțiuni. Editor într-un dialog accesibil sau panou lateral.
- Un singur CTA dominant: de exemplu „Adaugă utilizator”. Actualizare și navigare sunt secundare. Ștergerea se află în contextul utilizatorului selectat.
- Sesiuni: utilizator, rol, expirare și ulterior acțiune de revocare reală. Fără tokenuri sau prefixe de token în interfață.
- KPI-uri numai dacă există date și ajută o decizie. Nu inventa uptime, procente sau grafice decorative.

Scheletul actual admin/styles.css conține culori locale și layout simplificat: este punct de pornire, nu standard final. Migrează-l incremental către tokenurile comune.

## 5. Componente și stări obligatorii

Butoane: primary, secondary, quiet și destructive. Icon + text când sensul nu este evident. Stări default/hover/pressed/focus/disabled/busy. Hover discret; pressed scale aproximativ .98. Pe touch nu depinde de hover. În timpul unei mutații dezactivează retrimiterea aceleiași acțiuni, păstrând explicația.

Formulare: label permanent deasupra câmpului, placeholder doar exemplu, ajutor scurt și eroare lângă câmp. PIN-ul nu este vizibil implicit, nu apare în loguri și nu se păstrează în state după succes. Role selector explică fiecare rol în română.

Dialoguri: titlu clar, aria-labelledby, focus inițial potrivit, Escape când acțiunea permite, focus returnat la declanșator. Acțiune principală la dreapta; mesajul distructiv numește ținta. Nu închide dialogul pe eroare și nu pierde datele nesensibile.

Stări de pagină: încărcare, listă goală, eroare de rețea, 401, 403, succes, date depășite. „Nu ai acces” nu devine „Nu există date”. Pentru conținut sensibil șterge rezultatele vechi la pierderea accesului. Nu lăsa un fetch întârziat să repopuleze pagina după logout.

Toasts: scurte și temporare pentru confirmări; erorile care cer acțiune rămân lângă control. Nu confetti în admin. Pe tablete, efectele de succes se declanșează din confirmarea unică a evenimentului, nu la fiecare snapshot.

## 6. Identitate, iconografie și limbaj

Reutilizează logo-ul EXODUS7 existent; pe admin este mic în navigare, pe waiting este intenționat mare. Nu genera alt logo și nu reface portretele. Iconuri SVG din sistemul comun glass.ts, aceeași grosime de linie și cutie 24px. Nu amesteca emoji, font icons și trei biblioteci de iconuri în aceleași controale.

Română naturală: „Adaugă utilizator”, „Schimbă rolul”, „Dezactivează contul”, „Închide sesiunea”, „Modificările au fost salvate”. Explică observator/operator/administrator; identificatorii tehnici viewer/operator/admin rămân în contract, nu ca singura explicație pentru om. Fără „lock in”, „submit”, „user management” în interfața română.

Copii: personaj și nume persistente, A în stânga/B în dreapta, fără text rotit, 12 personaje oferite dar maximum 10 participanți. Culorile personajelor nu înlocuiesc identitatea fizică a locului. Mesajele se adaptează la 1–10 participanți. TV: filmul și GLB-ul Căpitanului rămân prioritare; nu pune carduri peste față sau subtitrări.

## 7. Mișcare, performanță și accesibilitate

Micro-tranziții 160–220ms; dialoguri 220–300ms, deplasări mici de 4–8px. Fundal lent numai unde servește atmosfera; adminul nu are nevoie de particule în mișcare. Oprește efectele când suprafața este ascunsă. Respectă prefers-reduced-motion și setările de stimuli reduși deja existente. Fără paralaxă agresivă, bounce continuu sau butoane care fug de cursor.

Ținte de contrast: 4.5:1 text normal, 3:1 text mare și elemente UI relevante; acestea sunt cerințe de verificat, nu rezultate certificate ale paletei. Verifică fondul final compus al sticlei când testarea va fi permisă. Focus vizibil de minimum 3px, contur distinct. Stări cu text/icon și culoare. Elemente native button/a/input/table/dialog înainte de div cu click. Nu adăuga aria-live pe întregul tabel la fiecare refresh.

Fără framework nou pentru acest task. Menține TypeScript, CSS și DOM existente. Componente mici pentru material, câmp, dialog, badge și empty state; nu rescrie toate suprafețele. Păstrează DOM IDs, event handlers și contractele API. Permisiunile se verifică pe server: ascunderea unui buton nu este RBAC.

## 8. Ordine de lucru și criterii de predare

1. Refolosește fundația glass și inventariază componenta înainte de editare.
2. Construiește o singură pagină de referință: Utilizatori, cu tabel și formular complet, înainte de a propaga modelul la Sesiuni/Instalație.
3. Acoperă toate stările reale și accesul pe rol; separă lucrul neimplementat de funcțiile livrate.
4. Documentează modificările, fișierele și limitele în handoff, fără rescrierea istoricului.
5. Când utilizatorul permite verificarea: 1920×1080 și aproximativ 1024×768 pentru admin, tastatură, text mărit, transparență fallback, reduced motion, 401/403/erori. Tablete/TV după rezoluțiile fizice stabilite.

La final trebuie să se vadă aceeași familie EXODUS7 pe login, consolă și admin: același text, colțuri, materiale, focus și vocabular de stare. Nu declara interfața validată vizual sau accesibilă doar din lectură ori build. Nu include capturi fictive.

## Prompt scurt pentru Fable

„Continuă administrarea Nava/EXODUS7 folosind docs/FABLE-ADMIN-RBAC-HANDOFF.md și docs/FABLE-FRONTEND-GLASS-GUIDELINES.md. Păstrează autentificarea și modificările existente. Dezvoltă un frontend Nava Glass luminos, spațios și tactil, cu tokenurile comune, fără framework nou. Începe cu Utilizatori, apoi Sesiuni; implementează stările și autorizarea reală. Respectă interdicția actuală de teste/build/aplicație și documentează exact ce rămâne nevalidat. Fără commit/push/deploy.”
