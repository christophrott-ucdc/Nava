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
import { createCrewStage, type CrewViewport } from '../shared/crew-stage';
import { crewRelay, crewMark } from '../shared/crew-relay';
import { crewSelection, attachCrewIdentity } from './crew-selection';

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
  const crew = createCrewStage(options.host);
  let draftScope = '', drafts: Partial<Record<Zone,string>> = {};
  const playPanels: Partial<Record<Zone, ReturnType<typeof createPlayPanel>>> = {};
  const classic = new URLSearchParams(location.search).get('interaction') === 'classic';
  function clearPlay() { for (const zone of ['A', 'B'] as const) { playPanels[zone]?.dispose(); delete playPanels[zone]; } }
  window.addEventListener('pagehide', event => { if (!event.persisted) { education.dispose(); crew.dispose(); clearPlay(); } });
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
    const lines = [...(current.summary.posts.find(p => p.post === current.post)?.lines || [])];
    for (const zone of ['A', 'B'] as const) {
      const identity=current.experience?.crew?.characters[`${current.post}${zone}`];
      if(identity)lines.push(`${zone} · Personajul tău: ${identity.charAt(0).toUpperCase()+identity.slice(1)}.`);
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
  // A retry reuses the exact PNG; other posts completing later must not redraw an immutable artifact.
  const journalBytes=new Map<string,string>(),journalDelivered=new Map<string,number>();
  let uploading='',retryAt=0,retryFailures=0,retryScope='',journalTimer:ReturnType<typeof setTimeout>|undefined;
  let journalDatabase:Promise<IDBDatabase|null>|undefined;
  function openJournalDatabase(){return journalDatabase??=new Promise<IDBDatabase|null>(resolve=>{try{const request=indexedDB.open('exodus7-journal-cache',1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('png'))request.result.createObjectStore('png');};request.onsuccess=()=>resolve(request.result);request.onerror=()=>resolve(null);request.onblocked=()=>resolve(null);}catch{resolve(null);}});}
  async function cachedJournal(key:string,value?:string):Promise<string|undefined>{const db=await openJournalDatabase();if(!db)return undefined;return new Promise(resolve=>{try{const transaction=db.transaction('png',value===undefined?'readonly':'readwrite'),store=transaction.objectStore('png');const request=value===undefined?store.get(key):store.put(value,key);let result:string|undefined;request.onsuccess=()=>{result=value??(typeof request.result==='string'?request.result:undefined);};transaction.oncomplete=()=>resolve(result);transaction.onerror=()=>resolve(undefined);transaction.onabort=()=>resolve(undefined);}catch{resolve(undefined);}});}
  function scheduleJournal(delay:number){if(journalTimer)clearTimeout(journalTimer);journalTimer=setTimeout(()=>{journalTimer=undefined;void upload();},delay);}
  function journalReady():boolean {
    if(!snapshot?.post||!['epilogue','ended'].includes(snapshot.state.state))return false;
    if(!snapshot.experience)return true;
    const e=snapshot.experience, seats=['A','B'].map(zone=>`${snapshot!.post}${zone}`).filter(key=>e.participants.includes(key));
    return !!e.finaleActive&&seats.length>0&&seats.every(key=>!!e.finale[key]);
  }
  async function upload() {
    if(!online||snapshot?.suspended||snapshot?.experience?.paused||!journalReady())return;
    const current = snapshot; if (!current) return;
    const uploadKey = `${current.runId}:${current.post}`,generation=current.journalRetry??0;
    const scope=`${uploadKey}:${generation}`;if(retryScope!==scope){retryScope=scope;retryAt=0;retryFailures=0;}
    if((journalDelivered.get(uploadKey)??-1)>=generation||uploading===uploadKey)return;
    if(Date.now()<retryAt){scheduleJournal(retryAt-Date.now());return;}
    uploading = uploadKey;
    let uploadDeadline:ReturnType<typeof setTimeout>|undefined;
    try {
      let bytes=journalBytes.get(uploadKey)??await cachedJournal(uploadKey);
      if(!bytes){const canvas=await certificate(current);if(!canvas)throw new Error('Jurnal indisponibil');bytes=canvas.toDataURL('image/png');await cachedJournal(uploadKey,bytes);}
      journalBytes.set(uploadKey,bytes);
      if(snapshot?.runId!==current.runId||snapshot.post!==current.post||!online||snapshot.suspended||!journalReady())return;
      // Artwork loading/encoding may span incoming snapshots: sign the request with the latest revision.
      const latest=snapshot;
      const controller=new AbortController();uploadDeadline=setTimeout(()=>controller.abort(),12000);
      const response = await fetch('/api/certificates', { method: 'POST', signal:controller.signal, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ post: latest.post, dataUrl: bytes, runId: latest.runId, summaryRevision: latest.revision, certificateToken: latest.certificateToken }) });
      if (snapshot?.runId !== current.runId || snapshot.post !== current.post) return;
      if(!response.ok)throw new Error('Jurnalul nu a fost acceptat');
      journalDelivered.set(uploadKey,generation);retryFailures=0;retryAt=0;
    } catch {if(snapshot?.runId===current.runId&&snapshot.post===current.post){retryFailures=Math.min(6,retryFailures+1);const delay=Math.min(30000,1000*2**retryFailures);retryAt=Date.now()+delay;scheduleJournal(delay);}}
    finally { if(uploadDeadline)clearTimeout(uploadDeadline);if (uploading === uploadKey) uploading = ''; }
    if(snapshot?.runId===current.runId&&snapshot.post===current.post&&(snapshot.journalRetry??0)>generation)scheduleJournal(0);
  }
  function renderZone(zone: Zone, view: ZoneView): HTMLElement {
    if (view.play && (!classic || view.play.kind==='pilot'&&view.play.solo) && snapshot) {
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
    const occupied=snapshot?.experience?.participants;
    const ownSeat=`${snapshot?.post}${zone}`,partnerSeat=`${snapshot?.post}${zone==='A'?'B':'A'}`;
    status.textContent = !online ? 'Refacem legătura cu nava…' : snapshot?.suspended ? 'Facem o pauză. Continuăm în curând.' : pending[zone] ? 'Trimitem alegerea…' : occupied&&!occupied.includes(ownSeat)?'Loc liber. Urmărește călătoria pe ecran.':view.completed ? 'Gata! Povestea continuă pe ecrane.' : occupied?.includes(partnerSeat)?'Lucrează în jumătatea ta. Fiecare contribuție contează.':'Acesta este locul tău. Poți continua în ritmul tău.';
    if (view.guidance?.length) { const help = node('details', 'mission-help'); help.append(node('summary', '', 'Un indiciu')); if (view.feedback && view.detail) help.append(node('p', '', view.detail)); for (const line of view.guidance) help.append(node('p', '', line)); panel.append(help); }
    panel.append(status); return panel;
  }
  function render() {
    if (!snapshot || (snapshot.scenarioId === 'legacy-v3' && !snapshot.experience?.crew?.open && !snapshot.experience?.active && !snapshot.experience?.finaleActive)) return;
    const a = snapshot.accessibility;
    document.body.dataset.mission = snapshot.scenarioId;
    document.body.dataset.missionContrast = String(a.contrastMode);
    document.body.dataset.missionQuiet = String(a.reducedStimuli);
    document.body.dataset.missionGuidance = String(a.showVisualGuidance !== false);
    document.body.dataset.missionMotion = String(a.reducedMotion);
    document.body.dataset.missionSimple = String(a.simplifiedChrome);
    options.host.style.setProperty('--mission-text-scale', String(Math.max(1, Math.min(1.3, a.textScale))));
    const tutorial = !!snapshot.experience?.active, finale = !!snapshot.experience?.finaleActive;
    const selecting=!!snapshot.experience?.crew?.open && snapshot.state.state==='idle';
    const nextScope = `${snapshot.runId}:${snapshot.scenarioId}:${snapshot.post}:${snapshot.cueInstanceId}`;
    if (draftScope !== nextScope) { draftScope = nextScope; drafts = {}; }
    const relayActive = finale || tutorial && snapshot.experience?.step !== 'practice';
    const summary = !tutorial && (snapshot.state.state === 'epilogue' || snapshot.state.state === 'ended');
    const structure = `${snapshot.runId}:${snapshot.scenarioId}:${snapshot.post}:${snapshot.experience?.epoch}:${snapshot.stage}:${summary}:${!!snapshot.view}:${tutorial}:${finale}:${selecting}:${tutorial ? snapshot.experience?.step : ''}`;
    if (signature !== structure || !options.host.querySelector('.mission-surface')) {
      options.notice('');
      education.clear();
      crew.clear();
      clearPlay();
      signature = structure; panelKeys.A = ''; panelKeys.B = ''; options.host.replaceChildren(); options.host.dataset.view = 'scenario';
      const wrap = node('div', `mission-surface ${tutorial ? 'experience-tutorial-surface' : finale ? 'experience-finale-surface' : ''}`);
      if(selecting){wrap.classList.add('crew-selection-surface');wrap.append(node('h1','crew-selection-title','EXODUS7 · Echipajul se adună'),node('div','mission-pair'));}
      else if (tutorial) { wrap.append(experienceHeader(snapshot, false), node('div', 'mission-pair')); }
      else if (summary) {
        const head = finale ? experienceHeader(snapshot, true) : node('div', 'mission-finale-head'); if (!finale) head.append(node('p', 'eyebrow', 'JURNALUL ACESTEI CĂLĂTORII'), node('h2', '', snapshot.summary.title)); wrap.append(head);
        const pair = node('div', 'mission-pair mission-summary-pair');
        if (!finale) for (const zone of ['A', 'B'] as const) { const panel = node('section', `mission-zone mission-zone-${zone.toLowerCase()}`); panel.append(node('b', 'mission-seat', zone), node('h3', '', 'Ce păstrăm din expediție')); const line = snapshot.summary.posts.find(p => p.post === snapshot!.post)?.lines[zone === 'A' ? 0 : 1] || 'Călătoria rămâne o amintire a echipajului.'; panel.append(node('p', 'mission-summary-text', line.replace(/^[AB]: /, ''))); pair.append(panel); }
        wrap.append(pair);
        if (snapshot.summary.lines.length) wrap.append(node('p', 'mission-shared-summary', snapshot.summary.lines.join(' · ')));
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
        const welcome=node('div','crew-boarding-seats');welcome.setAttribute('aria-label','Locurile voastre la bord');
        for(const zone of ['A','B'] as const){const seat=node('span',`crew-boarding-seat crew-boarding-${zone.toLowerCase()}`);seat.append(node('b','',`${snapshot.post}${zone}`),node('span','',zone==='A'?'Locul din stânga':'Locul din dreapta'));welcome.append(seat);}
        wait.append(welcome);
        wrap.append(wait);
      }
      options.host.append(wrap);
      if (summary && !snapshot.experience) void upload();
    }
    const waiting = options.host.querySelector<HTMLElement>('.mission-wait');
    if (waiting) {
      const boarding = snapshot.state.state === 'idle' || snapshot.state.state === 'preshow';
      waiting.dataset.boarding=String(boarding);
      waiting.querySelector<HTMLElement>('.crew-boarding-seats')!.hidden=!boarding;
      const activeHere=['A','B'].filter(zone=>snapshot!.experience?.participants.includes(`${snapshot!.post}${zone}`));
      for(const zone of ['A','B']){const label=waiting.querySelector<HTMLElement>(`.crew-boarding-${zone.toLowerCase()} span`);if(label)label.textContent=activeHere.includes(zone)?zone==='A'?'Locul tău · stânga':'Locul tău · dreapta':'Loc liber';}
      const ship = waiting.querySelector<HTMLImageElement>('.mission-wait-ship'), shipName = boarding ? 'ship-boarding-v1' : 'ship-cruise-v1';
      if (ship && ship.dataset.illustration !== shipName) { ship.dataset.illustration = shipName; ship.src = illustrationPath(shipName); }
      waiting.querySelector<HTMLElement>('.mission-wait-title')!.textContent = boarding ? 'Aventura începe cu voi' : 'Priviți drumul dintre lumi';
      waiting.querySelector<HTMLElement>('.mission-wait-copy')!.textContent = snapshot.suspended || snapshot.state.state === 'paused' ? 'Misiunea este în pauză. Echipajul rămâne împreună.' : boarding ? activeHere.length===1?'Locul tău este pregătit. Privește ecranul central; nava te va invita să participi.':activeHere.length===2?'Locurile voastre sunt pregătite. Urmăriți ecranul central; nava vă va invita să participați.':'Acest post este liber. Urmărește călătoria pe ecranul central.' : 'Următoarea etapă apare singură. Până atunci, povestea continuă pe ecrane.';
    }
    if (finale && journalReady()) void upload();
    if(selecting){
      const pair=options.host.querySelector('.mission-pair')!;
      for(const zone of ['A','B'] as const){
        const key=JSON.stringify([snapshot.experience?.crew,drafts[zone],pending[zone]?.event.eventId,online,snapshot.suspended]);
        if(panelKeys[zone]===key)continue;panelKeys[zone]=key;
        const previous=pair.querySelector<HTMLElement>(`[data-zone="${zone}"]`),focused=previous?.contains(document.activeElement),value=(document.activeElement as HTMLElement)?.dataset.value;
        const next=crewSelection(snapshot,zone,online,!!pending[zone],drafts[zone],id=>{drafts[zone]=id;render();},send);
        if(previous)previous.replaceWith(next);else pair.append(next);
        if(focused){const target=[...next.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.dataset.value===value&&!b.disabled);target?.focus({preventScroll:true});}
      }
    }else if (tutorial || finale) {
      const pair = options.host.querySelector('.mission-pair')!;
      for (const zone of ['A', 'B'] as const) {
        const exp = snapshot.experience!, seat = `${snapshot.post}${zone}`;
        const key = JSON.stringify([exp.step, exp.participants.includes(seat), exp.observed.includes(seat), exp.touched.includes(seat), exp.practiced.includes(seat), exp.linked.includes(seat), exp.practice[seat], exp.finale[seat], drafts[zone], exp.paused, pending[zone]?.event.eventId, online, snapshot.suspended, a]);
        if (panelKeys[zone] === key) continue;
        panelKeys[zone] = key;
        const previous = pair.querySelector<HTMLElement>(`[data-zone="${zone}"]`), focused = previous?.contains(document.activeElement);
        const value = focused ? (document.activeElement as HTMLElement).dataset.value : undefined;
        const next = experienceZone(snapshot, zone, online, !!pending[zone], send, finale, drafts[zone], value => { drafts[zone] = value; render(); });
        attachCrewIdentity(next,snapshot,zone);
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
        const next = renderZone(zone, view); attachCrewIdentity(next,snapshot,zone); if (previous !== next) { if (previous) previous.replaceWith(next); else pair.append(next); }
        if (focused && previous !== next) { const target = value ? [...next.querySelectorAll<HTMLButtonElement>('button')].find(b => b.dataset.value === value && !b.disabled) : undefined; (target || next.querySelector<HTMLElement>('h2'))?.focus({ preventScroll: true }); }
      }
    }
    for (const zone of ['A', 'B'] as const) {
      const panel = options.host.querySelector<HTMLElement>(`[data-zone="${zone}"]`);
      const visual = tutorial || finale ? experienceVisual(snapshot, zone, finale) : snapshot.view?.zones[zone].visual;
      if (!selecting && !relayActive && panel && !panel.classList.contains('play-panel') && visual && a.showVisualGuidance !== false) education.attach(panel, visual);
    }
    if (relayActive) {
      const views: CrewViewport[] = [];
      for (const zone of ['A', 'B'] as const) {
        const element = options.host.querySelector<HTMLElement>(`[data-zone="${zone}"] .crew-trigger-art`);
        if (element) views.push({ element, seat: `${snapshot.post}${zone}`, pending: !!pending[zone],
          preview: finale ? crewMark(snapshot.experience?.finale[`${snapshot.post}${zone}`] || drafts[zone]) : undefined });
      }
      crew.update(crewRelay(snapshot), views, { reduced: a.reducedMotion || a.reducedStimuli, paused: snapshot.suspended || !!snapshot.experience?.paused || !online, flat: a.showVisualGuidance === false || a.reducedStimuli });
    } else crew.clear();
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
        if (item.event.runId !== next.runId || item.event.cueInstanceId !== next.cueInstanceId || item.epoch !== next.serverEpoch || (next.stage === 0 && !next.experience?.crew?.open && !next.experience?.active && !next.experience?.finaleActive)) delete pending[zone];
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
          const hints: Record<string, string> = { 'character-taken': 'Acest personaj tocmai a fost ales. Alege alt prieten!', 'registration-closed': 'Echipajul a fost confirmat. Ghidul poate redeschide alegerea.', 'inactive-seat': 'Acest loc nu are un personaj confirmat.', 'piece-not-aligned': 'Semnul auriu trebuie să ajungă sus. Mai rotește piesa!', 'route-stops-early': 'Drumul se oprește înainte de felinar. Încearcă altul!', 'route-returns-to-start': 'Acest drum te aduce înapoi. Caută drumul spre felinar!', 'try-matching-shape': 'Compară contururile și încearcă încă o dată.', 'probe-already-sent': 'Ai testat deja acest ritm. Schimbă ordinea intervalelor.' };
          options.notice(hints[status] || (item.event.value === 'tutorial:confirm' ? 'Privește indiciul de sus. Poți schimba alegerea și încerca din nou.' : 'Nu am putut trimite alegerea. Poți încerca din nou dacă etapa este încă deschisă.'));
        }
        if (ok && (item.event.value.startsWith('tutorial:') || item.event.value.startsWith('finale:')) && !item.event.value.includes(':pick:') && !item.event.value.endsWith(':observe')) requestAnimationFrame(() => {
          const panel = options.host.querySelector<HTMLElement>(`[data-zone="${zone}"]`); panel?.classList.add('experience-confirmed'); setTimeout(() => panel?.classList.remove('experience-confirmed'), 750);
        });
      }
      render();
    },
    hide() { if(journalTimer)clearTimeout(journalTimer);journalTimer=undefined; education.clear(); crew.clear(); clearPlay(); snapshot = null; signature = ''; drafts = {}; draftScope = ''; pending = {}; save(); delete document.body.dataset.mission; delete document.body.dataset.missionContrast; delete document.body.dataset.missionQuiet; delete document.body.dataset.missionGuidance; delete document.body.dataset.missionMotion; delete document.body.dataset.missionSimple; },
  };
}
