import * as THREE from 'three';

const palette = [0xffce68, 0x7cceaa, 0xa9abf3];
const names = ['Siwarha · Planeta Luminii', 'Planeta Naturii', 'Planeta de Cristal · Atelierul Mann'];

/** A small fictional world beside the real instrument. It never sends a game event.
 * Low resolution, 24 fps ceiling, no shadows or post-processing, SVG on GPU loss. */
export function createStoryWorld() {
  const element = document.createElement('span'); element.className = 'story-world'; element.hidden = true;
  element.setAttribute('aria-hidden', 'true');
  const flat = document.createElement('span'); flat.className = 'story-world-flat'; element.append(flat);
  let renderer: THREE.WebGLRenderer | undefined, scene: THREE.Scene | undefined, planet: THREE.Group | undefined;
  let frame = 0, last = 0, stage = 0, reduced = false, solved = false, visible = true, failed = false, disposed = false;
  const abort = new AbortController(), media = matchMedia('(prefers-reduced-motion: reduce)');
  const camera = new THREE.PerspectiveCamera(36, 1, .1, 20); camera.position.set(0, .15, 4.5);
  const stop = () => { if (frame) cancelAnimationFrame(frame); frame = 0; };
  const observer = new IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting); if (visible) schedule(); else stop(); });
  observer.observe(element);
  function schedule() { if (!disposed && !frame && renderer && stage && visible && !document.hidden) frame = requestAnimationFrame(draw); }
  function draw(now: number) {
    frame = 0; if (!renderer || !scene || !planet || disposed || document.hidden || !visible) return;
    const moving = !reduced && !media.matches;
    if (!last || now - last >= 1000 / 24 || !moving) {
      planet.rotation.y = moving ? Math.sin(now / 4200) * .12 : 0;
      planet.rotation.z = moving ? Math.sin(now / 5000) * .04 : 0;
      renderer.render(scene, camera); last = now;
    }
    if (moving) schedule();
  }
  function releaseScene() {
    scene?.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
    });
    scene?.clear(); scene = undefined; planet = undefined;
  }
  function mesh(geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation, x = 0, y = 0, z = 0, luminous = false) {
    const material = new THREE.MeshStandardMaterial({ color, roughness: .32, metalness: .05, emissive: luminous ? color : 0x000000, emissiveIntensity: luminous ? .25 : 0 });
    const item = new THREE.Mesh(geometry, material); item.position.set(x, y, z); planet!.add(item); return item;
  }
  function build() {
    releaseScene();
    scene = new THREE.Scene(); planet = new THREE.Group(); scene.add(planet);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8ba5b9, 2));
    const key = new THREE.DirectionalLight(0xfff9ea, 3); key.position.set(-2, 4, 5); scene.add(key);
    const color = palette[stage - 1];
    mesh(new THREE.SphereGeometry(.69, 28, 20), color);
    if (stage === 1) {
      const ring = mesh(new THREE.TorusGeometry(.94, .036, 8, 48), 0xffe496); ring.rotation.x = .7; ring.rotation.y = .2;
      for (let i = 0; i < 7; i++) {
        const angle = i * Math.PI * 2 / 7;
        const shard = mesh(new THREE.OctahedronGeometry(.1, 0), i % 2 ? 0xffebae : 0xffb896, Math.cos(angle) * 1.01, Math.sin(angle) * 1.01, -.15, true);
        shard.rotation.z = angle;
      }
    } else if (stage === 2) {
      for (const [x, y, size] of [[-.48, .53, .22], [.14, .73, .25], [.53, .45, .2]]) {
        mesh(new THREE.CylinderGeometry(.035, .04, .25, 8), 0x846852, x, y - .12, 0);
        mesh(new THREE.SphereGeometry(size, 12, 10), 0x3d996e, x, y + .03, 0);
        mesh(new THREE.SphereGeometry(size * .65, 12, 10), 0xaeeab5, x + .08, y + .12, .02);
      }
      const river = mesh(new THREE.TorusGeometry(.72, .045, 8, 40, Math.PI * .85), 0xa5e6ee, 0, 0, .05);
      river.rotation.z = Math.PI * 1.02; river.rotation.x = .65;
    } else {
      for (const [x, y, size] of [[-.48, .58, .3], [.04, .78, .37], [.46, .53, .26]]) {
        const crystal = mesh(new THREE.ConeGeometry(size * .45, size * 1.8, 5), x < 0 ? 0xbdefff : 0xe6c5ff, x, y, 0);
        crystal.rotation.z = -x * .45;
      }
      const ring = mesh(new THREE.TorusGeometry(.88, .026, 8, 40), 0xecdcff); ring.rotation.x = 1.15; ring.rotation.z = -.3;
    }
    // A gentle toy-like face makes the graphic clearly imaginative, not a scientific planet model.
    for (const x of [-.19, .19]) {
      const eye = mesh(new THREE.SphereGeometry(.047, 10, 8), 0x213d56, x, .015, .665); eye.scale.y = 1.22;
      mesh(new THREE.SphereGeometry(.014, 8, 6), 0xffffff, x - .012, .032, .706);
      const cheek = mesh(new THREE.SphereGeometry(.06, 10, 8), 0xf1a69d, x * 1.48, -.085, .631); cheek.scale.set(1, .45, .2);
    }
    const smile = mesh(new THREE.TorusGeometry(.07, .014, 6, 16, Math.PI), 0x213d56, 0, -.06, .698); smile.rotation.z = Math.PI;
    if (solved) {
      const sparkle = mesh(new THREE.OctahedronGeometry(.1, 0), 0xfff0a4, .8, -.65, .1, true); sparkle.scale.y = 1.5;
    }
    last = 0;
  }
  function fallback() {
    const tint = ['#ffd57b', '#9ddfbb', '#c0bcfa'][stage - 1];
    const crown = stage === 1 ? '<path d="M18 19l3-9 3 9 9 3-9 3-3 9-3-9-9-3zM76 66l2-6 2 6 6 2-6 2-2 6-2-6-6-2z" fill="#ffc76c"/>' : stage === 2 ? '<path d="M30 29V15M65 28V12" stroke="#759b65" stroke-width="4"/><circle cx="30" cy="14" r="10" fill="#55aa80"/><circle cx="65" cy="12" r="11" fill="#84d39d"/>' : '<path d="M28 31l-8-16 13-8 9 22M44 26l4-23 12 6 1 20M63 31l7-19 12 7-6 18" fill="#b7e7f8" stroke="#9f95db" stroke-width="2"/>';
    flat.innerHTML = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${crown}<ellipse cx="50" cy="86" rx="30" ry="5" fill="#305874" opacity=".09"/><circle cx="50" cy="52" r="31" fill="${tint}"/><ellipse cx="42" cy="39" rx="19" ry="10" fill="white" opacity=".2"/><ellipse cx="41" cy="53" rx="2.5" ry="3.4" fill="#213d56"/><ellipse cx="59" cy="53" rx="2.5" ry="3.4" fill="#213d56"/><path d="M46 60q4 5 8 0" fill="none" stroke="#213d56" stroke-width="2" stroke-linecap="round"/><ellipse cx="34" cy="60" rx="4" ry="2" fill="#eda697"/><ellipse cx="66" cy="60" rx="4" ry="2" fill="#eda697"/></svg>`;
  }
  function ensure() {
    if (renderer || failed || reduced || media.matches) return;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
      renderer.setPixelRatio(1); renderer.setSize(96, 96); renderer.setClearColor(0, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); failed = true; stop(); renderer?.domElement.remove(); element.dataset.mode = 'flat'; }, { signal: abort.signal });
      element.append(renderer.domElement); element.dataset.mode = '3d';
    } catch { failed = true; renderer?.dispose(); renderer = undefined; }
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else schedule(); }, { signal: abort.signal });
  media.addEventListener('change', () => { stop(); schedule(); }, { signal: abort.signal });
  return {
    element,
    update(nextStage: number, quiet: boolean, confirmed: boolean) {
      const changed = stage !== nextStage || solved !== confirmed;
      stage = nextStage; reduced = quiet; solved = confirmed; element.hidden = !stage;
      if (!stage) { stop(); return; }
      element.title = names[stage - 1];
      if (changed) { fallback(); build(); }
      ensure(); if (failed) return;
      stop(); schedule();
    },
    dispose() { disposed = true; stop(); observer.disconnect(); abort.abort(); releaseScene(); renderer?.dispose(); renderer?.forceContextLoss(); element.remove(); },
  };
}
