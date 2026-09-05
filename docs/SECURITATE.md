# Securitate — modelul de amenințare al rețelei sălii și ce protejează NavaPlayer

> Scris 2026-09-05 (agentul E, E-03) pe baza `src/server/auth.ts`, `src/server/users.ts`, `src/server/index.ts` (gărzile), `src/main/config.ts` (tokenul ecranelor), `CONFIG_DEFAULTS_R4` din `src/shared/types.ts` și `scripts/smoke-auth.mjs`. Fiecare afirmație are sursa în paranteză. Nu descrie ce ar trebui să facă software-ul, ci ce face la data scrierii.

## 1. Contextul: un LAN de sală, fără internet obligatoriu

NavaPlayer rulează pe PC-ul master al sălii și ascultă pe `0.0.0.0:4321` (`config.server`). În aceeași rețea Wi-Fi/LAN stau: consola operatorului (laptop/telefon), eventual PC-uri follower, **cele cinci tablete ale copiilor** și — dacă rețeaua nu este separată — orice alt dispozitiv din clădire. Nu există TLS; totul este HTTP și `ws://` în clar.

### 1.1 Cine ar putea ataca și ce ar putea face

| Actor | Acces realist | Ce ar putea face fără protecție | Ce îl oprește acum |
|---|---|---|---|
| Un copil curios cu tableta | aceeași rețea, URL-ul din QR | să deschidă `/control/` și să apese **RESTART** în mijlocul filmului; să trimită `POST /api/cmd` | PIN-ul (§2); tableta vede doar `/tablet/`, `/api/health`, `/api/state` |
| Un telefon străin conectat la Wi-Fi-ul sălii | aceeași rețea | idem + să citească show-ul, răspunsurile tabletelor, jurnalele; să încerce PIN-uri | PIN-ul, rate limit-ul (§4), `publicState` (§3) |
| Un laptop care se dă drept „ecran" | aceeași rețea | să se conecteze la `/ws` ca `screen`, să pretindă că e sursa de ceas, să consume `/api/tts` (bani pe cheia ElevenLabs) | `screenToken` (§5); pretenția de sursă de ceas este acceptată doar de la id-ul primului ecran configurat (`src/server/index.ts`, `onHello`) |
| Cineva care ascultă traficul (sniffing pe Wi-Fi deschis) | aceeași rețea | să vadă PIN-ul la login, tokenul de sesiune, `screenToken`, textele | **nimic** — HTTP fără TLS (§7) |
| Cineva cu acces fizic la PC-ul master | consola Windows | să citească `config.json` (token), `data/users.json` (hash-uri), `.env` (chei API) | doar permisiunile Windows; în afara scopului aplicației |

Concluzia de proiectare (`docs/DECIZII.md` ADR-15): protejăm **comenzile și administrarea** cu un PIN tastabil de pe telefon, acceptăm că LAN-ul sălii trebuie tratat ca **privat** și documentăm ce rămâne expus.

## 2. Ce protejează PIN-ul

Login: `POST /api/auth/login { pin }` → utilizatorul al cărui hash `scrypt(pin, salt)` se potrivește (`src/server/users.ts`, `verifyPin`). Se pune cookie-ul `nava_session` (HttpOnly, `SameSite=Lax`, `Path=/`, `Max-Age = sessionTtlMin × 60`) și tokenul (64 hex) este întors și în corp, pentru WS (`src/server/auth.ts`). Roluri: `viewer (1) < operator (2) < admin (3)` (`ROLE_RANK`).

