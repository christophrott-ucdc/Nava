# Instrucțiuni autonome pentru GPT-6 Astra — implementarea „Nava Glass” R5

> Acesta este documentul de execuție pentru agentul care preia redesignul fără istoricul conversației. Dacă utilizatorul îți cere să continui proiectul sau să implementezi redesignul, nu te opri la un plan: inspectează starea reală, implementează, verifică vizual și tehnic, documentează și livrează rezultatul. Nu presupune însă că ai permisiunea de a face commit, push, merge, release sau deploy; pentru acestea este necesară o cerere explicită în conversația curentă.

## Mesaj de pornire recomandat pentru Astra

```text
Citește integral docs/ASTRA-IMPLEMENTARE-GLASS.md și docs/DESIGN-SPEC-GLASS.md, apoi implementează autonom redesignul Nava Glass R5 până la definiția de „gata” din document. Aceasta este o transformare vizuală completă, nu un facelift: rezultatul trebuie să pară cu două generații mai nou și să păstreze toate funcțiile existente. Inspectează și păstrează orice schimbare existentă în worktree. Folosește subagenți pe domeniile de fișiere indicate dacă instrumentele de colaborare sunt disponibile. Verifică vizual toate suprafețele și rulează toate testele cerute. Scrie progresul în fișierele de handoff conform instrucțiunilor. Nu face commit sau push fără o cerere explicită separată.
```

## 1. Obiectivul tău

Implementează integral runda 5 de redesign pentru NavaPlayer, conform `docs/DESIGN-SPEC-GLASS.md`.

Rezultatul trebuie să transforme toate interfețele din HUD întunecat într-un sistem vizual coerent, luminos și vesel, inspirat de sticlă lichidă, potrivit copiilor de 7–12 ani și suficient de clar pentru operator. Nu este suficient să schimbi paleta. Trebuie refăcute ierarhia vizuală, componentele, layoutul 1080p landscape al tabletelor, feedbackul interactiv, mascotele, sunetele locale, overlay-urile TV și toate suprafețele web. Transformarea trebuie să fie evidentă la prima vedere: premium, spațioasă, tactilă și finisată, nu încă un dashboard administrativ cu blur aplicat peste designul vechi.

Suprafețele obligatorii sunt:

1. tabletele copiilor — `/tablet/`;
2. rendererul Electron pentru televizoare;
3. consola operatorului — `/control/`;
4. autentificarea — `/login/`;
5. depanarea — `/debug/`;
6. analitica — `/analytics/`;
7. pagina de previzualizare a sistemului de design — `/shared/preview.html` sau ruta statică echivalentă deja servită de aplicație.

Consideră sarcina terminată numai când implementarea, verificarea vizuală, testele, documentația și integrarea între suprafețe sunt complete.

## 2. Proiectul pe scurt

NavaPlayer este o aplicație locală Windows/Electron pentru experiența imersivă „A Patra Lume”. Un master redă un film 4K pe până la cinci ecrane, suprapune un Căpitan GLB, subtitrări și entități procedurale, rulează o cronologie de exact zece minute și servește prin Hono/WebSocket consola operatorului și cinci tablete folosite de zece copii în perechi.

Stackul existent:

- Electron + TypeScript + esbuild;
- Hono pentru HTTP;
- WebSocket pentru starea live;
- HTML/CSS/TypeScript fără framework web;
- Three.js și TalkingHead pentru GLB;
- teste Node și smoke tests proprii;
- fără React, Vue, Tailwind sau biblioteci UI.

Intrările principale:

- `src/main/**` — procesul Electron, ferestrele și configurația;
- `src/renderer/**` — video, avatar, subtitrări, OSD, teme și timeline;
- `src/server/**` — stare, autentificare, API și WebSocket;
- `src/shared/types.ts` și `src/shared/protocol.ts` — contractele comune;
- `src/web/tablet/**` — interfața copiilor;
- `src/web/control/**` — consola operatorului;
- `src/web/login/**`, `src/web/debug/**`, `src/web/analytics/**` — suprafețele auxiliare;
- `scripts/build.mjs` — bundle și copiere de fișiere statice;
- `assets/show/show.json` — cronologia executabilă;
- `assets/voice/ro/**` — 51 de clipuri vocale deja generate și validate.

Runda 4 a adăugat autentificare cu PIN, utilizatori, readiness, preflight, depanare, analitică, editor de cue-uri, telemetrie pe tablete, certificate, ambianță, lumini, mod de repetiție, perf și span-mode. Redesignul nu are voie să rupă aceste funcții.

