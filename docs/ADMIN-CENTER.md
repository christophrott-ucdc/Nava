# EXODUS7 Admin Center

> Actualizare 14 septembrie 2026: la cererea proprietarului, aplicația Electron activează administratorul local **Christoph** cu o parolă fixă furnizată separat, inclusă numai ca hash scrypt în `src/server/bundled-admin.ts`. Se aplică o singură dată per bază de identitate, inclusiv actualizarea parolei unui Christoph deja administrator local. Modificările ulterioare ale parolei nu sunt suprascrise; MFA, dezactivarea și lockout-ul existent se păstrează. Coliziunile cu un Christoph non-admin/Google opresc inițializarea, fără promovare implicită. Aceasta înlocuiește instrucțiunile de mai jos privind absența contului implicit în Electron; serverele de test fără opțiunea `bundledAdministrator` păstrează bootstrap-ul cu token. Nu publica parola în documentație sau loguri.

Centrul se deschide la `/admin/` și necesită rol Administrator. Nu există parolă implicită. Pentru configurarea administratorului Christoph sau a altui cont, migrare, MFA și Google folosește [ghidul Identitate și RBAC](IDENTITATE-SI-RBAC.md).

## Instrumente

- Centru de comandă: stare show, scenă, timp, TV-uri/tablete, readiness și grafice.
- Control experiență: consola operatorului completă, tutorial, personaje, transport, demo, mixer, scenarii și editor.
- Resurse: CPU/RAM/disc/uptime ale PC-ului, resurse server, event loop, GPU NVIDIA/VRAM/temperatură și procese Electron.
- Stare și recuperare: health, checkpoint, backupul misiunii și acces la recuperare/diagnostic.
- Loguri, analitică, wiki offline, director de linkuri.
- Utilizatori, roluri, resetări, deblocare, sesiuni și audit.
- Identitate & dispozitive: directorul conturilor, browser/IP/metodă/activitate și configurarea Google Workspace @ucdc.ro.
- Parolă & MFA: schimbarea parolei, QR Authenticator și coduri de recuperare.
- Instalație: robotul și actualizările, cu limitele hardware din ghidurile dedicate.

## Resurse reale

Graficele păstrează maximum 72 de probe în memoria paginii și se actualizează aproximativ la 2,5 secunde. Nu sunt un istoric persistent. GPU se citește prin nvidia-smi cel mult o dată la 10 secunde. Senzorii/driverul indisponibili apar explicit ca indisponibili. CPU al unui proces poate depăși 100% pe mai multe nuclee. Procesele Electron sunt disponibile când serverul rulează în Electron.

Pagini inactive nu păstrează consolele încorporate conectate. Monitorizarea se oprește când pagina este ascunsă. Instrumentele încorporate folosesc aceleași API-uri și drepturi ca paginile dedicate.

## Date și acces

Identitatea este separată de baza misiunii. Backupul misiunii nu include utilizatorii sau cheia identității. Folosește procedura dedicată înainte de migrare/restaurare. Google necesită configurarea OAuth și un transport acceptat; aplicația Android nu este încă livrată. Inventarul browserelor nu reprezintă MDM sau atestare hardware.

Documentația wiki este inclusă în configurația electron-builder. Buildul din surse nu actualizează automat un EXE deja construit. Nu a fost făcut un nou EXE în această livrare.
