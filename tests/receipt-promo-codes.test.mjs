/**
 * Which promo codes a customer receipt is allowed to advertise.
 *
 * The receipt footer lists "Active Codes" as a nudge toward the next order.
 * It listed every active, non-hidden code — and two of the three it was
 * actually printing had no business being there:
 *
 *   JEANPAUL       an affiliate's own referral code, paying Jean Paul 20% of
 *                  whatever it is used on. Printed on every receipt the
 *                  business sent, so any customer could pay him a commission
 *                  on a sale he had no part in.
 *   WELCOME-XXXXXX single-use codes issued to one named customer each. None
 *                  were showing only because all of them happened to be spent;
 *                  a fresh one would have been offered to everybody else
 *                  before its owner could spend it.
 *
 * A code earns its place in the footer by being a public offer: no affiliate
 * behind it, and not minted for one person.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

/** The route's filter, kept in step with /api/order-notification. */
const receiptPromoCodes = (promos) => promos.filter((p) => (
  !p.hidden
  && !p.affiliate_id
  && Number(p.usage_limit) !== 1
  && (p.usage_limit === null || p.usage_limit === undefined
    || Number(p.usage_count || 0) < Number(p.usage_limit))
));

// The live production list, as it stood when this was found.
const LIVE = [
  { code: 'JEANPAUL', discount_pct: 0.05, affiliate_id: '2224952e', usage_limit: null, usage_count: 0 },
  { code: 'RAQUELDELGADO', discount_pct: 0.10, affiliate_id: null, usage_limit: null, usage_count: 0 },
  { code: 'PRIMERPEDIDO15', discount_pct: 0.15, affiliate_id: null, usage_limit: null, usage_count: 1 },
  { code: 'GHK15', discount_pct: 0.15, affiliate_id: null, usage_limit: null, usage_count: 0, is_flash_sale: true },
  { code: 'WELCOME-76FOEK', discount_pct: 0.15, affiliate_id: null, usage_limit: 1, usage_count: 1 },
  { code: 'WELCOME-FRESH1', discount_pct: 0.15, affiliate_id: null, usage_limit: 1, usage_count: 0 },
  { code: 'AHORA1067HPC', discount_pct: 0.10, affiliate_id: null, usage_limit: 1, usage_count: 0, hidden: true },
];

test("an affiliate's referral code is never advertised", () => {
  const shown = receiptPromoCodes(LIVE).map((p) => p.code);
  assert.ok(!shown.includes('JEANPAUL'), 'JEANPAUL pays a 20% commission to its owner');
});

test('an unspent single-use code is not offered to everyone else', () => {
  const shown = receiptPromoCodes(LIVE).map((p) => p.code);

  // This is the one the old filter would have leaked. It was invisible only
  // because every WELCOME code in production happened to be spent already.
  assert.ok(!shown.includes('WELCOME-FRESH1'));
  assert.ok(!shown.includes('WELCOME-76FOEK'));
});

test('genuine public offers still appear', () => {
  const shown = receiptPromoCodes(LIVE).map((p) => p.code);

  assert.deepEqual(shown, ['RAQUELDELGADO', 'PRIMERPEDIDO15', 'GHK15']);
});

test('a capped campaign is not mistaken for a personal code', () => {
  // "First 100 customers" is a real public offer and must survive. Only a
  // limit of exactly one means the code was minted for one person.
  const campaign = [{ code: 'FIRST100', affiliate_id: null, usage_limit: 100, usage_count: 12 }];
  assert.deepEqual(receiptPromoCodes(campaign).map((p) => p.code), ['FIRST100']);

  const spent = [{ code: 'FIRST100', affiliate_id: null, usage_limit: 100, usage_count: 100 }];
  assert.deepEqual(receiptPromoCodes(spent), []);
});

test('hidden codes stay hidden', () => {
  const shown = receiptPromoCodes(LIVE).map((p) => p.code);
  assert.ok(!shown.includes('AHORA1067HPC'));
});

test('the filter matches the route it describes', async () => {
  const fs = await import('node:fs');
  const route = fs.readFileSync('src/app/api/order-notification/route.js', 'utf8');
  const block = route.slice(route.indexOf('promoCodesList = promos.filter'), route.indexOf('promoCodesList = promos.filter') + 1400);

  assert.match(block, /!p\.hidden/);
  assert.match(block, /!p\.affiliate_id/);
  assert.match(block, /Number\(p\.usage_limit\) !== 1/);
});
