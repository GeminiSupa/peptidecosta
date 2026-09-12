import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  RESEARCH_ACK_VERSION,
  researchAckMessage,
  researchAckRecord,
  researchAckText,
  validateResearchAck,
} from '../src/lib/researchAcknowledgement.mjs';

test('the acknowledgement says what the processor asked it to say', () => {
  const en = researchAckText('en');
  assert.match(en, /research purposes only/i);
  assert.match(en, /not intended for human or animal consumption/i);

  // Spanish is the default for Costa Rica, so it is the wording most customers
  // actually read — it must carry the same undertaking, not a softer one.
  const es = researchAckText('es');
  assert.match(es, /fines de investigación/i);
  assert.match(es, /consumo humano ni animal/i);
});

test('an order without the acknowledgement is refused', () => {
  for (const payload of [undefined, null, {}, 'yes', 0, { accepted: false }, { accepted: 'true' }]) {
    const result = validateResearchAck(payload);
    assert.equal(result.ok, false, `expected ${JSON.stringify(payload)} to be refused`);
    assert.equal(result.reason, 'ackMissing');
  }
});

test('an acknowledgement of superseded wording is refused, not silently accepted', () => {
  const result = validateResearchAck({ accepted: true, version: '2019-something-else' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'ackStale');
});

test('a current acknowledgement passes', () => {
  assert.deepEqual(
    validateResearchAck({ accepted: true, version: RESEARCH_ACK_VERSION }),
    { ok: true },
  );
});

test('the stamped record uses our clock, never the browser’s', () => {
  const record = researchAckRecord(new Date('2026-09-11T12:00:00.000Z'));
  assert.equal(record.research_ack_version, RESEARCH_ACK_VERSION);
  assert.equal(record.research_ack_at, '2026-09-11T12:00:00.000Z');

  // Nothing the client sends may reach the row: an accepted payload carrying a
  // timestamp of its own must not be able to backdate the record.
  const keys = Object.keys(researchAckRecord());
  assert.deepEqual(keys.sort(), ['research_ack_at', 'research_ack_version']);
});

test('both refusals explain themselves in the customer’s language', () => {
  for (const reason of ['ackMissing', 'ackStale']) {
    for (const lang of ['en', 'es']) {
      const message = researchAckMessage(reason, lang);
      assert.ok(message.length > 20, `${reason}/${lang} should be a sentence`);
    }
  }
  // The stale case is the only one the customer cannot fix by reading the page,
  // so it has to tell them to reload.
  assert.match(researchAckMessage('ackStale', 'en'), /refresh/i);
  assert.match(researchAckMessage('ackStale', 'es'), /recargue/i);
});

test('the order endpoint enforces the gate and strips the claim from the row', async () => {
  const route = await readFile(
    new URL('../src/app/api/orders/create/route.js', import.meta.url),
    'utf8',
  );

  assert.match(route, /validateResearchAck\(order\.research_ack\)/);
  // Nothing whitelists the order fields before the insert, so leaving the
  // nested object on the payload would make it an unknown column and fail
  // every order.
  assert.match(route, /delete order\.research_ack/);
  assert.match(route, /Object\.assign\(order, researchAckRecord\(\)\)/);
  // The audit columns arrive by hand-run migration; losing them must degrade
  // the record, never take checkout down.
  assert.match(route, /ORDER_RESEARCH_ACK_COLUMNS/);
});

test('the checkout form is not rendered until the box is ticked', async () => {
  const catalog = await readFile(
    new URL('../src/app/catalog/page.js', import.meta.url),
    'utf8',
  );

  // The bank's requirement is that the payment fields are unreachable, not
  // merely disabled — so the gate has to be a branch around the form.
  assert.match(catalog, /\{!researchAck \? \(/);
  assert.match(catalog, /research-ack-gate/);
  // Both checkout paths run through saveOrderToDatabase, which is where the
  // acknowledgement is attached.
  assert.match(catalog, /research_ack: \{ accepted: true, version: RESEARCH_ACK_VERSION \}/);
});
