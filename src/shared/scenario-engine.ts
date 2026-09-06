/** Deterministic, JSON-only expedition mechanics. The host owns authorization and cue windows. */
import { educationFacts } from './education-facts';
import type { EducationForm, EducationVisual } from './education-visual';
import { adultDocument, adultSubject, autopilotTasks, type ExpeditionDocument } from './game-content';
import { applyPlayAction, pilotDecision, playRule, playView, playDocuments, type PlayProgress, type PlayView } from './play-engine';
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
  game?: { rotation?: number; tests?: Array<'agree' | 'conflict'> };
  play?: PlayProgress;
  soloRules?:Record<string,{authority?:string;confirmation?:string}>;
}
export interface ScenarioProgress { version: 1; profile: ScenarioId; zones: Record<string, ZoneProgress>; probes: string[]; participants?:string[] }
export interface ZoneView {
  heading: string; instruction: string; detail: string;
  options: Array<{ value: string; label: string; disabled?: boolean; hint?: string; route?: 'continuous' | 'dead-end' | 'loop' }>;
  completed: boolean; kind?: string; items?: Array<{ id: string; label: string }>;
  visual?: EducationVisual;
  goal?: string;
  feedback?: string;
  guidance?: string[];
  documents?: ExpeditionDocument[];
  comparison?: Array<{ label: string; before: string; after?: string }>;
  resourceLabel?: string;
  play?: PlayView;
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
  far: 'își păstrează ritmul', relay: 'repetă ce trimitem', uncertain: 'nu știm încă', insufficient: 'nu avem suficiente dovezi',
  observe: 'am ales să privesc', abstain: 'am ales să nu folosesc această opțiune', wide: 'trei zone cercetate', fine: 'o zonă cercetată în detaliu', protect: 'raport verificat',
  passive: 'raport nefiltrat', observation: 'harta observațiilor', probe: 'raportul sondei',
  propose: 'propune echipajului', execute: 'poate acționa singur', always: 'cere acordul de fiecare dată', conflict: 'cere acordul când senzorii diferă', agree: 'senzorii indică același lucru',
  'attach:repeated': 'două ritmuri diferite, ambele repetate', 'attach:single': 'un singur ritm testat', 'attach:none': 'nu am trimis un ritm nou', 'attach:identity': 'nu știm cine trimite semnalul',
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
function mandate(p: ScenarioProgress, post: number, test: string, revised: boolean, compact = false): string {
  const a = playRule(p,post as Post,'A',revised), b = playRule(p,post as Post,'B',revised);
  const decision = pilotDecision(a, b, test);
  if (decision === 'incomplete') return compact ? 'Regulă incompletă' : 'Pilotul așteaptă: mai avem de ales o regulă.';
  if (decision === 'propose') return compact ? 'Propune; echipajul decide' : 'Pilotul propune o acțiune. Echipajul decide dacă o execută.';
  if (decision === 'confirm' && b === 'always') return compact ? 'Cere acordul echipajului' : 'Pilotul cere acordul echipajului, așa cum i-ați cerut.';
  if (decision === 'confirm') return compact ? 'Cere acordul echipajului' : 'Pilotul cere acordul echipajului: senzorii indică lucruri diferite.';
  return compact ? 'Execută în simulare' : 'Pilotul execută acțiunea în simulare: senzorii indică același lucru.';
}
export function mandateCases(p: ScenarioProgress, post: Post, zone: Zone, revised = false): Array<{ test: 'agree' | 'conflict'; result: string }> {
  const z = p.zones[key(post, zone)];
  const tests = z.game?.tests || (['agree', 'conflict'].includes(z.choices['2']) ? [z.choices['2'] as 'agree' | 'conflict'] : []);
  return tests.map(test => ({ test, result: mandate(p, post, test, revised) }));
}
function localMeasure(p: ScenarioProgress, post: number, zone: Zone): string | undefined {
  const choice = p.zones[key(post, zone)].choices['2'];
  return choice?.startsWith('measure:') ? measures[index(post, zone)][Number(choice.slice(8))]?.[1] : undefined;
}
function evidence(p: ScenarioProgress): string { return p.probes.length ? p.probes.slice(0, 2).map((v, i) => `Testul ${i + 1}: trimis ${v} · primit ${v}`).join(' | ') : 'Încă nu am trimis un ritm nou.'; }
function attachmentOptions(p: ScenarioProgress, post: number) {
  const result = [option(p.probes.length >= 2 ? 'attach:repeated' : p.probes.length === 1 ? 'attach:single' : 'attach:none', p.probes.length >= 2 ? 'A repetat două ritmuri diferite' : p.probes.length === 1 ? 'Am testat un singur ritm' : 'Nu avem un test nou'), option('attach:identity', 'Nu știm cine emite semnalul')];
  for (const zone of ['A', 'B'] as const) { const m = localMeasure(p, post, zone); if (m) result.push(option(`attach:local:${zone}`, `${zone}: ${m}`)); }
  return result;
}
function zoneView(p: ScenarioProgress, stage: number, post: Post, zone: Zone): ZoneView {
  if(p.participants&&!p.participants.includes(key(post,zone)))return {heading:`${posts[post-1]} · ${zone}`,instruction:'Loc liber',detail:'Personajele confirmate continuă expediția. Poți urmări povestea pe ecran.',options:[],completed:false,kind:'crew-inactive'};
  const z = p.zones[key(post, zone)], i = index(post, zone), choice = z.choices[String(stage)];
  const v: ZoneView = { heading: `${posts[post - 1]} · ${zone}`, instruction: '', detail: '', options: [], completed: !!choice };
  if (p.profile === 'legacy-v3' || ![1, 2, 3].includes(stage)) return v;
  v.play = playView(p, stage, post, zone);
  const test = z.choices['2'], sensorOffset = zone === 'A' ? 0 : 2;
  v.visual = educationFacts(p, stage, post, zone, {
    shapes: shapes[post - 1] as [EducationForm, EducationForm], observation: observations[i],
    measurement: localMeasure(p, post, zone),
    attachmentMeasurement: z.attachment?.startsWith('attach:local:') ? localMeasure(p, post, z.attachment.slice(-1) as Zone) : undefined,
    ruleA: playRule(p,post,'A',stage===3), ruleB: playRule(p,post,'B',stage===3),
    before: ['agree', 'conflict'].includes(test) ? mandate(p, post, test, false) : undefined,
    after: ['agree', 'conflict'].includes(test) ? mandate(p, post, test, true) : undefined,
    sensors: ['agree', 'conflict'].includes(test) ? [sensorCases[post - 1][sensorOffset], sensorCases[post - 1][sensorOffset + (test === 'conflict' ? 1 : 0)]] : undefined,
    domain: domains[post - 1], subject: p.profile === 'adults' ? adultSubject(post) : objects[post - 1][zone === 'A' ? 0 : 1], budget: energy(z), coverageUnit: p.profile === 'adults' ? 'zone' : units[post - 1],
  });
  if (p.profile === 'age-5-10') {
    const shape = shapes[post - 1][zone === 'A' ? 0 : 1];
    v.kind = ['visual-match', 'paired-fit', 'latched-pair'][stage - 1];
    v.goal = 'Construim împreună un felinar pentru călătorie.';
    v.instruction = ['Găsește piesa care are aceeași formă', 'Rotește piesa și așaz-o în felinar', 'Găsește drumul care ajunge la felinar'][stage - 1];
    v.items = [{ id: 'shape', label: shape }];
    v.detail = stage === 1 ? `Uită-te la contur. Cauți piesa „${shape}”.` : stage === 2 ? (z.builder.length ? 'Rotește piesa până când semnul auriu ajunge sus. Apoi așaz-o.' : `${z.choices['1'] === 'found' ? 'Ai găsit piesa.' : 'Natura ți-a dăruit o piesă.'} Atinge-o ca să începi.`) : 'Urmărește fiecare drum de la început până la capăt. Unul ajunge la felinar.';
    if (stage === 2 && z.builder.length && !choice) v.detail = (z.game?.rotation ?? 0) === 0 ? 'Semnul auriu este sus. Acum poți așeza piesa!' : `Semnul auriu este ${['sus', 'în dreapta', 'jos', 'în stânga'][z.game?.rotation ?? 0]}. Rotește piesa până când semnul ajunge sus.`;
    v.guidance = stage === 3 ? ['Un drum se oprește prea devreme.', 'Un drum se întoarce de unde a pornit.', 'Alege drumul care ajunge la lumină.'] : undefined;
    if (!choice) v.options = stage === 1 ? [shape, ...distractors[i]].map(s => option(`shape:${s}`, s)).concat(observe()) : stage === 2 ? z.builder.length ? [option('rotate', 'Rotește piesa'), option('fit', 'Așază piesa'), observe()] : [option('select', 'Ia piesa'), observe()] : [
      { ...option('dead-end', 'Drumul 1'), route: 'dead-end' }, { ...option('link', 'Drumul 2'), route: 'continuous' }, { ...option('loop', 'Drumul 3'), route: 'loop' }, observe(),
    ];
    if (choice) v.feedback = choice === 'observe' ? 'Poți urmări cum se construiește felinarul.' : stage === 1 ? 'Ai găsit piesa! O luăm cu noi.' : stage === 2 ? 'Se potrivește! Felinarul are acum și piesa ta.' : p.zones[key(post, zone === 'A' ? 'B' : 'A')].choices['3'] === 'linked' ? 'Ați găsit amândoi drumul. Felinarul vostru luminează!' : 'Drumul tău ajunge la felinar. Lumina ta este aprinsă!';
  } else if (p.profile === 'age-10-15') {
    v.kind = stage === 2 ? 'probe-builder' : stage === 3 ? 'evidence-verdict' : 'hypothesis';
    v.goal = 'Află dacă semnalul răspunde la ce îi trimitem.';
    v.instruction = stage === 1 ? 'Ce crezi că face semnalul?' : stage === 2 ? 'Trimite două ritmuri diferite și compară răspunsurile' : z.pendingVerdict ? 'Ce observație îți susține concluzia?' : 'Ce ai aflat din teste?';
    v.guidance = ['Modelul 1 păstrează ritmul 2–2–2, indiferent ce trimitem.', 'Modelul 2 repetă ritmul trimis de noi.', 'Testele disting aceste două modele; nu ne spun cine se află la sursă.'];
    v.detail = stage === 1 ? observations[i] : `${evidence(p)}${localMeasure(p, post, zone) ? ` · ${localMeasure(p, post, zone)}` : ''}`;
    if (stage === 1 && !choice) v.options = [option('far', 'Își păstrează ritmul'), option('relay', 'Repetă ce trimitem'), option('uncertain', 'Nu știm încă'), observe()];
    if (stage === 2) {
      v.completed = z.probes.length >= 2;
      if (!choice) v.options.push(...measures[i].map((m, n) => option(`measure:${n}`, m[0])), observe());
      if (!z.constructing && z.probes.length < 2) v.options.push(option('construct', z.probes.length ? 'Încearcă altă ordine' : 'Compune un ritm'));
      if (z.constructing) v.options.push(...[1, 2, 3].map(n => option(`piece:${n}`, `${n} s`, z.builder.includes(n))), option('undo', 'Anulează ultimul interval', !z.builder.length), option('send', 'Trimite ritmul', z.builder.length !== 3));
      v.items = z.builder.map((n, j) => ({ id: String(j), label: `${n} s` }));
      v.detail += ` · Ritmul tău: ${z.builder.join(' – ') || 'alege ordinea celor trei intervale'}`;
      v.feedback = z.probes.length >= 2 ? 'Două ritmuri diferite, două răspunsuri identice cu ce ai trimis. Care model explică rezultatul?' : z.probes.length ? 'A repetat primul ritm. Schimbă ordinea și verifică încă o dată.' : undefined;
    }
    if (stage === 3 && !choice) v.options = z.pendingVerdict ? [...attachmentOptions(p, post), option('reconsider', 'Schimb concluzia')] : [option('relay', 'Repetă ce trimitem'), option('far', 'Își păstrează ritmul'), option('insufficient', 'Nu avem suficiente dovezi'), observe()];
    if (choice && stage !== 2) {
      const attachment = z.attachment?.startsWith('attach:local:') ? localMeasure(p, post, z.attachment.slice(-1) as Zone) : display(z.attachment, '');
      v.feedback = choice === 'observe' ? 'Poți urmări rezultatele echipajului.' : stage === 3 ? `Concluzia ta: ${display(choice, '')}. Observația aleasă: ${attachment}.` : `Presupunerea ta: ${display(choice, '')}. În etapa următoare o verificăm.`;
    }
  } else if (p.profile === 'age-15-18') {
    v.kind = stage === 2 ? 'mandate-test' : 'mandate-rule';
    v.goal = autopilotTasks[post - 1];
    v.instruction = stage === 2 ? 'Testează pilotul în ambele situații' : stage === 3 ? 'După teste, păstrezi sau schimbi regula?' : zone === 'A' ? 'Câtă libertate îi dai pilotului automat?' : 'Când trebuie să ceară acordul echipajului?';
    const a = playRule(p,post,'A',stage===3), b = playRule(p,post,'B',stage===3);
    v.detail = `A: ${display(a, 'alege libertatea pilotului')} · B: ${display(b, 'alege când cere acordul')}`;
    v.guidance = ['O decizie rapidă înseamnă mai multă autonomie. Confirmarea păstrează echipajul în decizie.', 'Doi senzori pot indica același lucru și totuși să greșească. Testăm regula, nu siguranța unei nave reale.'];
    const cases = mandateCases(p, post, zone);
    if (stage >= 2 && cases.length) v.comparison = cases.map(c => ({ label: c.test === 'agree' ? 'Senzorii sunt de acord' : 'Senzorii se contrazic', before: mandate(p, post, c.test, false, true), ...(stage === 3 ? { after: mandate(p, post, c.test, true, true) } : {}) }));
    if (stage === 2) {
      const s = sensorCases[post - 1], n = zone === 'A' ? 0 : 2;
      v.completed = cases.length === 2;
      if (choice !== 'observe') v.options = [option('agree', `Aceeași indicație: ${s[n]} / ${s[n]}`, cases.some(c => c.test === 'agree')), option('conflict', `Indicații diferite: ${s[n]} / ${s[n + 1]}`, cases.some(c => c.test === 'conflict'))];
      if (!choice) v.options.push(observe());
      v.feedback = cases.map(c => `${c.test === 'agree' ? 'Aceeași indicație' : 'Indicații diferite'}: ${c.result}`).join(' ');
    } else if (!choice) {
      v.options = zone === 'A' ? [option('propose', 'Propune; echipajul decide'), option('execute', 'Poate acționa singur')] : [option('always', 'Cere acordul de fiecare dată'), option('conflict', 'Cere acordul când senzorii diferă')];
      if (stage === 3 && substantive(z.choices['1'])) v.options.push(option('keep', 'Păstrez regula')); v.options.push(observe());
    }
    if (stage === 3) v.feedback = cases.length ? cases.map(c => `${c.test === 'agree' ? 'Aceeași indicație' : 'Indicații diferite'} — înainte: ${c.result} Acum: ${mandate(p, post, c.test, true)}`).join(' ') : 'Nu ai rulat un test. Poți compara regulile, dar nu avem încă un rezultat de test.';
  } else {
    v.kind = ['observation', 'probe-protection', 'archive'][stage - 1];
    v.goal = 'Lasă următorului echipaj informația de care va avea nevoie.';
    v.instruction = ['Cercetezi trei zone sau una în detaliu?', 'Investești în verificare sau păstrezi rezerva?', 'Ce trimiți următorului echipaj?'][stage - 1];
    if (stage === 2 && energy(z) === 0) v.instruction = 'Primești datele nefiltrate ale sondei?';
    v.resourceLabel = `Rezervă: ${energy(z)} din 2 credite`;
    v.detail = `${adultSubject(post)} · ${v.resourceLabel}`;
    v.guidance = ['Ai două credite pentru cercetare și verificare.', 'La final poți trimite un singur document. Restul rămâne în arhiva locală.', 'Datele sunt pregătite pentru acest exercițiu; nu sunt măsurători din film.'];
    if (!choice) v.options = stage === 1 ? [option('wide', 'Cercetez trei zone · 1 credit'), option('fine', 'Cercetez una în detaliu · 2 credite'), option('abstain', 'Păstrez rezerva')] : stage === 2 ? [option('protect', 'Verific citirile · 1 credit', energy(z) < 1), option('passive', 'Accept datele nefiltrate · gratuit'), option('abstain', 'Nu cer un raport')] : [option('observation', 'Trimit harta observațiilor', !['wide', 'fine'].includes(z.choices['1'])), option('probe', 'Trimit raportul sondei', !['protect', 'passive'].includes(z.choices['2'])), option('abstain', 'Nu transmit un document')];
    v.documents = [];
    if (['wide', 'fine'].includes(z.choices['1'])) v.documents.push(adultDocument(post, zone, z.choices['1'] as 'wide' | 'fine'));
    if (['protect', 'passive'].includes(z.choices['2']) && stage >= 2) v.documents.push(adultDocument(post, zone, z.choices['2'] as 'protect' | 'passive'));
    v.feedback = stage === 3 && substantive(choice) ? `${choice === 'observation' ? 'Harta observațiilor' : 'Raportul sondei'} a fost trimis. Echipajul următor va primi și limitele cercetării tale.` : v.documents.at(-1)?.summary;
    if (stage === 3 && !choice) v.feedback = 'Compară documentele. Poți trimite unul singur.';
    if (stage === 2 && energy(z) === 0 && !choice) v.detail += ' · Ai folosit ambele credite pentru cercetarea în detaliu.';
    if (stage === 3) v.detail += ' · Documentele nealese rămân local. Un document absent nu poate fi transmis.';
    if (choice === 'abstain') v.feedback = stage === 1 ? 'Ai păstrat ambele credite pentru etapa următoare.' : stage === 2 ? 'Nu ai cerut un raport de la sondă.' : 'Documentele tale rămân în arhiva locală.';
  }
  return v;
}
export function scenarioView(progress: ScenarioProgress, stage: number, post: Post): { title: string; zones: { A: ZoneView; B: ZoneView } } {
  return { title: titles[progress.profile], zones: { A: zoneView(progress, stage, post, 'A'), B: zoneView(progress, stage, post, 'B') } };
}
export function applyScenarioAction(progress: ScenarioProgress, action: ScenarioAction): { ok: boolean; reason?: string; progress: ScenarioProgress } {
  const fail = (reason: string) => ({ ok: false, reason, progress });
  if (!Number.isInteger(action.post) || action.post < 1 || action.post > 5 || !['A', 'B'].includes(action.zone) || ![1, 2, 3].includes(action.stage) || action.action !== 'choose' || typeof action.value !== 'string') return fail('invalid-action');
  if(progress.participants&&!progress.participants.includes(key(action.post,action.zone)))return fail('inactive-seat');
  if (action.value.startsWith('play:')) return applyPlayAction(progress, action);
  const offered = zoneView(progress, action.stage, action.post, action.zone).options.find(o => o.value === action.value);
  if (!offered || offered.disabled) return fail('unavailable-action');
  const p: ScenarioProgress = JSON.parse(JSON.stringify(progress));
  const z = p.zones[key(action.post, action.zone)], value = action.value, stage = String(action.stage);
  if (p.profile === 'age-5-10') {
    if (value.startsWith('shape:')) { if (value.slice(6) !== shapes[action.post - 1][action.zone === 'A' ? 0 : 1]) return fail('try-matching-shape'); z.choices[stage] = 'found'; }
    else if (value === 'select') { z.builder = [1]; z.game = { ...z.game, rotation: 1 + action.post % 3 }; }
    else if (value === 'rotate') z.game = { ...z.game, rotation: ((z.game?.rotation || 0) + 1) % 4 };
    else if (value === 'fit' && (z.game?.rotation || 0) !== 0) return fail('piece-not-aligned');
    else if (value === 'dead-end') return fail('route-stops-early');
    else if (value === 'loop') return fail('route-returns-to-start');
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
    if (value === 'reconsider') delete z.pendingVerdict;
    else if (value.startsWith('attach:')) { z.choices[stage] = z.pendingVerdict!; z.attachment = value; delete z.pendingVerdict; }
    else z.pendingVerdict = value;
  } else if (p.profile === 'age-15-18' && action.stage === 2 && ['agree', 'conflict'].includes(value)) {
    const previous = mandateCases(progress, action.post, action.zone).map(c => c.test);
    z.game = { ...z.game, tests: [...previous, value as 'agree' | 'conflict'] }; z.choices[stage] = value;
  } else z.choices[stage] = value;
  return { ok: true, progress: p };
}
export function scenarioConditions(p: ScenarioProgress): Set<string> {
  const result = new Set(['always']), zones = Object.entries(p.zones).filter(([id])=>!p.participants||p.participants.includes(id)).map(([,z])=>z), target=zones.length;
  if (p.profile === 'age-5-10') {
    let total = 0;
    for (const [stage, name, accepted] of [[1, 'find', 'found'], [2, 'fit', 'fitted'], [3, 'link', 'linked']] as const) { const n = zones.filter(z => z.choices[String(stage)] === accepted).length; total += n; result.add(`${name}_${target>0&&n === target ? 'complete' : n ? 'partial' : 'none'}`); }
    result.add(`final_${target>0&&total === target*3 ? 'complete' : total ? 'partial' : 'none'}`);
  } else if (p.profile === 'age-10-15') {
    const votes = zones.filter(z => substantive(z.choices['3'])), r = votes.filter(z => z.choices['3'] === 'relay').length;
    result.add(votes.length === 0 ? 'N' : p.probes.length < 2 ? 'O' : r > votes.length / 2 ? 'V' : 'D');
  } else if (p.profile === 'age-15-18') {
    let complete = 0, changed = 0, activePosts=0;
    for (let post = 1; post <= 5; post++) { if(p.participants&&!p.participants.some(id=>id.startsWith(String(post))))continue;activePosts++;if (playRule(p,post as Post,'A',true) && playRule(p,post as Post,'B',true)) complete++; for (const zone of ['A', 'B'] as const) { const before=playRule(p,post as Post,zone,false),after=playRule(p,post as Post,zone,true);if(after&&after!==before)changed++; } }
    result.add(complete === 0 ? 'DRAFT' : complete < activePosts ? 'PARTIAL' : changed ? 'REVISED' : 'RETAINED');
  } else if (p.profile === 'adults') {
    const available = zones.filter(z => ['wide', 'fine'].includes(z.choices['1']) || ['protect', 'passive'].includes(z.choices['2'])).length;
    const a = zones.filter(z => z.choices['3'] === 'observation').length, b = zones.filter(z => z.choices['3'] === 'probe').length;
    result.add(target>0&&available === target ? 'all_channels_have_document' : 'some_channels_have_no_document');
    result.add(a && b ? 'archive_both_types' : a || b ? 'archive_one_type' : 'archive_empty'); result.add(target>0&&a + b === target ? 'archive_full' : 'archive_partial');
  }
  return result;
}
export function summarizeScenario(p: ScenarioProgress): { title: string; lines: string[]; posts: Array<{ post: number; lines: string[] }> } {
  const result = { title: titles[p.profile], lines: [] as string[], posts: [] as Array<{ post: number; lines: string[] }> };
  const conditions = scenarioConditions(p);
  if (p.profile === 'age-5-10') { if (conditions.has('find_none')) result.lines.push('Lumina v-a dăruit cercul luminos.'); if (conditions.has('fit_none')) result.lines.push('Natura v-a dăruit frunza de grădină.'); if (!conditions.has('link_complete')) result.lines.push('Lumea tehnologiei v-a dăruit mânerul de călătorie.'); }
  if (p.profile === 'age-10-15') result.lines.push(evidence(p), 'Identitatea expeditorului rămâne necunoscută.');
  for (let post = 1; post <= 5; post++) {
    if(p.participants&&!p.participants.some(id=>id.startsWith(String(post))))continue;
    const lines: string[] = [];
    for (const zone of ['A', 'B'] as const) {
      if(p.participants&&!p.participants.includes(key(post,zone))){lines.push(`${zone}: Loc neocupat.`);continue;}
      const z = p.zones[key(post, zone)], c = z.choices;
      if (p.profile === 'age-5-10') { const shape = shapes[post - 1][zone === 'A' ? 0 : 1]; lines.push(`${zone}: piesa „${shape}” · ${c['1'] === 'found' ? 'găsită pe Siwarha' : c['2'] === 'fitted' ? 'primită de la Natură' : 'încă negăsită'} · ${c['2'] === 'fitted' ? 'așezată în felinar' : 'încă neașezată'} · ${c['3'] === 'linked' ? 'drum găsit' : 'drum încă neales'}`); }
      else if (p.profile === 'age-10-15') { const support = c['3'] === 'relay' && z.attachment === 'attach:repeated' ? 'testele susțin această explicație' : c['3'] === 'insufficient' && ['attach:single', 'attach:none'].includes(z.attachment || '') ? 'ai arătat ce ne lipsește' : 'această observație nu susține încă explicația'; const attachment = z.attachment?.startsWith('attach:local:') ? localMeasure(p, post, z.attachment.slice(-1) as Zone) : display(z.attachment, ''); const reception = z.play ? `teste fără răspuns clar: ${z.play.stages['2']?.records?.filter(r => r.received === null).length || 0}` : localMeasure(p, post, zone) || 'nu ai cerut o măsurătoare'; lines.push(`${zone}: presupunere: ${display(c['1'], 'încă nealeasă')} · ${reception} · ritmuri testate: ${z.probes.join(', ') || 'niciunul'} · concluzie: ${display(c['3'], z.pendingVerdict ? 'mai ai de ales dovada' : 'încă nealeasă')}${z.attachment ? ` · ${attachment} · ${support}` : ''}`); }
      else if (p.profile === 'age-15-18') { const cases = mandateCases(p, post as Post, zone); const describe=(revised:boolean)=>p.participants?.filter(id=>id.startsWith(String(post))).length===1?`${display(playRule(p,post as Post,'A',revised),'libertate încă nealeasă')} / ${display(playRule(p,post as Post,'B',revised),'acord încă neales')}`:display(rule(z,revised),'regulă încă nealeasă');lines.push(`${zone}: ${describe(false)} → ${describe(true)} · ${cases.length ? cases.map(t => `${display(t.test, '')}: ${t.result} → ${mandate(p, post, t.test, true)}`).join(' | ') : c['2'] === 'observe' ? 'ai ales să urmărești testele' : 'niciun test rulat'}`); }
      else if (p.profile === 'adults') {
        const documents = z.play ? playDocuments(p, post as Post, zone) : [];
        const observation = documents.find(d => d.id === 'observation'), probe = documents.find(d => d.id === 'probe');
        const research = observation ? `${observation.title}: ${observation.caption}` : display(c['1'], 'încă nealeasă');
        const reading = probe ? probe.caption : display(c['2'], 'niciun raport cerut');
        lines.push(`${zone}: ${z.play ? 'Date simulate ale postului' : adultSubject(post as Post)} · cercetare: ${research} · sondă: ${reading} · rezervă ${energy(z)} · arhivă: ${display(c['3'], 'niciun document ales')}${['wide', 'fine'].includes(c['1']) && c['3'] !== 'observation' ? ' · observație păstrată local; netransmisă' : ''}${['protect', 'passive'].includes(c['2']) && c['3'] !== 'probe' ? ' · raport păstrat local; netransmis' : ''}`);
      }
    }
    result.posts.push({ post, lines });
  }
  return result;
}
