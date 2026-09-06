import type { PlayView } from '@shared/play-engine';

type PilotView = Extract<PlayView, { kind: 'pilot' }>;
type SurveyView = Extract<PlayView, { kind: 'survey' }>;
type OlderView = PilotView | SurveyView;
type Decision = 'incomplete' | 'propose' | 'confirm' | 'execute';
type Context = { blocked: boolean; reduced: boolean };
const NS = 'http://www.w3.org/2000/svg';
const outcome: Record<Decision, string> = {
  incomplete: 'Mai trebuie stabilită o regulă.', propose: 'Arată propunerea. Voi decideți.',
  confirm: 'Se oprește și cere acordul.', execute: 'Execută acțiunea singur.',
};
const zoneNames = ['Intrare', 'Centru', 'Ieșire'];
const lowerFirst = (text: string) => text.charAt(0).toLocaleLowerCase('ro') + text.slice(1);
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) => {
  const node = document.createElement(tag); node.className = className;
  if (text !== undefined) node.textContent = text; return node;
};
function svg<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number> = {}, text?: string) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text; return node;
}
function button(label: string, action: () => void, className = '') {
  const node = el('button', `older-button ${className}`, label); node.type = 'button';
  node.addEventListener('click', action); return node;
}
function ship() {
  const g = svg('g', { class: 'older-ship' }), body = svg('g', { class: 'older-ship-body' });
  body.append(svg('ellipse', { cx: 0, cy: 23, rx: 36, ry: 9, fill: '#264e6420' }),
    svg('path', { d: 'M-29 -17Q-39 0 -29 17L8 23L38 0L8 -23Z', fill: '#fdfefe', stroke: '#315670', 'stroke-width': 3 }),
    svg('path', { d: 'M-7 -13L14 -9L24 0L14 9L-7 13Z', fill: '#7bbde0', stroke: '#315670', 'stroke-width': 2 }),
    svg('path', { d: 'M-25 -18L-9 -33L7 -20M-25 18L-9 33L7 20', fill: '#a4cdcb', stroke: '#315670', 'stroke-width': 2 }));
  g.append(body);
  return g;
}
function pathLine(values: Array<number | null>, x: number, y: number, width: number, height: number): string {
  let drawing = '', connected = false;
  for (let i = 0; i < values.length; i++) {
    const value = values[i]; if (value === null) { connected = false; continue; }
    const px = x + width * i / Math.max(1, values.length - 1), py = y + height - Math.max(0, Math.min(100, value)) / 100 * height;
    drawing += `${connected ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`; connected = true;
  }
  return drawing;
}

