import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { CREW_PATHS, type CrewMark, type CrewRelay } from './crew-relay';

export interface CrewViewport { element: HTMLElement; seat?: string; preview?: CrewMark; pending?: boolean }
type View = CrewViewport & { key: string; scene: THREE.Scene; pods: Map<string, THREE.Group>; flights: Map<string, THREE.Mesh>; flat: SVGSVGElement };
const NS = 'http://www.w3.org/2000/svg';
const position = (i: number) => ({ x: (Math.floor(i / 2) - 2) * 1.83, y: (i % 2 ? -.68 : .48) - Math.abs(Math.floor(i / 2) - 2) * .12 });
// Finale rows are centred independently, so a sparse crew leaves no empty stations.
const finalePosition = (i: number, count: number) => {
  const columns = count <= 5 ? count : Math.ceil(count / 2);
  const row = Math.floor(i / Math.max(1, columns));
  const rowCount = Math.min(columns, count - row * columns);
  return { x: (i % Math.max(1, columns) - (rowCount - 1) / 2) * 1.65, y: count <= 5 ? -.15 : row === 0 ? .48 : -.78 };
};

/** One bounded, on-demand WebGL canvas, shared by both touch targets on a tablet.
 * No timers or network commands originate here. SVG always carries the same state. */
export function createCrewStage(host: HTMLElement) {
  let renderer: THREE.WebGLRenderer | undefined, canvas: HTMLCanvasElement | undefined;
  let views: View[] = [], model: CrewRelay | undefined, epoch = '', previous = new Set<string>();
  const arrivals = new Map<string, number>();
  let frame = 0, reduced = false, paused = false, flatOnly = false, unsupported = false, lost = false, disposed = false;
  const forceFlat = new URLSearchParams(location.search).get('graphics') === '2d';
  const motion = matchMedia('(prefers-reduced-motion: reduce)'), abort = new AbortController();
  const camera = new THREE.OrthographicCamera(-6, 6, 2.6, -2.6, .1, 40); camera.position.z = 12;
  const resize = new ResizeObserver(() => invalidate()); resize.observe(host);
  document.addEventListener('visibilitychange', () => { arrivals.clear(); document.hidden ? stop() : invalidate(); }, { signal: abort.signal });
  motion.addEventListener('change', () => { arrivals.clear(); invalidate(); }, { signal: abort.signal });
  function stop() { cancelAnimationFrame(frame); frame = 0; }
  function invalidate() { if (!disposed && views.length && !document.hidden && !frame) frame = requestAnimationFrame(draw); }
  function ensureRenderer() {
    if (renderer || forceFlat || flatOnly || unsupported || disposed) return;
    try {
      canvas = document.createElement('canvas'); canvas.className = 'crew-stage-canvas'; canvas.setAttribute('aria-hidden', 'true');
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
      renderer.setClearColor(0, 0); renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.35;
      canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); lost = true; arrivals.clear(); stop(); markMode(); }, { signal: abort.signal });
      canvas.addEventListener('webglcontextrestored', () => { lost = false; markMode(); invalidate(); }, { signal: abort.signal });
      host.append(canvas);
    } catch { renderer?.dispose(); renderer = undefined; canvas?.remove(); canvas = undefined; unsupported = true; }
  }
  function markMode() {
    const flat = !renderer || lost || forceFlat || flatOnly;
    if (canvas) canvas.hidden = flat || !views.length;
    for (const v of views) v.element.dataset.crewMode = flat ? '2d' : '3d';
  }
  function material(color: string | number, glow = false) {
    return new THREE.MeshPhysicalMaterial({ color, roughness: .24, metalness: .12, clearcoat: 1,
      clearcoatRoughness: .14, emissive: glow ? color : 0, emissiveIntensity: glow ? .22 : 0 });
  }
  function ellipsoid(parent: THREE.Object3D, color: string | number, x: number, y: number, z: number, sx: number, sy: number, sz: number, glow = false) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), material(color, glow));
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); parent.add(mesh); return mesh;
  }
  function ring(parent: THREE.Object3D, color: string | number, radius: number, thickness: number, x = 0, y = 0, z = 0) {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, thickness, 10, 48), material(color, true));
    mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  }
  function symbol(parent: THREE.Object3D, mark: CrewMark, scale: number, z: number) {
    const paths = new SVGLoader().parse(`<svg xmlns="${NS}"><path d="${CREW_PATHS[mark]}"/></svg>`).paths;
    for (const path of paths) for (const shape of SVGLoader.createShapes(path)) {
      const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 5, bevelEnabled: true, bevelThickness: 1.5, bevelSize: 1.5, bevelSegments: 2, steps: 1 }), material('#fff3c5', true));
      mesh.scale.setScalar(scale); mesh.position.z = z; parent.add(mesh);
    }
  }
  function build(input: CrewViewport, key: string): View {
    const scene = new THREE.Scene(); scene.add(new THREE.HemisphereLight(0xffffff, 0x809bb5, 2));
    const keyLight = new THREE.DirectionalLight(0xfff5dd, 3); keyLight.position.set(-3, 5, 8); scene.add(keyLight);
    const fill = new THREE.DirectionalLight(0x97eaff, 1.4); fill.position.set(5, -2, 6); scene.add(fill);
    const pods = new Map<string, THREE.Group>(), flights = new Map<string, THREE.Mesh>();
    const finale = !input.seat && model!.phase === 'final';
    const seats = input.seat ? model!.seats.filter(s => s.id === input.seat) : finale ? model!.seats.filter(s => s.state !== 'absent') : model!.seats;
    const seatPosition = (seat: typeof seats[number]) => input.seat ? { x: 0, y: .1 } : finale ? finalePosition(seats.indexOf(seat), seats.length) : position(model!.seats.indexOf(seat));
    const podSize = input.seat ? 1 : finale && seats.length <= 3 ? .7 : .48;
    if (!input.seat) {
      // A stylised ship seen from above: pearl hull, coral outriggers and a turquoise canopy.
      ellipsoid(scene, '#dfedf0', 0, -.33, -.55, 5, 1.38, .35);
      ellipsoid(scene, '#f49376', -4.2, -.58, -.4, .86, .74, .28);
      ellipsoid(scene, '#f49376', 4.2, -.58, -.4, .86, .74, .28);
      ellipsoid(scene, '#edf8f6', 0, .75, -.36, 1.4, 1.25, .4);
      ellipsoid(scene, '#2b798a', 0, 1.34, -.02, .91, .52, .29);
      ring(scene, '#a4dfd9', 1.08, .028, 0, .63, -.08);
      for (const x of [-3.2, -1.6, 0, 1.6, 3.2]) ellipsoid(scene, '#91b7c6', x, -1.52, -.25, .38, .12, .12);
      for (let post=0;!finale&&post<5;post++) {
        const a=model!.seats[post*2],b=model!.seats[post*2+1];
        if(a.state==='confirmed'&&b.state==='confirmed') {
          const top=position(post*2),bottom=position(post*2+1);
          ellipsoid(scene,'#ffdc84',top.x,(top.y+bottom.y)/2,.16,.065,(top.y-bottom.y)/2,.07,true);
        }
      }
    }
    for (const seat of seats) {
      const p = seatPosition(seat);
      const group = new THREE.Group(); group.position.set(p.x, p.y, .3); scene.add(group); pods.set(seat.id, group);
      const active = seat.state === 'confirmed', own = !!input.seat;
      const color = active || own && seat.state === 'waiting' ? seat.color : seat.state === 'observing' ? '#b7b3cc' : '#9eb4c2';
      const size = podSize;
      ellipsoid(group, '#f7f9ed', 0, 0, -.1, size * 1.16, size * .94, .26);
      ellipsoid(group, color, 0, .03, .1, size, size * .79, .29, active);
      const rim = ring(group, active ? '#ffdf8b' : '#cbe7e9', size * 1.04, .028, 0, .03, .1); rim.scale.y = .82;
      symbol(group, input.preview ?? seat.mark, own ? .012 : .0055 * size / .48, .42);
      if (seat.state === 'absent') group.scale.setScalar(.65);
      const flight = ellipsoid(scene, seat.color, p.x, p.y, 1, own ? .14 : .10, own ? .14 : .10, .10, true);
      flight.visible = false; flights.set(seat.id, flight);
    }
    const flat = document.createElementNS(NS, 'svg'); flat.classList.add('crew-stage-flat'); flat.setAttribute('aria-hidden', 'true');
    flat.setAttribute('viewBox', input.seat ? '-210 -125 420 250' : '-600 -260 1200 520');
    const hull = input.seat ? '' : '<g class="crew-flat-art"><ellipse cx="0" cy="33" rx="500" ry="138" fill="#e6f0ef" stroke="#a2cbd1" stroke-width="3"/><ellipse cx="-420" cy="58" rx="86" ry="74" fill="#ef957c"/><ellipse cx="420" cy="58" rx="86" ry="74" fill="#ef957c"/><ellipse cx="0" cy="-110" rx="130" ry="85" fill="#e6f0ef"/><ellipse cx="0" cy="-134" rx="91" ry="52" fill="#327f90"/></g>';
    flat.innerHTML = hull;
    if(!input.seat&&!finale)for(let post=0;post<5;post++) {
      if(model!.seats[post*2].state!=='confirmed'||model!.seats[post*2+1].state!=='confirmed')continue;
      const a=position(post*2),b=position(post*2+1),line=document.createElementNS(NS,'line');
      line.classList.add('crew-flat-art');line.setAttribute('x1',String(a.x*100));line.setAttribute('x2',String(b.x*100));line.setAttribute('y1',String(-a.y*100));line.setAttribute('y2',String(-b.y*100));line.setAttribute('stroke','#edc365');line.setAttribute('stroke-width','9');flat.append(line);
    }
    for (const seat of seats) {
      const p = seatPosition(seat), radius = podSize * 100, markScale = input.seat ? 1.2 : .55 * podSize / .48;
      const g = document.createElementNS(NS, 'g'); g.setAttribute('transform', `translate(${p.x * 100},${-p.y * 100})`);
      const color = seat.state === 'confirmed' || input.seat && seat.state === 'waiting' ? seat.color : '#a9bdc7';
      g.innerHTML = `<g class="crew-flat-art" opacity="${seat.state === 'absent' ? .4 : 1}"><ellipse rx="${radius * 1.13}" ry="${radius * .94}" fill="#f7f8ed" stroke="${seat.state === 'confirmed' ? '#e6b854' : '#7d9aa7'}" stroke-width="3"/><ellipse rx="${radius}" ry="${radius * .8}" fill="${color}"/><path d="${CREW_PATHS[input.preview ?? seat.mark]}" fill="#fff7d6" transform="scale(${markScale},${-markScale})"/></g>`;
      if (!input.seat) {
        const label = document.createElementNS(NS, 'text'); label.setAttribute('y', '35'); label.setAttribute('text-anchor', 'middle');
        label.setAttribute('class', 'crew-seat-label'); label.textContent = seat.id; g.append(label);
      }
      flat.append(g);
    }
    input.element.append(flat); resize.observe(input.element);
    return { ...input, key, scene, pods, flights, flat };
  }
  function release(v: View) {
    resize.unobserve(v.element); v.flat.remove(); delete v.element.dataset.crewMode;
    v.scene.traverse(object => { const mesh = object as THREE.Mesh; mesh.geometry?.dispose(); if (mesh.material) for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m.dispose(); }); v.scene.clear();
  }
  function draw(now: number) {
    frame = 0; markMode();
    if (!renderer || lost || flatOnly || forceFlat || document.hidden || !views.length) return;
    const bounds = host.getBoundingClientRect(); if (!bounds.width || !bounds.height) return;
    if (canvas && !canvas.isConnected) host.append(canvas);
    // At 4K, keep this decorative layer below 2.4 megapixels. No post-processing or shadows.
    const dpr = Math.min(devicePixelRatio || 1, 1.25, Math.sqrt(2400000 / (bounds.width * bounds.height)));
    if (renderer.getPixelRatio() !== dpr) renderer.setPixelRatio(dpr);
    const size = renderer.getSize(new THREE.Vector2());
    if (size.x !== Math.round(bounds.width) || size.y !== Math.round(bounds.height)) renderer.setSize(Math.round(bounds.width), Math.round(bounds.height), false);
    renderer.setScissorTest(false); renderer.clear(); renderer.setScissorTest(true);
    const moving = !reduced && !motion.matches && !paused;
    for (const v of views) {
      const r = v.element.getBoundingClientRect(); if (!r.width || !r.height || !v.element.isConnected) continue;
      const x = v.seat ? 2.1 : 6, y = v.seat ? 1.25 : 2.6, aspect = r.width / r.height;
      camera.left = -Math.max(x, y * aspect); camera.right = -camera.left;
      camera.top = Math.max(y, x / aspect); camera.bottom = -camera.top; camera.updateProjectionMatrix();
      for (const [id, pod] of v.pods) {
        const time = arrivals.get(id), progress = moving && time !== undefined ? Math.min(1, (now - time) / 1100) : 1;
        const seat = model!.seats.find(s => s.id === id)!;
        const lift = progress < 1 ? Math.sin(progress * Math.PI) : 0;
        pod.scale.setScalar((seat.state === 'absent' ? .65 : 1) * (1 + lift * .12));
        const flight = v.flights.get(id)!; flight.visible = progress < .8;
        if (flight.visible) {
          const p = Math.min(1, progress / .8), blend = 1 - Math.pow(1 - p, 3);
          flight.position.set(pod.position.x + (1 - blend) * (v.seat ? 1.6 : (id.endsWith('A') ? -2 : 2)), pod.position.y - (1 - blend) * 2 + Math.sin(p * Math.PI) * .65, 1);
        }
      }
      renderer.setViewport(r.left - bounds.left, bounds.bottom - r.bottom, r.width, r.height);
      renderer.setScissor(Math.max(0, r.left - bounds.left), Math.max(0, bounds.bottom - r.bottom), Math.max(0, Math.min(r.right, bounds.right) - Math.max(r.left, bounds.left)), Math.max(0, Math.min(r.bottom, bounds.bottom) - Math.max(r.top, bounds.top)));
      renderer.render(v.scene, camera);
    }
    for (const [id, time] of arrivals) if (!moving || now - time >= 1100) arrivals.delete(id);
    if (arrivals.size) invalidate();
  }
  return {
    update(next: CrewRelay, inputs: CrewViewport[], settings: { reduced: boolean; paused: boolean; flat?: boolean }) {
      if (disposed) return;
      const settingsChanged=reduced!==settings.reduced||paused!==settings.paused||flatOnly!==(settings.flat===true||forceFlat);
      reduced = settings.reduced; paused = settings.paused;
      const wasFlat = flatOnly; flatOnly = settings.flat === true || forceFlat;
      const confirmed = new Set(next.seats.filter(s => s.state === 'confirmed').map(s => s.id));
      if (epoch !== next.epoch) { arrivals.clear(); epoch = next.epoch; }
      else if (!reduced && !paused && !motion.matches && !document.hidden) for (const id of confirmed) if (!previous.has(id)) arrivals.set(id, performance.now());
      previous = confirmed; model = next;
      if (paused || reduced || flatOnly) arrivals.clear();
      const retained: View[] = [];
      let changed=settingsChanged;
      for (const input of inputs) {
        const key = JSON.stringify([input.seat ? next.seats.find(s => s.id === input.seat) : next.seats, input.preview, input.pending, next.phase]);
        const old = views.find(v => v.element === input.element && v.key === key);
        if(!old)changed=true;
        retained.push(old ?? build(input, key));
      }
      for (const old of views) if (!retained.includes(old)) {changed=true;release(old);}
      views = retained;
      if (!views.length) { stop(); markMode(); return; }
      ensureRenderer(); if (canvas && !canvas.isConnected) host.append(canvas);
      for(const v of views)resize.observe(v.element);
      // Re-mark after releases: an old view may have shared its element with the new one.
      markMode(); if (wasFlat !== flatOnly) arrivals.clear(); if(changed||arrivals.size)invalidate();
    },
    clear() { stop(); arrivals.clear(); epoch='';previous.clear();for (const v of views) release(v); views = []; markMode(); },
    dispose() { this.clear(); disposed = true; abort.abort(); resize.disconnect(); renderer?.dispose(); canvas?.remove(); },
  };
}