La redactarea acestui document, fișierele `src/web/shared/glass.css`, `src/renderer/glass-tv.css`, `src/web/shared/preview.html` și folderul `src/web/shared/mascots/` nu existau. Verifică starea reală înainte să presupui că mai este valabil.

## 3. Sursele de adevăr și ordinea lor

Când găsești informații incompatibile, aplică această ordine:

1. cererea curentă a utilizatorului;
2. acest document de execuție;
3. deciziile explicite din §8 și §10 ale `docs/DESIGN-SPEC-GLASS.md`;
4. restul specificației `docs/DESIGN-SPEC-GLASS.md`;
5. contractele și comportamentul verificabil din cod și teste;
6. `HANDOFF-LIVE.md`, `HANDOFF.md`, README și celelalte documente istorice.

Înainte de orice editare, citește integral:

1. `docs/ASTRA-IMPLEMENTARE-GLASS.md`;
2. `docs/DESIGN-SPEC-GLASS.md`;
3. ultimele intrări din `HANDOFF-LIVE.md`;
4. `README.md` și `docs/OPERARE.md`;
5. orice `AGENTS.md` sau `SKILL.md` aplicabil pe care îl găsești;
6. fișierele sursă ale suprafeței pe care urmează s-o modifici.

Nu citi orbește tot istoricul de mii de linii înainte să lucrezi. Folosește `rg` pentru a găsi contractele și implementările relevante. Consultă `HANDOFF.md` integral numai dacă o dependență sau o decizie rămâne neclară.

## 4. Reguli de lucru obligatorii

- Începe cu `git status --short`, `git log -5 --oneline` și `npm run check`. Nu trata drept defect al redesignului o problemă care exista deja; noteaz-o separat.
- Worktree-ul poate conține modificări ale altui agent sau ale utilizatorului. Păstrează-le. Nu folosi `git reset --hard`, `git checkout --`, ștergeri recursive sau rescrieri în masă.
- Nu modifica `assets/show/show.json`, textele scenariului, timpii show-ului, vocile, manifestul vocal sau state machine-ul, exceptând extensia minimă `tabletSfx` descrisă în §8.2.
- Păstrează id-urile DOM folosite de TypeScript. Dacă trebuie schimbate, actualizează toate referințele și testele în aceeași etapă.
- Nu introduce framework, pachet npm sau font din rețea. Folosește CSS, SVG inline, API-uri browser și codul existent.
- Nu înlocui funcții reale cu mock-uri sau ecrane demonstrative. Loginul, consola, editorul, debugul, analitica, tabletele și rendererul trebuie să rămână funcționale.
- Nu elimina, ascunde sau simplifica funcții fiindcă sunt greu de integrat vizual. Păstrează rutele, autentificarea, permisiunile, formularele, validarea, starea, API-urile, WebSocket-urile, filtrele, căutarea, sortarea, tabelele, dialogurile, meniurile, comenzile și toate fluxurile operatorului.
- Nu ascunde erorile și nu dezactiva teste pentru a obține verde.
- Nu folosi emoji ca iconografie de producție. Creează SVG-uri inline cu linie rotunjită și stil comun.
- Nu afișa pe TV un al doilea chip pentru `AVATAR_AI`.
- Nu implementa controlul robotului Unitree H2 în această rundă.
- Nu schimba sau regenera vocile. Eticheta vizuală se poate schimba; audio și textul replicilor rămân identice.
- Nu scrie chei API, PIN-uri private sau tokenuri în cod, capturi, loguri ori documentație.
- Nu face commit sau push fără o cerere explicită nouă a utilizatorului. Permisiuni istorice nu se transferă automat.
- Trimite actualizări scurte în timpul lucrului, dar continuă autonom. Pune întrebări numai dacă răspunsul ar schimba material produsul; înainte de întrebare, termină tot ce poate fi făcut sigur.

## 5. Deciziile vizuale sunt deja luate

Nu redeschide următoarele alegeri:

