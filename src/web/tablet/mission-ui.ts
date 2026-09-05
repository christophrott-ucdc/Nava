import type { MissionEvent, MissionSnapshot } from '@shared/mission';
import type { ZoneView } from '@shared/scenario-engine';
import { mascotPath } from '../shared/glass';
import { experienceHeader, experienceZone } from './experience-ui';
import { FINALE_CHOICES } from '@shared/experience';

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
  let snapshot: MissionSnapshot | null = null, online = false, signature = '';
  let pending: Partial<Record<Zone, Pending>> = {};
  const seen = new Set<string>();
  const panelKeys: Partial<Record<Zone, string>> = {};
  const storageKey = `nava.mission.pending.${new URLSearchParams(location.search).get('post') || 'tablet'}`;
  try { pending = JSON.parse(sessionStorage.getItem(storageKey) || '{}'); } catch { pending = {}; }
  function save() { try { sessionStorage.setItem(storageKey, JSON.stringify(pending)); } catch { /* Session remains usable without storage. */ } }
  function send(zone: Zone, value: string) {
    if (!snapshot || !online || snapshot.suspended || snapshot.experience?.paused || pending[zone]) return;
    const event: MissionEvent = { type: 'missionAction', runId: snapshot.runId, cueInstanceId: snapshot.cueInstanceId, eventId: crypto.randomUUID(), zone, value };
    pending[zone] = { event, epoch: snapshot.serverEpoch, sentAt: Date.now() }; save();
    options.send(event); render();
  }
  function certificate(): HTMLCanvasElement | null {
    if (!snapshot?.post) return null;
    const canvas = document.createElement('canvas'); canvas.width = 1800; canvas.height = 1300;
    const ctx = canvas.getContext('2d'); if (!ctx) return null;
    ctx.fillStyle = '#f7fafc'; ctx.fillRect(0, 0, 1800, 1300);
    ctx.fillStyle = '#d8edff'; ctx.fillRect(0, 0, 1800, 24);
    ctx.fillStyle = '#142b46'; ctx.font = 'bold 36px system-ui'; ctx.fillText('A PATRA LUME · JURNAL DE EXPEDIȚIE', 90, 110);
    ctx.font = 'bold 58px system-ui'; ctx.fillText(snapshot.summary.title, 90, 210, 1620);
    ctx.font = '30px system-ui'; ctx.fillText(`Postul ${snapshot.post} · Siwarha → Natură → Mann → Pământ`, 90, 278);
    let y = 365;
    const lines = [...snapshot.summary.lines, ...(snapshot.summary.posts.find(p => p.post === snapshot!.post)?.lines || [])];
    for (const zone of ['A', 'B'] as const) {
      const value = snapshot.experience?.finale[`${snapshot.post}${zone}`];
      const label = FINALE_CHOICES[snapshot.scenarioId].options.find(choice => choice.value === value)?.label;
      if (label) lines.push(`${zone} · Gestul de încheiere: ${label}.`);
    }
    ctx.font = '28px system-ui';
    for (const paragraph of lines) {
      let line = '';
      for (const word of paragraph.split(/\s+/)) {
        if (ctx.measureText(`${line} ${word}`).width > 1600) { ctx.fillText(line, 90, y); y += 43; line = word; } else line += `${line ? ' ' : ''}${word}`;
      }
      ctx.fillText(line, 90, y); y += 70;
    }
    ctx.fillStyle = '#4f6277'; ctx.font = '23px system-ui'; ctx.fillText('Fiecare contribuție păstrată aparține acestei călătorii. Participarea nu este o competiție.', 90, 1200);
    return canvas;
  }
  function download() {
    const canvas = certificate(); if (!canvas || !snapshot) return;
    const link = document.createElement('a'); link.download = `Nava-${snapshot.scenarioId}-post-${snapshot.post}.png`; link.href = canvas.toDataURL('image/png'); link.click();
  }
  let uploaded = '', uploadStatus = '';
  function journalReady():boolean {
    if(!snapshot?.experience)return true;
    const e=snapshot.experience, seats=['A','B'].map(zone=>`${snapshot!.post}${zone}`).filter(key=>e.participants.includes(key));
    return !!e.finaleActive&&seats.length>0&&seats.every(key=>!!e.finale[key]);
  }
  async function upload() {
    if(!journalReady())return;
    const current = snapshot; const canvas = certificate(); if (!current || !canvas) return;
    const uploadKey = `${current.runId}:${current.post}`; if (uploaded === uploadKey) return;
    uploaded = uploadKey; uploadStatus = 'Trimitem jurnalul operatorului…';
    try {
      const response = await fetch('/api/certificates', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ post: current.post, dataUrl: canvas.toDataURL('image/png'), runId: current.runId, summaryRevision: current.revision, certificateToken: current.certificateToken }) });
      if (snapshot?.runId !== current.runId) return;
      uploadStatus = response.ok ? 'Jurnal trimis operatorului' : 'Jurnal disponibil pentru salvare pe tabletă';
      if (!response.ok) uploaded = '';
    } catch { if (snapshot?.runId !== current.runId || snapshot.post !== current.post) return; uploadStatus = 'Fără legătură. Poți salva jurnalul pe tabletă.'; uploaded = ''; }
    options.host.querySelector<HTMLElement>('.mission-upload-status')?.replaceChildren(document.createTextNode(uploadStatus));
  }
  function renderZone(zone: Zone, view: ZoneView): HTMLElement {
    const panel = node('section', `mission-zone mission-zone-${zone.toLowerCase()}`); panel.dataset.zone = zone; panel.dataset.kind = view.kind || 'waiting';
    panel.setAttribute('aria-label', `Zona ${zone}, ${zone === 'A' ? 'stânga' : 'dreapta'}`);
    const head = node('div', 'mission-zone-head'); head.append(node('b', 'mission-seat', zone), node('span', '', view.heading)); panel.append(head);
    const title = node('h2', 'mission-instruction', view.instruction); title.tabIndex = -1; panel.append(title);
    if (view.items?.length && snapshot?.accessibility.showVisualGuidance !== false) {
      const items = node('div', 'mission-items');
      for (const item of view.items) { const card = node('div', 'mission-item'); if (shapePaths[item.label]) card.append(shape(item.label)); card.append(node('span', '', item.label)); items.append(card); }
      panel.append(items);
    }
    const detail = node('p', 'mission-detail', view.detail); panel.append(detail);
    const grid = node('div', 'mission-options'); grid.dataset.count = String(view.options.length);
    for (const choice of view.options) {
      const button = node('button', 'mission-option'); button.type = 'button'; button.dataset.value = choice.value;
      button.disabled = !!choice.disabled || !online || !!snapshot?.suspended || !!pending[zone];
      if (choice.value === 'observe' || choice.value === 'abstain') button.classList.add('mission-observe');
      if (choice.value.startsWith('shape:')) button.append(shape(choice.label));
      button.append(node('span', '', choice.label)); button.addEventListener('click', () => send(zone, choice.value)); grid.append(button);
    }
    panel.append(grid);
    const status = node('p', 'mission-delivery'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    status.textContent = !online ? 'Reconectare. Păstrăm intenția ta până revine legătura.' : snapshot?.suspended ? 'O pauză de bord. Alegerile vor reveni odată cu misiunea.' : pending[zone] ? 'Trimitem atingerea ta…' : view.completed ? 'Păstrat în jurnal. Poți privi ecranele.' : 'Fiecare lucrează în jumătatea lui.';
    panel.append(status); return panel;
  }
  function render() {
    if (!snapshot || (snapshot.scenarioId === 'legacy-v3' && !snapshot.experience?.active && !snapshot.experience?.finaleActive)) return;
    const a = snapshot.accessibility;
    document.body.dataset.mission = snapshot.scenarioId;
    document.body.dataset.missionContrast = String(a.contrastMode);
    document.body.dataset.missionQuiet = String(a.reducedStimuli);
    document.body.dataset.missionMotion = String(a.reducedMotion);
    document.body.dataset.missionSimple = String(a.simplifiedChrome);
    options.host.style.setProperty('--mission-text-scale', String(Math.max(1, Math.min(1.3, a.textScale))));
    const tutorial = !!snapshot.experience?.active, finale = !!snapshot.experience?.finaleActive;
    const summary = !tutorial && (snapshot.state.state === 'epilogue' || snapshot.state.state === 'ended');
    const structure = `${snapshot.runId}:${snapshot.stage}:${summary}:${!!snapshot.view}:${tutorial}:${finale}:${tutorial ? snapshot.experience?.step : ''}`;
    if (signature !== structure || !options.host.querySelector('.mission-surface')) {
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
        const wait = node('div', 'mission-wait'); const image = node('img', 'mission-wait-mascot'); image.src = mascotPath(snapshot.post || 1); image.alt = ''; image.addEventListener('error', () => image.remove(), { once: true });
        wait.append(image, node('p', 'eyebrow', snapshot.label), node('h2', '', snapshot.state.state === 'idle' || snapshot.state.state === 'preshow' ? 'Pregătiți de expediție' : 'Priviți drumul dintre lumi'), node('p', '', snapshot.suspended ? 'Misiunea este în pauză. Echipajul rămâne împreună.' : 'Următoarea etapă apare singură. Până atunci, povestea continuă pe ecrane.'));
        wrap.append(wait);
      }
      options.host.append(wrap);
      if (summary && !snapshot.experience) void upload();
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
        const view = snapshot.view.zones[zone], key = JSON.stringify([view, pending[zone]?.event.eventId, online, snapshot.suspended, a]);
        if (panelKeys[zone] === key) continue;
        panelKeys[zone] = key;
        const previous = pair.querySelector<HTMLElement>(`[data-zone="${zone}"]`), focused = previous?.contains(document.activeElement);
        const value = focused ? (document.activeElement as HTMLElement).dataset.value : undefined;
        const next = renderZone(zone, view); if (previous) previous.replaceWith(next); else pair.append(next);
        if (focused) { const target = value ? [...next.querySelectorAll<HTMLButtonElement>('button')].find(b => b.dataset.value === value && !b.disabled) : undefined; (target || next.querySelector<HTMLElement>('h2'))?.focus({ preventScroll: true }); }
      }
    }
  }
  return {
    update(next: MissionSnapshot, connected: boolean) {
      snapshot = next; online = connected;
      for (const zone of ['A', 'B'] as const) {
        const item = pending[zone]; if (!item) continue;
        if (item.event.runId !== next.runId || item.event.cueInstanceId !== next.cueInstanceId || item.epoch !== next.serverEpoch || (next.stage === 0 && !next.experience?.active && !next.experience?.finaleActive)) delete pending[zone];
        else if (connected && !next.suspended && Date.now() - item.sentAt > 1200) { item.sentAt = Date.now(); options.send(item.event); }
      }
      save(); render();
    },
    connection(connected: boolean) { online = connected; render(); },
    ack(eventId: string, ok: boolean, status: string) {
      for (const zone of ['A', 'B'] as const) {
        const item = pending[zone]; if (item?.event.eventId !== eventId) continue;
        delete pending[zone]; save();
        if (ok && !seen.has(eventId)) { seen.add(eventId); if (seen.size > 200) seen.delete(seen.values().next().value!); options.onConfirmed(item.event.value); }
        if (!ok) options.notice(item.event.value === 'tutorial:confirm' ? 'Privește indiciul de sus. Poți schimba alegerea și încerca din nou.' : status === 'try-matching-shape' ? 'Privește forma de sus. Mai poți încerca.' : status === 'probe-already-sent' ? 'Proba este deja în dosar. Încearcă altă ordine.' : 'Atingerea nu a fost înregistrată. Verifică opțiunile disponibile.');
        if (ok && (item.event.value.startsWith('tutorial:') || item.event.value.startsWith('finale:')) && !item.event.value.includes(':pick:') && !item.event.value.endsWith(':observe')) requestAnimationFrame(() => {
          const panel = options.host.querySelector<HTMLElement>(`[data-zone="${zone}"]`); panel?.classList.add('experience-confirmed'); setTimeout(() => panel?.classList.remove('experience-confirmed'), 750);
        });
      }
      render();
    },
    hide() { snapshot = null; signature = ''; pending = {}; save(); delete document.body.dataset.mission; delete document.body.dataset.missionContrast; delete document.body.dataset.missionQuiet; delete document.body.dataset.missionMotion; delete document.body.dataset.missionSimple; },
  };
}
