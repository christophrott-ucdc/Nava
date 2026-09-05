/** Deterministic, JSON-only expedition mechanics. The host owns authorization and cue windows. */
export type ScenarioId = 'legacy-v3' | 'age-5-10' | 'age-10-15' | 'age-15-18' | 'adults';
export type Post = 1 | 2 | 3 | 4 | 5;
export type Zone = 'A' | 'B';
export interface ScenarioAction { stage: number; post: Post; zone: Zone; action: string; value?: string }
export interface ZoneProgress {
  choices: Record<string, string>;
  builder: number[];
  probes: string[];
  constructing: boolean;
  pendingVerdict?: string;
  attachment?: string;
}
export interface ScenarioProgress { version: 1; profile: ScenarioId; zones: Record<string, ZoneProgress>; probes: string[] }
export interface ZoneView {
  heading: string; instruction: string; detail: string;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  completed: boolean; kind?: string; items?: Array<{ id: string; label: string }>;
}
const titles: Record<ScenarioId, string> = { 'legacy-v3': 'A Patra Lume', 'age-5-10': 'Bucățile de acasă', 'age-10-15': 'Semnalul fără semnătură', 'age-15-18': 'Dreptul de a schimba cursul', adults: 'Ce lăsăm deschis' };
const posts = ['Navigație', 'Propulsie', 'Comunicații', 'Biosemnale', 'Memorie'];
const shapes = [['Cerc', 'Semilună'], ['Aripă', 'Flacără'], ['Undă', 'Clopoțel'], ['Frunză', 'Picătură'], ['Stea', 'Spirală']];
const distractors = [['Frunză', 'Aripă'], ['Aripă', 'Picătură'], ['Picătură', 'Cerc'], ['Frunză', 'Stea'], ['Stea', 'Semilună'], ['Cerc', 'Frunză'], ['Aripă', 'Undă'], ['Stea', 'Cerc'], ['Picătură', 'Clopoțel'], ['Frunză', 'Aripă']];
const objects = [['Conturul unui culoar', 'Mișcarea marginii culoarului'], ['Pierderile sondei', 'Variația consumului'], ['Intensitatea unei emisii', 'Repetiția emisiei'], ['Ritmul unei rețele', 'Legăturile rețelei'], ['Succesiunea observațiilor', 'Diferența dintre două citiri']];
const units = ['sectoare', 'intervale', 'benzi', 'zone', 'momente'];
const domains = ['Hartă de studiu', 'Profil de motor virtual', 'Mesaj local de test', 'Pragul unui senzor simulat', 'Indexul unei copii de arhivă'];
const sensorCases = [['EST', 'VEST', 'NORD', 'SUD'], ['LIN', 'RAPID', 'STABIL', 'PULSAT'], ['CUTIA 1', 'CUTIA 2', 'CUTIA 3', 'CUTIA 4'], ['NIVEL 2', 'NIVEL 4', 'NIVEL 3', 'NIVEL 5'], ['DUPĂ DATĂ', 'DUPĂ TITLU', 'DUPĂ LOC', 'DUPĂ COD']];
const observations = [
  'Semnal detectat în aceeași direcție de trei ori.', 'Unghiuri 12°, 12°, 12°; sursa poate fi fixă în ambele modele.',
  'Puterea recepționată are trei niveluri egale.', 'Consumul emițătorului nu este măsurat. Puterea nu identifică sursa.',
  'Recepția inițială: intervale 2, 2, 2 secunde.', 'Ambele modele pot produce această recepție regulată.',
  'Niciun senzor biologic conectat la sursă.', 'Asemănarea cu un puls nu dovedește viață.',
  'Recepția veche: intervale 2, 2, 2 secunde.', 'Proba trimisă atunci lipsește; nu avem comparația.',
];
const measures: Array<Array<[string, string]>> = [
  [['Măsoară direcția', '12°, 12°, 12°; sursă aparent fixă.'], ['Măsoară distanța', 'Instrument indisponibil; distanță necunoscută.']],
  [['Repetă unghiul', '12° ±1°; precizie cunoscută.'], ['Schimbă reperul', '32° față de un reper rotit cu 20°; aceeași direcție.']],
  [['Citește puterea', '4 unități în ambele recepții; nu separă modelele.'], ['Citește consumul', 'Sursă inaccesibilă; consum necunoscut.']],
  [['Verifică stabilitatea', 'Fluctuație 0,1 unități; stabil în limita instrumentului.'], ['Verifică saturația', 'Senzor nesaturat; nivel măsurabil.']],
  [['Măsoară intervalele', 'Recepția veche: 2–2–2.'], ['Repetă proba veche', '2–2–2 trimis și primit; ambele modele rămân posibile.']],
  [['Compară intervalele', 'Recepție 2–2–2, fără informație despre cauză.'], ['Numără pierderile', 'Zero impulsuri pierdute în recepția selectată.']],
  [['Caută senzorul', 'Niciun senzor biologic la sursă; viața nu poate fi evaluată.'], ['Compară un puls', 'Asemănare de desen, insuficientă pentru origine biologică.']],
  [['Verifică eticheta', 'Date electromagnetice, nu măsurare biologică.'], ['Cere o probă biologică', 'Nicio probă disponibilă; întrebare deschisă.']],
  [['Caută recepția veche', '2–2–2, fără proba de intrare arhivată.'], ['Caută expeditorul', 'Semnătură absentă; identitate necunoscută.']],
  [['Caută probe noi', 'Arhiva inițială nu conține probe cu intervale diferite.'], ['Verifică ceasurile', 'Diferență 0,0 s în simulare; ceasuri aliniate.']],
];
const key = (post: number, zone: Zone) => `${post}${zone}`;
const index = (post: number, zone: Zone) => (post - 1) * 2 + (zone === 'B' ? 1 : 0);
const option = (value: string, label: string, disabled = false) => ({ value, label, disabled });
const observe = () => option('observe', 'Doar privesc');
const substantive = (v?: string) => !!v && v !== 'observe' && v !== 'abstain';
const labels: Record<string, string> = {
  far: 'far independent', relay: 'releu', uncertain: 'încă nu aleg', insufficient: 'date insuficiente',
  observe: 'observare', abstain: 'abținere', wide: 'largă', fine: 'fină', protect: 'sondă protejată; pauză 3 s; zgomot redus',
  passive: 'citire continuă; zgomot ridicat', observation: 'observația', probe: 'raportul sondei',
  propose: 'doar propune', execute: 'poate executa', always: 'confirmare mereu', conflict: 'la conflict', agree: 'acord',
  'attach:repeated': 'K + R copiate', 'attach:single': 'o singură probă', 'attach:none': 'fără probe noi', 'attach:identity': 'identitate necunoscută',
};
const display = (value: string | undefined, fallback: string) => value ? labels[value] || value : fallback;
export function createProgress(profile: ScenarioId): ScenarioProgress {
  const zones: Record<string, ZoneProgress> = {};
  for (let p = 1; p <= 5; p++) for (const z of ['A', 'B'] as const) zones[key(p, z)] = { choices: {}, builder: [], probes: [], constructing: false };
  return { version: 1, profile, zones, probes: [] };
}
function energy(z: ZoneProgress): number { return 2 - (z.choices['1'] === 'fine' ? 2 : z.choices['1'] === 'wide' ? 1 : 0) - (z.choices['2'] === 'protect' ? 1 : 0); }
function rule(z: ZoneProgress, revised: boolean): string | undefined {
  const amended = z.choices['3'];
  return revised && substantive(amended) && amended !== 'keep' ? amended : substantive(z.choices['1']) ? z.choices['1'] : undefined;
}
function mandate(p: ScenarioProgress, post: number, test: string, revised: boolean): string {
  const a = rule(p.zones[key(post, 'A')], revised), b = rule(p.zones[key(post, 'B')], revised);
  if (!a || !b) return 'MANDAT INCOMPLET — lipsește o regulă';
  if (a === 'propose') return 'PROPUNERE — autoritate: doar propune';
  if (b === 'always') return 'AȘTEAPTĂ CONFIRMARE — confirmare cerută pentru orice caz';
  if (test === 'conflict') return 'AȘTEAPTĂ CONFIRMARE — senzorii diferă';
  return 'EXECUTAT ÎN SIMULARE — senzorii sunt de acord';
}
function localMeasure(p: ScenarioProgress, post: number, zone: Zone): string | undefined {
  const choice = p.zones[key(post, zone)].choices['2'];
  return choice?.startsWith('measure:') ? measures[index(post, zone)][Number(choice.slice(8))]?.[1] : undefined;
}
function evidence(p: ScenarioProgress): string { return p.probes.length ? p.probes.slice(0, 2).map((v, i) => `${i === 0 ? 'K' : 'R'}: ${v} → ${v} (+2 s)`).join(' · ') + (p.probes.length > 2 ? ` · ${p.probes.length - 2} probe suplimentare în dosar.` : '') : 'Fără probe noi trimise.'; }
function attachmentOptions(p: ScenarioProgress, post: number) {
  const result = [option(p.probes.length >= 2 ? 'attach:repeated' : p.probes.length === 1 ? 'attach:single' : 'attach:none', p.probes.length >= 2 ? 'K + R copiate' : p.probes.length === 1 ? 'O singură probă' : 'Fără probe noi'), option('attach:identity', 'Identitate necunoscută')];
  for (const zone of ['A', 'B'] as const) { const m = localMeasure(p, post, zone); if (m) result.push(option(`attach:local:${zone}`, `${zone}: ${m}`)); }
  return result;
}
function zoneView(p: ScenarioProgress, stage: number, post: Post, zone: Zone): ZoneView {
  const z = p.zones[key(post, zone)], i = index(post, zone), choice = z.choices[String(stage)];
  const v: ZoneView = { heading: `${posts[post - 1]} · ${zone}`, instruction: '', detail: '', options: [], completed: !!choice };
  if (p.profile === 'legacy-v3' || ![1, 2, 3].includes(stage)) return v;
  if (p.profile === 'age-5-10') {
    const shape = shapes[post - 1][zone === 'A' ? 0 : 1];
    v.kind = ['visual-match', 'paired-fit', 'latched-pair'][stage - 1];
    v.instruction = ['Găsește forma de sus', 'Pune piesa în contur', 'Atinge capătul tău de fir'][stage - 1];
    v.items = [{ id: 'shape', label: shape }];
    v.detail = stage === 1 ? `Forma de sus: ${shape}` : stage === 2 ? `${shape} · ${z.choices['1'] === 'found' ? 'Piesă găsită pe Siwarha' : 'Piesă primită de la Natură'}` : `${p.zones[key(post, zone === 'A' ? 'B' : 'A')].choices['3'] === 'linked' ? 'Celălalt capăt este prins.' : 'Fiecare capăt rămâne prins independent.'}`;
    if (!choice) v.options = stage === 1 ? [shape, ...distractors[i]].map(s => option(`shape:${s}`, s)).concat(observe()) : stage === 2 ? z.builder.length ? [option('fit', `Așază ${shape} în contur`), observe()] : [option('select', `Atinge piesa: ${shape}`), observe()] : [option('link', 'Prinde capătul meu'), observe()];
    if (choice) v.detail += choice === 'observe' ? ' · Poți privi.' : stage === 1 ? ' · Bucată găsită.' : stage === 2 ? ' · Piesa ta este așezată.' : ' · Capătul tău rămâne prins.';
  } else if (p.profile === 'age-10-15') {
    v.kind = stage === 2 ? 'probe-builder' : stage === 3 ? 'evidence-verdict' : 'hypothesis';
    v.instruction = stage === 1 ? 'Propune o explicație' : stage === 2 ? 'Măsoară, apoi construiește o probă' : z.pendingVerdict ? 'Leagă o dovadă sau o limită' : 'Alege verdictul';
    v.detail = stage === 1 ? observations[i] : `${evidence(p)}${localMeasure(p, post, zone) ? ` · ${localMeasure(p, post, zone)}` : ''}`;
    if (stage === 1 && !choice) v.options = [option('far', 'Far independent'), option('relay', 'Releu'), option('uncertain', 'Încă nu aleg'), observe()];
    if (stage === 2) {
      v.completed = z.probes.length >= 2;
      if (!choice) v.options.push(...measures[i].map((m, n) => option(`measure:${n}`, m[0])), observe());
      if (!z.constructing && z.probes.length < 2) v.options.push(option('construct', z.probes.length ? 'Încearcă altă ordine' : 'Construiește proba'));
      if (z.constructing) v.options.push(...[1, 2, 3].map(n => option(`piece:${n}`, `${n} s`, z.builder.includes(n))), option('undo', 'Șterge ultima', !z.builder.length), option('send', 'Trimite proba', z.builder.length !== 3));
      v.items = z.builder.map((n, j) => ({ id: String(j), label: `${n} s` }));
      v.detail += ` · Proba ta: ${z.builder.join(' – ') || 'trei locuri goale'}`;
    }
    if (stage === 3 && !choice) v.options = z.pendingVerdict ? attachmentOptions(p, post) : [option('relay', 'Releu verificat'), option('far', 'Far verificat'), option('insufficient', 'Date insuficiente'), observe()];
    if (choice && stage !== 2) v.detail += ` · ${choice === 'observe' ? 'Privești; nu adăugăm un răspuns.' : stage === 3 ? `Verdict: ${display(choice, '')}; fișă: ${display(z.attachment, '')}` : `Ipoteză: ${display(choice, '')}`}`;
  } else if (p.profile === 'age-15-18') {
    v.kind = stage === 2 ? 'mandate-test' : 'mandate-rule';
    v.instruction = stage === 2 ? 'Încearcă un caz de test' : zone === 'A' ? 'Stabilește autoritatea' : 'Stabilește confirmarea';
    const a = rule(p.zones[key(post, 'A')], stage === 3), b = rule(p.zones[key(post, 'B')], stage === 3);
    const label = (s?: string) => s === 'propose' ? 'doar propune' : s === 'execute' ? 'poate executa' : s === 'always' ? 'mereu' : s === 'conflict' ? 'la conflict' : 'regulă absentă';
    v.detail = `${domains[post - 1]} · A: ${label(a)} · B: ${label(b)}`;
    if (!choice) {
      if (stage === 2) { const s = sensorCases[post - 1], n = zone === 'A' ? 0 : 2; v.options = [option('agree', `Acord: ${s[n]} / ${s[n]}`), option('conflict', `Conflict: ${s[n]} / ${s[n + 1]}`), observe()]; }
      else { v.options = zone === 'A' ? [option('propose', 'Doar propune'), option('execute', 'Poate executa')] : [option('always', 'Confirmare mereu'), option('conflict', 'Confirmare la conflict')]; if (stage === 3 && substantive(z.choices['1'])) v.options.push(option('keep', 'Păstrez regula')); v.options.push(observe()); }
    }
    const test = z.choices['2'];
    if (substantive(test)) v.detail += ` · ${mandate(p, post, test, false)}${stage === 3 ? ` → ${mandate(p, post, test, true)}` : ''}`;
  } else {
    v.kind = ['observation', 'probe-protection', 'archive'][stage - 1];
    v.instruction = ['Alege întinderea observației', 'Protejează sonda sau observă pasiv', 'Transmite un singur document'][stage - 1];
    v.detail = `Model de expediție · ${objects[post - 1][zone === 'A' ? 0 : 1]} · Rezervă: ${energy(z)} / 2`;
    if (!choice) v.options = stage === 1 ? [option('wide', `Largă · 3 ${units[post - 1]}, precizie redusă · cost 1`), option('fine', 'Fină · 1 segment, precizie ridicată · cost 2'), option('abstain', 'Mă abțin')] : stage === 2 ? [option('protect', 'Protejez · pauză 3 s, zgomot redus · cost 1', energy(z) < 1), option('passive', 'Observ pasiv · citire continuă, zgomot ridicat · cost 0'), option('abstain', 'Mă abțin')] : [option('observation', `Transmit observația ${z.choices['1'] === 'fine' ? 'fină' : 'largă'}`, !['wide', 'fine'].includes(z.choices['1'])), option('probe', `Transmit raportul ${z.choices['2'] === 'protect' ? 'protecției' : 'observării pasive'}`, !['protect', 'passive'].includes(z.choices['2'])), option('abstain', 'Mă abțin')];
    if (stage === 2 && energy(z) === 0 && !choice) v.detail += ' · Rezerva a fost folosită pentru măsurarea fină.';
    if (stage === 3) v.detail += ' · Documentele nealese rămân local. Un document absent nu poate fi transmis.';
    if (choice) v.detail += ` · ${choice === 'abstain' ? 'Abținere înregistrată.' : `Alegere înregistrată: ${display(choice, '')}`}`;
  }
  return v;
}
export function scenarioView(progress: ScenarioProgress, stage: number, post: Post): { title: string; zones: { A: ZoneView; B: ZoneView } } {
  return { title: titles[progress.profile], zones: { A: zoneView(progress, stage, post, 'A'), B: zoneView(progress, stage, post, 'B') } };
}
export function applyScenarioAction(progress: ScenarioProgress, action: ScenarioAction): { ok: boolean; reason?: string; progress: ScenarioProgress } {
  const fail = (reason: string) => ({ ok: false, reason, progress });
  if (!Number.isInteger(action.post) || action.post < 1 || action.post > 5 || !['A', 'B'].includes(action.zone) || ![1, 2, 3].includes(action.stage) || action.action !== 'choose' || typeof action.value !== 'string') return fail('invalid-action');
  const offered = zoneView(progress, action.stage, action.post, action.zone).options.find(o => o.value === action.value);
  if (!offered || offered.disabled) return fail('unavailable-action');
  const p: ScenarioProgress = JSON.parse(JSON.stringify(progress));
  const z = p.zones[key(action.post, action.zone)], value = action.value, stage = String(action.stage);
  if (p.profile === 'age-5-10') {
    if (value.startsWith('shape:')) { if (value.slice(6) !== shapes[action.post - 1][action.zone === 'A' ? 0 : 1]) return fail('try-matching-shape'); z.choices[stage] = 'found'; }
    else if (value === 'select') z.builder = [1];
    else z.choices[stage] = value === 'fit' ? 'fitted' : value === 'link' ? 'linked' : value;
  } else if (p.profile === 'age-10-15' && action.stage === 2) {
    if (value === 'construct') { z.constructing = true; z.builder = []; }
    else if (value.startsWith('piece:')) z.builder.push(Number(value.slice(6)));
    else if (value === 'undo') z.builder.pop();
    else if (value === 'send') {
      const permutation = z.builder.join('-');
      if (z.probes.includes(permutation)) return fail('probe-already-sent');
      z.probes.push(permutation); if (!p.probes.includes(permutation)) p.probes.push(permutation); z.constructing = false;
    } else { z.choices[stage] = value; z.constructing = true; }
  } else if (p.profile === 'age-10-15' && action.stage === 3 && value !== 'observe') {
    if (value.startsWith('attach:')) { z.choices[stage] = z.pendingVerdict!; z.attachment = value; delete z.pendingVerdict; }
    else z.pendingVerdict = value;
  } else z.choices[stage] = value;
  return { ok: true, progress: p };
}
export function scenarioConditions(p: ScenarioProgress): Set<string> {
  const result = new Set(['always']), zones = Object.values(p.zones);
  if (p.profile === 'age-5-10') {
    let total = 0;
    for (const [stage, name, accepted] of [[1, 'find', 'found'], [2, 'fit', 'fitted'], [3, 'link', 'linked']] as const) { const n = zones.filter(z => z.choices[String(stage)] === accepted).length; total += n; result.add(`${name}_${n === 10 ? 'complete' : n ? 'partial' : 'none'}`); }
    result.add(`final_${total === 30 ? 'complete' : total ? 'partial' : 'none'}`);
  } else if (p.profile === 'age-10-15') {
    const votes = zones.filter(z => substantive(z.choices['3'])), r = votes.filter(z => z.choices['3'] === 'relay').length;
    result.add(votes.length === 0 ? 'N' : p.probes.length < 2 ? 'O' : r > votes.length / 2 ? 'V' : 'D');
  } else if (p.profile === 'age-15-18') {
    let complete = 0, changed = 0;
    for (let post = 1; post <= 5; post++) { if (rule(p.zones[key(post, 'A')], true) && rule(p.zones[key(post, 'B')], true)) complete++; for (const zone of ['A', 'B'] as const) { const z = p.zones[key(post, zone)]; if (rule(z, true) && rule(z, true) !== rule(z, false)) changed++; } }
    result.add(complete === 0 ? 'DRAFT' : complete < 5 ? 'PARTIAL' : changed ? 'REVISED' : 'RETAINED');
  } else if (p.profile === 'adults') {
    const available = zones.filter(z => ['wide', 'fine'].includes(z.choices['1']) || ['protect', 'passive'].includes(z.choices['2'])).length;
    const a = zones.filter(z => z.choices['3'] === 'observation').length, b = zones.filter(z => z.choices['3'] === 'probe').length;
    result.add(available === 10 ? 'all_channels_have_document' : 'some_channels_have_no_document');
    result.add(a && b ? 'archive_both_types' : a || b ? 'archive_one_type' : 'archive_empty'); result.add(a + b === 10 ? 'archive_full' : 'archive_partial');
  }
  return result;
}
export function summarizeScenario(p: ScenarioProgress): { title: string; lines: string[]; posts: Array<{ post: number; lines: string[] }> } {
  const result = { title: titles[p.profile], lines: [] as string[], posts: [] as Array<{ post: number; lines: string[] }> };
  const conditions = scenarioConditions(p);
  if (p.profile === 'age-5-10') { if (conditions.has('find_none')) result.lines.push('Dar de la Lumină: cercul de lumină.'); if (conditions.has('fit_none')) result.lines.push('Dar de la Natură: frunza de grădină.'); if (!conditions.has('link_complete')) result.lines.push('Dar de la Tehnologic: mânerul de călătorie.'); }
  if (p.profile === 'age-10-15') result.lines.push(evidence(p), 'Identitatea expeditorului rămâne necunoscută.');
  for (let post = 1; post <= 5; post++) {
    const lines: string[] = [];
    for (const zone of ['A', 'B'] as const) {
      const z = p.zones[key(post, zone)], c = z.choices;
      if (p.profile === 'age-5-10') { const shape = shapes[post - 1][zone === 'A' ? 0 : 1]; lines.push(`${zone}: ${shape} · ${c['1'] === 'found' ? 'găsită pe Siwarha' : c['2'] === 'fitted' ? 'primită de la Natură' : 'fără piesă păstrată'} · ${c['2'] === 'fitted' ? 'montată' : 'nemontată'} · ${c['3'] === 'linked' ? 'capăt prins' : 'capăt liber'}`); }
      else if (p.profile === 'age-10-15') { const support = c['3'] === 'relay' && z.attachment === 'attach:repeated' ? 'sprijin direct' : c['3'] === 'insufficient' && ['attach:single', 'attach:none'].includes(z.attachment || '') ? 'limită relevantă' : 'legătură neconcludentă'; const attachment = z.attachment?.startsWith('attach:local:') ? localMeasure(p, post, z.attachment.slice(-1) as Zone) : display(z.attachment, ''); lines.push(`${zone}: ipoteză ${display(c['1'], 'neînregistrată')} · ${localMeasure(p, post, zone) || 'fără măsurătoare'} · probe trimise: ${z.probes.join(', ') || 'niciuna'} · verdict ${display(c['3'], z.pendingVerdict ? 'netrimis; lipsește fișa' : 'neînregistrat')}${z.attachment ? ` · ${attachment} · ${support}` : ''}`); }
      else if (p.profile === 'age-15-18') lines.push(`${zone}: ${display(rule(z, false), 'regulă absentă')} → ${display(rule(z, true), 'regulă absentă')} · ${substantive(c['2']) ? `${display(c['2'], '')}: ${mandate(p, post, c['2'], false)} → ${mandate(p, post, c['2'], true)}` : c['2'] === 'observe' ? 'observare; fără test' : 'test neînregistrat'}`);
      else if (p.profile === 'adults') lines.push(`${zone}: ${objects[post - 1][zone === 'A' ? 0 : 1]} · observație: ${display(c['1'], 'neînregistrată')} · sondă: ${display(c['2'], 'comandă neînregistrată')} · rezervă ${energy(z)} · arhivă: ${display(c['3'], 'selecție neînregistrată')}${['wide', 'fine'].includes(c['1']) && c['3'] !== 'observation' ? ' · observație păstrată local; netransmisă' : ''}${['protect', 'passive'].includes(c['2']) && c['3'] !== 'probe' ? ' · raport păstrat local; netransmis' : ''}`);
    }
    result.posts.push({ post, lines });
  }
  return result;
}