- cele cinci tablete ale copiilor și tableta operatorului sunt toate 1080p landscape (1920×1080);
- pe tabletele copiilor, copilul A folosește jumătatea din stânga, iar copilul B jumătatea din dreapta;
- cele două jumătăți se citesc în aceeași orientare;
- fiecare post primește o mascotă desenată;
- există o mascotă separată pentru Avatarul AI;
- există confetti discret și sunete locale de bucurie;
- consola operatorului este la fel de luminoasă și veselă ca tabletele;
- `CAPITANUL` se afișează „CĂPITANUL”;
- `AVATAR_AI` se afișează „AVATARUL AI”;
- Căpitanul rămâne singurul GLB pe TV, în rendererul `center`;
- viitorul Unitree H2 întruchipează Avatarul AI în sală, dar integrarea hardware nu face parte din R5;
- cele opt teme sunt `prologue`, `launch`, `light`, `nature`, `tech`, `void`, `home`, `white`;
- tabletele și paginile web nu au fundal negru; filmul de pe TV rămâne cinematic.

Respectă exact tokenurile, paletele, tipografia, razele, spațierea, mișcarea și criteriile de accesibilitate din specificație, dacă nu descoperi o imposibilitate măsurabilă.

### 5.1 Mandatul de calitate vizuală

Ținta este o aplicație Apple-adjacent din 2026: luminoasă, sofisticată, colorată controlat, calmă, curată și foarte bine finisată. Inspiră-te din filosofia Liquid Glass, visionOS, macOS și iOS — materiale frumoase, profunzime, translucență, spațiu, tipografie și mișcare atentă — fără să copiezi literal interfețe Apple.

Prima impresie trebuie să fie „arată ca un produs scump”, nu „arată ca o temă glassmorphism”. Înainte și după trebuie să pară două generații diferite ale produsului. Dacă după aplicarea tokenurilor layoutul, densitatea, ierarhia și interacțiunile se simt încă la fel, redesignul nu este terminat.

Evită explicit:

- negru, cărbune și gri murdar pe suprafețele web;
- albastru corporatist fără personalitate și monocromie inertă;
- glow excesiv, neon, cyberpunk, gaming, crypto/NFT și gradient violet pe orice componentă;
- cercuri decorative uriașe, text transparent sau contraste sacrificate pentru efect;
- cutie în cutie în cutie, divizoare peste tot și fiecare informație izolată într-un dreptunghi;
- interfețe care arată ca un template generic de dashboard sau ca o demonstrație Dribbble fără produs real.

Culoarea trebuie să ghideze atenția și să creeze atmosferă, nu să transforme produsul într-un curcubeu. Modul luminos este eroul acestei runde. Rendererul TV rămâne cinematic și întunecat acolo unde filmul o cere, iar overlay-urile lui folosesc contractul separat din specificație.

### 5.2 Material, fundal și profunzime

Construiește un singur sistem de materiale reutilizabil, nu efecte locale inventate pe fiecare pagină:

- fundalul aplicației folosește alb luminos, alb cald, pearl și griuri reci subtile, cu mesh gradients, halouri radiale difuze și lumină ambientală aproape imperceptibilă;
- `.glass` este suprafața standard pentru navigație și carduri majore;
- `.glass-strong` este suprafața ridicată pentru dialoguri, meniuri, popover-uri și controale flotante;
- `.glass-tint` este accentul discret pentru grupuri secundare și stări;
- fiecare nivel combină transparență albă, blur controlat, saturație, highlight interior, bordură translucidă și umbră foarte moale conform tokenurilor din specificație;
- ierarhia spațială este: atmosferă → workspace → grupuri/carduri → controale flotante → dialoguri/meniuri;
- folosește spațiere, lumină, scară și umbră pentru separare; bordurile sunt ultimul instrument, nu primul;
- păstrează lizibilitatea pe browsere fără `backdrop-filter`, `color-mix` sau `oklch` prin fallbackuri explicite;
- nu aplica `backdrop-filter` pe rendererul TV.

Nu înlocui valorile normative din `docs/DESIGN-SPEC-GLASS.md` cu intervalele generice din alte briefuri. Scara de raze, grila de 8 px, dimensiunile textului și țintele tactile din specificația Nava au prioritate.

### 5.3 Contractul componentelor

Propagă limbajul vizual prin primitive comune și refactorizează prezentarea repetată când reduce duplicarea. Nu supra-abstractiza logica produsului. Urmărește cel puțin aceste contracte:

