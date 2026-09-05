import type { Post, ScenarioProgress, Zone } from './scenario-engine';
import type { EducationForm, EducationObject, EducationVisual } from './education-visual';

/** Values evaluated by the authoritative engine, never inferred from UI prose. */
export interface EducationContext {
  shapes: [EducationForm, EducationForm];
  observation: string;
  measurement?: string;
  attachmentMeasurement?: string;
  ruleA?: string;
  ruleB?: string;
  before?: string;
  after?: string;
  sensors?: [string, string];
  domain: string;
  subject: string;
  budget: number;
  coverageUnit: string;
}
const label: Record<string, string> = {
  far: 'Își păstrează ritmul', relay: 'Repetă ce trimitem', uncertain: 'Nu știm încă', insufficient: 'Nu avem suficiente dovezi',
  propose: 'Propune echipajului', execute: 'Poate acționa singur', always: 'Cere mereu acordul', conflict: 'Cere acordul când senzorii diferă',
  'attach:repeated': 'Două ritmuri diferite, ambele repetate', 'attach:single': 'Un singur ritm testat', 'attach:none': 'Nu am trimis un ritm nou',
  'attach:identity': 'Nu știm cine trimite semnalul', wide: 'Trei zone cercetate', fine: 'O zonă cercetată în detaliu',
  protect: 'Raport verificat', passive: 'Raport nefiltrat',
  linked: 'Drumul ajunge la felinar', found: 'Ai găsit piesa', fitted: 'Piesa este la locul ei', keep: 'Păstrezi regula',
};
const selected = (value?: string): EducationObject['state'] => !value ? 'missing' : ['observe', 'abstain'].includes(value) ? 'observed' : 'confirmed';
const participation = (value?: string) => !value ? 'Alege când ești gata.' : value === 'observe' ? 'Ai ales să privești.' : value === 'abstain' ? 'Ai ales să păstrezi ce ai.' : `${label[value] || value}.`;
const node = (id: string, text: string, form: EducationForm, state: EducationObject['state'], x: number, y = 0): EducationObject => ({ id, label: text, form, state, x, y });

