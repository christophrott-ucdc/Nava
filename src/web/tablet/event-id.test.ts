import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { tabletEventId } from './event-id';

test('tablet actions have unique UUIDs on room HTTP without crypto.randomUUID', () => {
  const lanCrypto = { getRandomValues: crypto.getRandomValues.bind(crypto) };
  const ids = new Set(Array.from({ length: 1000 }, () => tabletEventId(lanCrypto)));
  assert.equal(ids.size, 1000);
  for (const id of ids) assert.match(id, /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
});

test('secure tablet contexts retain native UUID generation', () => {
  let calls = 0;
  const expected = '01234567-89ab-4cde-8123-456789abcdef';
  assert.equal(tabletEventId({ getRandomValues: crypto.getRandomValues.bind(crypto), randomUUID: () => { calls++; return expected; } }), expected);
  assert.equal(calls, 1);
});