- **Navigație și header:** ușoare, translucide și spațioase; starea activă are tint, icon și profunzime discretă, fără blocuri solide grele; acțiunile de context rămân vizibile și clare.
- **Carduri:** nu sunt dreptunghiuri gri identice. Folosește variante cu scop — standard, accent, interactiv, metrică, informație, avertizare — cu aceeași geometrie și ierarhie. Valorile importante sunt mari, etichetele și metadatele rămân secundare.
- **Butoane:** acțiunea primară este tactilă și evidentă, cu accent controlat, highlight intern și umbră fină; secundarele folosesc sticlă; acțiunile ghost au feedback clar. Toate păstrează stările hover, pressed, focus, disabled, busy și destructive.
- **Formulare:** câmpuri aerisite, etichete clare, suprafețe luminoase, placeholder lizibil, focus ring moale, validare explicită și grupare logică. Păstrează submit-ul, validarea, focusul, autofill-ul și navigarea cu tastatura.
- **Tabele și liste dense:** rânduri mai generoase, antet discret, separatoare restrânse, hover fin, badge-uri coerente și meniuri pentru acțiuni secundare numai dacă toate acțiunile rămân accesibile. Păstrează sortarea, filtrarea, căutarea și orice acțiune existentă.
- **Badge-uri și stări:** success, warning, error, pending, info și neutral folosesc simultan tint, icon/semn și text; culoarea singură nu transmite sensul.
- **Dialoguri, drawers, dropdown-uri și popover-uri:** obiecte ridicate, cu blur, umbră, rază mare, spacing bun, ordine corectă de focus, Escape și focus vizibil.
- **Grafice:** dacă există în starea reală a proiectului, reduce gridurile grele, coordonează paleta, curăță legenda și folosește tooltip-uri din același sistem. Nu inventa grafice doar ca decor.
- **Stări goale, încărcare și eroare:** au compoziție, mesaj și acțiune coerente; nu lăsa texte brute sau skeleton-uri care schimbă violent layoutul.
- **Iconografie:** un singur set SVG outline cu `currentColor`, grosime și capete rotunjite comune. Iconul sprijină eticheta și nu concurează cu ea.

`GlassPanel`, `PageHeader`, `SectionHeader`, `MetricCard`, `StatusBadge`, `EmptyState`, variantele de buton și shell-ul de modal sunt exemple de primitive, nu o listă obligatorie. Creează numai abstracțiile justificate de codul repetat pe care îl găsești.

### 5.4 Tipografie, spațiu și mișcare

Folosește fontul local existent și fallbackul system UI; nu adăuga un font din rețea. Creează o ierarhie clară între titlu de pagină, titlu de secțiune, titlu de card, corp, etichetă și metadate. Elimină textul minuscul, boldul aplicat peste tot și contrastul slab. Valorile și acțiunile esențiale trebuie recunoscute într-o privire.

Mărește respirația layoutului și folosește scara comună de spacing. Grupează semantic conținutul; nu îngrămădi controale ca să păstrezi exact geometria veche. Densitatea paginilor de debug și analytics poate fi mai mare, dar ordinea vizuală și țintele interactive rămân bune.

Mișcarea trebuie să fie fluidă și reținută: tranziții de aproximativ 150–250 ms, lift de 1–3 px, luminanță, opacitate, umbră și indicatori activi. Evită bounce-ul exagerat și animațiile de joc. Respectă integral `prefers-reduced-motion`, fără a elimina feedbackul static de stare.

### 5.5 Accesibilitate și adaptare la suprafață

Designul trebuie să mențină sau să îmbunătățească semantica HTML, contrastul, focusul, ordinea tastaturii, stările disabled, dimensiunea țintelor și lizibilitatea. Sticla nu justifică text cu contrast scăzut.

Nu aplica orbește un brief generic „desktop/tablet/mobile” peste instalație. Verifică dimensiunile reale cerute de Nava:

- cele cinci tablete ale copiilor: 1920×1080 landscape, fără scroll în vederile de show;
- tableta operatorului — control și login, cu debug/analytics accesibile din aceeași interfață: 1920×1080 landscape; verifică și comportamentul robust în ferestre de dezvoltare mai mici;
- TV: 3840×2160 plus fereastra de dezvoltare, cu filmul drept centru al compoziției.

Dacă o suprafață este accesată și la altă dimensiune în codul real, păstrează comportamentul responsiv existent și îmbunătățește-l. Nu optimiza pentru o singură captură.

### 5.6 Disciplina transformării

Nu oferi o analiză teoretică lungă și nu te opri la sugestii, pseudo-cod, un mockup sau o singură pagină. Fă un audit scurt, stabilește fundația și modifică proiectul direct. Pentru fiecare etapă: inspectează fișierele, alege cea mai mică îmbunătățire arhitecturală coerentă, implementează, verifică regresiile și continuă.

