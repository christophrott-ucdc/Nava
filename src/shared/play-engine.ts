import type { Post, ScenarioAction, ScenarioId, ScenarioProgress, Zone } from './scenario-engine';

/** Gesture results are evaluated on the host. All numbers describe an authored model. */
export type PilotDecision = 'incomplete' | 'propose' | 'confirm' | 'execute';
export interface SignalRecord { id: number; input: number[]; received: number[] | null; predicted: number[] }
export interface PlayDocument { id: 'observation' | 'probe'; title: string; values: Array<number | null>; uncertainty: boolean[]; caption: string }
export interface PlayStageProgress {
  seq: number; attempts: number; lastAction: string; feedback: string;
  observed?: boolean;
  rotation?: number; wireTurns?: [number, number]; angle?: number;
  sequence?: number[]; records?: SignalRecord[]; case?: 'agree' | 'conflict';
  center?: 0 | 1 | 2; scanCenter?: 0 | 1 | 2;
}
export interface PlayProgress { version: 1; stages: Record<string, PlayStageProgress> }
interface PlayBase {
  stage: number; post: Post; zone: Zone; seq: number; attempts: number;
  solved: boolean; title: string; instruction: string; feedback: string; lesson: string; lastAction: string;
  observed: boolean;
}
export interface LightPlayView extends PlayBase {
  kind: 'light'; shape: string; candidates: string[]; rotation: number; socketRotation: number;
  wireTurns: [number, number]; wireTargets: [number, number]; wireConnected: boolean;
}
export interface SignalPlayView extends PlayBase {
  kind: 'signal'; angle: number; targetAngle: number; strength: number;
  canTransmit: boolean;
  hypothesis?: 'far' | 'relay' | 'uncertain'; sequence: number[]; records: SignalRecord[];
  verdict?: string; attachment?: string;
}
export interface PilotPlayView extends PlayBase {
  kind: 'pilot'; authority?: 'propose' | 'execute'; confirmation?: 'always' | 'conflict';
  case: 'agree' | 'conflict'; decision: PilotDecision; beforeDecision: PilotDecision;
  sensorLabels: [string, string]; ruleEditable: boolean;
}
export interface SurveyPlayView extends PlayBase {
  kind: 'survey'; center: 0 | 1 | 2; credits: number; scanKind?: 'wide' | 'fine';
  measurementLabel: string;
  protection?: 'protect' | 'passive'; documents: PlayDocument[]; scanValues: number[];
  shutterSeconds: 3; selectedDocument?: 'observation' | 'probe';
}
export type PlayView = LightPlayView | SignalPlayView | PilotPlayView | SurveyPlayView;

