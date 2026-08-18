import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  buildOrderEmailAddressing,
  stripOwnerAddress,
  ORDER_NOTIFICATION_INBOX,
  ORDER_NOTIFICATION_OWNER_BCC,
} from '../src/lib/orderEmailAddressing.mjs';

test('new-order mail goes to info, BCCs Omer, and CCs the other agents', () => {
  const addressing = buildOrderEmailAddressing([
    'Agent.One@example.com',
    'agent.two@example.com',
    'Aziza@peptidescostarica.net',
    'Sean@peptidescostarica.net',
    ORDER_NOTIFICATION_INBOX,
  ]);

  assert.equal(addressing.to, ORDER_NOTIFICATION_INBOX);
  assert.deepEqual(addressing.bcc, [ORDER_NOTIFICATION_OWNER_BCC]);
  assert.deepEqual(addressing.cc, [
    'Agent.One@example.com',
    'agent.two@example.com',
  ]);
});

test('Omer is never duplicated into CC', () => {
  const addressing = buildOrderEmailAddressing([
    'OMERFORCE@gmail.com',
    'agent@example.com',
    'Agent@example.com',
  ]);

  assert.deepEqual(addressing.bcc, [ORDER_NOTIFICATION_OWNER_BCC]);
  assert.deepEqual(addressing.cc, ['agent@example.com']);
});

test('the owner is dropped from a visible recipient list', () => {
  assert.equal(
    stripOwnerAddress('info@peptidescostarica.net, omerforce@gmail.com'),
    'info@peptidescostarica.net',
  );
  // Case and padding are not identity.
  assert.equal(
    stripOwnerAddress(' OmerForce@Gmail.com , info@peptidescostarica.net'),
    'info@peptidescostarica.net',
  );
  assert.equal(
    stripOwnerAddress(['a@example.com', ORDER_NOTIFICATION_OWNER_BCC, 'b@example.com']),
    'a@example.com, b@example.com',
  );
});

test('a list that was only the owner still reaches somebody', () => {
  // An empty To fails the send outright, which would be worse than the
  // duplicate listing this rule exists to remove.
  assert.equal(stripOwnerAddress(ORDER_NOTIFICATION_OWNER_BCC), ORDER_NOTIFICATION_INBOX);
  assert.equal(stripOwnerAddress(''), ORDER_NOTIFICATION_INBOX);
  assert.equal(stripOwnerAddress(undefined), ORDER_NOTIFICATION_INBOX);
});

test('payout and report mail never names the owner in To or CC', () => {
  // The owner stays on BCC. Naming them again puts the address on the envelope
  // twice and shows it to every other recipient of the message.
  const routes = [
    'src/app/api/admin/commissions/approve/route.js',
    'src/app/api/admin/commissions/weekly-report/route.js',
    'src/app/api/admin/affiliates/payouts/approve/route.js',
    'src/app/api/admin/affiliates/payouts/report/route.js',
    'src/app/api/cron/affiliate-payouts/route.js',
  ];

  for (const path of routes) {
    const source = fs.readFileSync(path, 'utf8');
    const visibleLists = source.match(/^const (ADMIN_CC_EMAILS|ADMIN_EMAIL) =[\s\S]*?;$/m);

    assert.ok(visibleLists, `${path} defines no visible recipient list`);
    assert.match(visibleLists[0], /stripOwnerAddress\(/, `${path} does not strip the owner`);
    // The BCC that actually delivers to them must survive.
    assert.match(source, /bcc: process\.env\.BCC_EMAIL/, `${path} lost the owner BCC`);
  }
});
