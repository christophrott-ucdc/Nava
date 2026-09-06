# FABLE — continuarea paginii administratorului și RBAC

## Cererea și limitele

Utilizatorul a cerut explicit doar scheletul, pentru a continua cu Fable. Nu porni o rescriere a autentificării. Interdicția de teste/build/aplicație rămâne activă până când utilizatorul o schimbă. Nu commit/push/merge/deploy. Păstrează toate modificările existente. Nu afișa .env, tokenuri, PIN-uri sau chei în output/documentație.

## Ce exista deja

- Roluri reale: viewer < operator < admin, în src/shared/types.ts și src/server/users.ts (ROLE_RANK).
- src/server/auth.ts: PIN login, cookie HttpOnly, sesiuni persistente, middleware requireRole, screen principal separat, tablete anonime.
- GET /api/auth/me; POST /api/auth/login și /logout.
- GET /api/auth/sessions: admin-only, vechiul răspuns conține prefixul tokenului; NU folosi pentru noul UI.
- /api/users admin-only: GET listă, POST creare {name,role,pin}, PATCH /:id {name,role,disabled}, POST /:id/pin {pin}, DELETE /:id.
- UsersStore protejează ultimul administrator și unele acțiuni asupra propriului cont. Citește implementarea înainte de completare.
- Sesiunile/conturile sunt JSON, nu SQLite. Nu este necesară o migrare pentru acest schelet.

## Schelet implementat 2026-09-06

- /admin/ — src/web/admin/index.html, index.ts, styles.css: shell Nava Glass, listă conturi cu rol/stare, sesiuni cu expirare, permisiuni, secțiune instalație marcată planificată. Doar citire, refresh și logout reale. 401 trimite la /login/?next=%2Fadmin%2F; 403 afișează acces refuzat. Datele dinamice folosesc textContent.
- src/shared/admin.ts: contract AdminOverview și vocabular mic AdminPermission. Acest contract NU înlocuiește autorizarea existentă a întregului server. Nu pretinde RBAC granular final.
- src/server/admin.ts: GET /api/admin/overview, admin-only pe server, no-store, proiecție explicită fără credentiale. Conturi și sesiuni reale; nu mockuri.
- src/server/index.ts: montare router + ruta statică admin.
- scripts/build.mjs: target browser și copiere statică admin. Buildul NU a fost executat; pagina necesită următorul build autorizat pentru dist.
- Nu există încă link contextual din consola operatorului; acces direct /admin/.

## Ordine de implementare pentru Fable

1. Citește sursele de mai sus și git status. Auditează protecțiile HTTP și WebSocket existente; nu deduce permisiuni doar din butoanele vizibile.
2. Adaugă link Administrare în consola existentă numai pentru admin, derivat din /api/auth/me, cu guard server intact.
3. Formulare creare utilizator, schimbare nume/rol, activare/dezactivare, reset PIN. Refolosește API-urile existente, fără store paralel. Afișează răspunsurile reale și protecțiile ultimului admin/propriului cont. Nu loga PIN-ul și nu-l repopula după trimitere. Dialoguri accesibile, busy/erori/focus.
4. Revocare sesiuni: endpoint nou admin-only cu identificator opac dedicat, NU token sau prefix de token. Revocarea trebuie să invalideze și conexiunile WebSocket relevante. Lista actuală nu oferă identificatorul necesar; nu improviza din nume/userId dacă vrei revocare individuală.
5. Audit persistent al schimbărilor administrative: actor, acțiune, țintă, rezultat, timp; fără PIN/token/hash. Definește retenția și rollback în caz de eroare de persistare. Nu eticheta logurile actuale drept audit complet.
6. Ecrane/setări: inventariază endpointurile reale și rolurile lor înainte de UI; nu muta comenzi de show la admin-only din greșeală. La unificarea unei matrici de permisiuni păstrează compatibilitatea viewer/operator/admin și principalul screen separat.
7. Revizuiește logout la fetch în curs, sesiune expirată, schimbare rol/dezactivare cu WS deja conectat, concurența schimbărilor și protecția CSRF/origin pentru mutații. Nu presupune că verificarea la WS hello este suficientă după schimbarea rolului.

## Definiția de gata pentru etapa următoare

Un admin gestionează conturi și sesiuni fără acces la secrete; operatorul poate conduce show-ul dar primește 403 pe administrare; viewer rămâne doar citire pe suprafețele sale. Ultimul admin rămâne protejat, erorile de rețea/persistare sunt reale și recuperabile. Formulare operabile cu tastatură și la 1920×1080/fereastră mică.

Când utilizatorul autorizează verificarea: teste meaningful pentru 401/403, ultimul admin, cont dezactivat, schimbare rol/revocare inclusiv WS, origin/CSRF, erori persistare; apoi verificare vizuală și comenzile proiectului. Până atunci raportează explicit implementare nevalidată, nu build verde.

