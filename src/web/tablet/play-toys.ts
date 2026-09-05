import type { PlayView } from '@shared/play-engine';
import { illustrationPath, type ExodusIllustration } from '../shared/illustrations';

type LightView = Extract<PlayView, { kind: 'light' }>;
type SignalView = Extract<PlayView, { kind: 'signal' }>;
type YoungView = LightView | SignalView;
type Point = { x: number; y: number };
const NS = 'http://www.w3.org/2000/svg';
const colors = ['#dd8658', '#568db5', '#849955'];
const rhythmColors = ['#f0b18c', '#a7cee8', '#c6d9a1'];
const forms: Record<string, string> = {
  Cerc: 'M50 16A34 34 0 1 1 49.99 16Z',
  Semilună: 'M65 13A37 37 0 1 0 84 72A37 37 0 0 1 65 13Z',
  Aripă: 'M12 77L86 17L70 73L47 60L33 89Z',
  Flacără: 'M50 10C68 37 84 48 78 69C70 94 29 94 23 69C17 50 33 36 39 27C35 48 45 56 49 46C54 31 49 22 50 10Z',
  Undă: 'M9 44Q29 6 50 44T91 44L91 65Q71 103 50 65T9 65Z',
  Clopoțel: 'M25 64V43A25 25 0 0 1 75 43V64L86 77H14ZM41 83A10 10 0 0 0 61 83Z',
  Frunză: 'M20 80C0 30 47 11 83 16C88 61 64 94 20 80Z',
  Picătură: 'M50 8C45 28 18 47 18 64A32 32 0 0 0 82 64C82 47 55 28 50 8Z',
  Stea: 'M50 5L63 34L95 38L72 60L79 93L50 76L21 93L28 60L5 38L37 34Z',
  Spirală: 'M53 49C40 35 25 54 39 69C62 91 94 52 72 27C44 -1 5 25 12 61C20 99 67 101 91 72L80 64C62 86 31 83 26 59C21 33 45 19 62 36C73 49 65 65 52 59Z',
};
function attrs(node: Element, values: Record<string, string | number | boolean>) {
  for (const [key, value] of Object.entries(values)) node.setAttribute(key, String(value));
}
function svg<K extends keyof SVGElementTagNameMap>(tag: K, values: Record<string, string | number | boolean> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag); attrs(node, values); return node;
}
function html<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.className = className; if (text !== undefined) node.textContent = text; return node;
}