const shapes = [['Cerc', 'Semilună'], ['Aripă', 'Flacără'], ['Undă', 'Clopoțel'], ['Frunză', 'Picătură'], ['Stea', 'Spirală']];
const sensors = [['EST', 'VEST'], ['LIN', 'RAPID'], ['CUTIA 1', 'CUTIA 2'], ['NIVEL 2', 'NIVEL 4'], ['DUPĂ DATĂ', 'DUPĂ TITLU']];
const seat = (post: Post, zone: Zone) => `${post}${zone}`;
const stageState = (p: ScenarioProgress, post: Post, zone: Zone, stage: number) => p.zones[seat(post, zone)].play?.stages[String(stage)];
const ownShape = (post: Post, zone: Zone) => shapes[post - 1][zone === 'A' ? 0 : 1];
const selected = (v?: string) => v && !['observe', 'abstain'].includes(v) ? v : undefined;
export function playRule(p: ScenarioProgress, post: Post, zone: Zone, revised: boolean): string | undefined {
  const c = p.zones[seat(post, zone)].choices;
  return revised && selected(c['3']) && c['3'] !== 'keep' ? c['3'] : selected(c['1']);
}
/** Also used by the legacy mandate descriptions: one rule table, two presentations. */
export function pilotDecision(authority: string | undefined, confirmation: string | undefined, test: string): PilotDecision {
  if (!authority || !confirmation) return 'incomplete';
  if (authority === 'propose') return 'propose';
  if (confirmation === 'always' || test === 'conflict') return 'confirm';
  return 'execute';
}
export function signalStrength(angle: number, target: number): number { return Math.max(0, 100 - Math.round(Math.abs(angle - target) * 2.5)); }
export function surveySamples(post: Post): number[] {
  const samples = [[28, 32, 35, 40, 68, 73, 72, 68, 64], [30, 30, 34, 42, 67, 43, 33, 31, 29], [18, 24, 27, 58, 82, 61, 24, 20, 16], [62, 65, 63, 60, 22, 64, 62, 61, 65], [35, 40, 42, 43, 12, 48, 53, 58, 63]];
  return [...samples[post - 1]];
}
export function playDocuments(p: ScenarioProgress, post: Post, zone: Zone): PlayDocument[] {
  const z = p.zones[seat(post, zone)], raw = surveySamples(post), docs: PlayDocument[] = [];
  const center = stageState(p, post, zone, 1)?.scanCenter ?? 1;
  if (['wide', 'fine'].includes(z.choices['1'])) {
    const wide = z.choices['1'] === 'wide';
    const values = raw.map((value, i) => wide ? Math.round(raw.slice(Math.floor(i / 3) * 3, Math.floor(i / 3) * 3 + 3).reduce((a, b) => a + b, 0) / 3) : Math.floor(i / 3) === center ? value : null);
    docs.push({ id: 'observation', title: wide ? 'Harta celor trei zone' : `Detaliul zonei ${center + 1}`, values, uncertainty: raw.map(() => false), caption: wide ? 'O medie pentru fiecare zonă: vezi întregul, dar vârfurile mici se pierd.' : 'Trei citiri apropiate într-o singură zonă. Celelalte două rămân necercetate.' });
  }
  if (['protect', 'passive'].includes(z.choices['2'])) {
    const protectedProbe = z.choices['2'] === 'protect';
    docs.push({ id: 'probe', title: protectedProbe ? 'Citiri cu întrerupere' : 'Citiri afectate de interferențe', values: raw.map((v, i) => i >= 3 && i <= 5 ? protectedProbe ? null : [91, 14, 87][i - 3] : v), uncertainty: raw.map((_, i) => !protectedProbe && i >= 3 && i <= 5), caption: protectedProbe ? 'Trei secunde fără citiri. Întreruperea este vizibilă; nu am inventat date în locul ei.' : 'Obturatorul a rămas deschis. Cele trei citiri din nor sunt afectate de interferențe.' });
  }
  return docs;
}

