import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCustomerReorderStats,
  estimateItemSupplyDays,
  getIntervalPatternLabel,
  classifyCustomerSegment,
  buildReorderFollowupScript,
} from '../src/lib/reorderTracking.mjs';

test('estimateItemSupplyDays returns expected supply duration', () => {
  assert.equal(estimateItemSupplyDays('GLP-1 10mg', 1), 30);
  assert.equal(estimateItemSupplyDays('BPC-157 5mg', 2), 60);
  assert.equal(estimateItemSupplyDays('Unknown Product', 1), 30);
});

test('getIntervalPatternLabel labels cycles accurately', () => {
  assert.equal(getIntervalPatternLabel(0), 'First Order');
  assert.equal(getIntervalPatternLabel(7), 'Weekly (~7d)');
  assert.equal(getIntervalPatternLabel(14), 'Bi-Weekly (~14d)');
  assert.equal(getIntervalPatternLabel(30), 'Monthly (~30d)');
  assert.equal(getIntervalPatternLabel(42), '6-Weeks (~42d)');
  assert.equal(getIntervalPatternLabel(60), 'Every 60 days');
});

test('calculateCustomerReorderStats detects overdue reorders and repeat cycles', () => {
  const refDate = new Date('2026-09-20T12:00:00Z');

  // Customer A: doctor buying bi-weekly (last order 30 days ago, biweekly cycle => overdue)
  // Customer B: retail buying monthly (last order 10 days ago, 30 day supply => on track)
  const sampleOrders = [
    {
      id: 'ord-1',
      customer_name: 'Dr. Smith',
      customer_email: 'drsmith@clinic.cr',
      customer_phone: '50688880001',
      created_at: '2026-08-05T10:00:00Z',
      items: [{ product: 'Semaglutide 10mg', qty: 5 }],
      status: 'Completed',
    },
    {
      id: 'ord-2',
      customer_name: 'Dr. Smith',
      customer_email: 'drsmith@clinic.cr',
      customer_phone: '50688880001',
      created_at: '2026-08-19T10:00:00Z', // 14 days later
      items: [{ product: 'Semaglutide 10mg', qty: 5 }],
      status: 'Completed',
    },
    {
      id: 'ord-3',
      customer_name: 'Retail Customer Jane',
      customer_email: 'jane@gmail.com',
      customer_phone: '50688880002',
      created_at: '2026-09-10T10:00:00Z', // 10 days ago
      items: [{ product: 'BPC-157 5mg', qty: 1 }],
      status: 'Completed',
    },
  ];

  const results = calculateCustomerReorderStats(sampleOrders, {}, refDate);

  assert.equal(results.length, 2);

  const drSmith = results.find((r) => r.customerEmail === 'drsmith@clinic.cr');
  assert.ok(drSmith);
  assert.equal(drSmith.orderCount, 2);
  assert.equal(drSmith.avgIntervalDays, 14);
  assert.equal(drSmith.intervalPattern, 'Bi-Weekly (~14d)');
  assert.equal(drSmith.estimatedSupplyDays, 14);
  assert.equal(drSmith.alertStatus, 'overdue');
  assert.ok(drSmith.daysOverdue > 0);
  assert.equal(drSmith.segment.label, 'Doctor / Clinic');

  const jane = results.find((r) => r.customerEmail === 'jane@gmail.com');
  assert.ok(jane);
  assert.equal(jane.orderCount, 1);
  assert.equal(jane.estimatedSupplyDays, 30);
  assert.equal(jane.alertStatus, 'on_track');
});

test('buildReorderFollowupScript generates personalized message', () => {
  const script = buildReorderFollowupScript({
    customerName: 'Dr. Alex',
    lastProductPurchased: '2x Tirzepatide 10mg',
    alertStatus: 'overdue',
    daysOverdue: 5,
    estimatedSupplyDays: 14,
  });

  assert.match(script, /Hi Dr\./);
  assert.match(script, /Tirzepatide 10mg/);
  assert.match(script, /Peptides Costa Rica/);
});
