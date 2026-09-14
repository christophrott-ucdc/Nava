type Metrics = {
    at: string;
    host: {
        name: string;
        platform: string;
        release: string;
        uptimeSec: number;
        cpuModel: string;
        logicalCores: number;
        cpuPercent: number | null;
        memoryTotalBytes: number;
        memoryUsedBytes: number;
        disk: {
            totalBytes: number;
            freeBytes: number;
        } | null;
    };
    process: {
        uptimeSec: number;
        cpuPercent: number | null;
        memory: {
            rss: number;
            heapUsed: number;
        };
        eventLoopUtilization: number;
    };
    gpu: {
        devices: Array<{
            name: string;
            utilization: number | null;
            memoryUsedMb: number | null;
            memoryTotalMb: number | null;
            temperatureC: number | null;
        }>;
        issue: string | null;
        sampledAt: string;
    };
    electron: {
        processes: Array<{
            pid: number;
            type: string;
            cpuPercent: number;
            memory: {
                workingSetSize?: number;
                privateBytes?: number;
            };
        }>;
        gpuFeatures: Record<string, string>;
    } | null;
};
type State = {
    state: string;
    phaseTime: number;
    screensConnected: number;
    tabletsConnected: number;
    lang: string;
    sceneId: string | null;
    suspended?: boolean;
    readiness?: {
        ready: boolean;
        reasons: string[];
    };
};
type Security = {
    passwordEnabled: boolean;
    mfaEnabled: boolean;
    recoveryCodesRemaining: number;
    christophExists: boolean;
    user: {
        name: string;
    };
};
const NAV = [['dashboard', 'Centru de comandă', '◈'], ['control', 'Control experiență', '▶'], ['resurse', 'Resurse sistem', '▥'], ['health', 'Stare și recuperare', '●'], ['logs', 'Loguri', '≡'], ['analytics', 'Analitică', '↗'], ['wiki', 'Wiki & proceduri', '▤'], ['links', 'Toate instrumentele', '⊞'], ['security', 'Parolă & MFA', '◇']] as const;
const LINKS = [['Consola operatorului', 'Toate comenzile, tutorialul, mixerul și editorul.', '/control/'], ['Loguri', 'Niveluri, filtrare, evenimente live și export.', '/logs/'], ['Depanare', 'Clienți, readiness, preflight și măsurători.', '/debug/'], ['Analitică', 'Istoricul misiunilor și contribuțiile.', '/analytics/'], ['Calibrare TV', 'Inventar și geometria peretelui.', '/wall/'], ['Clipuri', 'Verificarea filmelor instalate.', '/clips/'], ['Tabletă · postul 1', 'Interfața participanților; posturi 1–5.', '/tablet/?post=1'], ['Galerie Nava Glass', 'Componente și teme vizuale.', '/shared/preview.html'], ['Health API', 'Stare scurtă a serverului.', '/api/health']] as const;
function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string) { const n = document.createElement(tag); if (text !== undefined)
    n.textContent = text; if (className)
    n.className = className; return n; }
async function api<T>(url: string, body?: unknown): Promise<T> { const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }); const data = await response.json(); if (response.status === 401 && body === undefined) {
    location.replace('/login/?next=%2Fadmin%2F');
    throw Error('Sesiunea a expirat.');
} if (!response.ok)
    throw Error(data.reason ?? `Eroare ${response.status}`); return data as T; }