export function playView(p: ScenarioProgress, stage: number, post: Post, zone: Zone): PlayView | undefined {
  if (p.profile === 'legacy-v3' || ![1, 2, 3].includes(stage)) return;
  const z = p.zones[seat(post, zone)], s = stageState(p, post, zone, stage);
  const solved = p.profile === 'age-10-15' && stage === 2 ? z.probes.length >= 2 : p.profile === 'age-15-18' && stage === 2 ? (z.game?.tests?.length ?? 0) >= 2 : !!selected(z.choices[String(stage)]);
  const base: PlayBase = { stage, post, zone, seq: s?.seq ?? 0, attempts: s?.attempts ?? 0, solved, observed: !!s?.observed, title: '', instruction: '', feedback: s?.feedback ?? '', lesson: '', lastAction: s?.lastAction ?? '' };
  if (p.profile === 'age-5-10') {
    const shape = ownShape(post, zone), target: [number, number] = [1, 3];
    const turns = s?.wireTurns ?? (z.choices['3'] === 'linked' ? target : [0, 2]);
    return { ...base, kind: 'light', title: ['Prinde lumina!', 'Atelierul felinarului', 'Aprinde felinarul'][stage - 1], instruction: ['Atinge bucata care se potrivește cu forma de sus.', 'Rotește piesa și trage-o în contur.', 'Rotește cele două coturi ca să aprinzi felinarul.'][stage - 1], lesson: ['Recunoști o formă chiar dacă are altă mărime.', 'O piesă rotită își păstrează forma.', 'Becul se aprinde când circuitul este închis: bateria și becul sunt legate printr-un drum dus și întors.'][stage - 1], shape, candidates: [shape, ownShape(post === 5 ? 1 : (post + 1) as Post, zone), ownShape(post === 1 ? 5 : (post - 1) as Post, zone)].sort((a, b) => a.localeCompare(b, 'ro')), rotation: s?.rotation ?? z.game?.rotation ?? (stage === 2 ? 1 + post % 3 : 0), socketRotation: 0, wireTurns: [...turns] as [number, number], wireTargets: target, wireConnected: turns[0] === target[0] && turns[1] === target[1] };
  }
  if (p.profile === 'age-10-15') {
    const angle = s?.angle ?? stageState(p, post, zone, 2)?.angle ?? stageState(p, post, zone, 1)?.angle ?? 0, targetAngle = (post - 3) * 20;
    const records = stageState(p, post, zone, 2)?.records ?? z.probes.map((probe, i) => ({ id: i + 1, input: probe.split('-').map(Number), received: probe.split('-').map(Number), predicted: [2, 2, 2] }));
    return { ...base, kind: 'signal', title: ['Prinde semnalul', 'Trimite ceva neașteptat', 'Pune dovada lângă explicație'][stage - 1], instruction: ['Rotește antena. Ce crezi că se află la capăt?', 'Schimbă ordinea pieselor 1, 2 și 3. Trimite ritmul.', 'Trage un rezultat peste explicația pe care o susține.'][stage - 1], lesson: ['Un semnal mai puternic nu ne spune cine îl trimite.', 'Schimbăm intrarea și urmărim dacă se schimbă răspunsul.', 'O explicație bună trebuie să se potrivească cu rezultatul testului.'][stage - 1], angle, targetAngle, strength: signalStrength(angle, targetAngle), canTransmit: true, hypothesis: selected(z.choices['1']) as SignalPlayView['hypothesis'], sequence: s?.sequence ?? stageState(p, post, zone, 2)?.sequence ?? [1, 2, 3], records: structuredClone(records), verdict: selected(z.choices['3']), attachment: z.attachment };
  }
  if (p.profile === 'age-15-18') {
    const authority = playRule(p, post, 'A', stage === 3) as PilotPlayView['authority'], confirmation = playRule(p, post, 'B', stage === 3) as PilotPlayView['confirmation'];
    const test = s?.case ?? stageState(p, post, zone, 2)?.case ?? (z.choices['2'] === 'conflict' ? 'conflict' : 'agree');
    return { ...base, kind: 'pilot', title: ['Tu îi dai libertatea', 'Pune pilotul la încercare', 'Schimbă regula. Vezi diferența.'][stage - 1], instruction: stage === 2 ? 'Pornește o probă cu senzorii de acord, apoi una în care se contrazic.' : zone === 'A' ? 'Mișcă maneta: pilotul propune sau poate executa?' : 'Mișcă maneta: când cere pilotul acordul?', lesson: 'Un pilot automat execută regula primită. Senzorii de acord pot totuși greși.', authority, confirmation, case: test, decision: pilotDecision(authority, confirmation, test), beforeDecision: pilotDecision(playRule(p, post, 'A', false), playRule(p, post, 'B', false), test), sensorLabels: [sensors[post - 1][0], sensors[post - 1][test === 'agree' ? 0 : 1]], ruleEditable: stage !== 2 };
  }
  const center = stageState(p, post, zone, 1)?.center ?? 1;
  const measurementLabel = ['Culoar liber', 'Consum', 'Intensitatea semnalului', 'Conectivitate', 'Date păstrate'][post - 1] + ' · indice simulat 0–100';
  return { ...base, kind: 'survey', measurementLabel, title: ['Cât vrei să vezi?', 'Un nor trece prin dreptul sondei', 'Trimite ceva folositor'][stage - 1], instruction: ['Mută instrumentul, apoi alege cât cercetezi.', 'Închizi obturatorul prin nor sau lași sonda să înregistreze?', 'Trage un document către următorul echipaj.'][stage - 1], lesson: ['Mai mult detaliu într-un loc înseamnă mai puțină energie pentru restul.', 'Datele lipsă și datele tulburate nu sunt același lucru.', 'Transmite și limitele observației, nu doar ce pare convingător.'][stage - 1], center, credits: 2 - (z.choices['1'] === 'fine' ? 2 : z.choices['1'] === 'wide' ? 1 : 0) - (z.choices['2'] === 'protect' ? 1 : 0), scanKind: ['wide', 'fine'].includes(z.choices['1']) ? z.choices['1'] as SurveyPlayView['scanKind'] : undefined, protection: ['protect', 'passive'].includes(z.choices['2']) ? z.choices['2'] as SurveyPlayView['protection'] : undefined, documents: playDocuments(p, post, zone), scanValues: surveySamples(post), shutterSeconds: 3, selectedDocument: ['observation', 'probe'].includes(z.choices['3']) ? z.choices['3'] as SurveyPlayView['selectedDocument'] : undefined };
}

