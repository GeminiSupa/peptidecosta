import test from 'node:test';
import assert from 'node:assert/strict';

import {
  accountKindLabel,
  isAccountKind,
  orderMonthCounts,
  refillCountdown,
} from '../src/lib/accountHome.mjs';

test('account questions are who they are, not a health category', () => {
  assert.equal(isAccountKind('pharmacy'), true);
  assert.equal(isAccountKind('researcher'), true);
  assert.equal(isAccountKind('patient'), false);
  assert.equal(isAccountKind('dosage'), false);
  assert.equal(accountKindLabel('clinic', 'en'), 'Clinic');
  assert.equal(accountKindLabel('clinic', 'es'), 'Clínica');
});

test('the refill countdown follows the newest paid order', () => {
  const now = new Date('2026-09-30T12:00:00Z');
  const result = refillCountdown([
    { status: 'Cancelled', created_at: '2026-09-28T12:00:00Z', order_number: 'C-1' },
    { status: 'Paid', created_at: '2026-09-10T12:00:00Z', order_number: 'P-1' },
    { status: 'Paid', created_at: '2026-08-01T12:00:00Z', order_number: 'P-0' },
  ], now);

  assert.equal(result.orderNumber, 'P-1');
  assert.equal(result.days, 10);
  assert.equal(result.ready, false);
  assert.equal(result.total, 30);
});

test('a paid order older than 30 days is ready to refill', () => {
  const now = new Date('2026-09-30T12:00:00Z');
  const result = refillCountdown([
    { status: 'Order Complete', created_at: '2026-08-01T12:00:00Z', order_number: 'P-2' },
  ], now);
  assert.equal(result.ready, true);
  assert.equal(result.days, 0);
});

test('no paid order means no countdown', () => {
  assert.equal(refillCountdown([{ status: 'Pending', created_at: '2026-09-01T12:00:00Z' }]), null);
  assert.equal(refillCountdown([]), null);
});

test('order counts use Costa Rica months, not the next UTC day', () => {
  const now = new Date('2026-10-15T18:00:00Z');
  const counts = orderMonthCounts([
    { status: 'Paid', created_at: '2026-10-01T02:00:00Z' },
    { status: 'Paid', created_at: '2026-10-01T07:00:00Z' },
    { status: 'Cancelled', created_at: '2026-10-02T18:00:00Z' },
  ], now);

  assert.equal(counts.length, 6);
  assert.equal(counts[0].key, '2026-05');
  assert.equal(counts.find((slot) => slot.key === '2026-09').count, 1);
  assert.equal(counts.find((slot) => slot.key === '2026-10').count, 1);
});