/** Direct manipulation is local until a gesture is released. Outcomes come from PlayView. */
export function createOlderToy(host: HTMLElement, send: (value: string) => void) {
  const root = el('figure', 'older-toy');
  const stage = el('div', 'older-stage');
  const scene = svg('svg', { viewBox: '0 0 840 340', preserveAspectRatio: 'none', class: 'older-scene', 'aria-hidden': 'true' });
  const overlay = el('div', 'older-overlay'); stage.append(scene, overlay);
  const controls = el('div', 'older-controls');
  const readout = el('figcaption', 'older-readout'); readout.setAttribute('role', 'status'); readout.setAttribute('aria-live', 'polite');
  root.append(stage, controls, readout); host.append(root);
  let current: OlderView | undefined, context: Context = { blocked: true, reduced: false }, key = '', disposed = false;
  let lastSeq = -1, animation: { elapsed: number; duration: number; kind: 'pilot' | 'shield'; decision?: Decision } | null = null;
  let frame = 0, priorFrame = 0;
  let render: () => void = () => undefined, cancelGesture: () => void = () => undefined;
  const cleanups: Array<() => void> = [];
  const resize = new ResizeObserver(() => {
    const rect = stage.getBoundingClientRect();
    // The board fills the available workspace; typography and the vehicle keep their proportions.
    stage.style.setProperty('--older-compensate-y', String(rect.height ? rect.width * 340 / (840 * rect.height) : 1));
  });
  resize.observe(stage);
  function emit(value: string) { if (!disposed && !context.blocked) send(value); }
  function listen<K extends keyof HTMLElementEventMap>(node: HTMLElement, name: K, listener: (event: HTMLElementEventMap[K]) => void) {
    node.addEventListener(name, listener); cleanups.push(() => node.removeEventListener(name, listener));
  }
  function enable(buttons: HTMLButtonElement[]) { for (const b of buttons) b.disabled = context.blocked || b.dataset.unavailable === 'true'; }
  function tick(now: number) {
    frame = 0;
    if (disposed || !animation || context.blocked || document.hidden) { priorFrame = 0; return; }
    if (priorFrame) animation.elapsed = Math.min(animation.duration, animation.elapsed + Math.max(0, now - priorFrame));
    priorFrame = now;
    render();
    if (animation.elapsed < animation.duration) frame = requestAnimationFrame(tick);
    else { animation = null; priorFrame = 0; render(); }
  }
  function startFrame() { if (!frame && animation && !context.blocked && !document.hidden) frame = requestAnimationFrame(tick); }
  function makeSceneBase() {
    scene.append(svg('rect', { x: 1, y: 1, width: 838, height: 338, rx: 26, fill: '#edf6fa', stroke: '#c4dce7', 'stroke-width': 2 }));
    for (let n = 0; n < 13; n++) scene.append(svg('circle', { cx: 39 + n * 63, cy: 25 + n % 3 * 13, r: n % 2 ? 2 : 3, fill: '#a3c1d1', opacity: .65 }));
  }
  function buildPilot() {
    const v = current as PilotView, compare = v.stage === 3;
    makeSceneBase();
    const sensorTexts = [svg('text', { x: 115, y: 55, class: 'older-svg-label' }), svg('text', { x: 440, y: 55, class: 'older-svg-label' })];
    scene.append(svg('rect', { x: 30, y: 23, width: 290, height: 53, rx: 19, fill: '#fff', stroke: '#abcbd8' }),
      svg('rect', { x: 355, y: 23, width: 290, height: 53, rx: 19, fill: '#fff', stroke: '#abcbd8' }));
    [73, 398].forEach(x => {
      scene.append(svg('circle', { cx: x, cy: 49, r: 15, fill: '#a9d5d2', stroke: '#2e655f', 'stroke-width': 2 }),
        svg('circle', { cx: x, cy: 49, r: 5, fill: '#285952' }));
    });
    scene.append(...sensorTexts);
    const caseBadge = svg('text', { x: 801, y: 54, 'text-anchor': 'end', class: 'older-svg-small' }); scene.append(caseBadge);
    const lanes: Array<{ ship: SVGGElement; ghost: SVGGElement; gate: SVGPathElement; result: SVGTextElement; y: number }> = [];
    for (const [i, y] of (compare ? [157, 279] : [207]).entries()) {
      scene.append(svg('path', { d: `M72 ${y}H760`, fill: 'none', stroke: '#c6dce5', 'stroke-width': 50, 'stroke-linecap': 'round' }),
        svg('path', { d: `M72 ${y}H760`, fill: 'none', stroke: '#fff', 'stroke-width': 3, 'stroke-dasharray': '12 14' }),
        svg('circle', { cx: 753, cy: y, r: 33, fill: '#d2eee2', stroke: '#75b29f', 'stroke-width': 3 }),
        svg('path', { d: `M739 ${y}l10 10 19 -24`, fill: 'none', stroke: '#316f58', 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      const gate = svg('path', { d: `M443 ${y - 37}V${y + 37}`, stroke: '#b76b53', 'stroke-width': 9, 'stroke-linecap': 'round' });
      const ghost = ship(); ghost.classList.add('older-ghost'); ghost.setAttribute('transform', `translate(612 ${y})`);
      const craft = ship(); const result = svg('text', { x: 440, y: y - 43, 'text-anchor': 'middle', class: 'older-svg-result' });
      if (compare) scene.append(svg('text', { x: 27, y: y - 48, class: 'older-svg-small' }, i ? 'ACUM' : 'ÎNAINTE'));
      scene.append(gate, ghost, craft, result); lanes.push({ ship: craft, ghost, gate, result, y });
    }
    root.dataset.solo=String(!!v.solo);
    const levers=(v.solo?['A','B']:[v.zone]).map(zone=>{
      const lever=el('div','older-lever');
      const labels=zone==='A'?['Doar propune','Poate acționa']:['Acord de fiecare dată','Acord dacă senzorii diferă'];
      const values=zone==='A'?['propose','execute']:['always','conflict'];
      const choiceButtons=labels.map((label,i)=>{const b=button(label,()=>emit(`play:rule:${values[i]}`),'older-lever-choice');b.dataset.value=`play:rule:${values[i]}`;return b;});
      const range=el('input','older-lever-range');range.type='range';range.min='0';range.max='1';range.step='1';range.setAttribute('aria-label',zone==='A'?'Libertatea pilotului automat':'Când cere pilotul acordul');
      lever.append(choiceButtons[0],range,choiceButtons[1]);listen(range,'change',()=>emit(`play:rule:${values[Number(range.value)]}`));
      if(v.stage!==2)controls.append(lever);return {zone,labels,values,range,choiceButtons};
    });
    const tests = el('div', 'older-test-switches');
    const caseButtons = [button('Senzorii sunt de acord', () => emit('play:pilot:agree')), button('Senzorii se contrazic', () => emit('play:pilot:conflict'))];
    caseButtons.forEach((b, i) => { b.dataset.value = `play:pilot:${i ? 'conflict' : 'agree'}`; tests.append(b); });
    controls.append(tests);
    render = () => {
      const p = current as PilotView;
      root.dataset.running = String(animation?.kind === 'pilot'); root.dataset.case = p.case; root.dataset.decision = p.decision;
      sensorTexts.forEach((t, i) => t.textContent = `S${i + 1} · ${p.sensorLabels[i]}`);
      caseBadge.textContent = 'SIMULARE';
      for(const {zone,labels,values,range,choiceButtons} of levers){
        const own=zone==='A'?p.authority:p.confirmation,selected=Math.max(0,values.indexOf(own||''));
        if(document.activeElement!==range)range.value=String(selected);range.setAttribute('aria-valuetext',own?labels[selected]:'Încă nu ai ales');range.disabled=context.blocked||!p.ruleEditable;
        choiceButtons.forEach((b,i)=>{b.setAttribute('aria-pressed',String(own===values[i]));b.dataset.unavailable=String(!p.ruleEditable);});enable(choiceButtons);
      }
      caseButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(p.case === (i ? 'conflict' : 'agree'))));
      enable(caseButtons);
      const progress = animation?.kind === 'pilot' ? animation.elapsed / animation.duration : 1;
      for (const [i, lane] of lanes.entries()) {
        const decision = compare && i === 0 ? p.beforeDecision : p.decision;
        const destination = decision === 'execute' ? 740 : decision === 'confirm' ? 391 : 155;
        const travel = context.reduced ? 1 : 1 - (1 - progress) ** 2;
        lane.ship.setAttribute('transform', `translate(${85 + (destination - 85) * travel} ${lane.y})`);
        lane.ghost.style.opacity = decision === 'propose' ? '.25' : '0';
        lane.gate.style.opacity = decision === 'confirm' || decision === 'incomplete' ? '1' : '0';
        lane.result.textContent = outcome[decision];
      }
      readout.textContent = animation?.kind === 'pilot' ? 'Testăm regula pe traseu…' : compare ? `Înainte: ${lowerFirst(outcome[p.beforeDecision])} Acum: ${lowerFirst(outcome[p.decision])}` : `${outcome[p.decision]} Schimbă situația și urmărește ce face.`;
    };
  }
  function buildSurvey() {
    const v = current as SurveyView; makeSceneBase();
    const budget = el('span', 'older-budget'); overlay.append(budget);
    const measurement = el('span', 'older-measurement', v.measurementLabel); overlay.append(measurement);
    const updateBudget = (value: number) => { budget.textContent = `Rezervă: ${value} / 2`; budget.setAttribute('aria-label', `Rezervă: ${value} din două credite`); };
    let aim = v.center, mode: 'wide' | 'fine' = v.scanKind || 'fine';
    if (v.stage === 1) {
      const landscape = svg('g'); scene.append(landscape);
      const valueLabels: SVGTextElement[] = [];
      for (let zone = 0; zone < 3; zone++) {
        const x = 29 + zone * 268;
        scene.append(svg('rect', { x, y: 55, width: 246, height: 214, rx: 24, fill: ['#d4e8ed', '#dce2f3', '#d6ebe0'][zone], stroke: '#b4cad7', 'stroke-width': 2 }),
          svg('text', { x: x + 123, y: 301, 'text-anchor': 'middle', class: 'older-svg-label' }, zoneNames[zone]));
        for (let n = 0; n < 5; n++) scene.append(svg('path', { d: `M${x + 10} ${104 + n * 30}Q${x + 73} ${52 + n * 31} ${x + 139} ${98 + n * 29}T${x + 238} ${90 + n * 30}`, fill: 'none', stroke: '#6c98aa', 'stroke-width': 2, opacity: .3 }));
        const text = svg('text', { x: x + 123, y: 170, 'text-anchor': 'middle', class: 'older-svg-reading' }); valueLabels.push(text); scene.append(text);
      }
      const scanWindow = el('div', 'older-scan-window'); scanWindow.tabIndex = 0; scanWindow.setAttribute('role', 'slider');
      scanWindow.setAttribute('aria-label', 'Zona cercetată; mută cu săgețile stânga și dreapta'); scanWindow.setAttribute('aria-valuemin', '0'); scanWindow.setAttribute('aria-valuemax', '2');
      const handle = el('span', 'older-scan-handle', 'Mută fereastra'); scanWindow.append(handle); overlay.append(scanWindow);
      let pointer: number | null = null;
      const position = (clientX: number) => { const box = stage.getBoundingClientRect(); return Math.max(0, Math.min(2, Math.floor((clientX - box.left) / box.width * 3))) as 0 | 1 | 2; };
      cancelGesture = () => { if (pointer !== null && scanWindow.hasPointerCapture(pointer)) scanWindow.releasePointerCapture(pointer); pointer = null; aim = (current as SurveyView).center; render(); };
      listen(scanWindow, 'pointerdown', event => {
        if (context.blocked || (current as SurveyView).scanKind) return;
        pointer = event.pointerId; scanWindow.setPointerCapture(pointer); aim = position(event.clientX); event.preventDefault(); render();
      });
      listen(scanWindow, 'pointermove', event => { if (pointer !== event.pointerId || context.blocked) return; aim = position(event.clientX); render(); });
      listen(scanWindow, 'pointerup', event => {
        if (pointer !== event.pointerId) return; pointer = null; scanWindow.releasePointerCapture(event.pointerId);
        emit(`play:center:${aim}`); render();
      });
      listen(scanWindow, 'pointercancel', cancelGesture);
      listen(scanWindow, 'keydown', event => {
        if (context.blocked || (current as SurveyView).scanKind) return;
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); aim = (event.key === 'Home' ? 0 : event.key === 'End' ? 2 : Math.max(0, Math.min(2, aim + (event.key === 'ArrowLeft' ? -1 : 1)))) as 0 | 1 | 2;
        emit(`play:center:${aim}`); render();
      });
      const modes = el('div', 'older-scan-modes');
      const modeButtons = [button('Ansamblu · 1 credit', () => { mode = 'wide'; render(); }), button('Detaliu · 2 credite', () => { mode = 'fine'; render(); })];
      const scan = button('Pornește scanarea', () => emit(`play:scan:${mode}:${aim}`), 'older-primary'); scan.dataset.playAction = 'scan';
      modes.append(...modeButtons, scan); controls.append(modes);
      render = () => {
        const s = current as SurveyView; if (pointer === null) aim = s.center; if (s.scanKind) mode = s.scanKind;
        updateBudget(s.credits);
        root.dataset.mode = mode; root.dataset.center = String(aim); root.dataset.scanned = String(!!s.scanKind);
        const left = mode === 'wide' ? 3.1 : 3.1 + aim * 31.9, width = mode === 'wide' ? 93.8 : 29.4;
        scanWindow.style.left = `${left}%`; scanWindow.style.width = `${width}%`;
        scanWindow.setAttribute('aria-valuenow', String(aim)); scanWindow.setAttribute('aria-valuetext', mode === 'wide' ? 'Toate cele trei zone' : zoneNames[aim]);
        scanWindow.setAttribute('aria-disabled', String(context.blocked || !!s.scanKind));
        handle.textContent = s.scanKind ? 'Scanare păstrată' : mode === 'wide' ? 'Trei zone dintr-o privire' : `Mută fereastra · ${zoneNames[aim]}`;
        const doc = s.documents.find(d => d.id === 'observation');
        valueLabels.forEach((t, z) => {
          const readings = doc?.values.slice(z * 3, z * 3 + 3).filter((value): value is number => value !== null) || [];
          t.textContent = !s.scanKind ? '· · ·' : readings.length ? mode === 'fine' ? readings.map(n => Math.round(n)).join(' · ') : `${Math.round(readings.reduce((a, b) => a + b, 0) / readings.length)}` : 'necercetat';
          t.setAttribute('font-size', mode === 'fine' ? '26' : '35');
        });
        modeButtons.forEach((b, i) => { b.setAttribute('aria-pressed', String(mode === (i ? 'fine' : 'wide'))); b.dataset.unavailable = String(!!s.scanKind); });
        scan.dataset.unavailable = String(!!s.scanKind); scan.textContent = s.scanKind ? `Ai folosit ${s.scanKind === 'fine' ? 2 : 1} ${s.scanKind === 'fine' ? 'credite' : 'credit'}` : `Scanează ${mode === 'wide' ? 'cele trei zone' : zoneNames[aim].toLowerCase()}`;
        enable([...modeButtons, scan]);
        readout.textContent = doc?.caption || (mode === 'wide' ? 'Vei vedea mai mult teren, cu mai puține detalii. Îți rămâne un credit.' : 'Alege zona cu fereastra. Vei vedea detalii, dar vei folosi întreaga rezervă.');
      };
    } else if (v.stage === 2) {
      scene.append(svg('path', { d: 'M70 105H757', stroke: '#a7cad7', 'stroke-width': 4, 'stroke-dasharray': '10 10' }),
        svg('rect', { x: 355, y: 63, width: 127, height: 93, rx: 19, fill: '#d4e9ec', stroke: '#567b8f', 'stroke-width': 3 }));
      const particles = svg('g', { class: 'older-particles' });
      for (let n = 0; n < 17; n++) particles.append(svg('circle', { cx: 110 + (n * 79) % 595, cy: 79 + (n * 13) % 58, r: 3 + n % 3, fill: n % 2 ? '#c8956d' : '#7e9eaf' }));
      const shutter = svg('g'); shutter.append(svg('rect', { x: 367, y: 65, width: 103, height: 89, rx: 9, fill: '#355d72' }), svg('path', { d: 'M370 92H468M370 122H468', stroke: '#7bafc1', 'stroke-width': 3 }));
      scene.append(particles, shutter);
      const chart = svg('g'); chart.append(svg('path', { d: 'M42 183V300H800', fill: 'none', stroke: '#91b3c5', 'stroke-width': 2 }));
      const gap = svg('rect', { x: 320, y: 175, width: 238, height: 128, rx: 14, fill: '#d8e5ec', opacity: .8 });
      const line = svg('path', { fill: 'none', stroke: '#29667c', 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      const points = svg('g'), gapText = svg('text', { x: 439, y: 238, 'text-anchor': 'middle', class: 'older-svg-label' });
      const timer = svg('text', { x: 656, y: 112, 'text-anchor': 'middle', class: 'older-svg-reading' });
      chart.append(gap, line, points, gapText); scene.append(chart, timer);
      for (const [label, x] of [['Înainte', 150], ['În nor · 3 s', 439], ['După', 697]] as const) scene.append(svg('text', { x, y: 327, 'text-anchor': 'middle', class: 'older-svg-small' }, label));
      const shutterHandle = el('button', 'older-shutter-handle'); shutterHandle.type = 'button';
      shutterHandle.setAttribute('aria-label', 'Închide obturatorul: trage în jos sau atinge. Costă un credit.');
      shutterHandle.textContent = 'Trage în jos'; overlay.append(shutterHandle);
      let shutterDrag: { id: number; y: number; distance: number } | null = null, suppressClick = false;
      const releaseShutter = () => { if (shutterDrag && shutterHandle.hasPointerCapture(shutterDrag.id)) shutterHandle.releasePointerCapture(shutterDrag.id); shutterDrag = null; shutterHandle.style.transform = ''; };
      cancelGesture = () => { if (shutterDrag) suppressClick = true; releaseShutter(); };
      listen(shutterHandle, 'pointerdown', event => {
        if (context.blocked || shutterHandle.disabled) return;
        shutterDrag = { id: event.pointerId, y: event.clientY, distance: 0 }; shutterHandle.setPointerCapture(event.pointerId); suppressClick = false;
      });
      listen(shutterHandle, 'pointermove', event => {
        if (shutterDrag?.id !== event.pointerId) return;
        shutterDrag.distance = Math.max(0, event.clientY - shutterDrag.y); shutterHandle.style.transform = `translateY(${Math.min(50, shutterDrag.distance)}px)`;
      });
      listen(shutterHandle, 'pointerup', event => {
        if (shutterDrag?.id !== event.pointerId) return;
        const closed = shutterDrag.distance >= 16; releaseShutter();
        if (closed) { suppressClick = true; emit('play:shield:protect'); }
      });
      listen(shutterHandle, 'pointercancel', cancelGesture);
      listen(shutterHandle, 'click', () => { if (suppressClick) { suppressClick = false; return; } emit('play:shield:protect'); });
      const shield = button('Închide obturatorul · 1 credit', () => emit('play:shield:protect'), 'older-primary'); shield.dataset.value = 'play:shield:protect';
      const passive = button('Lasă sonda să înregistreze · gratuit', () => emit('play:shield:passive')); passive.dataset.value = 'play:shield:passive';
      controls.append(shield, passive);
      render = () => {
        const s = current as SurveyView, doc = s.documents.find(d => d.id === 'probe');
        updateBudget(s.credits);
        const motion = animation?.kind === 'shield' ? animation : null, running = !!motion, protectedRun = s.protection === 'protect';
        root.dataset.shield = s.protection || ''; root.dataset.running = String(running);
        root.dataset.animationMs = String(Math.round(motion?.elapsed ?? 3000));
        root.dataset.gapCount = String(doc?.values.filter(value => value === null).length ?? 0);
        root.dataset.shutterState = protectedRun && running ? 'closed' : 'open';
        const progress = motion ? motion.elapsed / motion.duration : 1;
        shutter.style.opacity = protectedRun && running ? '1' : '0';
        particles.setAttribute('transform', `translate(${running && !context.reduced ? Math.sin(progress * Math.PI * 2) * 25 : 0} 0)`);
        particles.style.opacity = running ? '.95' : '.35';
        gap.style.opacity = protectedRun && !!doc ? '.8' : '0';
        gapText.textContent = protectedRun && !!doc ? running ? 'Obturator închis' : 'Date lipsă · 3 s' : '';
        timer.textContent = motion ? `${Math.max(1, Math.ceil((motion.duration - motion.elapsed) / 1000))} s` : doc ? protectedRun ? 'Rezerva: 1 credit folosit' : 'Rezerva păstrată' : 'Alege ce protejezi';
        timer.setAttribute('font-size', running ? '38' : '21');
        // The first samples predate the cloud. Only its three-second crossing is played here.
        const values = doc ? doc.values.map((value, i) => running && i >= 3 + Math.floor(progress * 3) ? null : value) : [];
        line.setAttribute('d', pathLine(values, 61, 188, 718, 105));
        points.replaceChildren();
        values.forEach((value, i) => { if (value === null) return; const uncertain = !!doc?.uncertainty[i]; points.append(svg('circle', { cx: 61 + i / Math.max(1, values.length - 1) * 718, cy: 293 - value / 100 * 105, r: uncertain ? 7 : 5, fill: uncertain ? '#fff8ee' : '#29667c', stroke: uncertain ? '#9b612d' : '#29667c', 'stroke-width': uncertain ? 3 : 1 })); });
        shield.dataset.unavailable = String((!!s.protection && !protectedRun) || (!protectedRun && s.credits < 1) || running);
        passive.dataset.unavailable = String((!!s.protection && protectedRun) || running);
        shutterHandle.disabled = context.blocked || !!s.protection || s.credits < 1;
        shutterHandle.hidden = !!s.protection;
        shield.textContent = protectedRun ? 'Revezi trecerea cu obturatorul închis' : 'Închide obturatorul · 1 credit';
        passive.textContent = s.protection === 'passive' ? 'Revezi înregistrarea nefiltrată' : 'Înregistrează tot · gratuit';
        enable([shield, passive]);
        readout.textContent = running ? protectedRun ? 'Timp de trei secunde, sonda nu poate vedea. Urmărește golul din înregistrare.' : 'Sonda continuă să vadă, dar interferențele afectează citirile.' : doc?.caption || 'Protejarea instrumentului păstrează citiri clare, dar lasă un gol. Fără protecție, primești și citirile incerte.';
      };
    } else {
      scene.append(svg('path', { d: 'M480 160H555', stroke: '#8cabbc', 'stroke-width': 4, 'stroke-dasharray': '9 10' }),
        svg('path', { d: 'M541 149L556 160L541 171', fill: 'none', stroke: '#547e96', 'stroke-width': 4, 'stroke-linecap': 'round' }));
      const capsule = el('button', 'older-capsule'); capsule.type = 'button'; capsule.setAttribute('aria-label', 'Capsula echipajului următor; trimite documentul selectat');
      const capsuleArt = svg('svg', { viewBox: '0 0 150 150', 'aria-hidden': 'true' });
      capsuleArt.append(svg('path', { d: 'M39 119V54Q39 21 75 13Q111 21 111 54V119Z', fill: '#f6fffb', stroke: '#538c79', 'stroke-width': 4 }),
        svg('rect', { x: 52, y: 53, width: 46, height: 39, rx: 11, fill: '#bde3d7', stroke: '#538c79', 'stroke-width': 3 }),
        svg('path', { d: 'M39 103L24 128H126L111 103', fill: '#c9e7db', stroke: '#538c79', 'stroke-width': 4 }));
      const capsuleLabel = el('span', '', 'Echipajul următor'); capsule.append(capsuleArt, capsuleLabel); overlay.append(capsule);
      const cards: Array<{ node: HTMLButtonElement; graph: SVGPathElement; uncertainty: SVGGElement; label: HTMLElement; note: HTMLElement; id: 'observation' | 'probe' }> = [];
      let selection: 'observation' | 'probe' | undefined, dragged: { pointer: number; card: HTMLButtonElement; startX: number; startY: number } | null = null;
      const release = () => { if (dragged) { if (dragged.card.hasPointerCapture(dragged.pointer)) dragged.card.releasePointerCapture(dragged.pointer); dragged.card.style.transform = ''; dragged.card.classList.remove('is-dragging'); } dragged = null; capsule.classList.remove('is-target'); };
      cancelGesture = release;
      const sendSelected = () => { if (selection) emit(`play:archive:${selection}`); };
      listen(capsule, 'click', sendSelected);
      for (const [i, id] of (['observation', 'probe'] as const).entries()) {
        const card = el('button', 'older-record-card'); card.type = 'button'; card.dataset.document = id; card.style.top = `${22 + i * 38}%`;
        const label = el('strong', '', id === 'observation' ? 'Harta cercetată' : 'Citirile sondei');
        const chart = svg('svg', { viewBox: '0 0 270 62', 'aria-hidden': 'true' });
        const graph = svg('path', { fill: 'none', stroke: '#32728a', 'stroke-width': 3, 'stroke-linecap': 'round' }), uncertainty = svg('g'); chart.append(graph, uncertainty);
        const note = el('small', ''); card.append(label, chart, note); overlay.append(card); cards.push({ node: card, graph, uncertainty, label, note, id });
        listen(card, 'pointerdown', event => {
          if (context.blocked || card.disabled) return;
          selection = id; dragged = { pointer: event.pointerId, card, startX: event.clientX, startY: event.clientY };
          card.setPointerCapture(event.pointerId); card.classList.add('is-dragging'); render();
        });
        listen(card, 'pointermove', event => {
          if (!dragged || dragged.pointer !== event.pointerId) return;
          card.style.transform = `translate(${event.clientX - dragged.startX}px,${event.clientY - dragged.startY}px)`;
          const box = capsule.getBoundingClientRect(); capsule.classList.toggle('is-target', event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom);
        });
        listen(card, 'pointerup', event => {
          if (!dragged || dragged.pointer !== event.pointerId) return;
          const box = capsule.getBoundingClientRect(), dropped = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
          release(); if (dropped) sendSelected(); render();
        });
        listen(card, 'pointercancel', release);
        listen(card, 'click', () => { selection = id; render(); });
      }
      const transmit = button('Trimite documentul selectat', sendSelected, 'older-primary'); transmit.dataset.playAction = 'archive'; controls.append(transmit);
      render = () => {
        const s = current as SurveyView;
        updateBudget(s.credits);
        if (!selection || !s.documents.some(d => d.id === selection)) selection = s.selectedDocument || s.documents[0]?.id;
        root.dataset.document = s.selectedDocument || '';
        for (const card of cards) {
          const doc = s.documents.find(d => d.id === card.id);
          card.node.disabled = context.blocked || !doc; card.node.setAttribute('aria-pressed', String(selection === card.id));
          card.node.dataset.transmitted = String(s.selectedDocument === card.id); card.node.dataset.available = String(!!doc);
          card.graph.setAttribute('d', doc ? pathLine(doc.values, 5, 3, 260, 54) : '');
          card.uncertainty.replaceChildren();
          doc?.values.forEach((value, i) => { if (value === null || !doc.uncertainty[i]) return; card.uncertainty.append(svg('circle', { cx: 5 + i / Math.max(1, doc.values.length - 1) * 260, cy: 57 - value / 100 * 54, r: 4, fill: '#fff8ee', stroke: '#9b612d', 'stroke-width': 2 })); });
          card.note.textContent = !doc ? 'Niciun document creat' : s.selectedDocument === card.id ? 'Trimis echipajului următor' : 'Rămâne în arhiva ta';
          card.label.textContent = doc?.title || (card.id === 'observation' ? 'Harta cercetată' : 'Citirile sondei');
          card.node.setAttribute('aria-label', `${card.label.textContent}. ${card.note.textContent}. Atinge pentru a selecta, apoi trimite; poți și glisa în capsulă.`);
        }
        capsule.disabled = context.blocked || !selection;
        capsule.dataset.loaded = String(!!s.selectedDocument); capsuleLabel.textContent = s.selectedDocument ? 'Document primit' : 'Echipajul următor';
        transmit.dataset.unavailable = String(!selection); enable([transmit]);
        transmit.textContent = s.selectedDocument === selection ? 'Trimite din nou aceeași copie' : 'Trimite documentul selectat';
        readout.textContent = !s.documents.length ? 'Nu ai creat un document în etapele anterioare. Capsula rămâne goală.' : s.documents.find(doc => doc.id === selection)?.caption || 'Glisează o înregistrare în capsulă. Sau atinge-o, apoi apasă „Trimite”.';
      };
    }
  }
  function rebuild() {
    cancelGesture(); cleanups.splice(0).forEach(cleanup => cleanup());
    scene.replaceChildren(); overlay.replaceChildren(); controls.replaceChildren();
    animation = null; priorFrame = 0; cancelGesture = () => undefined;
    if (current?.kind === 'pilot') buildPilot(); else buildSurvey();
  }
  const visibility = () => {
    priorFrame = 0; if (document.hidden) { cancelGesture(); cancelAnimationFrame(frame); frame = 0; } else startFrame();
  };
  document.addEventListener('visibilitychange', visibility);
  return {
    update(view: PlayView, nextContext: Context) {
      if (disposed || (view.kind !== 'pilot' && view.kind !== 'survey')) return;
      const nextKey = `${view.kind}:${view.stage}:${view.post}:${view.zone}`, changed = nextKey !== key;
      const wasBlocked = context.blocked;
      current = view; context = nextContext;
      root.dataset.kind = view.kind; root.dataset.stage = String(view.stage); root.dataset.blocked = String(context.blocked); root.dataset.reduced = String(context.reduced);
      if (changed) { key = nextKey; lastSeq = view.seq; rebuild(); }
      if (context.blocked && !wasBlocked) { cancelGesture(); cancelAnimationFrame(frame); frame = 0; priorFrame = 0; }
      if (!changed && view.seq !== lastSeq) {
        if (view.kind === 'pilot' && view.lastAction?.startsWith('play:pilot:')) animation = { elapsed: 0, duration: 2000, kind: 'pilot', decision: view.decision };
        if (view.kind === 'survey' && view.stage === 2 && view.lastAction?.startsWith('play:shield:')) animation = { elapsed: 0, duration: view.shutterSeconds * 1000, kind: 'shield' };
        lastSeq = view.seq; priorFrame = 0;
      }
      render(); startFrame();
    },
    dispose() {
      if (disposed) return;
      disposed = true; cancelGesture(); cleanups.splice(0).forEach(cleanup => cleanup());
      cancelAnimationFrame(frame); resize.disconnect(); document.removeEventListener('visibilitychange', visibility); root.remove();
    },
  };
}
