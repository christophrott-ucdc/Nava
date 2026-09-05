import test from 'node:test';
import assert from 'node:assert/strict';
import { applyScenarioAction, createProgress, scenarioView, type ScenarioProgress, type Post, type Zone } from './scenario-engine';

const view = (p: ScenarioProgress, stage: number, post: Post = 1, zone: Zone = 'A') => scenarioView(p, stage, post).zones[zone].visual!;
function choose(p: ScenarioProgress, stage: number, value: string, post: Post = 1, zone: Zone = 'A') {
  const result = applyScenarioAction(p, { stage, post, zone, action: 'choose', value });
  assert(result.ok, result.reason);
  return result.progress;
}
function probe(p: ScenarioProgress, values: number[]) {
  p = choose(p, 2, 'construct');
  for (const n of values) p = choose(p, 2, `piece:${n}`);
  return choose(p, 2, 'send');
}

test('all 120 profile/stage/post/zone diagrams are bounded JSON and cannot mutate progress', () => {
  for (const profile of ['age-5-10', 'age-10-15', 'age-15-18', 'adults'] as const) {
    const p = createProgress(profile), before = JSON.stringify(p);
    for (const post of [1, 2, 3, 4, 5] as const) for (const zone of ['A', 'B'] as const) for (const stage of [1, 2, 3]) {
      const v = view(p, stage, post, zone);
      assert(v && v.title && v.caption);
      assert(v.objects.length <= 12 && v.facts.length <= 3);
      assert(v.objects.every(o => o.x >= -4 && o.x <= 4 && o.y >= -1 && o.y <= 1));
      assert.equal(new Set(v.objects.map(o => o.id)).size, v.objects.length);
      assert(v.links.every(link => link.every(id => v.objects.some(o => o.id === id))));
      assert.deepEqual(JSON.parse(JSON.stringify(v)), v);
    }
    assert.equal(JSON.stringify(p), before);
  }
  assert.equal(view(createProgress('legacy-v3'), 1), undefined);
  assert.equal(view(createProgress('age-5-10'), 0), undefined);
});

test('child provenance, selected versus fitted and A/B latches are honest', () => {
  let p = createProgress('age-5-10');
  assert.match(view(p, 2).facts[0], /Natura ți-a dăruit/);
  p = choose(p, 2, 'select');
  assert.match(view(p, 2).facts[1], /Ai luat piesa/);
  assert.equal(view(p, 2).links.length, 0);
  const unaligned = view(p, 2);
  assert.equal(unaligned.objects[0].keyMarker, true);
  assert.equal(unaligned.objects[0].quarterTurns, p.zones['1A'].game!.rotation);
  assert.equal(unaligned.objects[1].keyMarker, true);
  assert.equal(unaligned.objects[1].quarterTurns, 0);
  assert.notEqual(unaligned.objects[0].quarterTurns, 0);
  assert.equal(applyScenarioAction(p, { stage: 2, post: 1, zone: 'A', action: 'choose', value: 'fit' }).ok, false);
  while (p.zones['1A'].game?.rotation) p = choose(p, 2, 'rotate');
  assert.equal(view(p, 2).objects[0].quarterTurns, 0);
  p = choose(p, 2, 'fit');
  assert.equal(view(p, 2).objects.length, 1, 'assembled piece does not duplicate the socket');
  assert.equal(view(p, 2).objects[0].state, 'confirmed');
  assert.equal(view(p, 2).objects[0].x, 0);
  p = choose(p, 3, 'link', 1, 'B');
  const onlyB = view(p, 3);
  assert.equal(onlyB.objects[0].state, 'missing');
  assert.equal(onlyB.objects[1].state, 'confirmed');
  assert.equal(onlyB.links.length, 0);
  p = choose(p, 3, 'observe');
  assert.equal(view(p, 3).objects[0].state, 'observed');
  assert.match(view(p, 3).facts[0], /Ai ales să privești/);
  const found = choose(createProgress('age-5-10'), 1, 'shape:Cerc');
  assert.match(view(found, 2).facts[0], /Ai găsit piesa pe Siwarha/);
});

test('each child station retains its own geometric identities', () => {
  const expected = [['Cerc', 'Semilună'], ['Aripă', 'Flacără'], ['Undă', 'Clopoțel'], ['Frunză', 'Picătură'], ['Stea', 'Spirală']];
  for (const post of [1, 2, 3, 4, 5] as const) for (const [n, zone] of (['A', 'B'] as const).entries()) {
    assert.equal(view(createProgress('age-5-10'), 1, post, zone).objects[0].form, expected[post - 1][n]);
  }
});