const percent = (value: number | null | undefined) => value === null || value === undefined ? 'Indisponibil' : `${value.toFixed(1)}%`;
const gb = (value: number) => `${(value / 1024 ** 3).toFixed(1)} GB`;
function chart(svg: SVGSVGElement, values: Array<number | null>, label: string) { svg.replaceChildren(); svg.setAttribute('viewBox', '0 0 400 80'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label); const line = document.createElementNS(svg.namespaceURI, 'polyline'); line.setAttribute('fill', 'none'); line.setAttribute('stroke', 'currentColor'); line.setAttribute('stroke-width', '3'); line.setAttribute('points', values.flatMap((v, i) => v === null ? [] : [`${i / Math.max(1, values.length - 1) * 400},${75 - Math.max(0, Math.min(100, v)) * .7}`]).join(' ')); svg.append(line); }
/** Render the allowlisted local wiki as inert DOM; never execute document HTML. */
function markdown(parent: HTMLElement, content: string) {
    parent.replaceChildren();
    let code: HTMLElement | null = null, table: HTMLTableElement | null = null, list: HTMLElement | null = null;
    function inline(node: HTMLElement, text: string) {
        const tokens = /(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
        let cursor = 0;
        for (const match of text.matchAll(tokens)) {
            node.append(text.slice(cursor, match.index));
            if (match[2])
                node.append(el('strong', match[2]));
            else if (match[3])
                node.append(el('code', match[3]));
            else {
                const target = match[5], page = wikiLinks.find(p => p.file === target || p.file.endsWith('/' + target));
                if (page) {
                    const link = el('button', match[4], 'wiki-inline-link');
                    link.type = 'button';
                    link.addEventListener('click', () => document.querySelector<HTMLButtonElement>('[data-wiki-id="' + page.id + '"]')?.click());
                    node.append(link);
                }
                else if (/^https?:\/\//.test(target)) {
                    const link = el('a', match[4]);
                    link.href = target;
                    link.target = '_blank';
                    link.rel = 'noopener';
                    node.append(link);
                }
                else
                    node.append(match[4]);
            }
            cursor = match.index! + match[0].length;
        }
        node.append(text.slice(cursor));
    }
    for (const line of content.split('\n')) {
        if (line.startsWith('```')) {
            if (code)
                code = null;
            else {
                code = el('pre');
                parent.append(code);
            }
            continue;
        }
        if (code) {
            code.textContent += line + '\n';
            continue;
        }
        if (!line.trim()) {
            list = null;
            table = null;
            continue;
        }
        const heading = /^(#{1,6})\s+(.+)$/.exec(line);
        if (heading) {
            const h = el(('h' + Math.min(6, heading[1].length + 1)) as 'h2');
            inline(h, heading[2]);
            parent.append(h);
            list = null;
            table = null;
            continue;
        }
        if (/^\|[- :|]+\|$/.test(line))
            continue;
        if (line.startsWith('|')) {
            if (!table) {
                table = el('table');
                const wrap = el('div', undefined, 'center-table-wrap');
                wrap.append(table);
                parent.append(wrap);
            }
            const row = el('tr');
            for (const cell of line.replace(/^\||\|$/g, '').split('|')) {
                const td = el(table.rows.length ? 'td' : 'th');
                inline(td, cell.trim());
                row.append(td);
            }
            table.append(row);
            continue;
        }
        table = null;
        const item = /^(?:[-*] |\d+\. )(.+)$/.exec(line);
        if (item) {
            if (!list) {
                list = el(/^\d/.test(line) ? 'ol' : 'ul');
                parent.append(list);
            }
            const li = el('li');
            inline(li, item[1]);
            list.append(li);
            continue;
        }
        list = null;
        const paragraph = el('p');
        inline(paragraph, line);
        parent.append(paragraph);
    }
}
let wikiLinks: Array<{
    id: string;
    file: string;
}> = [];
export function mountAdminCenter() {
    const nav = document.querySelector('#nav')!, views = document.querySelector('#views')!;
    for (const [id, title, icon] of [...NAV].reverse()) {
        const a = el('a');
        a.href = '#/' + id;
        a.dataset.view = id;
        a.append(el('span', icon, 'nav-glyph'), el('span', title));
        nav.prepend(a);
    }
    const sections = new Map<string, HTMLElement>();
    for (const [id] of NAV) {
        const section = el('section', undefined, 'view center-view');
        section.id = 'view-' + id;
        section.hidden = true;
        views.append(section);
        sections.set(id, section);
    }
    const notice = el('p', '', 'center-notice');
    notice.setAttribute('role', 'status');
    document.querySelector('#main')!.prepend(notice);
    function feedback(text: string, error = false) { notice.textContent = text; notice.dataset.error = String(error); }
    const dashboard = sections.get('dashboard')!;
    dashboard.innerHTML = `<div class="center-welcome"><div><p class="eyebrow">EXODUS7 ADMIN CENTER</p><h2>O privire asupra întregii nave.</h2><p>Experiență, echipaj și infrastructură, în același loc.</p></div><a class="button-primary" href="#/control">Deschide controlul experienței →</a></div><div class="center-kpis"><article><span>EXPERIENȚĂ</span><strong id="center-show">Se conectează…</strong><small id="center-scene"></small></article><article><span>TV-URI CONECTATE</span><strong id="center-screens">—</strong><small>Conexiuni raportate de server</small></article><article><span>TABLETE CONECTATE</span><strong id="center-tablets">—</strong><small>Prezență în timp real</small></article><article><span>READINESS</span><strong id="center-ready">—</strong><small id="center-language"></small></article></div><div class="center-grid" id="center-summary-charts"></div><div class="center-bottom"><article class="center-card"><h3>Starea instalației</h3><ul id="center-issues"></ul><a href="#/health">Diagnostic și recuperare →</a></article><article class="center-card"><h3>Acces rapid</h3><div class="center-shortcuts"><a href="#/logs">Jurnalele navei</a><a href="#/wiki">Proceduri pentru ghid</a><a href="#/security">Securitatea contului</a><a href="#/instalatie">Robot și actualizări</a></div></article></div>`;
    const resources = sections.get('resurse')!;
    resources.innerHTML = '<p class="center-subtitle">Măsurători reale. Istoric local al acestei pagini, maximum 3 minute. CPU proces poate depăși 100% pe mai multe nuclee.</p><div class="center-grid" id="center-resource-charts"></div><div class="center-bottom"><article class="center-card"><h3>Gazdă și stocare</h3><dl id="center-host"></dl></article><article class="center-card"><h3>Plăci video</h3><div id="center-gpu"></div></article></div><article class="center-card"><h3>Procese Electron</h3><div class="center-table-wrap"><table><thead><tr><th>Proces</th><th>PID</th><th>CPU</th><th>RAM · working set</th></tr></thead><tbody id="center-processes"></tbody></table></div><p id="center-sample" class="muted"></p></article>';
    const charts: Array<{
        value: HTMLElement;
        svg: SVGSVGElement;
        key: 'cpu' | 'ram' | 'gpu' | 'loop';
    }> = [];
    const history = { cpu: [] as Array<number | null>, ram: [] as Array<number | null>, gpu: [] as Array<number | null>, loop: [] as Array<number | null> };
    for (const [host, keys] of [['center-summary-charts', ['cpu', 'ram', 'gpu']], ['center-resource-charts', ['cpu', 'ram', 'gpu', 'loop']]] as const)
        for (const key of keys) {
            const card = el('article', undefined, 'center-card metric-card');
            card.append(el('h3', ({ cpu: 'CPU · întregul PC', ram: 'RAM · întregul PC', gpu: 'GPU · NVIDIA', loop: 'Event loop · server' })[key]));
            const value = el('strong', '—'), svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            card.append(value, svg);
            document.getElementById(host)!.append(card);
            charts.push({ value, svg, key });
        }
    const frames = new Map<string, HTMLIFrameElement>();
    for (const [id, url, title] of [['control', '/control/', 'Control complet al experienței'], ['logs', '/logs/', 'Loguri'], ['analytics', '/analytics/', 'Analitică']]) {
        const section = sections.get(id)!;
        const top = el('div', undefined, 'center-frame-head');
        top.append(el('p', 'Aceleași date și permisiuni ca în aplicația dedicată.'));
        const link = el('a', 'Deschide separat ↗');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener';
        top.append(link);
        const frame = el('iframe');
        frame.title = title;
        frame.dataset.url = url;
        frame.className = 'center-frame';
        section.append(top, frame);
        frames.set(id, frame);
    }
    const links = sections.get('links')!;
    links.classList.add('center-links');
    for (const [title, description, url] of LINKS) {
        const a = el('a', undefined, 'center-card');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.append(el('h3', title + ' ↗'), el('p', description), el('code', url));
        links.append(a);
    }
    const health = sections.get('health')!;
    health.innerHTML = '<article class="center-card"><h2>Health, readiness și recuperare</h2><p>Verificările tehnice sunt distincte de prezența unei ferestre Electron. O sursă lipsă sau un decoder blocat cere intervenție.</p><div class="center-shortcuts"><button id="center-backup">Creează backupul misiunii</button><a href="#/control">Deschide recuperarea în consolă</a><a href="/debug/" target="_blank" rel="noopener">Depanare detaliată ↗</a><a href="/api/health" target="_blank" rel="noopener">Health API ↗</a></div><div id="center-health-cards" class="center-health-grid"></div><details><summary>Date tehnice detaliate</summary><pre id="center-technical">Se încarcă…</pre></details></article>';
    document.getElementById('center-backup')!.addEventListener('click', async () => { const button = document.getElementById('center-backup') as HTMLButtonElement; button.disabled = true; try {
        await api('/api/technical/backup', {});
        feedback('Backupul a fost solicitat. Consultă starea tehnică pentru rezultat.');
        await refresh();
    }
    catch (e) {
        feedback(String(e), true);
    }
    finally {
        button.disabled = false;
    } });
    const wiki = sections.get('wiki')!;
    wiki.innerHTML = '<div class="wiki-shell"><aside class="center-card"><h2>Wiki EXODUS7</h2><label>Caută un articol<input id="wiki-search" type="search" placeholder="Tutorial, sunet, recuperare…"></label><nav id="wiki-pages" aria-label="Articole wiki"></nav></aside><article class="center-card wiki-article"><p id="wiki-meta" class="muted"></p><div id="wiki-content"><h2>Ghidul echipei</h2><p>Alege un articol. Documentele sunt incluse local și funcționează fără internet.</p></div></article></div>';
    let wikiPages: Array<{
        id: string;
        title: string;
        file: string;
    }> = [], wikiLoaded = false;
    let articleGeneration = 0;
    function listWiki() { const q = (document.getElementById('wiki-search') as HTMLInputElement).value.toLocaleLowerCase(); const list = document.getElementById('wiki-pages')!; list.replaceChildren(); for (const page of wikiPages.filter(p => p.title.toLocaleLowerCase().includes(q))) {
        const button = el('button', page.title);
        button.dataset.wikiId = page.id;
        button.addEventListener('click', async () => { const generation = ++articleGeneration; try {
            const article = await api<{
                content: string;
                updatedAt: string;
                title: string;
            }>('/api/admin/wiki/' + page.id);
            if (generation !== articleGeneration)
                return;
            markdown(document.getElementById('wiki-content')!, article.content);
            document.getElementById('wiki-meta')!.textContent = article.title + ' · ' + new Date(article.updatedAt).toLocaleDateString('ro-RO');
        }
        catch (e) {
            feedback(String(e), true);
        } });
        list.append(button);
    } }
    document.getElementById('wiki-search')!.addEventListener('input', listWiki);
    let securityGeneration = 0;
    const security = sections.get('security')!;
    security.innerHTML = `<div class="center-bottom"><article class="center-card"><p class="eyebrow">IDENTITATE</p><h2 id="security-name">Cont administrator</h2><p id="security-state">Se verifică…</p><form id="christoph-form"><h3>Activează contul Christoph</h3><p>Cont separat de PIN-urile operatorilor. Alege parola aici; nu este trimisă în chat.</p><label>Parolă nouă<input name="password" type="password" minlength="15" maxlength="128" autocomplete="new-password" required></label><label>Confirmă parola<input name="confirm" type="password" minlength="15" maxlength="128" autocomplete="new-password" required></label><button type="submit">Creează contul Christoph</button></form><form id="password-form"><h3>Schimbă parola</h3><label>Parola actuală<input name="password" type="password" autocomplete="current-password" required></label><label>Parola nouă<input name="newPassword" type="password" minlength="15" maxlength="128" autocomplete="new-password" required></label><label>Cod MFA sau cod de recuperare, dacă MFA este activ<input name="code" autocomplete="one-time-code"></label><button type="submit">Salvează parola</button></form></article><article class="center-card"><p class="eyebrow">AUTENTIFICARE ÎN DOI PAȘI</p><h2>Authenticator</h2><p>Scanează QR-ul cu Microsoft Authenticator, Google Authenticator sau altă aplicație TOTP. Coduri de 6 cifre, valabile 30 de secunde.</p><form id="mfa-start-form"><label>Confirmă parola contului<input name="password" type="password" autocomplete="current-password" required></label><button type="submit">Configurează Authenticator</button></form><div id="mfa-vault"></div><form id="mfa-confirm-form" hidden><label>Codul de pe telefon<input name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required></label><button type="submit">Confirmă și activează MFA</button></form><form id="mfa-disable-form" hidden><h3>Dezactivează MFA</h3><label>Parola contului<input name="password" type="password" autocomplete="current-password" required></label><label>Cod Authenticator nou sau cod de recuperare<input name="code" autocomplete="one-time-code" required></label><button type="submit">Dezactivează MFA</button></form><p>Codurile de recuperare sunt afișate o singură dată și pot fi folosite o singură dată fiecare. Păstrează-le separat de PC.</p></article></div>`;
    async function refreshSecurity() { const status = await api<Security>('/api/admin/security'); document.getElementById('security-name')!.textContent = status.user.name; document.getElementById('security-state')!.textContent = `${status.passwordEnabled ? 'Parolă' : 'PIN'} · MFA ${status.mfaEnabled ? 'activ' : 'inactiv'} · ${status.recoveryCodesRemaining} coduri de recuperare rămase`; document.getElementById('christoph-form')!.hidden = status.christophExists; document.getElementById('password-form')!.hidden = !status.passwordEnabled; document.getElementById('mfa-start-form')!.hidden = !status.passwordEnabled || status.mfaEnabled; document.getElementById('mfa-disable-form')!.hidden = !status.mfaEnabled; }
    for (const [id, action] of [['christoph-form', 'create-christoph'], ['password-form', 'password'], ['mfa-start-form', 'mfa-start'], ['mfa-confirm-form', 'mfa-confirm'], ['mfa-disable-form', 'mfa-disable']]) {
        const form = document.getElementById(id) as HTMLFormElement;
        form.addEventListener('submit', async (event) => { event.preventDefault(); const generation = securityGeneration; const fields = Object.fromEntries(new FormData(form)); if (action === 'create-christoph' && fields.password !== fields.confirm) {
            feedback('Parolele nu coincid.', true);
            return;
        } const button = form.querySelector('button')!; button.disabled = true; try {
            const result = await api<{
                qr?: string;
                secret?: string;
                recoveryCodes?: string[];
            }>('/api/admin/security/' + action, fields);
            if (generation !== securityGeneration)
                return;
            const vault = document.getElementById('mfa-vault')!;
            vault.replaceChildren();
            if (result.qr) {
                const image = el('img');
                image.src = result.qr;
                image.alt = 'QR pentru configurarea Authenticator';
                vault.append(image, el('p', 'Cheie pentru introducere manuală:'), el('code', result.secret));
                document.getElementById('mfa-confirm-form')!.hidden = false;
            }
            if (result.recoveryCodes) {
                vault.append(el('h3', 'Salvează codurile acum'), el('pre', result.recoveryCodes.join('\n')));
                const save = el('button', 'Descarcă codurile de recuperare');
                save.type = 'button';
                save.addEventListener('click', () => { const url = URL.createObjectURL(new Blob(['EXODUS7 — coduri de recuperare. Fiecare cod se folosește o singură dată.\n\n' + result.recoveryCodes!.join('\n')], { type: 'text/plain;charset=utf-8' })); const a = el('a'); a.href = url; a.download = 'EXODUS7-coduri-recuperare.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
                vault.append(save);
                document.getElementById('mfa-confirm-form')!.hidden = true;
            }
            form.reset();
            feedback(action === 'create-christoph' ? 'Contul Christoph a fost creat. Ieși din cont și autentifică-te cu numele și parola lui.' : 'Setarea de securitate a fost salvată.');
            await refreshSecurity();
        }
        catch (e) {
            feedback(String(e), true);
        }
        finally {
            button.disabled = false;
        } });
    }
    let busy = false;
    async function refresh() {
        if (busy || document.hidden || (views as HTMLElement).hidden)
            return;
        const view = location.hash.replace('#/', '') || 'dashboard';
        if (!['dashboard', 'resurse', 'health'].includes(view))
            return;
        busy = true;
        try {
            const [m, s, technical] = await Promise.all([api<Metrics>('/api/admin/metrics'), api<State>('/api/state'), api<unknown>('/api/technical')]);
            if (document.hidden)
                return;
            const vals = { cpu: m.host.cpuPercent, ram: m.host.memoryUsedBytes / m.host.memoryTotalBytes * 100, gpu: m.gpu.devices[0]?.utilization ?? null, loop: m.process.eventLoopUtilization };
            for (const key of Object.keys(history) as Array<keyof typeof history>) {
                history[key].push(vals[key]);
                if (history[key].length > 72)
                    history[key].shift();
            }
            for (const c of charts) {
                c.value.textContent = percent(vals[c.key]);
                chart(c.svg, history[c.key], c.key + ' · ultimele măsurători');
            }
            document.getElementById('center-show')!.textContent = s.suspended ? 'Suspendată' : ({ idle: 'În așteptare', playing: 'În desfășurare', paused: 'În pauză', preshow: 'Primirea echipajului', epilogue: 'Final', ended: 'Încheiată' } as Record<string, string>)[s.state] ?? s.state;
            document.getElementById('center-scene')!.textContent = `${s.sceneId ?? 'Fără scenă'} · ${Math.floor(s.phaseTime)} s`;
            document.getElementById('center-screens')!.textContent = String(s.screensConnected);
            document.getElementById('center-tablets')!.textContent = String(s.tabletsConnected);
            document.getElementById('center-ready')!.textContent = s.readiness?.ready ? 'Pregătit' : 'Verifică instalația';
            document.getElementById('center-language')!.textContent = 'Limba experienței: ' + s.lang.toUpperCase();
            const issues = document.getElementById('center-issues')!;
            issues.replaceChildren(...(s.readiness?.reasons.length ? s.readiness.reasons : ['Verificările de readiness sunt satisfăcute.']).map(reason => el('li', reason)));
            document.getElementById('center-technical')!.textContent = JSON.stringify(technical, null, 2);
            const t = technical as {
                state: string;
                message: string;
                checkpointSavedAt: string | null;
                backup: Record<string, unknown>;
            };
            const hc = document.getElementById('center-health-cards')!;
            hc.replaceChildren();
            for (const [title, value, note] of [['Instalație', ({ ready: 'Pregătită', waiting: 'În așteptare', attention: 'Necesită atenție', preparing: 'Pregătire' })[t.state] ?? t.state, t.message], ['Checkpoint', t.checkpointSavedAt ? new Date(t.checkpointSavedAt).toLocaleString('ro-RO') : 'Niciun checkpoint', 'Stadiul persistent al experienței.'], ['Backup SQLite', String(t.backup?.lastSuccess ?? t.backup?.state ?? 'Consultă detaliile'), 'Identitatea SQLite și cheia ei se arhivează separat.']]) {
                const c = el('article');
                c.append(el('span', title), el('strong', value), el('p', note));
                hc.append(c);
            }
            const host = document.getElementById('center-host')!;
            host.replaceChildren();
            for (const [key, value] of [['PC', m.host.name], ['Sistem', m.host.platform + ' ' + m.host.release], ['CPU', m.host.cpuModel + ' · ' + m.host.logicalCores + ' procesoare logice'], ['RAM', gb(m.host.memoryUsedBytes) + ' / ' + gb(m.host.memoryTotalBytes)], ['Spațiu liber', m.host.disk ? gb(m.host.disk.freeBytes) + ' / ' + gb(m.host.disk.totalBytes) : 'Indisponibil'], ['Uptime PC', Math.floor(m.host.uptimeSec / 60) + ' minute'], ['Server RAM', gb(m.process.memory.rss)], ['Server CPU', percent(m.process.cpuPercent)]])
                host.append(el('dt', key), el('dd', value));
            const gpu = document.getElementById('center-gpu')!;
            gpu.replaceChildren();
            if (m.gpu.issue)
                gpu.append(el('p', m.gpu.issue));
            for (const device of m.gpu.devices)
                gpu.append(el('h4', device.name), el('p', `${percent(device.utilization)} · VRAM ${device.memoryUsedMb ?? '—'} / ${device.memoryTotalMb ?? '—'} MB · ${device.temperatureC ?? '—'} °C`));
            if (m.electron)
                gpu.append(el('p', 'Compositing Electron: ' + (m.electron.gpuFeatures.gpu_compositing ?? 'indisponibil')));
            const rows = document.getElementById('center-processes')!;
            rows.replaceChildren();
            for (const p of m.electron?.processes ?? []) {
                const row = el('tr');
                for (const value of [p.type, String(p.pid), percent(p.cpuPercent), p.memory.workingSetSize === undefined ? 'Indisponibil' : (p.memory.workingSetSize / 1024).toFixed(0) + ' MB'])
                    row.append(el('td', value));
                rows.append(row);
            }
            if (!m.electron) {
                const row = el('tr'), cell = el('td', 'Inventarul proceselor este disponibil când serverul rulează în Electron.');
                cell.colSpan = 4;
                row.append(cell);
                rows.append(row);
            }
            document.getElementById('center-sample')!.textContent = 'Ultima măsurătoare: ' + new Date(m.at).toLocaleTimeString('ro-RO');
        }
        catch (e) {
            feedback('Monitorizare indisponibilă: ' + String(e), true);
        }
        finally {
            busy = false;
        }
    }
    function activate() { if ((views as HTMLElement).hidden) {
        securityGeneration++;
        document.getElementById('mfa-vault')!.replaceChildren();
        security.querySelectorAll('form').forEach(f => f.reset());
        for (const frame of frames.values())
            frame.removeAttribute('src');
        return;
    } const id = location.hash.replace('#/', '') || 'dashboard'; for (const [key, frame] of frames) {
        if (key === id && !frame.getAttribute('src'))
            frame.src = frame.dataset.url!;
        else if (key !== id && frame.getAttribute('src'))
            frame.removeAttribute('src');
    } if (id === 'wiki' && !wikiLoaded)
        void api<{
            pages: typeof wikiPages;
        }>('/api/admin/wiki').then(data => { wikiPages = data.pages; wikiLinks = data.pages; wikiLoaded = true; listWiki(); }).catch(e => feedback(String(e), true)); if (id === 'security')
        void refreshSecurity().catch(e => feedback(String(e), true));
    else {
        securityGeneration++;
        document.getElementById('mfa-vault')!.replaceChildren();
        document.getElementById('mfa-confirm-form')!.hidden = true;
        security.querySelectorAll('form').forEach(f => f.reset());
    } void refresh(); }
    new MutationObserver(activate).observe(views, { attributes: true, attributeFilter: ['hidden'] });
    document.getElementById('refresh')!.addEventListener('click', activate);
    window.addEventListener('hashchange', activate);
    document.addEventListener('visibilitychange', () => { if (!document.hidden)
        activate(); });
    const interval = window.setInterval(() => void refresh(), 2500);
    window.addEventListener('pagehide', () => clearInterval(interval), { once: true });
    activate();
}