/** Read-only diagram model. The engine supplies evaluated rules and authored observations. */
export function educationFacts(p: ScenarioProgress, stage: number, post: Post, zone: Zone, c: EducationContext): EducationVisual | undefined {
  if (p.profile === 'legacy-v3' || ![1, 2, 3].includes(stage)) return undefined;
  const z = p.zones[`${post}${zone}`], choice = z.choices[String(stage)];
  const result: EducationVisual = { kind: 'pieces', title: '', caption: '', objects: [], links: [], facts: [] };
  if (p.profile === 'age-5-10') {
    const shape = c.shapes[zone === 'A' ? 0 : 1];
    result.title = stage === 1 ? 'Piesa ta pentru felinar' : stage === 2 ? 'Așază piesa în felinar' : 'Aprindem felinarul';
    result.caption = stage === 3 ? 'Două drumuri ajung la lumină: al tău și al colegului.' : stage === 2 ? 'Potrivește semnul auriu al piesei cu semnul de sus.' : 'Privește conturul și găsește aceeași formă.';
    if (stage === 3) {
      for (const [n, side] of (['A', 'B'] as const).entries()) {
        const v = p.zones[`${post}${side}`].choices['3'];
        result.objects.push(node(side, `${side} · ${v === 'linked' ? 'la felinar' : v === 'observe' ? 'privește' : 'liber'}`, c.shapes[n], selected(v), n ? 2 : -2));
      }
      if (result.objects.every(o => o.state === 'confirmed')) result.links.push(['A', 'B']);
      result.facts = [participation(choice), 'Felinarul se aprinde când amândoi găsiți drumul.'];
    } else {
      result.objects.push(node('piece', shape, shape, choice ? selected(choice) : 'available', stage === 2 && choice !== 'fitted' ? -2 : 0));
      if (stage === 2) {
        result.objects[0].keyMarker = true;
        result.objects[0].quarterTurns = z.game?.rotation ?? 0;
        if (choice !== 'fitted') result.objects.push({ ...node('socket', 'Locul piesei', shape, 'missing', 2), keyMarker: true, quarterTurns: 0 });
      }
      result.facts = stage === 1 ? [choice === 'found' ? `Ai găsit piesa: ${shape}.` : participation(choice)] : [z.choices['1'] === 'found' ? 'Ai găsit piesa pe Siwarha.' : 'Natura ți-a dăruit această piesă.', choice === 'fitted' ? 'Piesa este la locul ei.' : choice === 'observe' ? participation(choice) : z.builder.length ? (z.game?.rotation ? 'Ai luat piesa. Rotește-o până când semnul auriu ajunge sus.' : 'Semnul auriu este sus. Acum așază piesa.') : 'Ia piesa, rotește-o și așaz-o în felinar.'];
    }
  } else if (p.profile === 'age-10-15') {
    result.kind = 'signals';
    result.title = stage === 1 ? 'Două explicații posibile' : stage === 2 ? 'Ce trimitem și ce primim' : 'Ce ne arată testele';
    result.caption = 'Prima explicație: semnalul păstrează 2–2–2. A doua: repetă ritmul trimis de noi.';
    if (stage === 1) {
      result.objects = [node('far', 'Păstrează 2–2–2', 'beacon', choice === 'far' ? 'confirmed' : 'available', -2), node('relay', 'Repetă ce trimitem', 'gate', choice === 'relay' ? 'confirmed' : 'available', 2)];
      result.facts = [c.observation, participation(choice), 'Ritmul 2–2–2 se potrivește ambelor explicații. Avem nevoie de un test nou.'];
    } else {
      // Sequence cards retain the exact intervals. Layout is categorical, not a time axis.
      // The caption states that +2 s translates the entire response, not each interval.
      const probes = p.probes.slice(0, 2);
      for (const [i, probe] of probes.entries()) {
        const intervals = probe.split('-').map(Number), sequence = intervals.join('–'), code = i ? 'R' : 'K';
        result.objects.push({ ...node(`${code}-sent`, `${code} trimis: ${sequence}`, 'card', 'confirmed', -2, i ? -.6 : .6), intervals: [...intervals], offsetSeconds: 0 });
        result.objects.push({ ...node(`${code}-received`, `${code} primit: ${sequence}`, 'card', 'confirmed', 2, i ? -.6 : .6), intervals: [...intervals], offsetSeconds: 2 });
        result.links.push([`${code}-sent`, `${code}-received`]);
      }
      if (!probes.length) result.objects = [node('no-probe', 'Primul test', 'card', 'missing', 0)];
      if (stage === 2 && probes.length < 2) {
        for (let j = 0; j < 3; j++) result.objects.push(node(`builder-${j}`, z.builder[j] ? `${z.builder[j]} s` : 'Alege un interval', 'card', z.builder[j] ? 'available' : 'missing', (j - 1) * 2, -.8));
        if (!probes.length && post === 1 && zone === 'B' && choice === 'measure:0') {
          result.objects.push(node('uncertainty-low', '11°', 'beacon', 'observed', -2, .8), node('angle', '12° ±1°', 'beacon', 'confirmed', 0, .8), node('uncertainty-high', '13°', 'beacon', 'observed', 2, .8));
          result.links.push(['uncertainty-low', 'angle'], ['angle', 'uncertainty-high']);
        }
      }
      const rows = probes.map((probe, i) => `${i ? 'R' : 'K'}: ${probe} → ${probe}; decalaj +2 s.`).join(' ');
      const pending = z.pendingVerdict ? `Concluzia ta: ${label[z.pendingVerdict] || z.pendingVerdict}; alege acum dovada.` : participation(choice);
      const attachment = c.attachmentMeasurement || (z.attachment ? label[z.attachment] || z.attachment : 'Alege observația care îți susține concluzia.');
      result.facts = stage === 2 ? [rows || 'Echipajul nu a trimis încă un ritm nou.', `Ritmul tău: ${z.builder.join('–') || 'alege ordinea'}. Ai trimis ${z.probes.length} din 2 teste.`, c.measurement || (choice === 'observe' ? 'Ai ales să privești. Nu ai făcut o măsurătoare la acest post.' : 'Poți folosi și instrumentele postului pentru a căuta indicii.')] : [rows || 'Încă nu avem un test nou de comparat.', z.choices['3'] ? participation(choice) : pending, attachment];
      result.caption = stage === 2 ? 'În acest exercițiu, răspunsul începe cu 2 s mai târziu. Intervalele rămân aceleași; întârzierea nu măsoară distanța.' : 'Comparăm ritmul fix 2–2–2 cu repetarea probei. Testele nu ne spun cine trimite semnalul.';
    }
  } else if (p.profile === 'age-15-18') {
    result.kind = 'mandate';
    result.title = stage === 3 ? 'Ultimul test, înainte și după' : stage === 2 ? 'Pilotul automat la încercare' : 'Voi stabiliți regulile';
    result.caption = 'Doi senzori pot indica același lucru și totuși să greșească. Verificăm ce face pilotul după regulile voastre.';
    result.objects = [node('authority', `A · ${c.ruleA ? label[c.ruleA] : 'alege regula'}`, 'gate', c.ruleA ? 'confirmed' : 'missing', -2), node('confirmation', `B · ${c.ruleB ? label[c.ruleB] : 'alege regula'}`, 'gate', c.ruleB ? 'confirmed' : 'missing', 2)];
    if (c.ruleA && c.ruleB) result.links.push(['authority', 'confirmation']);
    if (c.sensors) result.objects.push(...c.sensors.map((v, i) => node(`sensor-${i}`, v, 'beacon', 'confirmed', i ? 2 : -2, -.8)));
    result.facts = stage === 1 ? [c.domain, participation(choice), 'A alege ce poate face pilotul. B alege când cere acordul echipajului.'] : stage === 2 ? [c.domain, c.before || (z.choices['2'] === 'observe' ? 'Ai ales să urmărești testele.' : 'Alege o situație și urmărește ce face pilotul.'), 'Compară cele două situații: ce se întâmplă când senzorii nu sunt de acord?'] : [c.before ? `Înainte: ${c.before}` : 'Nu ai rulat încă un test pe care să-l comparăm.', c.after ? `Acum: ${c.after}` : 'După un test putem vedea ce schimbă noua regulă.', participation(choice)];
  } else {
    result.kind = stage === 3 ? 'archive' : 'resources';
    result.title = stage === 3 ? 'Ce află următorul echipaj' : stage === 2 ? 'Ce merită verificat' : 'Cum folosești rezerva';
    result.caption = stage === 3 ? 'Poți trimite un singur document. Celelalte rămân în arhiva locală.' : 'Ai două credite pentru cercetare și verificare. Datele sunt pregătite pentru acest exercițiu.';
    if (stage === 3) {
      for (const [n, [id, available, description]] of ([['observation', ['wide', 'fine'].includes(z.choices['1']), 'Harta observațiilor'], ['probe', ['protect', 'passive'].includes(z.choices['2']), 'Raportul sondei']] as const).entries()) {
        const status = !available ? 'lipsește' : choice === id ? 'trimis' : 'în arhivă';
        result.objects.push(node(id, `${description} · ${status}`, 'card', !available ? 'missing' : choice === id ? 'confirmed' : 'available', n ? 2 : -2));
      }
      result.facts = [c.subject, `Observație: ${z.choices['1'] === 'wide' ? `ai cercetat 3 ${c.coverageUnit}` : label[z.choices['1']] || (z.choices['1'] === 'abstain' ? 'ai păstrat rezerva' : 'nu ai cercetat încă')}; sondă: ${label[z.choices['2']] || (z.choices['2'] === 'abstain' ? 'nu ai cerut un raport' : 'încă nu ai un raport')}.`, choice === 'observation' ? 'Ai trimis harta observațiilor.' : choice === 'probe' ? 'Ai trimis raportul sondei.' : choice === 'abstain' ? 'Ai păstrat documentele în arhiva locală.' : participation(choice)];
    } else {
      for (let n = 0; n < 2; n++) result.objects.push(node(`budget-${n}`, n < c.budget ? 'Disponibil' : 'Folosit', 'beacon', n < c.budget ? 'available' : 'missing', n ? .65 : -.65, -.8));
      const v = stage === 1 ? z.choices['1'] : z.choices['2'];
      if (stage === 1 && ['wide', 'fine'].includes(v)) for (let n = 0; n < (v === 'wide' ? 3 : 1); n++) result.objects.push(node(`sector-${n}`, v === 'wide' ? `Sector ${n + 1}` : 'Zonă în detaliu', 'card', 'confirmed', v === 'wide' ? (n - 1) * 2 : 0, .5));
      if (stage === 2) result.objects.push(node('probe', v === 'protect' ? 'Raport verificat' : v === 'passive' ? 'Raport nefiltrat' : 'Raportul sondei', 'card', selected(v), 0, .5));
      result.facts = [c.subject, `Mai ai ${c.budget} din 2 credite.`, v === 'wide' ? `Ai cercetat 3 ${c.coverageUnit}, cu mai puține detalii în fiecare.` : participation(v)];
    }
  }
  return result;
}
