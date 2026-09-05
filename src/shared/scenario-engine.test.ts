import test from 'node:test';
import assert from 'node:assert/strict';
import { applyScenarioAction, createProgress, scenarioConditions, scenarioView, summarizeScenario, type ScenarioProgress, type Post, type Zone } from './scenario-engine';

function choose(p: ScenarioProgress, stage: number, post: Post, zone: Zone, value: string): ScenarioProgress {
  const result = applyScenarioAction(p, { stage, post, zone, action: 'choose', value });
  assert.equal(result.ok, true, `${p.profile}/${stage}/${post}${zone}/${value}: ${result.reason}`);
  return result.progress;
}
const rejected = (p: ScenarioProgress, stage: number, post: Post, zone: Zone, value: string) => assert.equal(applyScenarioAction(p, { stage, post, zone, action: 'choose', value }).ok, false);
function align(p: ScenarioProgress, post: Post, zone: Zone): ScenarioProgress {
  while (p.zones[`${post}${zone}`].game?.rotation) p = choose(p, 2, post, zone, 'rotate');
  return p;
}
function probe(p: ScenarioProgress, post: Post, zone: Zone, values: number[]): ScenarioProgress {
  p = choose(p, 2, post, zone, 'construct');
  for (const n of values) p = choose(p, 2, post, zone, `piece:${n}`);
  return choose(p, 2, post, zone, 'send');
}
test('zero participation selects honest empty branches and serializes without changing anything', () => {
  for (const [profile, expected] of [['age-5-10', 'final_none'], ['age-10-15', 'N'], ['age-15-18', 'DRAFT'], ['adults', 'archive_empty']] as const) {
    const p = createProgress(profile);
    assert(scenarioConditions(p).has(expected));
    assert.deepEqual(JSON.parse(JSON.stringify(p)), p);
    assert.equal(summarizeScenario(p).posts.length, 5);
  }
  assert.equal(summarizeScenario(createProgress('age-5-10')).lines.length, 3);
});
test('children retain shape provenance, allow retries and count B-only latches independently', () => {
  const empty = createProgress('age-5-10');
  rejected(empty, 1, 1, 'A', 'shape:Frunză');
  let p = choose(empty, 3, 5, 'B', 'link');
  assert(scenarioConditions(p).has('link_partial'));
  rejected(p, 3, 5, 'B', 'link');
  p = choose(p, 2, 2, 'A', 'select'); p = align(p, 2, 'A'); p = choose(p, 2, 2, 'A', 'fit');
  assert.match(summarizeScenario(p).posts[1].lines[0], /primită de la Natură/);
  assert(scenarioConditions(p).has('find_none'));
  assert.equal(Object.keys(empty.zones['5B'].choices).length, 0, 'input is immutable');
});
test('children can complete every post and retain ten identities through all three actions', () => {
  let p = createProgress('age-5-10');
  for (let post = 1; post <= 5; post++) for (const zone of ['A', 'B'] as const) {
    const shape = scenarioView(p, 1, post as Post).zones[zone].items![0].label;
    p = choose(p, 1, post as Post, zone, `shape:${shape}`);
    p = choose(p, 2, post as Post, zone, 'select'); p = align(p, post as Post, zone); p = choose(p, 2, post as Post, zone, 'fit');
    p = choose(p, 3, post as Post, zone, 'link');
  }
  for (const condition of ['find_complete', 'fit_complete', 'link_complete', 'final_complete']) assert(scenarioConditions(p).has(condition));
  assert.equal(summarizeScenario(p).lines.length, 0, 'no invented gifts');
});
test('all six teen permutations are legal and global evidence deduplicates across participants', () => {
  let p = createProgress('age-10-15');
  const perms = [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]];
  for (let n = 0; n < perms.length; n++) p = probe(p, (Math.floor(n / 2) + 1) as Post, n % 2 ? 'B' : 'A', perms[n]);
  p = probe(p, 5, 'B', perms[0]);
  assert.equal(p.probes.length, 6);
  assert.deepEqual(p.probes.slice(0, 2), ['1-2-3', '1-3-2']);
  assert(scenarioConditions(p).has('N'), 'proofs alone do not invent a verdict');
});
test('single teen can make both evidence probes; incomplete verdict is never counted', () => {
  let p = probe(createProgress('age-10-15'), 1, 'A', [1, 2, 3]);
  p = probe(p, 1, 'A', [3, 2, 1]);
  p = choose(p, 3, 1, 'A', 'relay');
  assert(scenarioConditions(p).has('N'));
  p = choose(p, 3, 1, 'A', 'attach:repeated');
  assert(scenarioConditions(p).has('V'));
  rejected(p, 3, 1, 'A', 'far');
  p = choose(p, 3, 2, 'A', 'far'); p = choose(p, 3, 2, 'A', 'attach:identity');
  assert(scenarioConditions(p).has('D'), 'tie is not strict majority');
});
test('teen builders reject incomplete sends and repeated pieces and permit undo', () => {
  let p = choose(createProgress('age-10-15'), 2, 4, 'B', 'construct');
  p = choose(p, 2, 4, 'B', 'piece:1'); rejected(p, 2, 4, 'B', 'piece:1'); rejected(p, 2, 4, 'B', 'send');
  p = choose(p, 2, 4, 'B', 'undo'); assert.equal(p.zones['4B'].builder.length, 0);
  p = choose(p, 3, 4, 'B', 'relay'); p = choose(p, 3, 4, 'B', 'attach:none');
  assert(scenarioConditions(p).has('O'), 'opinion does not create proof');
});
test('every station can measure, observe or skip the local measurement and construct independently', () => {
  for (let post = 1; post <= 5; post++) for (const zone of ['A', 'B'] as const) {
    let p = choose(createProgress('age-10-15'), 2, post as Post, zone, 'measure:0');
    assert.equal(p.zones[`${post}${zone}`].constructing, true);
    assert.match(scenarioView(p, 2, post as Post).zones[zone].detail, /Încă nu am trimis/);
    rejected(p, 2, post as Post, zone, 'measure:1');
  }
});
test('mandate truth table preserves all authority and confirmation combinations', () => {
  for (const a of ['propose', 'execute']) for (const b of ['always', 'conflict']) for (const t of ['agree', 'conflict']) {
    let p = choose(createProgress('age-15-18'), 1, 1, 'A', a); p = choose(p, 1, 1, 'B', b); p = choose(p, 2, 1, 'A', t);
    const detail = scenarioView(p, 2, 1).zones.A.feedback!;
    assert(detail.includes(a === 'propose' ? 'Pilotul propune' : b === 'always' || t === 'conflict' ? 'Pilotul cere acordul' : 'Pilotul execută acțiunea în simulare'));
  }
});
test('mandate amendments compare against the original and preserve observation, missing tests and late completion', () => {
  let p = choose(createProgress('age-15-18'), 1, 1, 'A', 'execute');
  p = choose(p, 2, 1, 'B', 'agree');
  p = choose(p, 3, 1, 'B', 'conflict'); p = choose(p, 3, 1, 'A', 'observe');
  const summary = summarizeScenario(p).posts[0].lines;
  assert.match(summary[1], /Pilotul așteaptă.*→ Pilotul execută acțiunea în simulare/);
  assert.match(summary[0], /niciun test rulat/);
  assert(scenarioConditions(p).has('PARTIAL'));
  rejected(createProgress('age-15-18'), 3, 1, 'B', 'keep');
});
test('all five mandates select retained or revised final independently', () => {
  let p = createProgress('age-15-18');
  for (let post = 1; post <= 5; post++) { p = choose(p, 1, post as Post, 'A', 'propose'); p = choose(p, 1, post as Post, 'B', 'always'); }
  assert(scenarioConditions(p).has('RETAINED'));
  p = choose(p, 3, 5, 'B', 'conflict');
  assert(scenarioConditions(p).has('REVISED'));
});
test('adult costs and unavailable archive choices are enforced with immutable resources', () => {
  let p = choose(createProgress('adults'), 1, 1, 'A', 'fine');
  rejected(p, 2, 1, 'A', 'protect'); rejected(p, 1, 1, 'A', 'wide');
  p = choose(p, 2, 1, 'A', 'passive'); p = choose(p, 3, 1, 'A', 'probe');
  assert.match(summarizeScenario(p).posts[0].lines[0], /réserve|réservé|rezervă 0/);
  assert.match(summarizeScenario(p).posts[0].lines[0], /observație păstrată local/);
  rejected(p, 3, 1, 'B', 'observation'); rejected(p, 3, 1, 'B', 'probe');
  assert(scenarioConditions(p).has('archive_one_type'));
});
test('adults can populate ten independent channels with both archive types without double spending', () => {
  let p = createProgress('adults');
  for (let post = 1; post <= 5; post++) for (const zone of ['A', 'B'] as const) {
    p = choose(p, 1, post as Post, zone, 'wide'); p = choose(p, 2, post as Post, zone, 'protect');
    p = choose(p, 3, post as Post, zone, zone === 'A' ? 'observation' : 'probe');
    rejected(p, 2, post as Post, zone, 'protect');
  }
  for (const condition of ['all_channels_have_document', 'archive_full', 'archive_both_types']) assert(scenarioConditions(p).has(condition));
});
test('abstention and missing response remain distinct without inventing documents', () => {
  let p = createProgress('adults');
  for (const stage of [1, 2, 3]) p = choose(p, stage, 1, 'A', 'abstain');
  assert(scenarioConditions(p).has('archive_empty'));
  assert.equal(p.zones['1A'].choices['3'], 'abstain');
  assert.equal(p.zones['1B'].choices['3'], undefined);
  assert.match(summarizeScenario(p).posts[0].lines[0], /rezervă 2/);
});
test('legacy and malformed actions cannot mutate the engine', () => {
  const p = createProgress('legacy-v3');
  rejected(p, 1, 1, 'A', 'observe');
  assert.equal(applyScenarioAction(p, { post: 9 as Post, zone: 'A', stage: 1, action: 'choose', value: 'x' }).ok, false);
});
test('keyed pieces need alignment; wrong routes do not mutate progress', () => {
  let p = choose(createProgress('age-5-10'), 2, 1, 'A', 'select');
  const before = JSON.stringify(p);
  assert.equal(applyScenarioAction(p, { stage: 2, post: 1, zone: 'A', action: 'choose', value: 'fit' }).reason, 'piece-not-aligned');
  assert.equal(JSON.stringify(p), before);
  p = align(p, 1, 'A'); p = choose(p, 2, 1, 'A', 'fit');
  for (const [value, reason] of [['dead-end', 'route-stops-early'], ['loop', 'route-returns-to-start']]) {
    const result = applyScenarioAction(p, { stage: 3, post: 1, zone: 'A', action: 'choose', value });
    assert.equal(result.reason, reason); assert.equal(result.progress, p);
  }
  p = choose(p, 3, 1, 'A', 'link');
  assert.equal(p.zones['1B'].choices['3'], undefined);
});
test('each pilot can test both sensor cases and compare both after revision', () => {
  let p = choose(createProgress('age-15-18'), 1, 1, 'A', 'execute');
  p = choose(p, 1, 1, 'B', 'conflict');
  p = choose(p, 2, 1, 'A', 'agree');
  assert.equal(scenarioView(p, 2, 1).zones.A.completed, false);
  p = choose(p, 2, 1, 'A', 'conflict');
  assert.equal(scenarioView(p, 2, 1).zones.A.completed, true);
  assert.deepEqual(p.zones['1A'].game?.tests, ['agree', 'conflict']);
  rejected(p, 2, 1, 'A', 'agree');
  p = choose(p, 3, 1, 'A', 'propose');
  const feedback = scenarioView(p, 3, 1).zones.A.feedback!;
  assert.match(feedback, /Aceeași indicație/); assert.match(feedback, /Indicații diferite/);
  assert.match(feedback, /execută acțiunea/); assert.match(feedback, /Pilotul propune/);
});
test('signal conclusion can be reconsidered before evidence is committed', () => {
  let p = choose(createProgress('age-10-15'), 3, 1, 'A', 'far');
  p = choose(p, 3, 1, 'A', 'reconsider');
  assert.equal(p.zones['1A'].pendingVerdict, undefined);
  assert.equal(p.zones['1A'].choices['3'], undefined);
  p = choose(p, 3, 1, 'A', 'insufficient');
  p = choose(p, 3, 1, 'A', 'attach:none');
  assert.equal(p.zones['1A'].choices['3'], 'insufficient');
});
test('adult documents expose consequences only after the corresponding choice', () => {
  let p = createProgress('adults');
  assert.deepEqual(scenarioView(p, 1, 1).zones.A.documents, []);
  p = choose(p, 1, 1, 'A', 'wide');
  assert.equal(scenarioView(p, 1, 1).zones.A.documents?.length, 1);
  p = choose(p, 2, 1, 'A', 'protect');
  const docs = scenarioView(p, 3, 1).zones.A.documents!;
  assert.equal(docs.length, 2); assert.equal(docs[1].samples.length, 3);
  assert.equal(new Set(docs[1].samples.map(s => s.value)).size, 1);
  p = choose(p, 3, 1, 'A', 'probe');
  assert.match(scenarioView(p, 3, 1).zones.A.feedback!, /limitele cercetării/);
});
test('adult resource label stays accurate after every choice and topics match documents', () => {
  for (let post = 1; post <= 5; post++) for (const zone of ['A', 'B'] as const) {
    let p = createProgress('adults');
    assert.equal(scenarioView(p, 1, post as Post).zones[zone].resourceLabel, 'Rezervă: 2 din 2 credite');
    p = choose(p, 1, post as Post, zone, 'fine');
    p = choose(p, 2, post as Post, zone, 'passive');
    const view = scenarioView(p, 2, post as Post).zones[zone];
    assert.equal(view.resourceLabel, 'Rezervă: 0 din 2 credite');
    const title = view.documents![0].title.split(' · ')[0];
    assert(view.detail.startsWith(title));
    assert.equal(view.visual?.facts[0], title);
    assert.doesNotMatch(view.feedback!, /Ai păstrat rezerva/);
  }
});