| Protejat | Rol minim | Sursa gărzii |
|---|---|---|
| **Consola** — pagina `/control/` se încarcă static, dar fără sesiune `GET /api/auth/me` răspunde `401` și pagina redirecționează la `/login/`; WS `hello` al clientului `control` fără token valid → `error 4401` + close | viewer (a vedea), operator (a comanda) | `src/web/control/index.ts`, `auth.authenticateHello` |
| **Comenzile** — `POST /api/cmd`; WS `cmd` (un `viewer` primește `error 4403`) | operator | `index.ts` gărzi; `case "cmd"` |
| **Editarea show-ului** — `POST /api/show/reload`, `PUT/POST /api/show`, `PATCH /api/show/cue/:id`, `POST /api/show/restore/:file`, `GET /api/show/backups` | operator | `app.use("/api/show/*", operator)`, `app.on([PUT,POST,PATCH,DELETE], ...)` |
| **Utilizatorii** — `GET/POST /api/users`, `PATCH/DELETE /api/users/:id`, `POST /api/users/:id/pin`; `GET /api/auth/sessions` | admin | `usersRouter.use("*", requireRole("admin"))` |
| **Depanarea** — `GET /api/debug/summary|perf|logs|runs`, `GET /api/lights`, `GET /api/frame` | viewer | `index.ts`, `debug.ts` |
| — acțiunile `POST /api/debug/preflight|rotate-runs|clients/:id/close`, `POST /api/tablets/clear`, `POST /api/player/focus`, `/api/certificates*` | operator | idem |
| — `POST /api/debug/gc` | admin | `debug.ts` |
| **TTS live și dialog** — `/api/tts*`, `/api/dialog*` (consumă chei API plătite) | token de ecran **sau** operator | `auth.requireScreenOrRole("operator")` |
| **Citirea** — `/api/show`, `/api/cues`, `/api/config`, `/api/tablets`, `/api/run`, `/api/analytics*` | viewer | `index.ts` |

Ce vede `/debug/` din secrete: `config.security.operatorPin` → `****`, `screenToken` → primele 4 caractere + lungimea, `lights.hueUser` → `****`; cheile din `.env` doar ca **prezență** (`true/false`), niciodată valoarea (`redactConfig`, `envFlags` în `src/server/debug.ts`).

## 3. Ce rămâne public (intenționat)

| Rută / suprafață | De ce e publică | Ce expune |
|---|---|---|
| `/tablet/*` + WS `hello { client: "tablet" }` | tabletele copiilor nu au cum să tasteze un PIN; sunt anonime prin design (ADR-13) | primesc `welcome` (show-ul întreg, starea), `tabletView`, `state`, `photo`; pot trimite `set-post` și `choice` (validate: post 1–5, zone A/B, valori din opțiunile cue-ului curent, o singură dată per zonă; `src/server/tablets.ts`) |
| `GET /api/health` | diagnostic rapid, folosit de `RUN.bat` și de smoke-uri | versiune, rol, uptime, numărul de ecrane/tablete, `videoReady`, id-ul sursei de ceas, `state`, `showError` |
| `GET /api/state` **când `security.publicState: true` (implicit)** | tabletele și un „display de hol" pot citi starea fără login | `ShowState` complet: fază, timp, scenă, temă, limbă, ultimul cue vocal, `readiness` (inclusiv id-urile ecranelor lipsă), `variant`. Cu `publicState: false` cere rol `viewer` |
| `GET /api/urls`, `GET /api/qr` | consola le afișează înainte de login; QR-ul trebuie scanabil | adresele LAN ale masterului; QR-ul oricărui URL `http(s)://` ≤ 512 caractere (nu doar al tabletelor) |
| `POST /api/auth/login|logout`, `GET /api/auth/me` | fluxul de login | `me` răspunde `401` neautentificat |
| Fișierele statice `/control/`, `/debug/`, `/login/`, `/analytics/` | sunt doar HTML/JS; datele vin din API-uri protejate | codul client (nu conține secrete) |
| Mesajele WS `welcome`/`state` către tablete | tabletele au nevoie de show pentru interacțiuni | **întregul `show.json`** (toate textele replicilor, inclusiv cele trei ramuri ale Tehnologicei) ajunge pe orice client `tablet` |

## 4. Sesiuni și rate limit