test('signal cards retain exact intervals and describe the global two-second response shift', () => {
  let p = probe(createProgress('age-10-15'), [1, 3, 2]);
  p = probe(p, [3, 2, 1]);
  const v = view(p, 2);
  assert.equal(v.objects.length, 4);
  assert.deepEqual(v.objects.map(o => o.label), ['K trimis: 1–3–2', 'K primit: 1–3–2', 'R trimis: 3–2–1', 'R primit: 3–2–1']);
  assert.deepEqual(v.links, [['K-sent', 'K-received'], ['R-sent', 'R-received']]);
  assert.deepEqual(v.objects.map(o => o.intervals), [[1, 3, 2], [1, 3, 2], [3, 2, 1], [3, 2, 1]]);
  assert.deepEqual(v.objects.map(o => o.offsetSeconds), [0, 2, 0, 2]);
  assert(v.objects.every(o => o.intervals!.reduce((total, duration) => total + duration, 0) === 6), 'response shift never stretches the six-second sequence');
  assert.notEqual(v.objects[0].intervals, v.objects[1].intervals, 'render inspection cannot mutate the other sequence');
  assert.match(v.caption, /începe cu 2 s mai târziu/);
  assert.match(v.caption, /nu măsoară distanța/);
  assert.match(v.facts[0], /1-3-2 → 1-3-2/);
  assert.match(v.facts[1], /Ai trimis 2 din 2 teste/);
});

test('measurement uncertainty is explicit and observation does not invent a measurement', () => {
  const empty = createProgress('age-10-15');
  assert.match(view(empty, 2).facts[2], /Poți folosi și instrumentele/);
  const observed = choose(empty, 2, 'observe');
  assert.match(view(observed, 2).facts[2], /Ai ales să privești/);
  const measured = choose(empty, 2, 'measure:0', 1, 'B');
  const v = view(measured, 2, 1, 'B');
  assert.match(v.facts[2], /12° ±1°/);
  assert.deepEqual(v.objects.filter(o => o.id.startsWith('uncertainty')).map(o => o.label), ['11°', '13°']);
  assert.equal(v.links.length, 2);
});

test('pending verdict and locally attached evidence remain distinct from submitted verdict', () => {
  let p = choose(createProgress('age-10-15'), 2, 'measure:1');
  p = choose(p, 3, 'insufficient');
  assert.match(view(p, 3).facts[1], /alege acum dovada/);
  p = choose(p, 3, 'attach:local:A');
  assert.match(view(p, 3).facts[1], /Nu avem suficiente dovezi/);
  assert.match(view(p, 3).facts[2], /distanță necunoscută/);
});

test('mandate visual uses the actual engine result with identical test before and after', () => {
  let p = choose(createProgress('age-15-18'), 1, 'execute');
  p = choose(p, 1, 'conflict', 1, 'B');
  p = choose(p, 2, 'agree');
  assert.match(view(p, 2).facts[1], /execută acțiunea în simulare/);
  assert.deepEqual(view(p, 2).objects.filter(o => o.id.startsWith('sensor')).map(o => o.label), ['EST', 'EST']);
  p = choose(p, 3, 'always', 1, 'B');
  const v = view(p, 3);
  assert.match(v.facts[0], /execută acțiunea în simulare/);
  assert.match(v.facts[1], /cere acordul echipajului/);
  assert.match(v.facts[2], /Alege când ești gata/, 'other participant revision does not invent my participation');
  assert.match(v.caption, /totuși să greșească/);
  const noTest = view(choose(createProgress('age-15-18'), 2, 'observe'), 3);
  assert.match(noTest.facts[0], /Nu ai rulat încă un test/);
  assert(!noTest.objects.some(o => o.id.startsWith('sensor')));
});

test('adult budget depletion, document absence and local provenance remain distinct', () => {
  let p = choose(createProgress('adults'), 1, 'fine');
  assert.match(view(p, 2).facts[1], /0 din 2 credite/);
  assert.equal(view(p, 2).objects.filter(o => o.id.startsWith('budget') && o.state === 'available').length, 0);
  p = choose(p, 2, 'passive');
  p = choose(p, 3, 'observation');
  const v = view(p, 3);
  assert.equal(v.objects[0].label, 'Harta observațiilor · trimis');
  assert.equal(v.objects[1].label, 'Raportul sondei · în arhivă');
  assert.match(v.facts[1], /în detaliu/);
  assert.match(v.caption, /rămân în arhiva locală/);
  const empty = view(createProgress('adults'), 3);
  assert(empty.objects.every(o => o.state === 'missing'));
  assert.match(empty.facts[2], /Alege când ești gata/);
  const abstain = view(choose(createProgress('adults'), 3, 'abstain'), 3);
  assert.match(abstain.facts[2], /Ai păstrat documentele în arhiva locală/);
});
