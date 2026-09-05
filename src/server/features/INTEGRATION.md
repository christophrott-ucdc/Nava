# INTEGRATION.md — ce trebuie montat de orchestrator din livrarea Agentului D

Fișierele Agentului D nu ating `src/server/index.ts`. Mai jos: ce este deja montat (verificat în `index.ts`) și
singurul lucru care mai trebuie adăugat (analitica), plus contractele pe care se bazează consola/tabletele.

## 1. De montat: analitica (D-05)

```ts
import { createAnalyticsRouter } from "./features/analytics";
// după `app.route("/api/dialog", ...)`:
app.route("/api/analytics", createAnalyticsRouter({ runsDir: opts.runsDir, log }));
```

- Semnătura: `createAnalyticsRouter({ runsDir, log, maxRuns? }): Hono` — `maxRuns` implicit 200 (cele mai noi fișiere).
- Rute (toate GET, JSON):
  - `/summary` → `{ generatedAt, runsDir, aggregate, runs[] }` — `runs` fără lista de tranziții (`transitions: n` în loc de `states`).
  - `/runs` → `{ runs[] }` (același format „light”, cel mai nou primul).
  - `/run/:id` → `RunSummary` complet + `timeline[]` (max 2000 evenimente din kind-urile relevante). `400` id invalid (`show-YYYYMMDD-HHmmss[-n]`), `404` inexistent.
- Gardurile de rol există deja în `index.ts`: `/api/analytics` și `/api/analytics/*` sunt în lista `viewer`. Nu mai e nevoie de nimic.
- Citește doar `runs/show-*.jsonl` (formatul `RunLog`: `{t, kind, data}` pe linie); cache pe `size:mtime`, fără scriere pe disc.
- Pagina `/analytics/` este deja servită static (`for (const name of ["control","tablet","login","debug","analytics"])`) și bundlată de `scripts/build.mjs` (`src/web/analytics/index.ts` → `dist/web/analytics/app.js`). La 404 pe `/api/analytics/summary` pagina afișează un mesaj care trimite aici.

### Ce înseamnă câmpurile agregatului
| câmp | sens |
|---|---|
| `runs` / `runsStarted` / `runsCompleted` | fișiere citite / cu tranziție în `playing` (sau `cmd start`) / care au ajuns în `epilogue`/`ended` sau `video.ended` |
| `completionRate` | `runsCompleted / runsStarted` în procente (null fără misiuni pornite) |
| `avgDurationSec`, `medianDurationSec` | pe `missionDurationSec` (prima tranziție în `playing` → ultimul eveniment), doar rulări pornite |
| `commands` | `cmd.action` → număr, toate rulările |
| `choiceTotals[cueId][value]` | răspunsurile `tablet.choice` (valoarea `observe` = „doar privesc”) |
| `mostChosenPerInteraction[cueId]` | `{ value, count, total, share% }` — opțiunea cea mai aleasă, fără `observe` |

Per rulare (`RunSummary`): `id, file, startedAt, playStartedAt, endedAt, durationSec, missionDurationSec, started, reachedEpilogue, completed, events, cuesFired, cuesManual, cuesByKind, commands, commandsTotal, tabletAnswers, tabletChoices[cueId] = { total, observed, byValue, byZone[zone][value], posts[] }, tabletsSeen, photos, dynamicVoices, lastState, states[]`.

Funcțiile pure `parseRunLines`, `summarizeRun`, `aggregateRuns` sunt exportate pentru teste.

## 2. Deja montat / deja în contract (verificat, nimic de făcut)

- **Consola** (`src/web/control/**`): folosește `state.readiness`, `state.autoRun`, `state.variant`, `state.ambientEnabled`, `state.lightsDriver` din `ShowState`; mesajul `perfSummary` (1 Hz, `stateTimer`); comenzile R4 prin WS `cmd` (`rehearse`, `setRate`, `ambient`, `autoRun`, `lights`, `setVariant`, `say`, `photo`, `preflight`); `/api/auth/me` (rolul `admin` deschide panoul de utilizatori pe `/api/users`), `POST /api/auth/logout`. Rolul `viewer` primește UI cu acțiunile dezactivate vizual (serverul refuză oricum cu 4403).
- **Editorul de timeline** (`src/web/control/editor.ts`): `GET /api/show`, `PUT /api/show` (întreg `ShowFile`; răspunsul `SaveResult` cu `errors[]`/`warnings[]` este afișat inline), `GET /api/show/backups`, `POST /api/show/restore/:file`, `GET /api/frame?t=&w=480` (404 → previzualizarea se ascunde). Toate au deja garduri `operator` pentru scriere.
- **Tablete** (`src/web/tablet/**`): certificatul (D-06) face `POST /api/certificates { post, dataUrl }` — ruta există; **atenție**: în `index.ts` `/api/certificates` este în lista `operator`, iar tabletele nu au sesiune → POST-ul va primi 401 și tableta afișează „salvat local, netrimis”. Dacă vrem certificatele pe server, scoate `/api/certificates` din lista `operator` și lasă doar `GET`-urile protejate (comentariul din `certificates.ts` prevede exact asta), de ex.:
  ```ts
  app.on(["GET"], ["/api/certificates", "/api/certificates/*"], operator);
  ```
  în loc de intrarea din bucla `for (const p of [... "/api/certificates", "/api/certificates/*"])`.
- Butonul **PORNEȘTE MISIUNEA** (D-09) trimite `{type:"tablet", tabletId, event:{kind:"choice", cueId:"__start__", zone:"A", value:"start"}}` — tratat în `tablets.ts` (`START_REQUEST_CUE_ID`) și `director.requestStart()`; apare doar când `state.state === "idle"`, `state.autoRun === true` și tableta este la postul 1.
- Telemetria (D-07) este pur client-side (interpolare locală din `state` 1 Hz + `clock`), fără rute noi.

## 3. Teste

`src/server/state.test.ts` (node:test, rulat de `npm test` prin `scripts/test.mjs`) construiește `ShowDirector` fără I/O cu `DirectorOptions.now`/`schedule` injectate. Nu are nevoie de fișiere sau rețea.
