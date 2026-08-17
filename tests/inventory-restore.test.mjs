import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_EXPIRY_AGE_DAYS,
  STALE_ORDER_HOURS,
  expiryFloor,
  isWithinExpiryWindow,
  isAlreadyRestored,
  isExpirableStatus,
  planInventoryRestore,
  restorableQuantities,
  shouldRestoreForStatus,
  staleOrderCutoff,
} from '../src/lib/inventoryRestore.mjs';

test('stock comes back only for statuses where the sale is off', () => {
  for (const status of ['Cancelled', 'Declined', 'Payment Blocked', 'Error', 'cancelled']) {
    assert.equal(shouldRestoreForStatus(status), true, status);
  }
  // A pending order is still expected to be paid — its reservation stands.
  for (const status of ['Pending', 'Paid', 'Processing', 'Order Complete', 'Pending - Card']) {
    assert.equal(shouldRestoreForStatus(status), false, status);
  }
});

test('only unpaid orders can be expired by the sweep', () => {
  for (const status of ['Pending', 'Payment Pending', 'Pending - Card', 'Pending - Card 3DS']) {
    assert.equal(isExpirableStatus(status), true, status);
  }
  // Anything a human has already moved on is left alone.
  for (const status of ['Paid', 'Processing', 'Order Complete', 'Cancelled', 'Declined']) {
    assert.equal(isExpirableStatus(status), false, status);
  }
});

test('the window is 24 hours', () => {
  assert.equal(STALE_ORDER_HOURS, 24);

  const now = new Date('2026-08-17T12:00:00Z');
  assert.equal(staleOrderCutoff(now).toISOString(), '2026-08-16T12:00:00.000Z');
});

test('the recorded deduction wins over the order quantities', () => {
  // The deduction clamps at zero: this order asked for 5 but only 2 were in
  // stock, so only 2 were taken. Returning 5 would invent three vials.
  const order = {
    items: [{ product: 'Retatrutide 10mg', qty: 5 }],
    inventory_deducted: [{ product: 'Retatrutide 10mg', qty: 2 }],
  };

  assert.deepEqual(restorableQuantities(order), [{ product: 'Retatrutide 10mg', qty: 2 }]);
});

test('orders placed before the record existed fall back to their quantities', () => {
  const order = { items: [{ product: 'BPC-157 5mg', qty: 3 }] };
  assert.deepEqual(restorableQuantities(order), [{ product: 'BPC-157 5mg', qty: 3 }]);

  // An empty record is not a claim that nothing was taken.
  assert.deepEqual(
    restorableQuantities({ items: [{ product: 'BPC-157 5mg', qty: 3 }], inventory_deducted: [] }),
    [{ product: 'BPC-157 5mg', qty: 3 }],
  );
});

test('a product listed twice is returned once, summed', () => {
  const order = { items: [{ product: 'A', qty: 1 }, { product: 'A', qty: 2 }] };
  assert.deepEqual(restorableQuantities(order), [{ product: 'A', qty: 3 }]);
});

test('free gift and malformed lines return nothing', () => {
  const order = {
    items: [
      { product: 'A', qty: 0 },
      { product: '', qty: 5 },
      { product: 'B', qty: 'many' },
      { product: 'C', qty: -2 },
    ],
  };
  assert.deepEqual(restorableQuantities(order), []);
});

test('an order is never restored twice', () => {
  const order = {
    status: 'Cancelled',
    items: [{ product: 'A', qty: 1 }],
    inventory_restored_at: '2026-08-17T10:00:00Z',
  };

  assert.equal(isAlreadyRestored(order), true);
  assert.deepEqual(planInventoryRestore(order), { restore: false, reason: 'already restored' });
});

test('the plan explains itself whether it acts or not', () => {
  const cancelled = { status: 'Cancelled', items: [{ product: 'A', qty: 2 }] };
  const plan = planInventoryRestore(cancelled);
  assert.equal(plan.restore, true);
  assert.deepEqual(plan.lines, [{ product: 'A', qty: 2 }]);

  const paid = planInventoryRestore({ status: 'Paid', items: [{ product: 'A', qty: 2 }] });
  assert.equal(paid.restore, false);
  assert.match(paid.reason, /keeps its reservation/);

  const empty = planInventoryRestore({ status: 'Cancelled', items: [] });
  assert.equal(empty.restore, false);
  assert.equal(empty.reason, 'nothing to restore');

  assert.equal(planInventoryRestore(null).restore, false);
});

test('the sweep cannot mass-cancel a backlog it has never seen', () => {
  // Without this bound the first run would have cancelled 89 live orders dating
  // back to June — three months of "Pending" rows staff may still be chasing.
  const now = new Date('2026-08-17T12:00:00Z');

  assert.equal(MAX_EXPIRY_AGE_DAYS, 7);
  assert.equal(expiryFloor(now).toISOString(), '2026-08-10T12:00:00.000Z');

  const justExpired = { created_at: '2026-08-16T06:00:00Z' };   // 30h old
  const juneBacklog = { created_at: '2026-06-04T10:00:00Z' };   // months old
  const stillFresh = { created_at: '2026-08-17T06:00:00Z' };    // 6h old

  assert.equal(isWithinExpiryWindow(justExpired, now), true);
  assert.equal(isWithinExpiryWindow(juneBacklog, now), false);
  assert.equal(isWithinExpiryWindow(stillFresh, now), false);
});

test('an order with no usable creation date is never expired', () => {
  const now = new Date('2026-08-17T12:00:00Z');
  assert.equal(isWithinExpiryWindow({}, now), false);
  assert.equal(isWithinExpiryWindow({ created_at: null }, now), false);
  assert.equal(isWithinExpiryWindow({ created_at: 'not a date' }, now), false);
});