Ordinea implicită este: audit → tokenuri globale → tipografie → fundal → layout → navigație/header → suprafețe comune → butoane/formulare → carduri/tabele/badge-uri → dialoguri/meniuri → grafice existente → suprafețe individuale → adaptare → micro-interacțiuni → pass de consistență. Poți schimba ordinea numai când arhitectura reală o cere.

La pass-ul final, judecă fiecare ecran după aceeași întrebare: ar fi credibil într-o prezentare a unui produs premium, Apple-adjacent, fără să piardă personalitatea jucăușă Nava? Dacă nu, continuă să corectezi alinierea, spațierea, tipografia, echilibrul, razele, umbrele, stările și armonia culorilor.

## 6. Organizarea recomandată cu subagenți

Dacă ai instrumente de colaborare, folosește trei subagenți după ce fundația comună este disponibilă. Dă fiecăruia un domeniu de fișiere exclusiv și cere-i să nu facă commit.

### Astra principal — fundație și integrare

Deține:

- `src/web/shared/**`;
- `scripts/build.mjs`;
- mascotele și sunetele;
- contractul minim `tabletSfx` din config/shared/server;
- integrarea finală, testele globale și `docs/DESIGN-REVIEW.md`.

### Agent T — tablete

Deține numai:

- `src/web/tablet/**`.

Obiectiv: layout 1920×1080 landscape, zone A/B alăturate stânga/dreapta, carduri de post cu mascote, telemetrie ca gadgeturi, confetti, SFX, subtitrări, countdown, mulțumiri, certificat și fotografie.

### Agent R — televizoare

Deține numai:

- `src/renderer/glass-tv.css`;
- markupul și stilurile rendererului;
- componentele vizuale din `src/renderer/ui/**` numai dacă sunt necesare.

Obiectiv: subtitrări, countdown, OSD, veil, vignette, platforma Căpitanului, entități și epilog, fără regresii video/GLB.

### Agent K — suprafețele operatorului

Deține numai:

- `src/web/control/**`;
- `src/web/login/**`;
- `src/web/debug/**`;
- `src/web/analytics/**`.

Obiectiv: același sistem glass, toate funcțiile R4 păstrate, densitate bună și stare critică exprimată prin iconiță + text + culoare.

Nu porni agenții înainte de a crea contractul vizual comun, deoarece vor inventa trei sisteme diferite. După livrare, inspectează tu fiecare diff și rezolvă integrarea. Agenții nu decid schimbări de protocol, nu editează fișierele altora și nu rescriu documentația centrală.

## 7. Planul de implementare

### Etapa 0 — baseline reproductibil

1. Notează branch-ul, HEAD-ul și starea worktree-ului.
2. Rulează `npm run check` și păstrează rezultatul inițial.
3. Construiește și pornește aplicația în mod windowed.
4. Capturează starea veche a celor șase suprafețe pentru comparație, fără să comiți capturile din `runs/`.
5. Verifică arhitectura reală a buildului și rutelor statice înainte de a crea `shared/`.
6. Confirmă stackul notat în §2 și inventariază rutele, stilurile globale, tokenurile, layouturile, navigația, componentele reutilizate și id-urile DOM legate de TypeScript.
7. Identifică pe scurt tiparele repetate, inconsistențele și zonele cele mai întunecate, dense sau fragile. Comunică utilizatorului rezumatul în câteva rânduri, apoi începe imediat implementarea.

### Etapa 1 — sistemul comun Nava Glass

Creează `src/web/shared/glass.css` cu:

- tokenurile de culoare și fallbackurile hex din specificație;
- cele opt palete tematice;
- gradient mesh și decorul cu bule/stele;
- `.glass`, `.glass-strong`, `.glass-tint`;
- butoane primare/secundare, badge-uri, carduri, toast, formulare, tabele și focus;
- scara tipografică și spațierea pe grila de 8 px;
- animațiile spring și stările de apăsare;
- un bloc complet `prefers-reduced-motion`;
- fallback lizibil dacă `color-mix`, `oklch` sau `backdrop-filter` nu sunt disponibile.

Creează `src/renderer/glass-tv.css` separat. Pe TV nu folosi `backdrop-filter`; folosește fundaluri translucide/gradiente și un zgomot static foarte discret. Păstrează `[hidden] { display: none !important; }`, deoarece această regulă repară bugul care ascundea filmul și avatarul.

Creează `src/web/shared/preview.html`. Trebuie să afișeze toate componentele, cele opt teme și stările normal/hover/focus/disabled/error/success, astfel încât sistemul să poată fi verificat fără rularea întregului show.

