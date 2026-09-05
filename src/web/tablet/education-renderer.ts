import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import type { EducationForm, EducationVisual } from '@shared/education-visual';

const svgNS = 'http://www.w3.org/2000/svg';
// The same silhouettes as the existing matching controls, extruded without changing the task.
const paths: Partial<Record<EducationForm, string>> = {
  Cerc: '<circle cx="50" cy="50" r="32"/>',
  Semilună: '<path d="M68 15A36 36 0 1 0 82 74A38 38 0 0 1 68 15Z"/>',
  Aripă: '<path d="M14 77L82 18L68 72L46 59L33 86Z"/>',
  Flacără: '<path d="M50 12C68 38 83 48 78 67C72 94 29 92 23 67C19 49 34 39 38 29C36 49 46 54 48 47C53 34 49 24 50 12Z"/>',
  Undă: '<path d="M10 50Q30 10 50 50T90 50L90 65Q70 105 50 65T10 65Z"/>',
  Clopoțel: '<path d="M25 62V45A25 25 0 0 1 75 45V62L85 75H15Z"/><circle cx="50" cy="84" r="8"/>',
  Frunză: '<path d="M20 78C2 30 47 13 82 16C87 61 63 94 20 78Z"/>',
  Picătură: '<path d="M50 10C45 30 20 48 20 63A30 30 0 0 0 80 63C80 48 55 30 50 10Z"/>',
  Stea: '<path d="M50 8L62 35L92 38L70 59L76 90L50 74L24 90L30 59L8 38L38 35Z"/>',
  Spirală: '<path d="M51 51C40 38 28 56 42 68C65 86 88 52 70 29C48 2 10 25 13 58C17 93 62 100 85 72" fill="none" stroke="black" stroke-width="11" stroke-linecap="round"/>',
};
function element<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) {
  const e = document.createElement(tag); e.className = cls; if (text) e.textContent = text; return e;
}
function silhouette(form: EducationForm): string {
  return paths[form] || (form === 'pulse' ? '<rect x="38" y="14" width="24" height="72" rx="10"/>' : form === 'card' ? '<rect x="17" y="12" width="66" height="76" rx="12"/>' : form === 'gate' ? '<path d="M16 86V14H84V86H68V30H32V86Z"/>' : '<circle cx="50" cy="50" r="30"/><circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" stroke-width="3"/>');
}

type View = { figure: HTMLElement; diagram: HTMLElement; model: EducationVisual; previous?: EducationVisual; scene?: THREE.Scene; group?: THREE.Group; angle: number; intro: number; abort: AbortController };
/** One WebGL context for the tablet, scissored to the two read-only educational diagrams.
 * All controls remain HTML. Rendering never sends commands, sounds or success events. */
