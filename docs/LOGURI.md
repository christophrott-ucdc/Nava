# Jurnalul navei — /logs

Pagina `http://localhost:4321/logs` redirecționează la `/logs/`. Accesul la date cere autentificare cu rol viewer, operator sau admin. Există legătură LOGURI în consola operatorului. Reporniți Electron după compilare; aplicația deja pornită nu încarcă automat rutele noi.

## Surse și persistență

- `runs/app-*.jsonl`: Electron, server, erori, conexiuni și diagnosticele raportate prin loggerul aplicației. Persistența acestui flux aparține loggerului Electron.
- `runs/show-*.jsonl` și `runs/diagnostic-*.jsonl`: comenzi, schimbări de stare, replici și interacțiuni înregistrate de RunLog. Noile evenimente au și nivel explicit.
- Jurnalul administrativ `audit.jsonl` și copiile rotite sunt citite din calea reală a configurației de utilizatori.
- Erorile JavaScript și promisiunile respinse fără handler din tabletă, control, debug, analytics, admin, login, wall și logs sunt raportate către server și intră în jurnalul aplicației. Sunt marcate ca rapoarte provenite de la client, nu ca fapte verificate de server.

Pagina reunește fișierele existente, fără un al doilea jurnal duplicat. Funcționează inclusiv pentru istoricul anterior acestei modificări. Înregistrarea nu depinde de deschiderea paginii. Nu se înregistrează fiecare cadru video, fiecare mișcare de deget, câmpurile completate sau toate obiectele interne; se păstrează evenimentele emise de instrumentarea aplicației. Erorile clientului apărute complet offline nu sunt recuperate automat ulterior.

Niveluri: DEBUG, INFO, WARNING, ERROR, FATAL. `warn` devine WARNING; evenimentele vechi fără nivel sunt clasificate după tip și rezultatul acțiunii. Această clasificare este orientativă, nu rescrie istoricul brut.

## Utilizare

Actualizare live la 3 secunde, suspendată când pagina este ascunsă. Butonul Live oprește numai actualizarea vizualizării. Sunt disponibile căutare, nivel, selectarea jurnalului, detalii JSON, actualizare manuală și export JSONL filtrat.

Vizualizarea implicită citește cele mai recente 8 jurnale; fiecare citire este limitată la o fereastră de 1 MiB per fișier. Sunt afișate până la 300 de rezultate. Pentru istoric, selectați un fișier și folosiți „Intrări mai vechi”; filtrarea rămâne aplicată ferestrei citite. Exportul include până la 1.000 de rezultate din aceeași fereastră, nu pretinde că exportă toate jurnalele. Fișierele care au dispărut prin rotație sau liniile JSON invalide nu blochează pagina și sunt semnalate.

API-uri autentificate: `GET /api/logs/files`, `GET /api/logs?file=&level=&q=&before=&limit=`, export cu `format=jsonl`. Căile fișierelor provin dintr-o listă controlată, nu dintr-o cale furnizată de browser. Nu există ștergere din UI. Citirea logurilor nu generează alte loguri de polling în buclă.

## Date sensibile și volum

Cheile API, tokenurile, parolele, PIN-urile, cookie-urile și conținutul media sunt filtrate din noile loguri main/show și din răspunsurile paginii pentru istoricul vechi. Fișierele istorice de pe disc nu sunt rescrise. Păstrați controlul accesului asupra directorului de date.

Raportarea erorilor browserului acceptă doar pagini și tipuri cunoscute, corp limitat și maximum 10 rapoarte/minut/client, respectiv 100/minut pe server. Rapoartele duplicate sunt reduse pe client. Nu se oferă un endpoint public pentru citirea logurilor.

Rotația existentă se păstrează: până la 20 jurnale app și politica existentă pentru rulări; auditul păstrează fișierul curent și 3 copii de aproximativ 2 MiB. Această pagină nu introduce retenție nelimitată. Faceți backup separat dacă este necesară păstrarea pe termen lung.

## Starea livrării

Actualizare la 14 septembrie 2026: verificarea completă a repository-ului a trecut cu 256 de teste, inclusiv testele routerului de loguri, typecheck și build. Pagina a fost inclusă în verificările Chromium ale operatorului. Dovezile locale se găsesc în `runs/debug/planet-stops-2026-09-14/operator/` și `runs/debug/cleanup-2026-09-14/`.

Documentarea paginii nu repornește aplicația și nu actualizează executabilele deja împachetate. Limitele de citire, retenție și instrumentare de mai sus se aplică în continuare. Pentru orientare în toate paginile, consultați [README](../README.md).