Actualizează `scripts/build.mjs` astfel încât CSS-ul comun, preview-ul, mascotele, iconițele și SFX-urile să ajungă în `dist` pentru toate suprafețele care le folosesc. Nu copia manual aceleași fișiere în cinci directoare.

### Etapa 2 — mascotele

Dacă skill-ul sau unealta de generare imagini este disponibilă, citește instrucțiunile ei înainte de folosire. Generează cele șase mascote după §9 din `docs/DESIGN-SPEC-GLASS.md`:

- `mascot-01-navigatie.png`;
- `mascot-02-propulsie.png`;
- `mascot-03-comunicatii.png`;
- `mascot-04-biosemnale.png`;
- `mascot-05-memorie.png`;
- `mascot-ai-avatar.png`.

Cerințe:

- familie vizuală coerentă;
- 1024×1024;
- fundal transparent real;
- personajul centrat, fără text și fără margini tăiate;
- variante 256×256 pentru folosire mică;
- contrast bun pe toate cele opt fundaluri;
- fără asset-uri descărcate de pe internet și fără licențe externe.

Inspectează vizual fiecare PNG și verifică programatic dimensiunile și existența canalului alpha. Nu accepta șase stiluri inconsistente.

### Etapa 3 — iconițele și sunetele

Creează un set comun de SVG-uri inline sau un sprite SVG local pentru iconițele enumerate în §2.8. Toate trebuie să folosească aceeași grosime de linie, capete rotunde și `currentColor`.

Creează sunete originale, foarte scurte, pentru `tap`, `pick`, `confirm`, `start` și `thanks`, în `src/web/tablet/sfx/`. Nu folosi biblioteci audio externe. Fiecare sunet trebuie să aibă maximum 400 ms, volum perceput moderat și să nu semene cu o alarmă. Normalizează-le pentru a evita diferențe bruște.

Pe tabletă:

- deblochează audio numai după prima atingere;
- redă la aproximativ 35%;
- nu reda sunet la erori;
- nu repeta confetti sau sunetul dacă același răspuns este rerandat de starea serverului;
- oprește efectele vizuale la `prefers-reduced-motion`;
- respectă setarea `tabletSfx`.

### Etapa 4 — tabletele copiilor, 1080p landscape

Refă tableta pentru 1920×1080 landscape, fără scroll în vederile de show. Dacă orientarea devine portret, afișează un mesaj prietenos de rotire, nu o versiune înghesuită a interacțiunii.

Structura este:

- bară de sus: siglă, post, semnal;
- conținut: o singură idee principală;
- bară de jos: scena/starea misiunii.

Implementări obligatorii:

- alegerea postului: cinci carduri cu mascotă, nume și lentilă;
- așteptare: mascota levitează discret și textul explică starea;
- countdown: cifră mare și inel de progres;
- telemetrie: gadgeturi de sticlă, păstrând datele și logica R4;
- subtitrare: card luminos cu pastila vorbitorului;
- paired-choice: A în stânga/coral, B în dreapta/sky, fiecare cu perspectiva sa și propria confirmare;
- butonul „DOAR PRIVESC” cu icon de ochi;
- confirmare: bifă, „Mulțumim!”, confetti și sunet o singură dată;
- start pentru postul 1 în autoRun;
- mulțumiri, certificat și fotografie în noul limbaj vizual.

Păstrează perspectivele existente:

- NAVIGAȚIE: DIRECȚIE / TRASEU;
- PROPULSIE: ENERGIE / STABILITATE;
- COMUNICAȚII: CUVINTE / SEMNAL;
- BIOSEMNALE: PULS / LEGĂTURĂ;
- MEMORIE: AMINTIRE / TIMP.

### Etapa 5 — rendererul TV

Filmul rămâne centrul compoziției. Refă numai overlay-urile:

- subtitrarea `.glass-dark`, maximum două rânduri și etichetă de vorbitor;
- countdown alb cu inel tematic;
- vignette colorat subtil;
- halouri pentru entitățile Lumină, Natură și Tehnologica;
- platformă/disc de sticlă sub Căpitan;
- OSD, identify, erori și rehearsal ca panouri lizibile;
- veil-ul de pornire prietenos;
- tranziția alb-cald din epilog.

Reguli de performanță și compoziție:

- fără `backdrop-filter` pe TV;
- overlay-urile nu acoperă mai mult de 20% din cadru în starea normală;
- nu schimba stratificarea care menține filmul și GLB-ul vizibile;
- `AVATAR_AI` are doar pastilă + icon mic pe TV, fără mascotă mare și fără chip alternativ;
- Căpitanul rămâne unicul GLB și apare numai unde `showAvatar` este adevărat;
- verifică la 3840×2160 și în windowed; nu considera 1600×900 suficient.

