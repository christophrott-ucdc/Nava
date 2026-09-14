/** Identity directory and observed devices. Device metadata is not device attestation/MDM. */
export function mountIdentityDirectory() {
    const nav = document.querySelector('#nav')!, views = document.querySelector('#views')!;
    const link = document.createElement('a');
    link.href = '#/identity';
    link.dataset.view = 'identity';
    link.textContent = '▦ Identitate & dispozitive';
    nav.append(link);
    const section = document.createElement('section');
    section.id = 'view-identity';
    section.className = 'view center-view';
    section.hidden = true;
    section.innerHTML = `<div class="center-welcome"><div><p class="eyebrow">DIRECTORUL ORGANIZAȚIEI</p><h2>O identitate. Accesul potrivit.</h2><p>Conturi locale și Google Workspace, cu roluri verificate de server.</p></div><a class="button-primary" href="#/utilizatori">Gestionează utilizatorii →</a></div><p id="directory-message" role="status"></p><div class="center-kpis"><article><span>PROTECȚIA IDENTITĂȚII</span><strong>SQLite criptat</strong><small id="identity-protection"></small></article><article><span>BLOCARE CONT</span><strong>5 încercări</strong><small>Deblocare explicită de administrator</small></article><article><span>GOOGLE WORKSPACE</span><strong>@ucdc.ro</strong><small>Conturile noi primesc rol Observator</small></article><article><span>DISPOZITIVE OBSERVATE</span><strong id="identity-devices-count">—</strong><small>Identificate din sesiunile autentificate</small></article></div><article class="center-card"><h2>Director de conturi</h2><p>Resetarea creează o credențială temporară și închide sesiunile. Utilizatorul o schimbă înainte de acces.</p><div class="center-table-wrap"><table><thead><tr><th>Utilizator</th><th>Rol</th><th>Sursă</th><th>Stare</th><th>Încercări greșite</th><th>Acțiuni</th></tr></thead><tbody id="identity-users"></tbody></table></div></article><article class="center-card"><h2>Dispozitive și sesiuni</h2><p>Browserul și adresa IP sunt metadate observate, nu dovadă că dispozitivul este administrat. Tabletele copiilor sunt terminale anonime și nu sunt conturi de personal.</p><div class="center-table-wrap"><table><thead><tr><th>Utilizator</th><th>Dispozitiv / browser</th><th>IP</th><th>Metodă</th><th>Ultima activitate</th><th>Sesiuni</th></tr></thead><tbody id="identity-devices"></tbody></table></div></article><div class="center-bottom"><article class="center-card"><h2>Conectare Google Workspace</h2><form id="google-config"><label><span><input name="enabled" type="checkbox"> Activează autentificarea Google</span></label><label>OAuth Client ID<input name="clientId" autocomplete="off" maxlength="300"></label><label>Client secret<input name="clientSecret" type="password" autocomplete="new-password" maxlength="300" placeholder="Lasă gol pentru a păstra secretul existent"></label><label>Redirect URI<input name="redirectUri" type="url" placeholder="https://nava.example/api/auth/google/callback" maxlength="500"></label><p>Configurează aceeași adresă în Google Cloud. Domeniul se verifică din tokenul semnat Google, inclusiv hd=ucdc.ro.</p><button type="submit">Salvează configurația Google</button></form></article><article class="center-card"><h2>Roluri și responsabilități</h2><dl><dt>Observator</dt><dd>Status, loguri, analitică și citirea consolei. Fără comenzi.</dd><dt>Operator</dt><dd>Tutorial, transport, scenarii, audio, recuperare și operarea experienței.</dd><dt>Administrator</dt><dd>Toate funcțiile operatorului, plus conturi, roluri, resetări, dispozitive și configurare.</dd></dl><p>Promovarea Google la Operator sau Administrator este manuală. Parolele Google se resetează în Google Workspace.</p><a href="#/wiki">Proceduri și securitate →</a></article></div>`;
    views.append(section);
    const message = document.getElementById('directory-message')!;
    async function request(url: string, body?: unknown) { const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) }); const data = await response.json(); if (!response.ok)
        throw Error(data.reason ?? 'Acces refuzat.'); return data; }
    const cell = (row: HTMLTableRowElement, text: string) => { const td = document.createElement('td'); td.textContent = text; row.append(td); return td; };
    let busy = false, configured = false;
    async function refresh() {
        if (busy || section.hidden || document.hidden || (views as HTMLElement).hidden)
            return;
        busy = true;
        try {
            const [identity, overview] = await Promise.all([request('/api/admin/identity'), request('/api/admin/overview')]);
            document.getElementById('identity-protection')!.textContent = identity.protection;
            document.getElementById('identity-devices-count')!.textContent = String(identity.devices.length);
            const users = document.getElementById('identity-users')!;
            users.replaceChildren();
            for (const user of overview.users) {
                const row = document.createElement('tr');
                cell(row, user.name);
                cell(row, ({ admin: 'Administrator', operator: 'Operator', viewer: 'Observator' } as Record<string, string>)[user.role]);
                cell(row, user.provider === 'google' ? 'Google Workspace' : user.authentication === 'password' ? 'Parolă locală' : 'PIN local');
                cell(row, user.disabled ? 'Dezactivat' : user.lockedAt ? 'Blocat' : user.mustChangeCredential ? 'Schimbare obligatorie' : 'Activ');
                cell(row, String(user.failedAttempts ?? 0));
                const actions = cell(row, '');
                if (user.lockedAt) {
                    const button = document.createElement('button');
                    button.textContent = 'Deblochează';
                    button.addEventListener('click', async () => { button.disabled = true; try {
                        await request('/api/users/' + user.id + '/unlock', {});
                        message.textContent = 'Cont deblocat.';
                        await refresh();
                    }
                    catch (e) {
                        message.textContent = String(e);
                    }
                    finally {
                        button.disabled = false;
                    } });
                    actions.append(button);
                }
                const edit = document.createElement('a');
                edit.href = '#/utilizatori';
                edit.textContent = ' Gestionează';
                actions.append(edit);
                users.append(row);
            }
            const devices = document.getElementById('identity-devices')!;
            devices.replaceChildren();
            for (const device of [...identity.devices].reverse()) {
                const row = document.createElement('tr');
                cell(row, overview.users.find((u: {
                    id: string;
                }) => u.id === device.userId)?.name ?? device.name);
                cell(row, device.userAgent ?? 'Necunoscut');
                cell(row, device.ip ?? '—');
                cell(row, device.authMethod ?? 'local');
                const active = overview.sessions.filter((s: {
                    deviceId: string;
                }) => s.deviceId === device.id);
                const latest = active.map((s: {
                    lastSeenAt: string;
                }) => s.lastSeenAt).filter(Boolean).sort().at(-1) ?? device.lastSeenAt;
                cell(row, new Date(latest).toLocaleString('ro-RO'));
                const controls = cell(row, String(active.length));
                for (const session of active) {
                    const button = document.createElement('button');
                    button.textContent = session.current ? 'Sesiunea ta' : 'Închide sesiunea';
                    button.disabled = session.current;
                    button.addEventListener('click', async () => { try {
                        await request('/api/admin/sessions/' + session.id + '/revoke', {});
                        await refresh();
                    }
                    catch (e) {
                        message.textContent = String(e);
                    } });
                    controls.append(button);
                }
                devices.append(row);
            }
            if (!configured) {
                const form = document.getElementById('google-config') as HTMLFormElement;
                (form.elements.namedItem('enabled') as HTMLInputElement).checked = identity.google.enabled;
                for (const key of ['clientId', 'redirectUri'])
                    (form.elements.namedItem(key) as HTMLInputElement).value = identity.google[key];
                configured = true;
            }
        }
        catch (error) {
            message.textContent = String(error);
        }
        finally {
            busy = false;
        }
    }
    const form = document.getElementById('google-config') as HTMLFormElement;
    form.addEventListener('submit', async (e) => { e.preventDefault(); const button = form.querySelector('button')!; button.disabled = true; try {
        const body = { ...Object.fromEntries(new FormData(form)), enabled: (form.elements.namedItem('enabled') as HTMLInputElement).checked };
        await request('/api/admin/identity/google', body);
        (form.elements.namedItem('clientSecret') as HTMLInputElement).value = '';
        message.textContent = 'Configurația Google a fost salvată.';
    }
    catch (error) {
        message.textContent = String(error);
    }
    finally {
        button.disabled = false;
    } });
    window.addEventListener('hashchange', () => { if (section.hidden) {
        (form.elements.namedItem('clientSecret') as HTMLInputElement).value = '';
    } void refresh(); });
    const timer = setInterval(() => void refresh(), 5000);
    window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
    new MutationObserver(() => void refresh()).observe(views, { attributes: true, attributeFilter: ['hidden'] });
    void refresh();
}