- Sesiunea: `randomBytes(32)` hex, `expiresAt = now + max(5, sessionTtlMin) min` (**implicit 720 min = 12 h**, configurabil 1…525 600). Persistată în `data/sessions.json` lângă `users.json`, deci supraviețuiește repornirii serverului (`.gitignore` le exclude pe amândouă).
- Invalidare: `POST /api/auth/logout`; **schimbarea PIN-ului unui utilizator șterge toate sesiunile lui** (`usersRouter.post("/:id/pin")`); ștergerea sau dezactivarea utilizatorului face tokenul inutil la următoarea cerere (`sessionByToken` verifică `disabled`); rolul se împrospătează din `users.json` la fiecare cerere, deci o retrogradare `admin → viewer` are efect imediat.
- Rate limit login: **8 încercări per IP în fereastra de 5 minute**; a noua și următoarele primesc `429` până expiră fereastra (`LOGIN_MAX_ATTEMPTS`, `LOGIN_WINDOW_MS`). Contorul este în memorie (se pierde la repornire) și cheia este IP-ul din `x-forwarded-for` sau al socket-ului. Spațiul PIN-urilor de 4 cifre are 10 000 valori: cu 8/5 min, o parcurgere completă ar dura peste 4 zile de pe un singur IP — suficient pentru o sală, insuficient împotriva mai multor IP-uri; de aceea recomandăm 6–8 cifre (§6).
- Comparațiile de PIN și token sunt în timp constant (`timingSafeEqual`), iar `verifyPin` calculează hash-ul pentru **toți** utilizatorii indiferent de rezultat (cost constant ≈ N × scrypt).

## 5. Tokenul ecranelor (`security.screenToken`)

- Ecranele (renderer-ele Electron, locale sau de pe follower-e) nu au PIN. Ele trimit în WS `hello` un token comun, `security.screenToken`, primit prin `getBoot().screenToken` (`src/main/ipc.ts`, `src/renderer/sync.ts`). Același token este acceptat ca `Authorization: Bearer <screenToken>` pe `/api/tts`, `/api/dialog`, `/api/frame`.
- Pe **master**, dacă tokenul lipsește sau nu are forma `[A-Za-z0-9_-]{16,128}`, `loadConfig` generează `randomBytes(16).hex` (32 caractere) și îl **scrie înapoi în `config.json`** — singura rescriere a fișierului (`src/main/config.ts`). Operatorul copiază valoarea în `config.json` al fiecărui follower; un placeholder (`"<copiaza...>"`) este respins și follower-ul loghează eroare.
- Fără token valid, `hello { client: "screen" }` primește `error 4401 token de ecran invalid` și close (`auth.authenticateHello`).
- **Excepție de compatibilitate:** dacă masterul are `screenToken` **gol** (un `config.json` pe care aplicația nu a putut să-l rescrie — de ex. read-only), ecranele sunt acceptate **fără token** și `/api/tts` fără `Authorization` este permis; avertismentul se loghează o singură dată (`screenTokenOk`, `requireScreenOrRole`). Verificați în `/debug/` → CONFIG că `screenToken` nu apare `(gol)`.
- Tokenul nu identifică ecranul individual; un follower compromis poate impersona orice ecran, dar nu poate deveni sursă de ceas decât dacă are id-ul primului ecran din `config.screens` al masterului.

## 6. Recomandări pentru instalație

1. **Schimbați PIN-ul `4078` înainte de primul show public** — `/debug/` → UTILIZATORI (ca admin) sau `POST /api/users/<id>/pin`; folosiți 6–8 cifre (permis: 4–8). Creați un `operator` separat pentru facilitator și păstrați `admin` pentru administrare; un `viewer` pentru monitorul din hol, dacă există.
2. **SSID separat pentru sală** (tablete + consolă + follower-e), fără acces la internetul instituției și fără alte dispozitive; ideal cu izolare client-la-client dezactivată doar între master și clienți. Nu publicați QR-ul tabletelor în afara sălii.
3. **Firewall Windows:** permiteți `NavaPlayer.exe` (portul 4321 TCP) **numai** pe profilul de rețea *privat*; refuzați pe *public*. Nu expuneți portul prin routerul instituției.
4. `security.publicState: false` dacă nu aveți nevoie ca dispozitive neautentificate să citească starea (tabletele primesc oricum `state` prin WS).
5. Verificați la fiecare instalare că `security.screenToken` a fost generat (nu `(gol)` în `/debug/`) și că este identic pe follower-e.
6. `.env` (chei ElevenLabs/Gemini) numai pe master, cu permisiuni de fișier restrânse; fără chei, `/api/tts` și `/api/dialog` răspund cu eroare, show-ul de producție nu depinde de ele (`fallback: silent`).
7. După show, `POST /api/tablets/clear` sau **RESTART** șterge răspunsurile din memorie; run-log-urile `runs/show-*.jsonl` păstrează totuși alegerile (anonime, pe post) — decideți politica de păstrare (rotația păstrează ultimele 20).