### Etapa 6 — control, login, debug și analytics

Aplică `glass.css` tuturor celor patru suprafețe. Nu simplifica funcțiile existente pentru a face designul mai ușor.

Consola trebuie să păstreze:

- transportul complet și focusarea ferestrei playerului;
- readiness și preflight;
- timeline și editorul de cue-uri;
- ecrane, perf și tablete;
- utilizatori, mesaje, repetiție, ambianță, lumini, say, variantă, foto;
- linkurile spre debug și analytics;
- logout și controlul de rol.

Loginul trebuie să folosească tastatură PIN 3×4, mesaje prietenoase și focus corect. Debugul și analitica trebuie să rămână dense, dar să folosească text monospace numai pentru valori tehnice. Stările critice trebuie să aibă simultan icon, text și culoare.

Leagă tema curentă din starea show-ului de `data-theme` pe fiecare suprafață conectată. Loginul poate rămâne static pe `prologue`. Tranziția între teme trebuie să se termine în maximum 600 ms.

### Etapa 7 — documentație și integrare

După ce codul reflectă realitatea:

- creează `docs/DESIGN-REVIEW.md` cu matricea capturilor, contrastul, dimensiunile țintelor, overflow-ul, reduced-motion, performanța TV și defectele rămase;
- actualizează README și `docs/OPERARE.md` numai pentru comportamentele efectiv implementate;
- adaugă progresul în `HANDOFF-LIVE.md`;
- adaugă la finalul `HANDOFF.md` o secțiune R5; nu rescrie și nu șterge conținutul existent;
- nu transforma `docs/DESIGN-SPEC-GLASS.md` într-un jurnal. Păstrează-l ca specificație.

## 8. Două ambiguități deja rezolvate pentru tine

### 8.1 Cele șase opțiuni din scena Tehnologicei

Scena are cinci răspunsuri plus „Doar privesc”. Fiecare copil primește numai jumătate din lățimea ecranului landscape, iar cele șase ținte nu încap confortabil într-un singur rând dacă rămân accesibile.

Decizia de implementare:

- pentru maximum patru opțiuni folosește un singur rând;
- pentru cinci sau șase opțiuni folosește o grilă 3×2 în fiecare jumătate;
- nu folosi scroll orizontal, carusel sau text sub 20 px;
- fiecare țintă rămâne de minimum 64×64 CSS px; țintește 120 px înălțime când spațiul permite;
- verifică explicit că ambele zone alăturate, întrebarea și barele încap în 1920×1080.

Această decizie are prioritate față de formularea „un singur rând” din tabelul de componente.

### 8.2 `tabletSfx` și regula „protocolul nu se schimbă”

O setare din consola operatorului nu poate opri sunetul pe alte dispozitive fără să ajungă la tablete. Criteriul funcțional are prioritate față de afirmația generală că protocolul nu se schimbă.

Este autorizată o singură extensie comportamentală minimă:

- `tabletSfx: boolean` în configurație, implicit `true`;
- valoarea expusă tabletelor în starea/welcome-ul existent;
- control operator autentificat pentru schimbare în timpul sesiunii;
- validare, serializare și teste pentru valoare;
- nicio altă schimbare de protocol sau state machine.

Folosește mecanismele existente de comandă și broadcast dacă pot transporta valoarea curat. Dacă este necesar un action nou, numește-l clar, validează-l și testează autorizarea. Documentează această excepție în `docs/DESIGN-REVIEW.md`.

## 9. Verificarea obligatorie

### 9.1 Teste automate

După fiecare etapă relevantă rulează testele țintite. La final rulează obligatoriu:

```powershell
npm run check
```

Acesta trebuie să includă și să treacă: typecheck, validarea show-ului, validarea vocilor, build, testele Node, smoke core, smoke auth, smoke platform și smoke media.

Pentru renderer:

```powershell
.\node_modules\.bin\electron.cmd --remote-debugging-port=19191 . --config config.json --windowed
npm run smoke:renderer
```

Nu lăsa aplicația sau porturile de test deschise după verificare.

Adaugă teste numai pentru logică nouă care poate regresa: setarea `tabletSfx`, declanșarea unică a confetti/SFX, maparea temelor, fallbackul de CSS/build și păstrarea regulii `[hidden]`. Nu scrie teste artificiale care doar caută un șir în propriul fișier dacă poți testa comportamentul.

