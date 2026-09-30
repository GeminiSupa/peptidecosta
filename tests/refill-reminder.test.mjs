import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRefillEmail,
  buyAgainParam,
  buyAgainUrl,
  parseBuyAgainParam,
  refillLines,
  shouldSendRefillReminder,
} from '../src/lib/refillReminder.mjs';

const ITEMS = [
  { product: 'GHK-Cu 50mg', qty: 2, price: 70 },
  { product: 'BAC Water 10ml (Free Gift)', qty: 1, price: 0 },
  { product: 'GHK-Cu 50mg', qty: 1, price: 70 },
];

test('a refill lists the paid products and drops the free gift', () => {
  assert.deepEqual(refillLines(ITEMS), [
    { product: 'GHK-Cu 50mg', qty: 3 },
  ]);
  assert.deepEqual(refillLines(JSON.stringify(ITEMS)), [
    { product: 'GHK-Cu 50mg', qty: 3 },
  ]);
});

test('the buy-again link round-trips names and quantities, not prices', () => {
  const param = buyAgainParam(ITEMS);
  const parsed = parseBuyAgainParam(param);
  assert.deepEqual(parsed.items, [{ product: 'GHK-Cu 50mg', qty: 3 }]);
  assert.equal(parsed.items[0].price, undefined);
  assert.match(buyAgainUrl(ITEMS), /^https:\/\/catalog\.peptidescostarica\.net\/catalog\?buy=/);
});

test('a broken or empty buy-again link is ignored', () => {
  assert.equal(parseBuyAgainParam(''), null);
  assert.equal(parseBuyAgainParam('not-a-link'), null);
  assert.equal(parseBuyAgainParam(null), null);
});

test('only a paid order that still has items gets the refill email', () => {
  const paid = { customer_email: 'lab@example.com', status: 'Paid', items: ITEMS };
  assert.equal(shouldSendRefillReminder(paid), true);
  assert.equal(shouldSendRefillReminder({ ...paid, status: 'Order Complete' }), true);
  assert.equal(shouldSendRefillReminder({ ...paid, status: 'Cancelled' }), false);
  assert.equal(shouldSendRefillReminder({ ...paid, status: 'Payment Blocked' }), false);
  assert.equal(shouldSendRefillReminder({ ...paid, status: 'Pending' }), false);
  assert.equal(shouldSendRefillReminder({ ...paid, customer_email: '' }), false);
  assert.equal(shouldSendRefillReminder({ ...paid, reorder_reminded_at: '2026-09-01' }), false);
  assert.equal(shouldSendRefillReminder({ ...paid, items: [{ product: 'BAC Water (Regalo)', qty: 1, price: 0 }] }), false);
});

test('the email names every item and does not talk about a dose', () => {
  const email = buildRefillEmail({ customerName: 'Ana <script>', items: ITEMS });
  assert.match(email.subject, /GHK-Cu 50mg/);
  assert.match(email.html, /GHK-Cu 50mg — 3/);
  assert.match(email.html, /Ana &lt;script&gt;/);
  assert.match(email.html, /Comprar de nuevo/);
  assert.doesNotMatch(email.html, /cycle|dose|dosis|inyec/i);
  assert.doesNotMatch(email.subject, /cycle|dose|dosis/i);
});