/** Valid unsuccessful experiments are commits, not protocol errors. */
export function applyPlayAction(progress: ScenarioProgress, action: ScenarioAction): { ok: boolean; reason?: string; progress: ScenarioProgress } {
  const fail = (reason = 'unavailable-action') => ({ ok: false, reason, progress });
  if (action.action !== 'choose' || typeof action.value !== 'string' || action.value.length > 200 || !Number.isInteger(action.post) || action.post < 1 || action.post > 5 || !['A', 'B'].includes(action.zone) || ![1, 2, 3].includes(action.stage)) return fail('invalid-action');
  const current = playView(progress, action.stage, action.post, action.zone); if (!current) return fail();
  const parts = action.value.split(':'), [, verb, arg, extra] = parts;
  if (parts[0] !== 'play' || parts.length > 4 || !verb || (arg === undefined && action.value !== 'play:observe')) return fail('invalid-action');
  const p: ScenarioProgress = structuredClone(progress), z = p.zones[seat(action.post, action.zone)];
  z.play ??= { version: 1, stages: {} };
  const s = z.play.stages[String(action.stage)] ??= { seq: 0, attempts: 0, lastAction: '', feedback: '' };
  if (action.value === 'play:observe') { s.observed = true; s.seq++; s.lastAction = action.value; s.feedback = 'Poți urmări ce se întâmplă. Atinge jocul dacă vrei să încerci.'; return { ok: true, progress: p }; }
  s.observed = false;
  const integer = (value: string | undefined, min: number, max: number) => value !== undefined && /^-?\d+$/.test(value) && Number(value) >= min && Number(value) <= max;
  let trial = false;
  if (current.kind === 'light') {
    if (verb === 'match' && action.stage === 1 && extra === undefined && current.candidates.includes(arg)) {
      trial = true;
      if (arg === current.shape) { z.choices['1'] = 'found'; s.feedback = 'Ai prins-o! Piesa ta intră în valiză.'; }
      else s.feedback = 'Nu se potrivește încă. Urmărește marginea formei, nu culoarea.';
    } else if (verb === 'rotate' && action.stage === 2 && integer(arg, 0, 3) && extra === undefined) { s.rotation = Number(arg); s.feedback = 'Acum încearcă piesa în contur.'; }
    else if (verb === 'fit' && action.stage === 2 && integer(arg, 0, 3) && extra === undefined) {
      trial = true; s.rotation = Number(arg);
      if (current.shape === 'Cerc' || s.rotation === current.socketRotation) { z.choices['2'] = 'fitted'; z.game = { ...z.game, rotation: s.rotation }; s.feedback = 'Se potrivește! Piesa ta rămâne în felinar.'; }
      else s.feedback = 'Încă nu intră. Rotește-o și încearcă din nou.';
    } else if (verb === 'wire' && action.stage === 3 && integer(arg, 0, 1) && integer(extra, 0, 3)) {
      trial = true; s.wireTurns = [...current.wireTurns]; s.wireTurns[Number(arg)] = Number(extra);
      if (s.wireTurns.every((v, i) => v === current.wireTargets[i])) { z.choices['3'] = 'linked'; s.feedback = 'Circuitul este închis. Becul s-a aprins!'; }
      else s.feedback = 'Circuitul este încă întrerupt. Rotește cotul ca să legi firele.';
    } else return fail();
  } else if (current.kind === 'signal') {
    if (verb === 'tune' && action.stage <= 2 && integer(arg, -60, 60) && extra === undefined) {
      s.angle = Number(arg); const strength = signalStrength(s.angle, current.targetAngle);
      if (action.stage === 2 && !z.choices['2']?.startsWith('measure:')) z.choices['2'] = 'measure:0';
      s.feedback = strength >= 80 ? 'Semnal clar. Antena este gata pentru test.' : 'Semnal slab. Rotește antena spre sursă.';
    } else if (verb === 'hypothesis' && action.stage === 1 && ['far', 'relay', 'uncertain'].includes(arg) && extra === undefined) { z.choices['1'] = arg; s.feedback = 'Am păstrat presupunerea ta. Urmează să o încercăm.'; }
    else if (verb === 'signal' && action.stage === 2 && /^(1|2|3)-(1|2|3)-(1|2|3)$/.test(arg) && new Set(arg.split('-')).size === 3 && extra === undefined) {
      trial = true; s.sequence = arg.split('-').map(Number); const received = current.strength >= 80 ? [...s.sequence] : null;
      const previousRecords = s.records ?? current.records;
      s.records = [...previousRecords, { id: Math.max(s.seq, ...previousRecords.map(r => r.id)) + 1, input: [...s.sequence], received, predicted: [2, 2, 2] }].slice(-8);
      if (received) { if (!z.probes.includes(arg)) z.probes.push(arg); if (!p.probes.includes(arg)) p.probes.push(arg); s.feedback = 'A revenit ritmul tău. Schimbă ordinea și vezi dacă te urmărește.'; }
      else s.feedback = 'Nu am primit un răspuns clar. Reglează antena și trimite din nou.';
    } else if (verb === 'conclude' && action.stage === 3 && ['far', 'relay', 'insufficient'].includes(arg) && (extra === 'none' || integer(extra, 1, 1000000))) {
      const record = current.records.find(r => r.id === Number(extra)); if (extra !== 'none' && !record) return fail();
      trial = true; z.choices['3'] = arg; delete z.pendingVerdict;
      z.attachment = record?.received ? p.probes.length >= 2 ? 'attach:repeated' : 'attach:single' : 'attach:none';
      s.feedback = arg === 'relay' && record?.received ? 'Rezultatul ales arată același ritm la intrare și la ieșire.' : arg === 'insufficient' && (!record?.received || p.probes.length < 2) ? 'Ai arătat ce ne lipsește. Mai multe teste ar putea lămuri răspunsul.' : 'Compară din nou: explicația trebuie să prezică ritmul pe care l-ai primit.';
    } else return fail();
  } else if (current.kind === 'pilot') {
    if (verb === 'rule' && action.stage !== 2 && (action.zone === 'A' ? ['propose', 'execute'] : ['always', 'conflict']).includes(arg) && extra === undefined) { z.choices[String(action.stage)] = arg; s.feedback = 'Regula s-a schimbat. Pornește o probă ca să vezi ce face pilotul.'; }
    else if (verb === 'pilot' && ['agree', 'conflict'].includes(arg) && extra === undefined) {
      trial = true; s.case = arg as 'agree' | 'conflict';
      if (action.stage >= 2) { z.game = { ...z.game, tests: [...new Set([...(z.game?.tests ?? (['agree', 'conflict'].includes(z.choices['2']) ? [z.choices['2'] as 'agree' | 'conflict'] : [])), s.case])] }; if (action.stage === 2) z.choices['2'] = arg; }
      const decision = pilotDecision(playRule(p, action.post, 'A', action.stage === 3), playRule(p, action.post, 'B', action.stage === 3), arg);
      s.feedback = { incomplete: 'Pilotul așteaptă ambele reguli. Nu presupune permisiunea colegului.', propose: 'Pilotul arată direcția. Echipajul decide dacă pornește.', confirm: 'Pilotul se oprește la poartă și cere acordul echipajului.', execute: 'Pilotul trece de poartă și execută acțiunea în simulare.' }[decision];
    } else return fail();
  } else {
    if (verb === 'center' && action.stage === 1 && integer(arg, 0, 2) && extra === undefined) { s.center = Number(arg) as 0 | 1 | 2; s.feedback = 'Instrument mutat. Privirea de probă nu consumă energie.'; }
    else if (verb === 'scan' && action.stage === 1 && ['wide', 'fine'].includes(arg) && (extra === undefined || integer(extra, 0, 2))) {
      if (selected(z.choices['1']) && z.choices['1'] !== arg) return fail('scan-already-recorded');
      if (!selected(z.choices['1'])) { const cost = arg === 'fine' ? 2 : 1; if (current.credits < cost) return fail('insufficient-energy'); z.choices['1'] = arg; s.scanCenter = extra === undefined ? current.center : Number(extra) as 0 | 1 | 2; s.center = s.scanCenter; }
      trial = true; s.feedback = arg === 'fine' ? `Ai cercetat zona ${(s.scanCenter ?? 1) + 1} în detaliu. Celelalte rămân deschise.` : 'Ai harta celor trei zone. Detaliile mici încă se ascund în medie.';
    } else if (verb === 'shield' && action.stage === 2 && ['protect', 'passive'].includes(arg) && extra === undefined) {
      if (selected(z.choices['2']) && z.choices['2'] !== arg) return fail('probe-already-recorded');
      if (!selected(z.choices['2'])) { if (arg === 'protect' && current.credits < 1) return fail('insufficient-energy'); z.choices['2'] = arg; }
      trial = true; s.feedback = arg === 'protect' ? 'Obturatorul se închide. În grafic rămâne o întrerupere.' : 'Obturatorul rămâne deschis. Urmărește citirile afectate de interferențe.';
    } else if (verb === 'archive' && action.stage === 3 && ['observation', 'probe'].includes(arg) && extra === undefined && current.documents.some(doc => doc.id === arg)) { trial = true; z.choices['3'] = arg; s.feedback = 'Documentul și limitele lui au ajuns la următorul echipaj.'; }
    else return fail();
  }
  s.seq++; if (trial) s.attempts++; s.lastAction = action.value;
  return { ok: true, progress: p };
}
