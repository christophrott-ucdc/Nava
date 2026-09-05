import type { MissionEvent, MissionSnapshot } from '@shared/mission';
import type { ZoneView } from '@shared/scenario-engine';
import { mascotPath } from '../shared/glass';
import { experienceHeader, experienceZone } from './experience-ui';
import { FINALE_CHOICES } from '@shared/experience';
import { createEducationRenderer } from './education-renderer';
import { experienceVisual } from './education-experience';
import { createPlayPanel } from './play-board';
import { hasChildIllustrations, illustrationPath } from '../shared/illustrations';
import { drawCertificateImage, preloadCertificateArtwork } from './certificate';

type Zone = 'A' | 'B';
type Pending = { event: MissionEvent; epoch: string; sentAt: number };
const node = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag); el.className = className; if (text !== undefined) el.textContent = text; return el;
};
const shapePaths: Record<string, string> = {
  Cerc: '<circle cx="50" cy="50" r="32"/>',
  Semilună: '<path d="M68 15A36 36 0 1 0 82 74A38 38 0 0 1 68 15Z"/>',
  Aripă: '<path d="M14 77L82 18L68 72L46 59L33 86Z"/>',
  Flacără: '<path d="M50 12C68 38 83 48 78 67C72 94 29 92 23 67C19 49 34 39 38 29C36 49 46 54 48 47C53 34 49 24 50 12Z"/>',
  Undă: '<path d="M10 50Q30 10 50 50T90 50L90 65Q70 105 50 65T10 65Z"/>',
  Clopoțel: '<path d="M25 62V45A25 25 0 0 1 75 45V62L85 75H15Z"/><circle cx="50" cy="84" r="8"/>',
  Frunză: '<path d="M20 78C2 30 47 13 82 16C87 61 63 94 20 78Z"/><path d="M22 78L65 35" fill="none" stroke="white" stroke-width="5"/>',
  Picătură: '<path d="M50 10C45 30 20 48 20 63A30 30 0 0 0 80 63C80 48 55 30 50 10Z"/>',
  Stea: '<path d="M50 8L62 35L92 38L70 59L76 90L50 74L24 90L30 59L8 38L38 35Z"/>',
  Spirală: '<path d="M51 51C40 38 28 56 42 68C65 86 88 52 70 29C48 2 10 25 13 58C17 93 62 100 85 72" fill="none" stroke="currentColor" stroke-width="11" stroke-linecap="round"/>',
};
function shape(label: string): HTMLElement {
  const span = node('span', 'mission-shape');
  // Paths are fixed local artwork; the label is never inserted as markup.
  span.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true" fill="currentColor">${shapePaths[label] || '<circle cx="50" cy="50" r="24"/>'}</svg>`;
  return span;
}
export function createMissionUI(options: { host: HTMLElement; send: (event: MissionEvent) => boolean; onConfirmed: (value: string) => void; notice: (text: string) => void }) {
  const education = createEducationRenderer(options.host);
  const playPanels: Partial<Record<Zone, ReturnType<typeof createPlayPanel>>> = {};
  const classic = new URLSearchParams(location.search).get('interaction') === 'classic';
  function clearPlay() { for (const zone of ['A', 'B'] as const) { playPanels[zone]?.dispose(); delete playPanels[zone]; } }
  window.addEventListener('pagehide', event => { if (!event.persisted) { education.dispose(); clearPlay(); } });
  let snapshot: MissionSnapshot | null = null, online = false, signature = '';
  let pending: Partial<Record<Zone, Pending>> = {};
  const seen = new Set<string>();
  const panelKeys: Partial<Record<Zone, string>> = {};
  const storageKey = `nava.mission.pending.${new URLSearchParams(location.search).get('post') || 'tablet'}`;
  try { pending = JSON.parse(sessionStorage.getItem(storageKey) || '{}'); } catch { pending = {}; }
  function save() { try { sessionStorage.setItem(storageKey, JSON.stringify(pending)); } catch { /* Session remains usable without storage. */ } }
  function send(zone: Zone, value: string) {
    if (!snapshot || !online || snapshot.suspended || snapshot.experience?.paused || pending[zone]) return;
    if (value.startsWith('play:') && snapshot.state.state !== 'playing') return;
    const event: MissionEvent = { type: 'missionAction', runId: snapshot.runId, cueInstanceId: snapshot.cueInstanceId, eventId: crypto.randomUUID(), zone, value };
    pending[zone] = { event, epoch: snapshot.serverEpoch, sentAt: Date.now() }; save();
    options.send(event); render();
  }
  async function certificate(current: MissionSnapshot): Promise<HTMLCanvasElement | null> {
    if (!current.post) return null;
    const artwork = await preloadCertificateArtwork();
    const canvas = document.createElement('canvas'); canvas.width = 1800; canvas.height = 1300;
    const ctx = canvas.getContext('2d'); if (!ctx) return null;
    const lines = [...current.summary.lines, ...(current.summary.posts.find(p => p.post === current.post)?.lines || [])];
    for (const zone of ['A', 'B'] as const) {
      const value = current.experience?.finale[`${current.post}${zone}`];
      const label = FINALE_CHOICES[current.scenarioId].options.find(choice => choice.value === value)?.label;
      if (label) lines.push(`${zone} · La final: ${label}.`);
    }
    ctx.font = '28px system-ui';
    let requiredHeight = 365;
    for (const paragraph of lines) {
      let currentLine = '';
      for (const word of paragraph.split(/\s+/)) {
        if (ctx.measureText(`${currentLine} ${word}`).width > 1600) { requiredHeight += 43; currentLine = word; } else currentLine += ` ${word}`;
      }
      requiredHeight += 70;
    }
    canvas.height = Math.max(1300, requiredHeight + 160);
    ctx.fillStyle = '#f7fafc'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#d8edff'; ctx.fillRect(0, 0, 1800, 24);
    if (artwork.logo) drawCertificateImage(ctx, artwork.logo, 90, 45, 285, 95);
    if (hasChildIllustrations(current.scenarioId) && artwork.emblem) drawCertificateImage(ctx, artwork.emblem, 1520, 60, 190, 190);
    ctx.fillStyle = '#142b46'; ctx.font = 'bold 36px system-ui'; ctx.fillText('A PATRA LUME · JURNAL DE EXPEDIȚIE', artwork.logo ? 420 : 90, 110, artwork.logo ? 1060 : 1420);
    ctx.font = 'bold 58px system-ui'; ctx.fillText(current.summary.title, 90, 210, 1390);
    ctx.font = '30px system-ui'; ctx.fillText(`Postul ${current.post} · Siwarha → Natură → Mann → Pământ`, 90, 278, 1620);
    let y = 365;
    ctx.font = '28px system-ui';
    for (const paragraph of lines) {
      let line = '';
      for (const word of paragraph.split(/\s+/)) {
        if (ctx.measureText(`${line} ${word}`).width > 1600) { ctx.fillText(line, 90, y); y += 43; line = word; } else line += `${line ? ' ' : ''}${word}`;
      }
      ctx.fillText(line, 90, y); y += 70;
    }
    ctx.fillStyle = '#4f6277'; ctx.font = '23px system-ui'; ctx.fillText('O amintire a alegerilor voastre din această călătorie.', 90, canvas.height - 100);
    return canvas;
  }
  let downloading = false;
  async function download() {
    const current = snapshot; if (!current || downloading) return; downloading = true;
    try {
      const canvas = await certificate(current);
      if (!canvas || snapshot?.runId !== current.runId || snapshot.post !== current.post) return;
      const link = document.createElement('a'); link.download = `Nava-${current.scenarioId}-post-${current.post}.png`; link.href = canvas.toDataURL('image/png'); link.click();
    } catch { options.notice('Jurnalul nu a putut fi salvat. Poți încerca din nou.'); }
    finally { downloading = false; }
  }
  let uploaded = '', uploading = '', uploadStatus = '';
  function journalReady():boolean {
    if(!snapshot?.experience)return true;
    const e=snapshot.experience, seats=['A','B'].map(zone=>`${snapshot!.post}${zone}`).filter(key=>e.participants.includes(key));
    return !!e.finaleActive&&seats.length>0&&seats.every(key=>!!e.finale[key]);
  }
  async function upload() {
    if(!journalReady())return;
    const current = snapshot; if (!current) return;
    const uploadKey = `${current.runId}:${current.post}`; if (uploaded === uploadKey || uploading === uploadKey) return;
    uploading = uploadKey;
    try {
      const canvas = await certificate(current);
      if (!canvas || snapshot?.runId !== current.runId || snapshot.post !== current.post) return;
      uploaded = uploadKey; uploadStatus = 'Trimitem jurnalul operatorului…';
      const response = await fetch('/api/certificates', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ post: current.post, dataUrl: canvas.toDataURL('image/png'), runId: current.runId, summaryRevision: current.revision, certificateToken: current.certificateToken }) });
      if (snapshot?.runId !== current.runId || snapshot.post !== current.post) return;
      uploadStatus = response.ok ? 'Jurnal trimis operatorului' : 'Jurnal disponibil pentru salvare pe tabletă';
      if (!response.ok) uploaded = '';
    } catch { if (snapshot?.runId !== current.runId || snapshot.post !== current.post) return; uploadStatus = 'Fără legătură. Poți salva jurnalul pe tabletă.'; uploaded = ''; }
    finally { if (uploading === uploadKey) uploading = ''; }
    options.host.querySelector<HTMLElement>('.mission-upload-status')?.replaceChildren(document.createTextNode(uploadStatus));
  }
  function renderZone(zone: Zone, view: ZoneView): HTMLElement {
    if (view.play && !classic && snapshot) {
      const play = playPanels[zone] ||= createPlayPanel(zone, value => send(zone, value));
      play.update(view.play, { blocked: !online || snapshot.suspended || snapshot.state.state !== 'playing' || !!snapshot.experience?.paused, reduced: snapshot.accessibility.reducedMotion || snapshot.accessibility.reducedStimuli || matchMedia('(prefers-reduced-motion: reduce)').matches, pending: !!pending[zone], offline: !online });
      return play.element;
    }
    const panel = node('section', `mission-zone mission-zone-${zone.toLowerCase()}`); panel.dataset.zone = zone; panel.dataset.kind = view.kind || 'waiting';
    panel.setAttribute('aria-label', `Zona ${zone}, ${zone === 'A' ? 'stânga' : 'dreapta'}`);
    const head = node('div', 'mission-zone-head'); head.append(node('b', 'mission-seat', zone), node('span', '', view.heading)); panel.append(head);
    if (view.goal) panel.append(node('p', 'mission-goal', view.goal));
    if (view.resourceLabel) head.append(node('p', 'mission-resource', view.resourceLabel));
    const title = node('h2', 'mission-instruction', view.instruction); title.tabIndex = -1; panel.append(title);
    if (view.items?.length && snapshot?.accessibility.showVisualGuidance !== false) {
      const items = node('div', 'mission-items');
      for (const item of view.items) { const card = node('div', 'mission-item'); if (shapePaths[item.label]) card.append(shape(item.label)); card.append(node('span', '', item.label)); items.append(card); }
      panel.append(items);
    }
    const detail = node('p', 'mission-detail', view.comparison?.length ? (snapshot?.stage === 3 ? 'Compară rezultatele înainte și după alegerea voastră.' : 'Acesta este răspunsul pilotului la regulile voastre.') : view.feedback || view.detail); panel.append(detail);
    if (view.comparison?.length) {
      const table = node('table', 'mission-comparison');
      const header = node('tr', ''); for (const text of snapshot?.stage === 3 ? ['Situație', 'Înainte', 'Acum'] : ['Situație', 'Ce face pilotul']) { const th=node('th','',text);th.scope='col';header.append(th); } const thead=node('thead','');thead.append(header);table.append(thead);
      const body=node('tbody','');for(const result of view.comparison){const row=node('tr','');row.append(node('th','',result.label),node('td','',result.before));if(result.after)row.append(node('td','',result.after));body.append(row);}table.append(body);panel.append(table);
    }
    if (view.documents?.length) {
      const documents = node('div', 'mission-documents');
      for (const document of view.documents) {
        const card = node('article', 'mission-document'); card.append(node('strong', '', document.title));
        for (const sample of document.samples) card.append(node('p', '', `${sample.label}: ${sample.value}`));
        const limits = node('details', 'mission-document-limit'); limits.append(node('summary', '', 'Ce nu știm încă'), node('p', '', document.limitation)); card.append(limits); documents.append(card);
      }
      panel.append(documents);
    }
    const grid = node('div', 'mission-options'); grid.dataset.count = String(view.options.length);
    for (const choice of view.options) {
      const button = node('button', 'mission-option'); button.type = 'button'; button.dataset.value = choice.value;
      button.disabled = !!choice.disabled || !online || !!snapshot?.suspended || !!pending[zone];
      if (choice.value === 'observe' || choice.value === 'abstain') button.classList.add('mission-observe');
      if (choice.value.startsWith('shape:')) button.append(shape(choice.label));
      if (choice.route) {
        const drawing = node('span', 'mission-route');
        const paths = { continuous: 'M10 42H45V16H90V42H134', 'dead-end': 'M10 42H45V16H90V42H104', loop: 'M10 42H45V16H90V65H45V42' };
        drawing.innerHTML = `<svg viewBox="0 0 160 80" aria-hidden="true"><path d="${paths[choice.route]}" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10" cy="42" r="7" fill="currentColor"/><path d="M137 20h18v32h-18zM141 14h10M140 58h12" fill="none" stroke="currentColor" stroke-width="4"/></svg>`;
        button.append(drawing);
      }
      button.append(node('span', '', choice.label)); button.addEventListener('click', () => send(zone, choice.value)); grid.append(button);
      if (choice.hint) button.append(node('small', 'mission-option-hint', choice.hint));
    }
    panel.append(grid);
    const status = node('p', 'mission-delivery'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    status.textContent = !online ? 'Refacem legătura cu nava…' : snapshot?.suspended ? 'Facem o pauză. Continuăm în curând.' : pending[zone] ? 'Trimitem alegerea…' : view.completed ? 'Gata! Povestea continuă pe ecrane.' : 'Tu lucrezi aici. Colegul, în cealaltă jumătate.';
    if (view.guidance?.length) { const help = node('details', 'mission-help'); help.append(node('summary', '', 'Un indiciu')); if (view.feedback && view.detail) help.append(node('p', '', view.detail)); for (const line of view.guidance) help.append(node('p', '', line)); panel.append(help); }
    panel.append(status); return panel;
  }
  function render() {
    if (!snapshot || (snapshot.scenarioId === 'legacy-v3' && !snapshot.experience?.active && !snapshot.experience?.finaleActive)) return;
    const a = snapshot.accessibility;
    document.body.dataset.mission = snapshot.scenarioId;
    document.body.dataset.missionContrast = String(a.contrastMode);
    document.body.dataset.missionQuiet = String(a.reducedStimuli);
    document.body.dataset.missionGuidance = String(a.showVisualGuidance !== false);
    document.body.dataset.missionMotion = String(a.reducedMotion);
    document.body.dataset.missionSimple = String(a.simplifiedChrome);
    options.host.style.setProperty('--mission-text-scale', String(Math.max(1, Math.min(1.3, a.textScale))));
    const tutorial = !!snapshot.experience?.active, finale = !!snapshot.experience?.finaleActive;
    const summary = !tutorial && (snapshot.state.state === 'epilogue' || snapshot.state.state === 'ended');
    const structure = `${snapshot.runId}:${snapshot.stage}:${summary}:${!!snapshot.view}:${tutorial}:${finale}:${tutorial ? snapshot.experience?.step : ''}`;
    if (signature !== structure || !options.host.querySelector('.mission-surface')) {
      options.notice('');
      education.clear();
      clearPlay();
      signature = structure; panelKeys.A = ''; panelKeys.B = ''; options.host.replaceChildren(); options.host.dataset.view = 'scenario';
      const wrap = node('div', `mission-surface ${tutorial ? 'experience-tutorial-surface' : finale ? 'experience-finale-surface' : ''}`);
      if (tutorial) { wrap.append(experienceHeader(snapshot, false), node('div', 'mission-pair')); }
      else if (summary) {
        const head = finale ? experienceHeader(snapshot, true) : node('div', 'mission-finale-head'); if (!finale) head.append(node('p', 'eyebrow', 'JURNALUL ACESTEI CĂLĂTORII'), node('h2', '', snapshot.summary.title)); wrap.append(head);
        const pair = node('div', 'mission-pair mission-summary-pair');
        if (!finale) for (const zone of ['A', 'B'] as const) { const panel = node('section', `mission-zone mission-zone-${zone.toLowerCase()}`); panel.append(node('b', 'mission-seat', zone), node('h3', '', 'Ce păstrăm din expediție')); const line = snapshot.summary.posts.find(p => p.post === snapshot!.post)?.lines[zone === 'A' ? 0 : 1] || 'Călătoria rămâne o amintire a echipajului.'; panel.append(node('p', 'mission-summary-text', line.replace(/^[AB]: /, ''))); pair.append(panel); }
        wrap.append(pair);
        if (snapshot.summary.lines.length) wrap.append(node('p', 'mission-shared-summary', snapshot.summary.lines.join(' · ')));
        const actions = node('div', 'mission-finale-actions'); const button = node('button', 'mission-option', 'Salvează jurnalul expediției'); button.addEventListener('click', download); const retry = node('button', 'mission-option mission-observe', 'Trimite operatorului'); retry.addEventListener('click', () => { uploaded = ''; void upload(); }); actions.append(button, retry, node('span', 'mission-upload-status', uploadStatus)); wrap.append(actions);
        wrap.append(node('p', 'mission-home-note', 'Bun venit acasă. Rămâneți la posturi; ghidul vă spune când vă puteți ridica.'));
      } else if (snapshot.view && snapshot.stage > 0) wrap.append(node('div', 'mission-pair'));
      else {
        const wait = node('div', 'mission-wait'), art = node('div', 'mission-wait-art');
        const image = node('img', 'mission-wait-mascot'); image.src = mascotPath(snapshot.post || 1); image.alt = ''; image.draggable = false; image.addEventListener('error', () => image.remove(), { once: true });
        if (hasChildIllustrations(snapshot.scenarioId)) {
          art.classList.add('has-expedition-ship');
          const ship = node('img', 'mission-wait-ship'); ship.alt = ''; ship.draggable = false;
          ship.addEventListener('error', () => { ship.remove(); art.classList.remove('has-expedition-ship'); }, { once: true }); art.append(ship);
        }
        art.append(image);
        wait.append(art, node('p', 'eyebrow', snapshot.label), node('h2', 'mission-wait-title'), node('p', 'mission-wait-copy'));
        wrap.append(wait);
      }
      options.host.append(wrap);
      if (summary && !snapshot.experience) void upload();
    }
    const waiting = options.host.querySelector<HTMLElement>('.mission-wait');
    if (waiting) {
      const boarding = snapshot.state.state === 'idle' || snapshot.state.state === 'preshow';
      const ship = waiting.querySelector<HTMLImageElement>('.mission-wait-ship'), shipName = boarding ? 'ship-boarding-v1' : 'ship-cruise-v1';
      if (ship && ship.dataset.illustration !== shipName) { ship.dataset.illustration = shipName; ship.src = illustrationPath(shipName); }
      waiting.querySelector<HTMLElement>('.mission-wait-title')!.textContent = boarding ? 'Pregătiți de expediție' : 'Priviți drumul dintre lumi';
      waiting.querySelector<HTMLElement>('.mission-wait-copy')!.textContent = snapshot.suspended || snapshot.state.state === 'paused' ? 'Misiunea este în pauză. Echipajul rămâne împreună.' : 'Următoarea etapă apare singură. Până atunci, povestea continuă pe ecrane.';
    }
    const journalButton=options.host.querySelector<HTMLButtonElement>('.mission-finale-actions .mission-observe');
    if(journalButton){journalButton.disabled=!journalReady();journalButton.title=journalReady()?'':'Jurnalul se trimite după ultimul gest al locurilor active.';}
    if (finale && journalReady()) void upload();
    if (tutorial || finale) {
      const pair = options.host.querySelector('.mission-pair')!;
      for (const zone of ['A', 'B'] as const) {
        const exp = snapshot.experience!, seat = `${snapshot.post}${zone}`;
        const key = JSON.stringify([exp.step, exp.participants.includes(seat), exp.observed.includes(seat), exp.touched.includes(seat), exp.practiced.includes(seat), exp.linked.includes(seat), exp.practice[seat], exp.finale[seat], exp.paused, pending[zone]?.event.eventId, online, snapshot.suspended, a]);
        if (panelKeys[zone] === key) continue;
        panelKeys[zone] = key;
        const previous = pair.querySelector<HTMLElement>(`[data-zone="${zone}"]`), focused = previous?.contains(document.activeElement);
        const value = focused ? (document.activeElement as HTMLElement).dataset.value : undefined;
        const next = experienceZone(snapshot, zone, online, !!pending[zone], send, finale);
        if (previous) previous.replaceWith(next); else pair.append(next);
        if (focused) { const target = [...next.querySelectorAll<HTMLButtonElement>('button')].find(b => b.dataset.value === value && !b.disabled); (target || next.querySelector<HTMLElement>('h2'))?.focus({preventScroll:true}); }
      }
    } else if (!summary && snapshot.view && snapshot.stage > 0) {
      const pair = options.host.querySelector('.mission-pair')!;
      for (const zone of ['A', 'B'] as const) {
        const view = snapshot.view.zones[zone], key = JSON.stringify([view, pending[zone]?.event.eventId, online, snapshot.suspended, snapshot.state.state, snapshot.experience?.paused, a]);
        if (panelKeys[zone] === key) continue;
        panelKeys[zone] = key;
        const previous = pair.querySelector<HTMLElement>(`[data-zone="${zone}"]`), focused = previous?.contains(document.activeElement);
        const value = focused ? (document.activeElement as HTMLElement).dataset.value : undefined;
        const next = renderZone(zone, view); if (previous !== next) { if (previous) previous.replaceWith(next); else pair.append(next); }
        if (focused && previous !== next) { const target = value ? [...next.querySelectorAll<HTMLButtonElement>('button')].find(b => b.dataset.value === value && !b.disabled) : undefined; (target || next.querySelector<HTMLElement>('h2'))?.focus({ preventScroll: true }); }
      }
    }
    for (const zone of ['A', 'B'] as const) {
      const panel = options.host.querySelector<HTMLElement>(`[data-zone="${zone}"]`);
      const visual = tutorial || finale ? experienceVisual(snapshot, zone, finale) : snapshot.view?.zones[zone].visual;
      if (panel && !panel.classList.contains('play-panel') && visual && a.showVisualGuidance !== false) education.attach(panel, visual);
    }
    education.update({ reduced: a.reducedMotion || a.reducedStimuli, paused: snapshot.suspended || !!snapshot.experience?.paused || !online });
  }
  return {
    update(next: MissionSnapshot, connected: boolean) {
      if (snapshot?.runId === next.runId && snapshot.cueInstanceId === next.cueInstanceId) {
        for (const zone of ['A', 'B'] as const) if (snapshot.view?.zones[zone].play?.solved === false && next.view?.zones[zone].play?.solved) {
          options.onConfirmed(next.scenarioId === 'age-5-10' && next.stage === 3 ? 'link' : 'play:solved');
        }
      }
      snapshot = next; online = connected;
      for (const zone of ['A', 'B'] as const) {
        const item = pending[zone]; if (!item) continue;
        if (item.event.runId !== next.runId || item.event.cueInstanceId !== next.cueInstanceId || item.epoch !== next.serverEpoch || (next.stage === 0 && !next.experience?.active && !next.experience?.finaleActive)) delete pending[zone];
        else if (connected && !next.suspended && !next.experience?.paused && (!item.event.value.startsWith('play:') || next.state.state === 'playing') && Date.now() - item.sentAt > 1200) { item.sentAt = Date.now(); options.send(item.event); }
      }
      save(); render();
    },
    connection(connected: boolean) { online = connected; render(); },
    ack(eventId: string, ok: boolean, status: string) {
      for (const zone of ['A', 'B'] as const) {
        const item = pending[zone]; if (item?.event.eventId !== eventId) continue;
        delete pending[zone]; save();
        if (ok) options.notice('');
        if (ok && !seen.has(eventId)) { seen.add(eventId); if (seen.size > 200) seen.delete(seen.values().next().value!); if (!item.event.value.startsWith('play:')) options.onConfirmed(item.event.value); }
        if (!ok) {
          const hints: Record<string, string> = { 'piece-not-aligned': 'Semnul auriu trebuie să ajungă sus. Mai rotește piesa!', 'route-stops-early': 'Drumul se oprește înainte de felinar. Încearcă altul!', 'route-returns-to-start': 'Acest drum te aduce înapoi. Caută drumul spre felinar!', 'try-matching-shape': 'Compară contururile și încearcă încă o dată.', 'probe-already-sent': 'Ai testat deja acest ritm. Schimbă ordinea intervalelor.' };
          options.notice(hints[status] || (item.event.value === 'tutorial:confirm' ? 'Privește indiciul de sus. Poți schimba alegerea și încerca din nou.' : 'Nu am putut trimite alegerea. Poți încerca din nou dacă etapa este încă deschisă.'));
        }
        if (ok && (item.event.value.startsWith('tutorial:') || item.event.value.startsWith('finale:')) && !item.event.value.includes(':pick:') && !item.event.value.endsWith(':observe')) requestAnimationFrame(() => {
          const panel = options.host.querySelector<HTMLElement>(`[data-zone="${zone}"]`); panel?.classList.add('experience-confirmed'); setTimeout(() => panel?.classList.remove('experience-confirmed'), 750);
        });
      }
      render();
    },
    hide() { education.clear(); clearPlay(); snapshot = null; signature = ''; pending = {}; save(); delete document.body.dataset.mission; delete document.body.dataset.missionContrast; delete document.body.dataset.missionQuiet; delete document.body.dataset.missionGuidance; delete document.body.dataset.missionMotion; delete document.body.dataset.missionSimple; },
  };
}