## 7. Lacune cunoscute (acceptate în R4)

| Lacună | Consecință | De ce a fost acceptată / ce ar rezolva-o |
|---|---|---|
| **HTTP fără TLS** (`http://`, `ws://`) | PIN-ul, tokenul de sesiune și `screenToken` circulă în clar; un sniffer pe Wi-Fi le poate captura și reutiliza | certificat autosemnat ar produce avertismente pe fiecare tabletă/telefon; mitigare: SSID separat cu WPA2/3 |
| **Cookie fără `Secure`** | consecință directă a HTTP-ului; browserul ar refuza un cookie `Secure` pe `http://` | `HttpOnly` și `SameSite=Lax` sunt setate |
| **`GET /api/auth/me` returnează tokenul de sesiune** apelantului deja autentificat (prin cookie) | orice script care rulează pe origin-ul consolei poate citi tokenul și îl poate folosi din alt client | necesar pentru WS `hello` (cookie-ul HttpOnly nu e accesibil JS-ului); comentat explicit în `auth.ts`; alternativa ar fi trimiterea cookie-ului la upgrade-ul WS |
| **CORS `origin: *`** | orice pagină web deschisă pe un dispozitiv din LAN poate apela API-ul; cookie-urile nu se trimit cross-origin fără `credentials`, dar un `Bearer` furat da | simplitate pentru consolă/tablete pe IP-uri diferite |
| **Login doar cu PIN, fără nume** | PIN-urile trebuie unice; un PIN ghicit dă direct rolul utilizatorului | ergonomie pe telefon; compensat de rate limit și de recomandarea 6–8 cifre |
| **Rate limit per IP, în memorie** | se resetează la repornire; NAT-ul/proxy-ul poate grupa sau separa clienții; `x-forwarded-for` este de încredere fără verificare | nu există proxy în instalația-țintă |
| **Tokenul ecranelor este comun** și acceptat fără token când e gol pe master | vezi §5 | compatibilitate cu `config.json` anterioare R4 |
| **Show-ul întreg ajunge pe tablete** | textele (inclusiv finalul) pot fi citite de un copil care deschide DevTools | contract `welcome` comun; ar cere un `welcome` filtrat per tip de client |
| **Paginile statice sunt publice** | `/debug/` și `/control/` se încarcă fără login (fără date) | datele sunt în API-uri protejate |
| **`POST /api/certificates` cere rol operator** (integrarea curentă) | tabletele anonime nu pot posta certificatul lor — funcția D-06 nu poate fi folosită de pe tabletă până la ajustarea gărzii | semnalat în raportul E; decizia aparține orchestratorului (public cu validare strictă a PNG-ului, ca în antetul `features/certificates.ts`, sau prin token) |
| **Nu există jurnal de audit separat** | acțiunile operatorului apar în log ca `http:<nume>` / `control:<nume>` (`handleCommand` source), dar amestecate cu restul | suficient pentru o sală |

## 8. Cum verificați (fără hardware)

`npm run smoke:auth` (`scripts/smoke-auth.mjs`) pornește serverul pe un port liber, cu un appRoot temporar, și verifică 30 de puncte: gărzile `401/403` pe toate rutele protejate, login cu `4078`, CRUD utilizatori, unicitatea PIN-ului, invalidarea sesiunilor la schimbarea PIN-ului, WS `hello` refuzat cu `4401` fără token, rate limit `429`. Face parte din `npm run check`.
