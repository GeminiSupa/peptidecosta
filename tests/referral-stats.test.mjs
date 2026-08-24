import test from 'node:test';
import assert from 'node:assert/strict';
import {
  groupScans,
  orderUsd,
  buildReferralStats,
  deviceTypeFromUserAgent,
} from '../src/lib/referralStats.mjs';

const scan = (over = {}) => ({
  sales_agent: 'Sean Mcully', promo_code: null, referral: null,
  session_id: 's1', is_first_visit: true, device_type: 'mobile',
  country: 'CR', created_at: '2026-07-21T10:00:00Z', ...over,
});

const order = (over = {}) => ({
  sales_agent: 'Sean Mcully', status: 'Order Complete', total_usd: 200, currency: 'USD', ...over,
});

test('classifies devices without fingerprinting', () => {
  assert.equal(deviceTypeFromUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)'), 'mobile');
  assert.equal(deviceTypeFromUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0)'), 'tablet');
  assert.equal(deviceTypeFromUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64)'), 'desktop');
  assert.equal(deviceTypeFromUserAgent(''), 'unknown');
});

test('groups scans case-insensitively, matching the payout rule', () => {
  const groups = groupScans([scan(), scan({ sales_agent: 'sean mcully', session_id: 's2' })]);
  assert.equal(groups.size, 1);
  assert.equal(groups.get('sean mcully').scans, 2);
});

test('reads order value in either currency', () => {
  assert.equal(orderUsd({ total_usd: 150 }), 150);
  assert.equal(Math.round(orderUsd({ total_crc: 45448 })), 100);
  assert.equal(orderUsd({ total: 80, currency: 'USD' }), 80);
  assert.equal(Math.round(orderUsd({ total: 45448, currency: 'CRC' })), 100);
  assert.equal(orderUsd({}), 0);
});

test('joins scans to the orders they produced', () => {
  const stats = buildReferralStats(
    [scan(), scan({ session_id: 's2' }), scan({ session_id: 's3' }), scan({ session_id: 's4' })],
    [order()],
  );
  assert.equal(stats.length, 1);
  assert.equal(stats[0].scans, 4);
  assert.equal(stats[0].orders, 1);
  assert.equal(stats[0].revenueUsd, 200);
  assert.equal(stats[0].conversionRate, 25);
});

test('unpaid orders do not count as conversions', () => {
  const stats = buildReferralStats([scan()], [order({ status: 'Pending' })]);
  assert.equal(stats[0].orders, 0);
  assert.equal(stats[0].revenueUsd, 0);
});

test('revenue from links that predate tracking is still reported', () => {
  const stats = buildReferralStats([], [order()]);
  assert.equal(stats.length, 1);
  assert.equal(stats[0].orders, 1);
  assert.equal(stats[0].revenueUsd, 200);
  assert.equal(stats[0].scans, 0);
});

test('conversion rate is null, not zero, when nothing was measured', () => {
  const stats = buildReferralStats([], [order()]);
  assert.equal(stats[0].conversionRate, null, '0% would imply the link failed rather than went unmeasured');
});

test('separates agents from promo codes', () => {
  const stats = buildReferralStats(
    [scan(), scan({ sales_agent: null, promo_code: 'SUMMER25', session_id: 's2' })],
    [],
  );
  assert.equal(stats.length, 2);
  assert.deepEqual(stats.map((s) => s.kind).sort(), ['agent', 'promo']);
});

test('reports the commonest device and country', () => {
  const stats = buildReferralStats([
    scan({ session_id: 's1', device_type: 'mobile', country: 'CR' }),
    scan({ session_id: 's2', device_type: 'mobile', country: 'CR' }),
    scan({ session_id: 's3', device_type: 'desktop', country: 'US' }),
  ], []);
  assert.equal(stats[0].topDevice, 'mobile');
  assert.equal(stats[0].topCountry, 'CR');
});

test('ranks by revenue, then by scans', () => {
  const stats = buildReferralStats(
    [scan({ sales_agent: 'Big' }), scan({ sales_agent: 'Small', session_id: 's2' })],
    [order({ sales_agent: 'Small', total_usd: 50 }), order({ sales_agent: 'Big', total_usd: 900 })],
  );
  assert.equal(stats[0].label, 'Big');
});

test('tracks repeat visits separately from first visits', () => {
  const stats = buildReferralStats([
    scan({ session_id: 's1', is_first_visit: true }),
    scan({ session_id: 's2', is_first_visit: false }),
  ], []);
  assert.equal(stats[0].scans, 2);
  assert.equal(stats[0].firstVisits, 1);
});

test('ignores scans carrying no referral at all', () => {
  assert.equal(groupScans([scan({ sales_agent: null, promo_code: null, referral: null })]).size, 0);
});
