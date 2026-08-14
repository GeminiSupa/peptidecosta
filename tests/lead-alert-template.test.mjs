import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLeadAlertParameters,
  LEAD_ALERT_VARIABLE_COUNT,
} from '../src/lib/leadAlertTemplate.mjs';

const fullLead = {
  name: 'Maria Rodriguez',
  phone: '+50688881234',
  dueAt: '2026-08-15T17:41:00.000Z',
  qualification: { category: 'Weight Loss', location: 'Costa Rica', volume: '5-9 vials' },
};

test('the alert fills every approved variable in template order', () => {
  const parameters = buildLeadAlertParameters(fullLead);

  assert.equal(parameters.length, LEAD_ALERT_VARIABLE_COUNT);
  assert.equal(parameters[0], 'Maria Rodriguez');
  assert.equal(parameters[1], 'Weight Loss');
  assert.equal(parameters[2], 'Costa Rica');
  assert.equal(parameters[3], '5-9 vials');
  assert.equal(parameters[4], '+50688881234');
});

test('the deadline is rendered in Costa Rica time, not the server timezone', () => {
  // 17:41 UTC is 11:41 in Costa Rica. A server in another zone must not shift it,
  // or the agent is given a deadline that has already passed.
  const [, , , , , due] = buildLeadAlertParameters(fullLead);
  assert.equal(due, '11:41 AM');
});

test('a lead with no deadline says so rather than showing a bare dash', () => {
  const [, , , , , due] = buildLeadAlertParameters({ ...fullLead, dueAt: null });
  assert.equal(due, 'lo antes posible');
});

test('missing answers never produce an empty variable', () => {
  // Meta rejects the whole send if any variable resolves to an empty string, so
  // a lead that skipped the questionnaire must still deliver.
  for (const lead of [
    {},
    { name: '', phone: '', qualification: {} },
    { name: '   ', qualification: { category: '  ', location: null, volume: undefined } },
  ]) {
    const parameters = buildLeadAlertParameters(lead);
    assert.equal(parameters.length, LEAD_ALERT_VARIABLE_COUNT);
    for (const value of parameters) {
      assert.ok(value.length > 0, `empty variable in ${JSON.stringify(lead)}`);
    }
  }
});

test('called with no argument at all it still returns a sendable set', () => {
  const parameters = buildLeadAlertParameters();
  assert.equal(parameters.length, LEAD_ALERT_VARIABLE_COUNT);
  assert.ok(parameters.every((value) => value.length > 0));
});
