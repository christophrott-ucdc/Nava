import test from 'node:test';
import assert from 'node:assert/strict';
import { applyScenarioAction, createProgress, scenarioConditions, scenarioView, summarizeScenario, type Post, type ScenarioProgress, type Zone } from './scenario-engine';
import { playView, playDocuments, pilotDecision, signalStrength, type LightPlayView, type SignalPlayView, type PilotPlayView, type SurveyPlayView } from './play-engine';

function act(p: ScenarioProgress, stage: number, value: string, post: Post = 1, zone: Zone = 'A'): ScenarioProgress {
  const before = JSON.stringify(p);
  const result = applyScenarioAction(p, { action: 'choose', stage, value, post, zone });
  assert.equal(result.ok, true, `${p.profile}/${stage}/${value}: ${result.reason}`);
  assert.equal(JSON.stringify(p), before, 'input remains immutable');
  return result.progress;
}
function reject(p: ScenarioProgress, stage: number, value: string, post: Post = 1, zone: Zone = 'A') {
  const result = applyScenarioAction(p, { action: 'choose', stage, value, post, zone });
  assert.equal(result.ok, false, value);
  assert.equal(result.progress, p, 'rejection keeps the authoritative object');
}

test('every age, stage, post and side receives an isolated direct-play view; original remains untouched', () => {
  for (const profile of ['age-5-10', 'age-10-15', 'age-15-18', 'adults'] as const) {
    const p = createProgress(profile), serialized = JSON.stringify(p);
    for (const post of [1, 2, 3, 4, 5] as const) for (const zone of ['A', 'B'] as const) for (let stage = 1; stage <= 3; stage++) {
      const v = scenarioView(p, stage, post).zones[zone].play!;
      assert.equal(v.post, post); assert.equal(v.zone, zone); assert.equal(v.stage, stage); assert.equal(v.solved, false);
      assert(v.instruction.length > 10 && v.lesson.length > 10);
    }
    assert.equal(JSON.stringify(p), serialized);
  }
  assert.equal(scenarioView(createProgress('legacy-v3'), 1, 1).zones.A.play, undefined);
  reject(createProgress('legacy-v3'), 1, 'play:match:Cerc');
});

test('shape mistakes are recorded trials, retries solve, and earned discoveries survive later exploration', () => {
  for (const post of [1, 2, 3, 4, 5] as const) for (const zone of ['A', 'B'] as const) {
    let p = createProgress('age-5-10'); const view = playView(p, 1, post, zone) as LightPlayView;
    p = act(p, 1, `play:match:${view.candidates.find(s => s !== view.shape)}`, post, zone);
    assert.equal(playView(p, 1, post, zone)!.attempts, 1); assert.equal(playView(p, 1, post, zone)!.solved, false);
    p = act(p, 1, `play:match:${view.shape}`, post, zone);
    assert.equal(p.zones[`${post}${zone}`].choices['1'], 'found');
    p = act(p, 1, `play:match:${view.candidates.find(s => s !== view.shape)}`, post, zone);
    assert.equal(playView(p, 1, post, zone)!.solved, true);
    assert(scenarioConditions(p).has('find_partial'));
  }
});

test('fit uses geometric rotation: circle has no arbitrary key; other pieces require the matching orientation', () => {
  for (let turn = 0; turn < 4; turn++) {
    const p = act(createProgress('age-5-10'), 2, `play:fit:${turn}`);
    assert.equal(p.zones['1A'].choices['2'], 'fitted');
  }
  let p = act(createProgress('age-5-10'), 2, 'play:fit:1', 1, 'B');
  assert.equal(p.zones['1B'].choices['2'], undefined);
  assert.equal(playView(p, 2, 1, 'B')!.attempts, 1);
  p = act(p, 2, 'play:fit:0', 1, 'B'); assert.equal(p.zones['1B'].choices['2'], 'fitted');
  p = act(p, 2, 'play:rotate:3', 1, 'B'); assert.equal(playView(p, 2, 1, 'B')!.solved, true);
});

test('wire light requires both physical bends; reopening a bend does not erase the earned contribution', () => {
  let p = act(createProgress('age-5-10'), 3, 'play:wire:0:1');
  assert.equal((playView(p, 3, 1, 'A') as LightPlayView).wireConnected, false);
  p = act(p, 3, 'play:wire:1:3'); assert.equal((playView(p, 3, 1, 'A') as LightPlayView).wireConnected, true);
  assert.equal(p.zones['1A'].choices['3'], 'linked');
  p = act(p, 3, 'play:wire:0:0'); const v = playView(p, 3, 1, 'A') as LightPlayView;
  assert.equal(v.wireConnected, false); assert.equal(v.solved, true);
  assert.equal(p.zones['1B'].choices['3'], undefined, 'other person is never completed automatically');
});

