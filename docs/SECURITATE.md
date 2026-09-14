# Securitate EXODUS7

> Actualizare 14 septembrie 2026: la cererea proprietarului, aplicația Electron activează administratorul local **Christoph** cu o parolă fixă furnizată separat, inclusă numai ca hash scrypt în `src/server/bundled-admin.ts`. Se aplică o singură dată per bază de identitate, inclusiv actualizarea parolei unui Christoph deja administrator local. Modificările ulterioare ale parolei nu sunt suprascrise; MFA, dezactivarea și lockout-ul existent se păstrează. Coliziunile cu un Christoph non-admin/Google opresc inițializarea, fără promovare implicită. Aceasta înlocuiește instrucțiunile de mai jos privind absența contului implicit în Electron; serverele de test fără opțiunea `bundledAdministrator` păstrează bootstrap-ul cu token. Nu publica parola în documentație sau loguri.

Actualizat 14 septembrie 2026. Procedurile de identitate, migrare, MFA, Google, RBAC și backup sunt în [IDENTITATE-SI-RBAC.md](IDENTITATE-SI-RBAC.md). Acestea înlocuiesc loginul exclusiv cu PIN și recrearea administratorului 4078.

## Limite de încredere

PC-ul navei este serverul autoritativ. Personalul se autentifică nominal; Observator, Operator și Administrator au permisiuni distincte verificate în HTTP și WebSocket. Tabletele copiilor au un protocol separat, anonim, pentru experiență; nu primesc identitate de personal. Ecranele folosesc tokenul dedicat configurat al instalației.

Configurația nativă folosește LAN HTTP/WS. Acest transport nu criptează credențialele. Pentru acces în rețele neîncredere, acces extern sau Google prin LAN configurați HTTPS și WSS cu un proxy TLS pe PC, Host păstrat și antete de forwarding controlate de proxy. Nu expuneți direct portul HTTP pe internet. Serverul acceptă forwarding numai de la loopback; verificarea originii și cookie-urile nu înlocuiesc TLS.

## Protecțiile implementate

- Fără parolă implicită. Configurarea inițială este locală și cere un token aleator consumabil o singură dată.
- Conturi nominale cu parolă/PIN hash-uit scrypt, salt aleator, cost actualizat; conturile vechi se migrează.
- Cinci încercări greșite blochează persistent contul. Limitare suplimentară per IP și globală, înainte de hashing.
- Resetări administrative cu schimbare obligatorie la login, deblocare, dezactivare, RBAC și revocarea sesiunilor HTTP/WS.
- Sesiuni aleatoare, cookie HttpOnly/SameSite, Secure la HTTPS; maximum 20 de sesiuni per cont și durată maximă de 24 h.
- TOTP Authenticator cu confirmare QR, protecție anti-replay și coduri de recuperare one-use.
- Înregistrări de identitate criptate AES-256-GCM în SQLite; cheia protejată prin Windows DPAPI în Electron. Nu se presupune protecție DPAPI în harness-uri Node fără Electron.
- Google OIDC cu PKCE/state/nonce, semnătură RS256, issuer/audience/expirare și validarea domeniului organizației. Conturile noi sunt Observator. Fără asociere automată la un cont local pe baza e-mailului.
- Jurnalizare a autentificărilor și modificărilor administrative; redacția secretelor, parolelor, tokenurilor și codurilor OAuth.
- Inventar observat de utilizator/browser/IP, sesiuni și ultima activitate. Nu reprezintă atestare hardware sau MDM.

## Operațiuni necesare organizației

Protejați contul Windows și activați criptarea discului potrivit politicii organizației. Limitați accesul la directorul de date, configurații, chei și backupuri. Păstrați un administrator de recuperare, activați MFA pentru administratori și testați procedura de recuperare. Parolele temporare se transmit protejat, separat de utilizarea publică a sălii.

Backupul misiunii și cel al identității sunt distincte. Pentru identitate păstrați baza și cheia împreună cu posibilitatea de recuperare a profilului Windows. Testați restaurarea înainte de o situație reală. Nu copiați credențiale/chei în Git sau în EXE. Nu ștergeți identitatea ca metodă de resetare a parolei.

Actualizările software, accesul administratorilor Google Workspace, TLS, politicile de retenție, protecția fizică a PC-ului și procedurile personalului fac parte din securitatea întregii instalații. Un utilizator care controlează sistemul de operare poate modifica aplicația sau citi memoria proceselor; aplicația nu este o graniță de protecție față de administratorul Windows.

## Verificări și standarde

Testele de identitate verifică migrarea, blocarea concurentă/persistentă, resetarea, rolurile, dispozitivele și validarea criptografică Google. Testul Electron verifică protecția OS a cheii și redeschiderea datelor. Testele de browser verifică operațiunile administrative. Capturi și rapoarte: runs/debug/identity-2026-09-14/.

ISO/IEC 27001 este un standard de management organizațional; implementarea acestor controale nu reprezintă certificare ISO a aplicației. Sursele și limitele sunt explicitate în [ghidul identității](IDENTITATE-SI-RBAC.md). Google trebuie validat și cu aplicația OAuth reală a organizației; un test cu tokenuri semnate local nu dovedește configurarea tenantului UCDC.