/** Persistent, direct manipulation surfaces. A pointer draft never counts as a mission result. */
export function createYoungToy(host: HTMLElement, send: (value: string) => void) {
  const root = html('div', 'young-toy');
  const scene = svg('svg', { viewBox: '0 0 640 320', class: 'young-toy-scene', role: 'group', 'aria-label': 'Masa de lucru' });
  const controls = html('div', 'young-toy-controls');
  const help = html('p', 'young-toy-help');
  root.append(scene, controls, help); host.append(root);
  let view: YoungView | null = null, blocked = false, reduced = false, key = '', actionController = new AbortController();
  let drawing: (() => void) | null = null, gesture: { id: number; move: (p: Point) => void; end: (p: Point, moved: boolean) => void; start: Point; moved: boolean } | null = null;
  let draftSequence = [1, 2, 3], draftAngle: number | null = null, selectedRecord: number | null = null, lastSequenceKey = '', lastRecord = -1;
  const refs = new Map<string, SVGElement>();

  const getLight = () => view?.kind === 'light' ? view : null;
  const getSignal = () => view?.kind === 'signal' ? view : null;
  function commit(value: string) { if (!blocked && view) send(value); }
  function add<K extends keyof SVGElementTagNameMap>(tag: K, values: Record<string, string | number | boolean>, id?: string, parent: SVGElement = scene): SVGElementTagNameMap[K] {
    const node = svg(tag, values); parent.append(node); if (id) refs.set(id, node); return node;
  }
  function text(textValue: string, x: number, y: number, className = '', id?: string, parent: SVGElement = scene) {
    const node = add('text', { x, y, class: className }, id, parent); node.textContent = textValue; return node;
  }
  function setText(id: string, value: string) { const node = refs.get(id); if (node && node.textContent !== value) node.textContent = value; }
  function set(id: string, values: Record<string, string | number | boolean>) { const node = refs.get(id); if (node) attrs(node, values); }
  function shape(name: string, parent: SVGElement, size = 100, className = '', id?: string) {
    const g = add('g', { transform: `translate(${-size / 2} ${-size / 2}) scale(${size / 100})` }, undefined, parent);
    return add('path', { d: forms[name] || forms.Cerc, class: className }, id, g);
  }
  /** Artwork is only a housing; the SVG above it owns every target and live state. */
  function shell(name: ExodusIllustration, bounds: { x: number; y: number; width: number; height: number }, fallback: SVGElement) {
    fallback.classList.add('toy-shell-fallback');
    const artwork = add('g', { class: 'toy-shell', 'aria-hidden': true });
    const image = add('image', { ...bounds, preserveAspectRatio: 'xMidYMid meet' }, undefined, artwork);
    const ready = (loaded: boolean) => {
      artwork.dataset.loaded = String(loaded);
      fallback.dataset.artReady = String(loaded);
    };
    image.addEventListener('load', () => ready(true), { signal: actionController.signal });
    image.addEventListener('error', () => ready(false), { signal: actionController.signal });
    image.setAttribute('href', illustrationPath(name));
    return artwork;
  }
  function action(node: SVGElement, label: string, run: () => void, value: string) {
    attrs(node, { role: 'button', tabindex: 0, 'aria-label': label, 'data-play': value });
    node.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!blocked) run(); } }, { signal: actionController.signal });
    node.addEventListener('click', event => { if (event.detail === 0 && !blocked) run(); }, { signal: actionController.signal });
  }
  function button(label: string, value: string, run: () => void, primary = false) {
    const node = html('button', ''); node.type = 'button'; node.textContent = label; node.dataset.play = value; node.dataset.primary = String(primary);
    node.addEventListener('click', run, { signal: actionController.signal }); controls.append(node); return node;
  }
  function point(event: PointerEvent): Point {
    const matrix = scene.getScreenCTM(); if (!matrix) return { x: 0, y: 0 };
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()); return { x: p.x, y: p.y };
  }
  function drag(node: SVGElement, move: (p: Point) => void, end: (p: Point, moved: boolean) => void) {
    node.addEventListener('pointerdown', event => {
      if (blocked || gesture || event.button !== 0) return; event.preventDefault();
      gesture = { id: event.pointerId, move, end, start: point(event), moved: false }; scene.setPointerCapture(event.pointerId);
    }, { signal: actionController.signal });
  }
  scene.addEventListener('pointermove', event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    const p = point(event); gesture.moved ||= Math.hypot(p.x - gesture.start.x, p.y - gesture.start.y) > 7; gesture.move(p);
  });
  scene.addEventListener('pointerup', event => {
    if (!gesture || event.pointerId !== gesture.id) return; const completed = gesture; gesture = null;
    if (scene.hasPointerCapture(event.pointerId)) scene.releasePointerCapture(event.pointerId);
    completed.end(point(event), completed.moved); drawing?.();
  });
  scene.addEventListener('pointercancel', () => { gesture = null; draftAngle = null; drawing?.(); });

  function buildLight(v: LightView) {
    if (v.stage === 1) {
      text('Caută această formă', 320, 26, 'toy-heading');
      add('ellipse', { cx: 320, cy: 99, rx: 91, ry: 20, class: 'toy-piece-shadow' });
      const target = add('g', { transform: 'translate(320 76)' }); shape(v.shape, target, 85, 'toy-socket', 'target-shape');
      v.candidates.forEach((name, index) => {
        const x = 150 + index * 170;
        add('ellipse', { cx: x, cy: 269, rx: 66, ry: 15, class: 'toy-piece-shadow' });
        const g = add('g', { transform: `translate(${x} 209)`, class: 'toy-piece' }, `piece-${index}`);
        add('circle', { cx: 0, cy: 0, r: 59, fill: '#ffffff01' }, undefined, g);
        shape(name, g, 112, '', `piece-shape-${index}`).setAttribute('fill', colors[index]);
        text(name, x, 298);
        action(g, `Ia piesa ${name}`, () => commit(`play:match:${name}`), `play:match:${name}`);
        drag(g, p => attrs(g, { transform: `translate(${p.x} ${p.y})` }), (p, moved) => {
          if (!moved || Math.hypot(p.x - 320, p.y - 76) < 120) commit(`play:match:${name}`);
        });
      });
      help.textContent = 'Atinge piesa potrivită sau du-o pe contur.';
      drawing = () => {
        const current = getLight(); if (!current) return;
        current.candidates.forEach((name, index) => set(`piece-${index}`, { transform: current.solved && name === current.shape ? 'translate(320 76) scale(.76)' : `translate(${150 + index * 170} 209)`, opacity: current.solved && name !== current.shape ? .6 : 1 }));
        set('target-shape', { fill: current.solved ? '#f6df9c' : '#eff5f5' });
      };
    } else if (v.stage === 2) {
      text('Piesa ta', 160, 45, 'toy-heading'); text('Fereastra felinarului', 465, 45, 'toy-heading');
      const housing = add('g', { 'aria-hidden': true });
      add('rect', { x: 375, y: 71, width: 181, height: 204, rx: 43, fill: '#edddaa', stroke: '#bd9b58', 'stroke-width': 5 }, undefined, housing);
      add('path', { d: 'M389 104Q465 77 542 104M389 244Q465 265 542 244', fill: 'none', stroke: '#fff7d5', 'stroke-width': 8 }, undefined, housing);
      const lantern = shell('lantern-shell-v1', { x: 347, y: 63, width: 236, height: 211 }, housing);
      add('rect', { x: 391, y: 97, width: 148, height: 148, rx: 24, fill: '#fff8ec' }, undefined, lantern);
      const socket = add('g', { transform: 'translate(465 171)' }, 'socket'); shape(v.shape, socket, 135, 'toy-socket');
      action(socket, 'Așază piesa în fereastră', () => { const state = getLight(); if (state) commit(`play:fit:${state.rotation}`); }, 'play:fit');
      drag(socket, () => {}, () => { const state = getLight(); if (state) commit(`play:fit:${state.rotation}`); });
      add('ellipse', { cx: 165, cy: 261, rx: 83, ry: 21, class: 'toy-piece-shadow' });
      const piece = add('g', { class: 'toy-piece' }, 'fit-piece'); add('circle', { cx: 0, cy: 0, r: 80, fill: '#ffffff01' }, undefined, piece); shape(v.shape, piece, 139).setAttribute('fill', '#de9068');
      const rotate = () => { const state = getLight(); if (state) commit(`play:rotate:${(state.rotation + 1) % 4}`); };
      action(piece, 'Rotește piesa', rotate, 'play:rotate');
      drag(piece, p => attrs(piece, { transform: `translate(${p.x} ${p.y}) rotate(${(getLight()?.rotation || 0) * 90})` }), (p, moved) => {
        const state = getLight(); if (!state) return;
        if (moved && Math.hypot(p.x - 465, p.y - 171) < 125) commit(`play:fit:${state.rotation}`); else if (!moved) rotate();
      });
      const rotationButton = button('Rotește piesa', 'play:rotate', rotate);
      button('Așază în fereastră', 'play:fit', () => { const state = getLight(); if (state) commit(`play:fit:${state.rotation}`); }, true);
      help.textContent = v.shape === 'Cerc' ? 'Cercul se potrivește oricum l-ai întoarce.' : 'Rotește piesa, apoi du-o în fereastră.';
      drawing = () => {
        const state = getLight(); if (!state) return;
        const inWindow = state.solved && (state.shape === 'Cerc' || state.rotation === state.socketRotation);
        set('fit-piece', { transform: `translate(${inWindow ? 465 : 165} 171) rotate(${state.rotation * 90})` });
        rotationButton.disabled = blocked || state.shape === 'Cerc';
      };
    } else {
      text('Două legături. Un felinar aprins.', 320, 28, 'toy-heading');
      add('path', { d: 'M86 132H218M250 164V212H406M438 180V132H551V158M565 196V275H86V212', class: 'toy-wire' }, 'wire-base');
      add('rect', { x: 56, y: 132, width: 60, height: 80, rx: 15, fill: '#fcfded', stroke: '#8c9b65', 'stroke-width': 4 });
      text('+', 86, 160, 'toy-heading'); text('−', 86, 196, 'toy-heading'); text('Baterie', 86, 312);
      add('circle', { cx: 565, cy: 157, r: 53, fill: '#f6dea4', opacity: 0 }, 'lamp-halo');
      add('path', { d: 'M541 161A31 31 0 1 1 589 161L578 183H552Z', fill: '#f8f5e7', stroke: '#a4a086', 'stroke-width': 3 }, 'lamp');
      add('rect', { x: 550, y: 182, width: 29, height: 19, rx: 5, fill: '#80949a' });
      add('path', { d: 'M558 179L554 148L565 158L576 148L572 179', fill: 'none', stroke: '#89958a', 'stroke-width': 3 }, 'filament');
      text('Bec', 565, 312);
      [250, 438].forEach((x, index) => {
        const g = add('g', { transform: `translate(${x} ${index === 0 ? 132 : 212})` }, `joint-${index}`);
        add('circle', { cx: 0, cy: 0, r: 49, class: 'toy-platform' }, undefined, g);
        add('path', { d: index === 0 ? 'M-32 0H0V32' : 'M-32 0H0V-32', class: 'toy-wire' }, `joint-line-${index}`, g);
        text(String(index + 1), 0, -61, '', undefined, g);
        const turn = () => { const state = getLight(); if (state) commit(`play:wire:${index}:${(state.wireTurns[index] + 1) % 4}`); };
        action(g, `Rotește legătura ${index + 1}`, turn, `play:wire:${index}`); drag(g, () => {}, turn);
        button(`Rotește ${index + 1}`, `play:wire:${index}`, turn);
      });
      add('path', { d: 'M86 132H250V212H438V132H551V158M565 196V275H86V212', class: 'toy-current', visibility: 'hidden' }, 'current');
      help.textContent = 'Curentul are nevoie de un drum întreg, dus și întors.';
      drawing = () => {
        const state = getLight(); if (!state) return;
        state.wireTurns.forEach((turn, index) => set(`joint-line-${index}`, { transform: `rotate(${(turn - state.wireTargets[index]) * 90})`, class: state.wireConnected ? 'toy-wire toy-live' : 'toy-wire' }));
        set('lamp', { fill: state.wireConnected ? '#ffcf52' : '#f8f5e7' }); set('lamp-halo', { opacity: state.wireConnected ? .55 : 0 }); set('current', { visibility: state.wireConnected ? 'visible' : 'hidden' });
      };
    }
  }

  function waveform(parent: SVGElement, id: string, x: number, y: number, width = 244) {
    add('path', { d: `M${x} ${y + 17}H${x + width}`, class: 'toy-graph-line' }, undefined, parent);
    for (let n = 0; n < 3; n++) {
      add('rect', { x, y, width: 25, height: 23, rx: 7, class: 'toy-pulse-out' }, `${id}-${n}`, parent);
      text('', x, y + 17, 'toy-white toy-small', `${id}-label-${n}`, parent);
    }
  }
  function wave(id: string, values: number[] | null, x: number, width: number, incoming = false) {
    let offset = 0;
    [0, 1, 2].forEach(index => {
      const value = values?.[index] || 0, barWidth = value * (width - 20) / 6;
      set(`${id}-${index}`, { x: x + offset, width: Math.max(0, barWidth), visibility: values ? 'visible' : 'hidden', style: `fill:${incoming ? '#236f9e' : '#ae542f'}` });
      set(`${id}-label-${index}`, { x: x + offset + barWidth / 2, visibility: values ? 'visible' : 'hidden' }); setText(`${id}-label-${index}`, String(value)); offset += barWidth + 10;
    });
  }
  function tuner(v: SignalView, compact = false) {
    const label = html('label', 'toy-tuner'); const caption = html('span', '', 'Antena');
    const range = document.createElement('input'); range.type = 'range'; range.min = '-60'; range.max = '60'; range.step = '1'; range.value = String(v.angle); range.dataset.play = 'play:tune'; range.setAttribute('aria-label', 'Direcția antenei');
    range.addEventListener('input', () => { draftAngle = Number(range.value); if (!compact) drawAntenna(); }, { signal: actionController.signal });
    range.addEventListener('change', () => { commit(`play:tune:${range.value}`); draftAngle = null; }, { signal: actionController.signal });
    label.append(caption, range); controls.append(label); return range;
  }
  function drawAntenna() {
    const current = getSignal(); if (!current) return; const angle = draftAngle ?? current.angle;
    set('antenna-dish', { transform: `translate(320 187) rotate(${angle})` });
    setText('strength', draftAngle === null ? `Semnal: ${current.strength}%` : `Antena: ${angle}°`);
    for (let i = 0; i < 10; i++) set(`strength-${i}`, { fill: current.strength >= (i + 1) * 10 ? '#3a927c' : '#bccdd0' });
  }
  function model(parent: SVGElement, x: number, y: number, kind: 'far' | 'relay' | 'insufficient', id: string) {
    const g = add('g', { transform: `translate(${x} ${y})` }, id, parent);
    add('rect', { x: -85, y: -45, width: 170, height: 125, rx: 25, class: 'toy-target' }, undefined, g);
    if (kind === 'far') {
      add('path', { d: 'M-15 17L-9 -18H9L15 17Z', fill: '#c8794c' }, undefined, g);
      add('path', { d: 'M-37 -11L-15 -5M37 -11L15 -5M-31 8L-15 2M31 8L15 2', stroke: '#bc820b', 'stroke-width': 4, 'stroke-linecap': 'round' }, undefined, g);
    } else if (kind === 'relay') {
      add('rect', { x: -23, y: -19, width: 46, height: 33, rx: 11, fill: '#568db5' }, undefined, g);
      add('path', { d: 'M-56 -3H-31M-38 -12L-29 -3L-38 6M31 -3H55M46 -12L56 -3L46 6', fill: 'none', stroke: '#28658b', 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, undefined, g);
    } else text('?', 0, 16, 'toy-heading', undefined, g);
    text(kind === 'far' ? 'Același ritm' : kind === 'relay' ? 'Copiază ritmul' : 'Încă nu știm', 0, 41, 'toy-small', undefined, g);
    if (kind !== 'insufficient') waveform(g, `prediction-${kind}`, -60, 51, 120);
    else text('Datele nu ajung', 0, 68, 'toy-small', undefined, g);
    return g;
  }
  function buildSignal(v: SignalView) {
    if (v.stage === 1) {
      text('Antena ta', 320, 27, 'toy-heading');
      const angleRad = v.targetAngle * Math.PI / 180, sx = 320 + 154 * Math.sin(angleRad), sy = 187 - 154 * Math.cos(angleRad);
      add('circle', { cx: sx, cy: sy, r: 17, fill: '#f4ce78' }); add('circle', { cx: sx, cy: sy, r: 28, fill: 'none', stroke: '#c29543', 'stroke-width': 2, opacity: .45 });
      const housing = add('path', { d: 'M286 219H354L369 245H271Z', fill: '#62848d', 'aria-hidden': true });
      shell('signal-receiver-shell-v1', { x: 237, y: 213, width: 166, height: 60 }, housing);
      const dish = add('g', {}, 'antenna-dish');
      add('path', { d: 'M-66 -48Q0 52 66 -48Q0 -13 -66 -48', fill: '#faf9ec', stroke: '#56808c', 'stroke-width': 4 }, undefined, dish);
      add('path', { d: 'M0 -24V-85M-8 -84H8M0 0V39', fill: 'none', stroke: '#456d7e', 'stroke-width': 7, 'stroke-linecap': 'round' }, undefined, dish);
      add('circle', { cx: 0, cy: -86, r: 7, fill: '#d19638' }, undefined, dish);
      action(dish, 'Orientează antena cu săgețile', () => {}, 'play:tune');
      dish.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return; event.preventDefault(); const current = getSignal(); if (current) commit(`play:tune:${Math.max(-60, Math.min(60, current.angle + (event.key === 'ArrowLeft' ? -5 : 5)))}`);
      }, { signal: actionController.signal });
      drag(dish, p => { draftAngle = Math.max(-60, Math.min(60, Math.round((getSignal()?.angle || 0) + (p.x - (gesture?.start.x || p.x)) * .5))); drawAntenna(); }, () => { if (draftAngle !== null) commit(`play:tune:${draftAngle}`); draftAngle = null; });
      for (let i = 0; i < 10; i++) add('rect', { x: 218 + i * 21, y: 275, width: 15, height: 17, rx: 5 }, `strength-${i}`);
      text('', 320, 313, 'toy-small', 'strength');
      const range = tuner(v);
      const choices = ['far', 'relay', 'uncertain'] as const;
      const labels = ['Își păstrează ritmul', 'Repetă ce trimitem', 'Încă nu știm'];
      const buttons = choices.map((choice, i) => button(labels[i], `play:hypothesis:${choice}`, () => commit(`play:hypothesis:${choice}`)));
      help.textContent = 'Mișcă antena. Ce crezi că face semnalul?';
      drawing = () => { const current = getSignal(); if (!current) return; drawAntenna(); if (draftAngle === null) range.value = String(current.angle); buttons.forEach((node, i) => node.dataset.selected = String(current.hypothesis === choices[i])); };
    } else if (v.stage === 2) {
      lastRecord = v.records.at(-1)?.id ?? -1;
      text('Ritmul trimis', 121, 34, 'toy-heading'); text('Răspunsul primit', 475, 34, 'toy-heading');
      waveform(scene, 'last-input', 28, 57, 227); waveform(scene, 'last-received', 378, 57, 227);
      add('path', { d: 'M279 69H353M341 57L355 69L341 81', fill: 'none', stroke: '#497b90', 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      text('', 320, 115, 'toy-small', 'response-note');
      add('path', { d: 'M83 239H557', stroke: '#a8c0c9', 'stroke-width': 5, 'stroke-linecap': 'round' });
      for (let i = 0; i < 3; i++) {
        const g = add('g', { class: 'toy-piece' }, `beat-${i}`); add('rect', { x: -65, y: -53, width: 130, height: 100, rx: 25, fill: rhythmColors[i] }, undefined, g);
        text('', 0, -4, 'toy-heading', `beat-value-${i}`, g); text('secunde', 0, 24, 'toy-small', `beat-unit-${i}`, g);
        const rotate = () => { const next = [...draftSequence]; [next[i], next[(i + 1) % 3]] = [next[(i + 1) % 3], next[i]]; draftSequence = next; drawing?.(); };
        action(g, `Mută intervalul ${i + 1} pe locul următor`, rotate, `draft:beat:${i}`);
        drag(g, p => attrs(g, { transform: `translate(${Math.max(76, Math.min(564, p.x))} ${Math.max(153, Math.min(259, p.y))})` }), (p, moved) => {
          if (!moved) { rotate(); return; } const target = Math.max(0, Math.min(2, Math.round((p.x - 143) / 177)));
          const next = [...draftSequence]; [next[i], next[target]] = [next[target], next[i]]; draftSequence = next;
        });
      }
      text('Schimbă ordinea pieselor', 320, 291, 'toy-heading');
      const range = tuner(v, true);
      button('Schimbă ordinea', 'draft:reorder', () => { draftSequence = [draftSequence[1], draftSequence[2], draftSequence[0]]; drawing?.(); });
      const transmit = button('Trimite ritmul', 'play:signal', () => commit(`play:signal:${draftSequence.join('-')}`), true);
      help.textContent = 'Glisează piesele, trimite și privește ce se întoarce.';
      drawing = () => {
        const current = getSignal(); if (!current) return; const record = current.records.at(-1);
        transmit.disabled = blocked || !current.canTransmit;
        help.textContent = current.canTransmit ? 'Glisează piesele, trimite și privește ce se întoarce.' : 'Reglează antena înainte de primul test.';
        const justReceived = !!record && record.id !== lastRecord;
        if (record) lastRecord = record.id;
        wave('last-input', record?.input || null, 28, 227); wave('last-received', record?.received || null, 378, 227, true);
        if (justReceived && !reduced) for (let i = 0; i < 3; i++) {
          refs.get(`last-input-${i}`)?.animate([{ opacity: .15, transform: 'translateX(-25px)' }, { opacity: 1, transform: 'translateX(0)' }], { duration: 550, delay: i * 100 });
          refs.get(`last-received-${i}`)?.animate([{ opacity: .15, transform: 'translateX(-25px)' }, { opacity: 1, transform: 'translateX(0)' }], { duration: 550, delay: 550 + i * 100 });
        }
        setText('response-note', !record ? `Semnal: ${current.strength}%. Pregătește primul ritm.` : record.received ? `Trimis ${record.input.join('–')} · primit ${record.received.join('–')}` : 'Nu am recepționat răspunsul. Orientează antena și încearcă iar.');
        draftSequence.forEach((n, i) => { set(`beat-${i}`, { transform: `translate(${143 + i * 177} 205)` }); setText(`beat-value-${i}`, String(n)); setText(`beat-unit-${i}`, n === 1 ? 'secundă' : 'secunde'); });
        if (draftAngle === null) range.value = String(current.angle);
      };
    } else {
      text('Înregistrările tale', 320, 27, 'toy-heading');
      [0, 1].forEach(index => {
        const x = 161 + index * 318, g = add('g', { transform: `translate(${x} 91)`, class: 'toy-piece' }, `record-${index}`);
        add('rect', { x: -140, y: -42, width: 280, height: 100, rx: 23, class: 'toy-record' }, undefined, g);
        text('', 0, -19, 'toy-small', `record-title-${index}`, g);
        waveform(g, `record-wave-${index}`, -113, -6, 226); text('', 0, 45, 'toy-small', `record-note-${index}`, g);
        const pick = () => { const record = getSignal()?.records.filter(r => r.received).slice(-2)[index]; if (record) selectedRecord = record.id; drawing?.(); };
        action(g, `Alege înregistrarea ${index + 1}`, pick, `draft:record:${index}`);
        drag(g, p => attrs(g, { transform: `translate(${p.x} ${p.y})` }), (p, moved) => {
          if (!getSignal()?.records.filter(record => record.received).slice(-2)[index]) return;
          pick(); if (!moved || p.y < 175 || p.y > 325 || p.x < 20 || p.x > 620 || selectedRecord === null) return;
          const option = p.x < 222 ? 'far' : p.x < 420 ? 'relay' : 'insufficient'; commit(`play:conclude:${option}:${selectedRecord}`);
        });
      });
      const options = ['far', 'relay', 'insufficient'] as const;
      options.forEach((choice, i) => {
        const g = model(scene, 119 + i * 201, 239, choice, `model-${choice}`);
        const conclude = () => commit(`play:conclude:${choice}:${selectedRecord ?? 'none'}`);
        action(g, choice === 'far' ? 'Farul păstrează ritmul' : choice === 'relay' ? 'Releul copiază ritmul' : 'Nu avem suficiente date', conclude, `play:conclude:${choice}`); drag(g, () => {}, conclude);
      });
      help.textContent = 'Du înregistrarea pe explicație. Sau atinge-le pe rând.';
      drawing = () => {
        const current = getSignal(); if (!current) return; const records = current.records.filter(record => record.received).slice(-2);
        if (selectedRecord === null || !current.records.some(record => record.id === selectedRecord)) selectedRecord = records.at(-1)?.id ?? null;
        [0, 1].forEach(index => {
          const record = records[index]; set(`record-${index}`, { transform: `translate(${161 + index * 318} 91)`, 'data-selected': !!record && record.id === selectedRecord, opacity: record ? 1 : .65, 'aria-disabled': blocked || !record, tabindex: record ? 0 : -1, 'pointer-events': record ? 'auto' : 'none' });
          setText(`record-title-${index}`, record ? `Proba ${current.records.findIndex(item => item.id === record.id) + 1}` : 'Loc pentru o probă'); wave(`record-wave-${index}`, record?.received || null, -113, 226, true);
          setText(`record-note-${index}`, record ? `Trimis ${record.input.join('–')} · primit ${record.received?.join('–')}` : 'Niciun răspuns înregistrat');
        });
        options.forEach(choice => set(`model-${choice}`, { 'data-selected': current.verdict === choice }));
        const record = records.find(item => item.id === selectedRecord);
        wave('prediction-far', record?.predicted || null, -60, 120); wave('prediction-relay', record?.input || null, -60, 120, true);
      };
    }
  }

  function update(next: PlayView, context: { blocked: boolean; reduced: boolean }) {
    if (next.kind !== 'light' && next.kind !== 'signal') return;
    view = next; blocked = context.blocked; reduced = context.reduced;
    root.dataset.blocked = String(blocked); root.dataset.quiet = String(reduced); root.dataset.kind = next.kind; root.dataset.stage = String(next.stage);
    if (reduced || blocked) for (const animation of scene.getAnimations({ subtree: true })) animation.cancel();
    const nextKey = `${next.kind}:${next.stage}:${next.post}:${next.zone}`;
    if (key !== nextKey) {
      key = nextKey; gesture = null; draftAngle = null; selectedRecord = null; lastRecord = -1;
      actionController.abort(); actionController = new AbortController(); scene.replaceChildren(); controls.replaceChildren(); refs.clear();
      if (next.kind === 'signal') { draftSequence = next.sequence.length === 3 ? [...next.sequence] : [1, 2, 3]; lastSequenceKey = next.sequence.join('-'); buildSignal(next); } else buildLight(next);
    } else if (next.kind === 'signal' && next.sequence.join('-') !== lastSequenceKey) {
      lastSequenceKey = next.sequence.join('-'); if (!gesture && next.sequence.length === 3) draftSequence = [...next.sequence];
    }
    for (const node of controls.querySelectorAll('button,input')) (node as HTMLButtonElement | HTMLInputElement).disabled = blocked;
    for (const node of scene.querySelectorAll('[role=button]')) node.setAttribute('aria-disabled', String(blocked));
    if (!gesture) drawing?.();
  }
  return { update, dispose() { actionController.abort(); gesture = null; drawing = null; root.remove(); } };
}
