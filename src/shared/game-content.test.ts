import test from 'node:test';
import assert from 'node:assert/strict';
import { adultDocument, adultSubject } from './game-content';
import type { Post } from './scenario-engine';

test('expedition documents distinguish coverage, detail and uncertainty at every post', () => {
  for (let post = 1; post <= 5; post++) for (const zone of ['A', 'B'] as const) {
    const wide = adultDocument(post as Post, zone, 'wide');
    const fine = adultDocument(post as Post, zone, 'fine');
    const protectedReport = adultDocument(post as Post, zone, 'protect');
    const passive = adultDocument(post as Post, zone, 'passive');
    assert(wide.title.startsWith(adultSubject(post as Post)));
    assert.deepEqual(wide.samples.map(s => s.label), ['Zona de intrare', 'Zona centrală', 'Zona de ieșire']);
    assert.match(fine.limitation, /observație detaliată/);
    assert.doesNotMatch(passive.summary, /Ai păstrat rezerva/);
    assert.equal(wide.samples.filter(s => s.value !== 'necercetat').length, 3);
    assert.equal(fine.samples.filter(s => s.value !== 'necercetat').length, 1);
    assert.equal(new Set(protectedReport.samples.map(s => s.value)).size, 1);
    assert.equal(passive.samples.filter(s => s.value.includes('incert')).length, 2);
    for (const doc of [wide, fine, protectedReport, passive]) assert(doc.limitation.length > 20);
    const serialized = JSON.stringify(wide);
    wide.samples[0].value = 'modified';
    assert.equal(JSON.stringify(adultDocument(post as Post, zone, 'wide')), serialized, 'views cannot mutate authored data');
  }
});