test('signal strength changes reception, and duplicate experiments remain replayable without inventing new evidence', () => {
  assert.equal(signalStrength(-40, -40), 100); assert.equal(signalStrength(0, -40), 0);
  let p = act(createProgress('age-10-15'), 2, 'play:signal:1-2-3');
  let v = playView(p, 2, 1, 'A') as SignalPlayView;
  assert.equal(v.records[0].received, null); assert.equal(p.probes.length, 0);
  p = act(p, 2, 'play:tune:-40'); assert.equal(p.zones['1A'].choices['2'], 'measure:0');
  assert.equal(playView(p, 2, 1, 'A')!.solved, false, 'a measurement alone is not two successful experiments');
  p = act(p, 2, 'play:signal:1-2-3'); p = act(p, 2, 'play:signal:1-2-3');
  assert.equal(p.probes.length, 1); assert.equal(playView(p, 2, 1, 'A')!.solved, false);
  p = act(p, 2, 'play:signal:3-1-2');
  v = playView(p, 2, 1, 'A') as SignalPlayView;
  assert.equal(p.probes.length, 2); assert.equal(v.solved, true); assert.equal(v.records.length, 4);
  assert.deepEqual(v.records.at(-1)!.received, [3, 1, 2]); assert.deepEqual(v.records.at(-1)!.predicted, [2, 2, 2]);
  const id = v.records.at(-1)!.id;
  p = act(p, 3, `play:conclude:relay:${id}`);
  assert(scenarioConditions(p).has('V')); assert.equal(p.zones['1A'].attachment, 'attach:repeated');
  reject(p, 3, 'play:conclude:relay:999');
  p = act(p, 3, `play:conclude:far:${id}`); assert(scenarioConditions(p).has('D'), 'conclusion stays revisable');
});

test('old signal probes restore as usable records with unique ids when the next direct experiment is saved', () => {
  let p = createProgress('age-10-15'); p.zones['3A'].probes = ['1-2-3']; p.probes = ['1-2-3'];
  p = act(p, 2, 'play:signal:3-2-1', 3);
  const v = playView(p, 2, 3, 'A') as SignalPlayView;
  assert.equal(new Set(v.records.map(r => r.id)).size, 2);
  const json = JSON.parse(JSON.stringify(p)); assert.deepEqual(playView(json, 2, 3, 'A'), v);
});

test('the direct pilot obeys the exact legacy rule table and revisions preserve the original response', () => {
  for (const authority of ['propose', 'execute']) for (const confirmation of ['always', 'conflict']) for (const example of ['agree', 'conflict']) {
    let p = act(createProgress('age-15-18'), 1, `play:rule:${authority}`);
    p = act(p, 1, `play:rule:${confirmation}`, 1, 'B');
    p = act(p, 2, `play:pilot:${example}`);
    const v = playView(p, 2, 1, 'A') as PilotPlayView;
    assert.equal(v.decision, pilotDecision(authority, confirmation, example));
    p = act(p, 2, 'play:pilot:agree'); p = act(p, 2, 'play:pilot:conflict'); p = act(p, 2, 'play:pilot:conflict');
    assert.equal(p.zones['1A'].game!.tests!.length, 2); assert.equal(playView(p, 2, 1, 'A')!.solved, true);
  }
  let p = act(createProgress('age-15-18'), 1, 'play:rule:execute'); p = act(p, 1, 'play:rule:conflict', 1, 'B');
  p = act(p, 2, 'play:pilot:agree'); p = act(p, 3, 'play:rule:propose');
  const revised = playView(p, 3, 1, 'A') as PilotPlayView;
  assert.equal(revised.beforeDecision, 'execute'); assert.equal(revised.decision, 'propose');
  reject(p, 2, 'play:rule:execute'); reject(p, 1, 'play:rule:always');
});

