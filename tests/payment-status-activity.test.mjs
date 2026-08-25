import assert from 'node:assert/strict';
import test from 'node:test';

import { withPaymentStatusActivity } from '../src/lib/paymentStatusActivity.mjs';

test('gateway status transitions append an auditable status-change entry', () => {
  const existing = {
    status: 'Processing - Card',
    activity_log: [{
      at: '2026-08-24T20:00:00.000Z',
      type: 'manual_entry',
      message: 'Order created',
    }],
  };

  const patch = withPaymentStatusActivity(existing, {
    status: 'Paid',
    payment_transaction_id: '715816',
  });

  assert.equal(patch.status, 'Paid');
  assert.equal(patch.payment_transaction_id, '715816');
  assert.equal(patch.activity_log.length, 2);
  assert.deepEqual(
    { ...patch.activity_log[0], at: '<dynamic>' },
    {
      at: '<dynamic>',
      type: 'status_change',
      message: 'Status changed to Paid',
      by: 'Shield Hub Pay',
    },
  );
  assert.equal(Number.isNaN(Date.parse(patch.activity_log[0].at)), false);
});

test('duplicate gateway results do not append duplicate activity', () => {
  const existing = {
    status: 'Paid',
    activity_log: [{ type: 'status_change', message: 'Status changed to Paid' }],
  };

  const patch = withPaymentStatusActivity(existing, {
    status: 'Paid',
    payment_provider_status: 'Approved',
  });

  assert.equal(patch.activity_log, undefined);
  assert.equal(existing.activity_log.length, 1);
});