## Ghid vizual pentru continuare
Aplică [FABLE-FRONTEND-GLASS-GUIDELINES.md](FABLE-FRONTEND-GLASS-GUIDELINES.md): paletă, materiale, layout admin, componente, stări, accesibilitate și prompt de continuare. Refolosește tokenurile existente; stilul actual admin este doar un schelet.



## Etapa Fable — 2026-09-06 (implementare, NEVALIDATĂ)

Interdicția de teste/build/aplicație a fost respectată: nimic din cele de mai jos nu a fost compilat, rulat sau capturat. Prima comandă când verificarea devine permisă: `npx tsc --noEmit`, apoi `npm run build`, apoi `npm run smoke:auth`.

### Fișiere

- `src/shared/admin.ts` — contract v2: `AdminUser`, `AdminSession` (id opac, `current`), `AuditEntry`/`AuditAction`, `ROLE_HELP` (explicații în română), permisiuni noi `sessions.revoke`, `audit.read`.
- `src/server/audit.ts` (nou) — `AuditLog`: JSONL append-only în `data/audit.jsonl`, rotație la 2 MB cu 3 copii păstrate, `tail(limit)`. Politica la eroare de persistare: modificarea NU se anulează; eșecul se loghează la nivel error și ajunge în răspuns ca `audited:false`, iar UI-ul avertizează.
- `src/server/auth.ts` — `AuthDeps.audit` și `AuthDeps.onSessionsRevoked`; `sessionIdOf(token)` = sha256 trunchiat (opac, ireversibil); `revokeById`, `revokeUser`, `dropSessions`; middleware `sameOrigin` (Sec-Fetch-Site / Origin vs Host) aplicat pe `/api/users` și `/api/admin`; audit la login/logout/create/update/pin/delete; la PIN nou, dezactivare sau ștergere sesiunile se închid și WS-ul primește 4401; la schimbare de rol WS-ul primește 4409 (consola se reconectează și recitește rolul din /api/auth/me). Endpointul vechi `/api/auth/sessions` nu mai întoarce prefixul tokenului, ci id-ul opac.
- `src/server/admin.ts` — `GET /overview` (v2), `POST /sessions/:id/revoke` (refuză sesiunea proprie), `POST /users/:userId/sessions/revoke` (păstrează sesiunea actorului), `GET /audit?limit=`; no-store pe toate.
- `src/server/index.ts` — creează `AuditLog` lângă users.json, îl dă lui `createAuth` și routerului admin; `onSessionsRevoked` închide clienții WS cu tokenul revocat.
- `src/web/admin/` — pagină rescrisă pe glass.css: navigare laterală 240 px (Prezentare, Utilizatori, Sesiuni, Audit, Instalație marcată „planificat”), header cu identitate + acțiune principală „Adaugă utilizator”, tabel de conturi cu meniu de acțiuni pe rând (`<details>` nativ), dialoguri `<dialog>` pentru creare/modificare, reset PIN și confirmări (focus inițial, focus returnat, Escape blocat cât e o cerere în zbor, eroarea rămâne în dialog), stări: încărcare, gol, eroare de rețea, 401 → login cu date șterse, 403 → „Nu ai acces”, „Actualizat la HH:MM”; răspunsuri întârziate ignorate (generație + AbortController); PIN niciodată păstrat după închidere; fără confetti. Tema fixă `prologue` pe `html[data-theme]` (scheletul o punea doar pe body).
- `src/web/control/index.html` + `index.ts` — link „ADMINISTRARE” vizibil doar pentru admin (derivat din /api/auth/me; gardul rămâne pe server).

### Rămase / de verificat când se permite

1. Typecheck + build + smoke:auth; smoke-auth așteaptă probabil răspunsul vechi al `/api/auth/sessions` — de actualizat dacă verifică prefixul.
2. Teste noi: 401/403 pe /api/admin, revocare după id, revocare pe utilizator care păstrează sesiunea actorului, 4409 la schimbare de rol cu WS deschis, ultimul admin, cont dezactivat cu WS deschis, sameOrigin cu Origin străin, audit degradat (director read-only).
3. Verificare vizuală la 1920×1080 și ~1024×768, tastatură, text mărit, fallback fără blur, reduced motion; contrastul butonului destructiv (`color-mix` pe --danger) și al focusului pe fundalul compus.
4. Consola mai are propriul panou „Utilizatori” (prompt()/confirm() native); acum există pagina dedicată — de decis dacă panoul rămâne sau devine doar link.
5. Instalație: doar text „planificat”, fără comenzi. Retenția auditului (2 MB × 4) e o alegere inițială, de confirmat cu Christoph.
6. Fără commit/push/deploy în această etapă.
