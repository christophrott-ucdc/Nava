# Identitate, RBAC și Google Workspace

> Actualizare 14 septembrie 2026: la cererea proprietarului, aplicația Electron activează administratorul local **Christoph** cu o parolă fixă furnizată separat, inclusă numai ca hash scrypt în `src/server/bundled-admin.ts`. Se aplică o singură dată per bază de identitate, inclusiv actualizarea parolei unui Christoph deja administrator local. Modificările ulterioare ale parolei nu sunt suprascrise; MFA, dezactivarea și lockout-ul existent se păstrează. Coliziunile cu un Christoph non-admin/Google opresc inițializarea, fără promovare implicită. Aceasta înlocuiește instrucțiunile de mai jos privind absența contului implicit în Electron; serverele de test fără opțiunea `bundledAdministrator` păstrează bootstrap-ul cu token. Nu publica parola în documentație sau loguri.

Starea surselor: 14 septembrie 2026. Acest ghid înlocuiește instrucțiunile vechi despre login exclusiv cu PIN și administratorul implicit 4078.

## Pornire și migrare

Nu există cont sau parolă implicită. `security.operatorPin` este păstrat doar pentru compatibilitatea configurațiilor vechi și nu creează un administrator.

1. Pornește noul build pe PC-ul navei și deschide `/login/` pe acel PC.
2. Dacă nu există un administrator activ și neblocat, apare configurarea inițială. Citește codul aleator din `identity-setup.json`, în directorul configurat al identității (implicit `data/`). Codul expiră după 24 h și se regenerează la repornire cât timp configurarea este necesară.
3. Alege numele administratorului (de exemplu Christoph) și o parolă de minimum 15 caractere. Codul de configurare este consumat o singură dată. Cererile din LAN sunt refuzate, chiar dacă trec prin proxy-ul local care transmite corect IP-ul clientului.
4. La login alege **Utilizator + parolă**. Poți activa MFA în **Parolă & MFA**, scanând QR-ul și confirmând codul.

La migrare, `users.json` este validat și importat în `identity.sqlite`. Contul local vechi cu PIN 4078 este dezactivat. Celelalte identități și secrete MFA sunt păstrate; hash-urile vechi sunt actualizate la autentificare, iar credențialele vechi prea scurte trebuie schimbate. Conturile create înaintea migrării se autentifică acum și cu numele lor. Sesiunile vechi JSON nu se reactivează: personalul se autentifică din nou.

Copiile legacy sunt păstrate criptat în SQLite înainte de eliminarea fișierelor JSON vechi. Cheia MFA `auth.key`, dacă există și este utilizată, este importată în seiful criptat. Baze corupte sau chei lipsă nu sunt înlocuite cu date implicite. `security.usersFile` indică încă sursa legacy; directorul ei stabilește unde se află noua identitate.

## Administrarea utilizatorilor

În `/admin/#/utilizatori`:

- Creezi un cont nominal, alegi rolul și o parolă temporară de 15–128 caractere sau un PIN temporar de 6–8 cifre. PIN-urile triviale sunt refuzate la resetare/schimbare.
- Credențiala temporară trebuie schimbată la prima autentificare, înainte de a primi sesiune și acces. Transmite-o persoanei printr-un canal protejat.
- Meniul contului permite resetarea parolei/PIN-ului, deblocarea, schimbarea rolului, dezactivarea și închiderea sesiunilor.
- După cinci autentificări greșite, contul se blochează persistent, inclusiv după repornire. Încercările simultane nu depășesc pragul. Administratorul îl deblochează explicit.
- Există și limitare per IP/globală împotriva atacurilor. Deblocarea unui cont nu anulează instantaneu o limitare de rețea deja activă; aceasta expiră după cinci minute.
- Resetarea închide sesiunile contului și cere o nouă schimbare. Nu elimină automat MFA. Parolele Google se resetează în Google Workspace.

Dacă singurul administrator s-a blocat, repornirea pe PC oferă configurarea locală cu un nou cod aleator. Creează un administrator de recuperare cu alt nume, apoi deblochează contul vechi. Nu șterge baza de identități. Pentru o parolă uitată, dar cont neblocat, folosește un al doilea administrator autorizat; păstrează din timp o identitate de recuperare protejată.

## Roluri verificate pe server

| Rol | Citire | Operare experiență | Identități și configurație |
|---|---|---|---|
| Observator (`viewer`) | Consolă, status, loguri, debug, analitică | Nu | Nu |
| Operator (`operator`) | Da | Tutorial, transport, mixer, scenarii/editor, recuperare și comenzile operaționale | Nu |
| Administrator (`admin`) | Da | Da | Conturi, roluri, parole, deblocare, sesiuni, Google, instalație |

HTTP și WebSocket verifică rolurile. Schimbarea rolului/dezactivarea închide conexiunile autentificate vechi, astfel încât drepturile retrase să nu rămână pe un WebSocket deschis. Tabletele participanților rămân terminale anonime pentru experiență; nu primesc drepturile personalului. Ecranele folosesc tokenul dedicat instalației.

## Stocare și protecție