### 9.2 Matrice vizuală

Capturează cel puțin:

- tabletele copiilor: 1920×1080 landscape;
- tableta operatorului — consolă/login/debug/analytics: 1920×1080 landscape și o fereastră de dezvoltare la 1440×900;
- TV: 3840×2160 și modul windowed de dezvoltare;
- preview-ul componentelor pentru toate cele opt teme.

Pe tabletă verifică fiecare vedere, nu doar waiting:

- post-assign;
- waiting;
- countdown;
- telemetrie;
- subtitrare;
- color choice;
- pulse choice;
- perspective choice cu șase opțiuni;
- stare selectată A/B;
- start autoRun;
- mulțumiri/certificat;
- fotografie și erori.

Pentru fiecare captură verifică:

- `scrollWidth <= clientWidth` și `scrollHeight <= clientHeight` acolo unde specul interzice scrollul;
- nicio țintă sub 64 px pe tabletă;
- niciun text sub 20 px pe tabletă, exceptând etichetele tehnice permise;
- text netăiat, fără suprapuneri și fără carduri ieșite din viewport;
- focus vizibil;
- contrast minimum 4.5:1 în combinațiile cerute;
- reduced-motion fără gradient animat, levitație, spring sau confetti;
- teme sincronizate între state și `data-theme`;
- consola și paginile protejate funcționează după login;
- nicio eroare nouă în consola browserului.

### 9.3 Test vizual cu filmul real

Nu declara rendererul terminat doar din CSS static. Pornește filmul real și confirmă:

- două cadre succesive diferă;
- `currentTime` și contorul de cadre avansează;
- veil-ul ascuns are `display:none` și suprafață zero;
- Căpitanul este vizibil și WebGL nu și-a pierdut contextul;
- subtitrarea nouă este lizibilă peste un cadru luminos și unul întunecat;
- overlay-urile nu ascund planeta sau mai mult de 20% din cadru;
- schimbarea celor opt teme nu produce flash negru;
- performanța la 4K rămâne acceptabilă.

## 10. Definiția exactă a rezultatului final

Poți spune că R5 este complet numai dacă toate afirmațiile următoare sunt adevărate:

- `glass.css`, `glass-tv.css` și preview-ul există și sunt folosite;
- toate cele șase suprafețe reale folosesc același sistem de design;
- există șase mascote coerente, în ambele dimensiuni, cu alpha verificat;
- există cinci sunete originale și controlul `tabletSfx` funcționează de la consolă la tablete;
- cele cinci tablete ale copiilor funcționează complet la 1920×1080 landscape, A în stânga și B în dreapta, fără scroll în vederile de show;
- tableta operatorului funcționează complet la 1920×1080 landscape;
- confetti și sunetele se declanșează o singură dată și respectă preferințele/setările;
- toate cele opt teme recolorează fiecare suprafață conectată;
- TV-ul nu folosește blur greu și păstrează filmul/GLB-ul vizibile;
- `AVATAR_AI` este afișat „AVATARUL AI”, fără modificarea vocilor;
- Căpitanul rămâne unicul GLB;
- loginul, rolurile, consola, editorul, debugul, analitica, certificatele și telemetria încă funcționează;
- criteriile de contrast, focus, dimensiune și reduced-motion sunt verificate;
- `npm run check` și `npm run smoke:renderer` trec;
- `docs/DESIGN-REVIEW.md`, README, OPERARE, HANDOFF-LIVE și addendumul HANDOFF reflectă exact ce există;
- worktree-ul nu conține secrete, procese uitate sau asset-uri temporare;
- nu ai făcut commit/push fără instrucțiune explicită.

## 11. Cum comunici rezultatul utilizatorului

În mesajul final:

1. începe cu rezultatul concret, nu cu planul sau efortul;
2. enumeră suprafețele terminate și orice excepție reală;
3. spune exact ce teste au trecut;
4. oferă linkuri locale către `docs/DESIGN-REVIEW.md`, preview și capturile importante;
5. spune clar dacă worktree-ul este necomis;
6. nu afirma că ai verificat hardware pe care nu l-ai avut;
7. separă validarea software de repetiția fizică rămasă pe cinci TV-uri și cinci tablete;
8. nu propune commit sau push dacă utilizatorul nu le-a cerut.

Lucrează autonom până la această definiție de „gata”. Nu te opri după prima suprafață, după un mockup sau după un build verde fără verificare vizuală.