test('adult scan target changes real sampled data; previews are free, replay neither spends nor silently changes the recorded target', () => {
  let p = act(createProgress('adults'), 1, 'play:center:0');
  assert.equal((playView(p, 1, 1, 'A') as SurveyPlayView).credits, 2);
  p = act(p, 1, 'play:scan:fine:0');
  const before = playDocuments(p, 1, 'A')[0]; assert.deepEqual(before.values.slice(0, 3), [28, 32, 35]);
  assert(before.values.slice(3).every(v => v === null));
  p = act(p, 1, 'play:scan:fine:2');
  assert.deepEqual(playDocuments(p, 1, 'A')[0], before); assert.equal((playView(p, 1, 1, 'A') as SurveyPlayView).credits, 0);
  reject(p, 1, 'play:scan:wide:1'); reject(p, 2, 'play:shield:protect');
  const other = act(createProgress('adults'), 1, 'play:scan:fine:2'); assert.notDeepEqual(playDocuments(other, 1, 'A'), playDocuments(p, 1, 'A'));
});

test('a closed shutter leaves missing data, an open shutter uncertain data; archive accepts only an actual retained document', () => {
  let p = act(createProgress('adults'), 1, 'play:scan:wide:1');
  p = act(p, 2, 'play:shield:protect'); p = act(p, 2, 'play:shield:protect');
  const protectedReport = playDocuments(p, 1, 'A')[1];
  assert.deepEqual(protectedReport.values.slice(3, 6), [null, null, null]); assert.equal(protectedReport.uncertainty.some(Boolean), false);
  assert.equal((playView(p, 2, 1, 'A') as SurveyPlayView).credits, 0);
  let open = act(createProgress('adults'), 2, 'play:shield:passive');
  assert(playDocuments(open, 1, 'A')[0].values.every(v => v !== null)); assert.equal(playDocuments(open, 1, 'A')[0].uncertainty.filter(Boolean).length, 3);
  reject(open, 3, 'play:archive:observation');
  open = act(open, 3, 'play:archive:probe'); assert(scenarioConditions(open).has('archive_one_type'));
  p = act(p, 3, 'play:archive:observation'); p = act(p, 3, 'play:archive:probe'); assert.equal(p.zones['1A'].choices['3'], 'probe');
});

test('observing never invents an achievement, allows resuming, and does not erase a previous success', () => {
  for (const profile of ['age-5-10', 'age-10-15', 'age-15-18', 'adults'] as const) {
    const p = act(createProgress(profile), 1, 'play:observe');
    assert.equal(playView(p, 1, 1, 'A')!.observed, true); assert.deepEqual(p.zones['1A'].choices, {});
  }
  let p = act(createProgress('age-5-10'), 1, 'play:observe'); p = act(p, 1, 'play:match:Cerc');
  assert.equal(playView(p, 1, 1, 'A')!.observed, false);
  p = act(p, 1, 'play:observe'); assert.equal(playView(p, 1, 1, 'A')!.solved, true);
});

test('malformed gestures, out-of-range positions, wrong stages and cross-profile commands are rejected', () => {
  const child = createProgress('age-5-10');
  for (const value of ['play:fit:NaN', 'play:fit:4', 'play:fit:1.5', 'play:fit:0:extra', 'play:wire:2:0', 'play:signal:1-2-3', 'play:match:unknown']) reject(child, 2, value);
  const teen = createProgress('age-10-15');
  for (const value of ['play:tune:61', 'play:tune:-61', 'play:signal:1-1-3', 'play:signal:1-2', 'play:signal:1-2-4']) reject(teen, 2, value);
  reject(createProgress('adults'), 1, 'play:scan:fine:3'); reject(createProgress('adults'), 1, 'play:scan:free:0');
});

test('the journal describes the actual new experiment, not the retired instrument readings', () => {
  let signal = act(createProgress('age-10-15'), 2, 'play:tune:0');
  signal = act(signal, 2, 'play:signal:1-2-3');
  const signalLine = summarizeScenario(signal).posts[0].lines[0];
  assert(signalLine.includes('teste fără răspuns clar: 1'));
  assert(!signalLine.includes('12°'), 'turning the new antenna is not the old fixed-angle measurement');
  let survey = act(createProgress('adults'), 1, 'play:scan:fine:2');
  survey = act(survey, 2, 'play:shield:passive');
  const openLine = summarizeScenario(survey).posts[0].lines[0];
  assert(openLine.includes('Detaliul zonei 3')); assert(openLine.includes('interferențe'));
  survey = act(createProgress('adults'), 2, 'play:shield:protect');
  const closedLine = summarizeScenario(survey).posts[0].lines[0];
  assert(closedLine.includes('Trei secunde fără citiri'));
  assert(!closedLine.includes('raport verificat'));
});