- Parole/PIN: scrypt cu `N=131072`, `r=8`, `p=1`, salt aleator și comparație constant-time. Hash-urile legacy sunt citite numai pentru migrare și actualizare.
- Persistență: SQLite, înregistrări criptate AES-256-GCM, cu nonce aleator pentru fiecare scriere. Include utilizatori, blocări, sesiuni, istoric de dispozitive, MFA și configurația Google. Schema/versionarea SQLite este locală; nu este un controller de domeniu AD/LDAP.
- Cheia `identity.key` este protejată prin Electron `safeStorage` (Windows DPAPI) în aplicația Electron. Este legată de profilul Windows. Harness-urile Node fără Electron folosesc o cheie de fișier și afișează explicit această diferență; nu reprezintă protecția Windows a EXE-ului.
- Sesiuni aleatoare de 256 biți, cookie HttpOnly/SameSite și Secure la HTTPS. Maximum 20 de sesiuni simultane per cont; cele mai vechi sunt revocate. Durata configurabilă este limitată la 5–1440 minute.
- MFA TOTP: QR, confirmare, replay protection persistent și opt coduri de recuperare one-use. Codurile sunt afișate o singură dată; secretele nu apar în răspunsurile de inventar/loguri.

**Backupul misiunii nu este backupul identității.** Pentru identitate, oprește aplicația și arhivează `identity.sqlite` împreună cu `identity.key`, în spațiu protejat. Păstrează și o metodă de recuperare a profilului Windows/DPAPI. O copie a celor două fișiere nu garantează restaurarea pe alt PC sau alt profil Windows. Nu comite aceste fișiere în Git. Testează restaurarea în procedura organizației, fără a înlocui identitatea producției în timpul unui show.

## Google Workspace @ucdc.ro

Implementat: Authorization Code + PKCE, `state` legat de cookie, `nonce`, verificare criptografică RS256/JWKS, issuer, audience, expirare, `email_verified`, `hd=ucdc.ro` și domeniul e-mailului. Identitatea stabilă este `sub`, nu numele afișat. Un cont local cu aceeași adresă nu se asociază automat, pentru a evita preluarea contului.

Configurare în **Identitate & dispozitive**:

1. Administratorul Google creează un OAuth Client de tip **Web application** în Google Cloud și configurează consent pentru organizație, dacă este disponibil.
2. Înregistrează adresa exactă `https://<numele-serverului>/api/auth/google/callback`. Pentru test pe PC se poate folosi `http://localhost:4321/api/auth/google/callback`, accesând loginul tot prin localhost.
3. Introdu Client ID, Client secret și aceeași adresă în dashboard. Secretul este păstrat criptat, nu returnat la citirea setărilor. Activează Google.
4. Testează un cont real `@ucdc.ro`, un cont extern refuzat și retragerea accesului. Conturile noi sunt automat **Observator**; promovarea este manuală, conform deciziei utilizatorului.

Pentru LAN, Google necesită un nume/HTTPS configurat. Proxy-ul TLS local trebuie să păstreze Host și să înlocuiască/completeze corect X-Forwarded-For cu IP-ul real, plus X-Forwarded-Proto=https. Aplicația are încredere în aceste antete numai când conexiunea vine de pe loopback. Cererile directe din LAN nu pot declara singure că sunt locale/HTTPS.

Nu s-a creat o aplicație OAuth în organizație și nu s-a testat loginul cu un cont UCDC real fără aceste credențiale. Spectacolul și conturile locale funcționează fără Google/internet. Nu se păstrează refresh token Google și nu se copiază parola Google în aplicație.

## Dispozitive și viitoarea aplicație Android

Dashboardul afișează contul, browserul/agentul raportat, IP-ul, metoda locală/Google, ultima activitate și sesiunile revocabile. Identificatorul de browser este aleator, în cookie; asocierea este per utilizator/browser, cu cel mult 500 de intrări observate. Activitatea este actualizată periodic și la autentificare.

Acesta este inventar de acces, nu MDM: User-Agent și IP nu dovedesc modelul fizic, proprietatea sau integritatea unui dispozitiv. Nu se pretinde citirea MAC/IMEI ori înscrierea Android în AD.

Baza pentru Android este separarea identității de experiență și API-urile serverului: `/api/auth/login`, `/api/auth/me`, logout, sesiuni revocabile, RBAC și inventar. Aplicația nativă va necesita ulterior transport HTTPS, stocare în Android Keystore, un flux prin browserul de sistem pentru Google și înrolare explicită de dispozitiv; nu va stoca parole în aplicație și nu va trimite `screenToken` către participanți. Aplicația Android însăși nu este implementată în această livrare.

## Standarde și limite

[ISO/IEC 27001:2022](https://www.iso.org/standard/27001) este un standard de management al securității organizației. Software-ul singur nu poate fi declarat certificat ISO. Implementarea susține controlul accesului, gestiunea identităților, criptografia, jurnalizarea și retragerea drepturilor; conformitatea organizației cere și proceduri, evaluarea riscurilor, politici, backup verificat, control Windows, TLS, instruire și audit independent.

Alegerea scrypt urmează [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). Validarea domeniului Google urmează [documentația OpenID Connect Google](https://developers.google.com/identity/openid-connect/openid-connect). Nu se revendică certificare ISO/FIPS sau compatibilitate de protocol cu Active Directory.
