import test from 'node:test';
import assert from 'node:assert/strict';
import { experienceVisual } from './education-experience';
import { freshExperience } from '../../server/experience';
import { EXPERIENCE_PRACTICE, FINALE_CHOICES } from '../../shared/experience';
import type { MissionSnapshot } from '../../shared/mission';
import type { ScenarioId } from '../../shared/scenario-engine';

function snapshot(profile: ScenarioId = 'age-5-10'): MissionSnapshot {
  return { scenarioId: profile, post: 1, experience: { ...freshExperience(), status: 'tutorial',
    active: true, finaleActive: false, canContinue: false, paused: false } } as MissionSnapshot;
}

test('tutorial selection is not confirmation, across every profile', () => {
  for (const profile of Object.keys(EXPERIENCE_PRACTICE) as ScenarioId[]) {
    const s = snapshot(profile); s.experience!.step = 'practice';
    const option = EXPERIENCE_PRACTICE[profile].options[0];
    s.experience!.practice['1A'] = option.value;
    const before = JSON.stringify(s);
    assert(experienceVisual(s, 'A', false).objects.every(object => object.state !== 'confirmed'));
    assert.equal(JSON.stringify(s), before, 'render model is read-only');
    s.experience!.practiced.push('1A');
    const confirmed = experienceVisual(s, 'A', false).objects.filter(object => object.state === 'confirmed');
    assert.deepEqual(confirmed.map(object => object.label), [option.label]);
  }
});

test('ready never invents a missing link; observer, absent and pending are distinct', () => {
  const s = snapshot(); s.experience!.step = 'ready';
  s.experience!.participants = ['1A', '1B'];
  s.experience!.linked = ['1A'];
  const model = experienceVisual(s, 'B', false);
  assert.deepEqual(model.objects.map(object => object.state), ['confirmed', 'available']);
  assert.equal(model.links.length, 0);
  assert(model.objects[0].x < model.objects[1].x, 'A stays left in the B panel too');
  s.experience!.observed = ['1B'];
  assert.equal(experienceVisual(s, 'B', false).objects[0].state, 'observed');
  s.experience!.participants = ['1A'];
  assert.equal(experienceVisual(s, 'B', false).objects[0].state, 'missing');
});

test('finale preserves exact choices, absence, observation and unanswered seats', () => {
  for (const profile of Object.keys(FINALE_CHOICES) as ScenarioId[]) {
    const s = snapshot(profile); s.experience!.participants = ['1A', '1B', '2A'];
    s.experience!.finale = { '1A': FINALE_CHOICES[profile].options[0].value, '1B': 'observe' };
    const model = experienceVisual(s, 'A', true);
    assert.equal(model.objects.length, 10);
    assert.deepEqual(model.objects.slice(0, 4).map(object => object.state), ['confirmed', 'observed', 'available', 'missing']);
    assert(model.facts[0].includes(FINALE_CHOICES[profile].options[0].label));
    assert(model.objects.every(object => object.label.length <= 16));
    assert.equal(model.links.length, 0);
    assert(model.facts[2].includes('1 răspuns primit · 1 persoană privește'));
    assert(model.objects.every(object => Math.abs(object.x) <= 4 && Math.abs(object.y) <= 1));
    // A tutorial observer may still make a final choice. Only finale state governs finale.
    s.experience!.observed = ['1A'];
    assert.equal(experienceVisual(s, 'A', true).objects[0].state, 'confirmed');
  }
});
