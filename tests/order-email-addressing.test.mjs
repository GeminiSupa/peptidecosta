import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildOrderEmailAddressing,
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