export function createEducationRenderer(host: HTMLElement) {
  let renderer: THREE.WebGLRenderer | undefined;
  let canvas: HTMLCanvasElement | undefined;
  let views: View[] = [];
  let frame = 0, last = 0, until = 0, quiet = false, paused = false, lost = false;
  let quality = 1, slow = 0, drawCount = 0;
  let permanentFallback = new URLSearchParams(location.search).get('graphics') === '2d';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const camera = new THREE.OrthographicCamera(-5, 5, 1.65, -1.65, .1, 50);
  camera.position.set(0, 0, 12);
  const geometries = new Map<EducationForm, THREE.BufferGeometry[]>();
  const previousModels = new Map<string, EducationVisual>();
  let lastTheme = document.documentElement.dataset.theme;
  const themeObserver = new MutationObserver(() => { const next = document.documentElement.dataset.theme; if (next !== lastTheme) { lastTheme = next; invalidate(); } });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const resize = new ResizeObserver(() => invalidate());
  resize.observe(host);
  const abort = new AbortController();
  reduce.addEventListener('change', () => invalidate(), { signal: abort.signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else invalidate(); }, { signal: abort.signal });

  function mode() { return !renderer || lost || permanentFallback ? '2d' : '3d'; }
  function markMode() {
    host.dataset.educationMode = mode();
    if (canvas) { canvas.hidden = mode() === '2d'; canvas.dataset.mode = mode(); canvas.dataset.quality = String(quality); }
    for (const v of views) v.figure.dataset.mode = mode();
  }
  function ensureRenderer() {
    if (renderer || permanentFallback) { if (canvas && !canvas.isConnected) host.append(canvas); return; }
    try {
      canvas = element('canvas', 'education-canvas'); canvas.setAttribute('aria-hidden', 'true');
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
      renderer.setClearColor(0, 0); renderer.setScissorTest(true);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.35;
      canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; stop(); markMode(); });
      canvas.addEventListener('webglcontextrestored', () => { lost = false; markMode(); invalidate(); });
      host.append(canvas);
    } catch { renderer?.dispose(); renderer = undefined; canvas?.remove(); canvas = undefined; permanentFallback = true; }
    markMode();
  }
  function geometry(form: EducationForm): THREE.BufferGeometry[] {
    const cached = geometries.get(form); if (cached) return cached;
    const parsed = new SVGLoader().parse(`<svg xmlns="${svgNS}" viewBox="0 0 100 100">${silhouette(form)}</svg>`);
    const result: THREE.BufferGeometry[] = [];
    for (const path of parsed.paths) {
      if (path.userData?.style.fill !== 'none') for (const shape of SVGLoader.createShapes(path)) {
        const g = new THREE.ExtrudeGeometry(shape, { depth: 13, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 2, bevelThickness: 2, curveSegments: 12 });
        // A rotation flips SVG Y without reversing triangle winding (a baked reflection would).
        g.translate(-50, -50, -6.5); g.rotateX(Math.PI); g.scale(.015, .015, .015); result.push(g);
      }
      if (path.userData?.style.stroke && path.userData.style.stroke !== 'none') for (const sub of path.subPaths) {
        const g = SVGLoader.pointsToStroke(sub.getPoints(32), path.userData.style);
        if (g) { g.translate(-50, -50, 0); g.rotateX(Math.PI); g.scale(.015, .015, .015); result.push(g); }
      }
    }
    geometries.set(form, result); return result;
  }
  function buildScene(v: View) {
    const scene = new THREE.Scene(), group = new THREE.Group();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x91a6c6, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.5); key.position.set(-3, 5, 9); scene.add(key);
    const fill = new THREE.DirectionalLight(0xc8deff, .8); fill.position.set(6, -1, 4); scene.add(fill);
    const isB = v.figure.closest('[data-zone]')?.getAttribute('data-zone') === 'B';
    for (const object of v.model.objects) {
      const color = object.state === 'confirmed' ? 0x309976 : object.state === 'missing' || object.state === 'observed' ? 0x879db5 : isB ? 0x479bdd : 0xea815f;
      const material = new THREE.MeshPhysicalMaterial({ color, side: THREE.DoubleSide, metalness: .08, roughness: .24, clearcoat: 1, clearcoatRoughness: .16, transparent: object.state === 'missing', opacity: object.state === 'missing' ? .45 : 1, wireframe: object.state === 'missing' });
      const item = new THREE.Group(); item.position.set(object.x, object.y, 0); item.scale.setScalar(object.scale ?? .85);
      if (object.intervals?.length) {
        let elapsed = 0;
        for (const duration of object.intervals) {
          const g = new THREE.BoxGeometry(duration * .34 - .04, .5, .28);
          const mesh = new THREE.Mesh(g, material); mesh.position.x = (elapsed + duration / 2) * .34 - 1.02;
          mesh.userData.ownedGeometry = true; item.add(mesh); elapsed += duration;
        }
      } else for (const g of geometry(object.form)) item.add(new THREE.Mesh(g, material));
      if (object.keyMarker) {
        const marker = new THREE.Mesh(new THREE.SphereGeometry(.075, 16, 12), new THREE.MeshStandardMaterial({ color: 0xe0a118, roughness: .3 }));
        marker.position.set(0, .53, .2); marker.userData.ownedGeometry = true; item.add(marker);
      }
      item.rotation.z = -(object.quarterTurns ?? 0) * Math.PI / 2;
      // Every object rotates around its own centre, preserving all diagram coordinates.
      group.add(item);
    }
    for (const [from, to] of v.model.links) {
      const a = v.model.objects.find(o => o.id === from), b = v.model.objects.find(o => o.id === to); if (!a || !b) continue;
      const line = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a.x, a.y, -.2), new THREE.Vector3(b.x, b.y, -.2)]);
      const mesh = new THREE.Line(line, new THREE.LineBasicMaterial({ color: 0x7393b0 })); mesh.userData.ownedGeometry = true; scene.add(mesh);
    }
    scene.add(group); v.scene = scene; v.group = group;
  }
  function release(v: View) {
    v.abort.abort(); resize.unobserve(v.diagram);
    const materials = new Set<THREE.Material>();
    v.scene?.traverse(o => { const m = o as THREE.Mesh; if (m.material) for (const material of Array.isArray(m.material) ? m.material : [m.material]) materials.add(material); if (o.userData.ownedGeometry) m.geometry.dispose(); });
    for (const m of materials) m.dispose();
    v.scene?.clear(); v.figure.remove();
  }
  function stop() { if (frame) cancelAnimationFrame(frame); frame = 0; last = 0; }
  function invalidate() {
    if (!views.length || document.hidden) return;
    if (!frame) frame = requestAnimationFrame(draw);
  }
  function draw(now: number) {
    frame = 0; markMode();
    for (const v of views) layoutFlat(v);
    if (!renderer || lost || permanentFallback || document.hidden || !views.length) return;
    const bounds = host.getBoundingClientRect(); if (!bounds.width || !bounds.height) return;
    const dpr = Math.min(devicePixelRatio, 1.5) * quality;
    const width = Math.max(1, Math.round(bounds.width)), height = Math.max(1, Math.round(bounds.height));
    if (renderer.getPixelRatio() !== dpr) renderer.setPixelRatio(dpr);
    const size = renderer.getSize(new THREE.Vector2());
    if (size.x !== width || size.y !== height) renderer.setSize(width, height, false);
    renderer.setScissorTest(false); renderer.clear(); renderer.setScissorTest(true);
    const moving = !quiet && !reduce.matches && !paused;
    const start = performance.now();
    for (const v of views) {
      if (!v.diagram.isConnected) continue;
      const r = v.diagram.getBoundingClientRect(); if (r.height < 1 || r.width < 1) continue;
      if (!v.scene) buildScene(v);
      // Preserve shape proportions at every viewport size; only node positions use the diagram plane.
      const top = 5 * r.height / r.width;
      camera.top = top; camera.bottom = -top; camera.updateProjectionMatrix();
      const fit = top / 1.65 * (v.model.objects.some(o => o.y !== 0) ? 2 : 3);
      const intro = moving ? Math.min(1, Math.max(0, (now - v.intro) / 420)) : 1;
      v.group!.children.forEach((item, i) => {
        const object = v.model.objects[i], before = v.previous?.objects.find(o => o.id === object.id);
        const arriving = object.state === 'confirmed' && before?.state !== 'confirmed';
        const blend = arriving ? 1 - Math.pow(1 - intro, 3) : 1;
        item.position.x = before ? before.x + (object.x - before.x) * blend : object.x;
        item.position.y = (before ? before.y + (object.y - before.y) * blend : object.y) * top / 1.65;
        item.scale.setScalar((object.scale ?? .85) * fit); item.rotation.y = v.angle + (1 - intro) * .16; item.rotation.x = v.angle * -.25;
      });
      for (const item of v.scene!.children) if (item.userData.ownedGeometry) item.scale.y = top / 1.65;
      renderer.setViewport(r.left - bounds.left, bounds.bottom - r.bottom, r.width, r.height);
      renderer.setScissor(Math.max(0, r.left - bounds.left), Math.max(0, bounds.bottom - r.bottom), Math.min(r.width, bounds.right - r.left), Math.min(r.height, bounds.bottom - r.top));
      renderer.render(v.scene!, camera);
    }
    drawCount++; if (canvas) { canvas.dataset.frames = String(drawCount); canvas.dataset.triangles = String(renderer.info.render.triangles); }
    if (moving && now < until) {
      if ((last && now - last > 45) || performance.now() - start > 24) slow++; else slow = Math.max(0, slow - 1);
      if (slow >= 8 && quality > .6) { quality = .6; slow = 0; }
      last = now; invalidate();
    } else last = 0;
  }
  function layoutFlat(v: View) {
    const height = v.diagram.clientHeight;
    const mult = v.model.objects.some(o => o.y !== 0) ? .42 : .72;
    v.diagram.querySelectorAll<HTMLElement>('.education-flat-object').forEach((icon, i) => {
      const size = Math.max(16, Math.min(110, height * mult * (v.model.objects[i].scale ?? .85)));
      icon.style.width = `${size}px`; icon.style.height = `${size}px`;
    });
    // Labels stay inside their diagram even when a long subtitle reduces the available height.
    v.diagram.querySelectorAll<HTMLElement>('.education-object-label').forEach((label, i) => {
      const y = (1.65 - v.model.objects[i].y) / 3.3 * height;
      const offset = v.model.kind === 'constellation' ? 12 : 22;
      label.style.top = `${Math.max(0, Math.min(height - label.offsetHeight - 3, y + offset))}px`;
      label.style.transform = 'translateX(-50%)';
    });
  }
  function attach(panel: HTMLElement, model: EducationVisual) {
    const existing = views.find(v => v.figure.parentElement === panel);
    if (existing && JSON.stringify(existing.model) === JSON.stringify(model)) return;
    if (existing) { release(existing); views = views.filter(v => v !== existing); }
    const figure = element('figure', 'education-figure'); figure.dataset.kind = model.kind;
    figure.setAttribute('aria-label', model.title);
    const heading = element('div', 'education-heading'); heading.append(element('strong', '', model.title));
    const diagram = element('div', 'education-diagram'); diagram.tabIndex = 0; diagram.setAttribute('role', 'group');
    diagram.setAttribute('aria-label', 'Model de explorat. Săgețile stânga și dreapta rotesc obiectele; Home revine frontal. Nu schimbă răspunsul.');
    const fallback = document.createElementNS(svgNS, 'svg'); fallback.setAttribute('viewBox', '0 0 1000 330'); fallback.setAttribute('preserveAspectRatio', 'none'); fallback.classList.add('education-flat'); fallback.setAttribute('aria-hidden', 'true');
    const positions = new Map(model.objects.map(o => [o.id, { x: (o.x + 5) * 100, y: (1.65 - o.y) * 100 }]));
    for (const [from, to] of model.links) {
      const a = positions.get(from), b = positions.get(to); if (!a || !b) continue;
      const line = document.createElementNS(svgNS, 'line'); line.setAttribute('x1', String(a.x)); line.setAttribute('y1', String(a.y)); line.setAttribute('x2', String(b.x)); line.setAttribute('y2', String(b.y)); fallback.append(line);
    }
    for (const o of model.objects) {
      const p = positions.get(o.id)!;
      const icon = element('span', 'education-flat-object'); icon.dataset.state = o.state; icon.setAttribute('aria-hidden', 'true');
      icon.style.left = `${p.x / 10}%`; icon.style.top = `${p.y / 3.3}%`;
      if (o.intervals?.length) {
        let elapsed = 0;
        const bars = o.intervals.map(duration => { const bar = `<rect x="${elapsed * 16.66}" y="36" width="${duration * 16.66 - 2}" height="28" rx="3"/>`; elapsed += duration; return bar; }).join('');
        icon.innerHTML = `<svg viewBox="0 0 100 100" xmlns="${svgNS}">${bars}</svg>`;
      } else icon.innerHTML = `<svg viewBox="0 0 100 100" xmlns="${svgNS}"><g transform="rotate(${(o.quarterTurns ?? 0) * 90} 50 50)">${silhouette(o.form)}${o.keyMarker ? '<circle cx="50" cy="7" r="8" fill="#e0a118" stroke="#805500" stroke-width="2"/>' : ''}</g></svg>`;
      diagram.append(icon);
      const label = element('span', 'education-object-label', o.label); label.style.left = `${p.x / 10}%`; label.style.top = `${p.y / 3.3}%`; label.dataset.state = o.state; label.dataset.object = o.id; diagram.append(label);
    }
    diagram.prepend(fallback);
    const caption = element('figcaption', 'education-caption', model.caption);
    const facts = element('ul', 'education-facts');
    for (const fact of model.facts) facts.append(element('li', '', fact));
    // Detailed facts are available on demand without consuming the timed interaction's workspace.
    const details = element('details', 'education-explanation'); details.append(element('summary', '', 'Privește mai atent'), facts);
    figure.append(heading, diagram, caption, details);
    const title = panel.querySelector('.mission-instruction'); title ? title.after(figure) : panel.append(figure);
    const identity = `${panel.dataset.zone}:${model.kind}:${model.title}`;
    const previous = previousModels.get(identity), changed = JSON.stringify(previous) !== JSON.stringify(model);
    previousModels.set(identity, model);
    const v: View = { figure, diagram, model, previous, angle: 0, intro: performance.now() - (changed ? 0 : 1000), abort: new AbortController() };
    views.push(v); resize.observe(diagram); layoutFlat(v);
    const rotate = (delta: number) => { if (paused) return; v.angle = Math.max(-.55, Math.min(.55, v.angle + delta)); figure.dataset.angle = v.angle.toFixed(2); invalidate(); };
    let pointer: number | undefined, x = 0;
    diagram.addEventListener('pointerdown', e => { if (paused || pointer !== undefined || mode() !== '3d') return; pointer = e.pointerId; x = e.clientX; diagram.setPointerCapture(pointer); }, { signal: v.abort.signal });
    diagram.addEventListener('pointermove', e => { if (e.pointerId !== pointer) return; rotate((e.clientX - x) * .006); x = e.clientX; }, { signal: v.abort.signal });
    const up = () => { pointer = undefined; }; diagram.addEventListener('pointerup', up, { signal: v.abort.signal }); diagram.addEventListener('pointercancel', up, { signal: v.abort.signal });
    diagram.addEventListener('keydown', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home') { e.preventDefault(); rotate(e.key === 'Home' ? -v.angle : e.key === 'ArrowLeft' ? -.15 : .15); } }, { signal: v.abort.signal });
    details.addEventListener('toggle', () => invalidate(), { signal: v.abort.signal });
    until = performance.now() + (changed ? 450 : 0); ensureRenderer(); markMode(); invalidate();
  }
  return {
    attach,
    update(settings: { reduced: boolean; paused: boolean }) {
      const changed = quiet !== settings.reduced || paused !== settings.paused;
      quiet = settings.reduced; paused = settings.paused;
      const stale = views.filter(v => !v.figure.isConnected); for (const v of stale) release(v);
      views = views.filter(v => v.figure.isConnected);
      if (!views.length) { stop(); if (canvas) canvas.hidden = true; } else { ensureRenderer(); if (changed || stale.length) invalidate(); }
    },
    clear() { stop(); for (const v of views) release(v); views = []; previousModels.clear(); if (canvas) canvas.hidden = true; },
    dispose() { this.clear(); abort.abort(); resize.disconnect(); themeObserver.disconnect(); renderer?.dispose(); for (const gs of geometries.values()) for (const g of gs) g.dispose(); geometries.clear(); canvas?.remove(); },
  };
}
