import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseDealOffer, dealOffersError, normalizeDealOffers } from '../src/lib/dealOffers.mjs';
import { combineLiveDeals, isDealRunning } from '../src/lib/dealOfWeek.mjs';

const GHK = 'GHK-CU 50mg';
const TIRZ = 'Tirzepatide 20mg';

/** The weekly deal Omer has running: 10% off the order with 2+ vials. */
const weeklyOffers = {
  items: [{
    id: 'mix-1', type: 'mix', enabled: true,
    product_names: [GHK, TIRZ], min_units: 2, discount_pct: 0.10,
  }],
};

/** A flash sale: half off one product, no minimum, no code. */
const flashOffers = {
  items: [{
    id: 'flash-1', type: 'flat', enabled: true,
    product_names: [GHK], discount_pct: 0.50,
  }],
};

const line = (product, qty, unitPrice) => ({ product, qty, unitPrice });

test('a flat offer discounts a single vial, with no minimum to reach', () => {
  const choice = chooseDealOffer(flashOffers, [line(GHK, 1, 70)], {});
  assert.equal(choice.kind, 'flat');
  assert.equal(choice.savings, 35);
});

test('a flat offer discounts only its own products, not the whole cart', () => {
  // 1 GHK at $70 (on sale) + 1 Tirzepatide at $200 (not on sale).
  const choice = chooseDealOffer(flashOffers, [line(GHK, 1, 70), line(TIRZ, 1, 200)], {});
  assert.equal(choice.savings, 35, 'the $200 vial must not be discounted');
});

test('a flat offer needs a percentage between 1% and 99%', () => {
  assert.match(dealOffersError({ items: [{ ...flashOffers.items[0], discount_pct: 0 }] }), /between 1% and 99%/);
  assert.match(dealOffersError({ items: [{ ...flashOffers.items[0], product_names: [] }] }), /which products qualify/);
  assert.equal(dealOffersError(flashOffers), '');
});

test('best saving wins: the flash sale beats the weekly deal on a small cart', () => {
  const pooled = { items: [...weeklyOffers.items, ...flashOffers.items] };
  // 2 GHK at $70 = $140. Weekly: 10% of $140 = $14. Flash: 50% of $140 = $70.
  const choice = chooseDealOffer(pooled, [line(GHK, 2, 70)], {});
  assert.equal(choice.kind, 'flat');
  assert.equal(choice.savings, 70);
});

test('best saving wins: the weekly deal still beats the flash on a big mixed cart', () => {
  const pooled = { items: [...weeklyOffers.items, ...flashOffers.items] };
  // 1 GHK at $70 + 5 Tirzepatide at $200 = $1070.
  // Weekly: 10% of $1070 = $107. Flash: 50% of $70 = $35. Weekly must win.
  const choice = chooseDealOffer(pooled, [line(GHK, 1, 70), line(TIRZ, 5, 200)], {});
  assert.equal(choice.kind, 'mix');
  assert.equal(choice.savings, 107);
});

test('the two offers never stack: only one saving is ever returned', () => {
  const pooled = { items: [...weeklyOffers.items, ...flashOffers.items] };
  const choice = chooseDealOffer(pooled, [line(GHK, 2, 70)], {});
  const both = 70 + 14;
  assert.notEqual(choice.savings, both);
  assert.equal(choice.savings, Math.max(70, 14));
});

test('the volume tier still wins when it is worth more than either offer', () => {
  const pooled = { items: [...weeklyOffers.items, ...flashOffers.items] };
  // 10 Tirzepatide at $200 = $2000, no GHK so the flash does not apply.
  // Weekly: 10% = $200. Volume tier at 15%: $300.
  const choice = chooseDealOffer(pooled, [line(TIRZ, 10, 200)], { volumePct: 15 });
  assert.equal(choice.kind, 'volume');
  assert.equal(choice.savings, 300);
});

const weeklyDeal = {
  id: 'weekly-1', kind: 'weekly', status: 'live', pricing_mode: 'offers',
  title_en: 'Deal of the Week', product_names: [GHK, TIRZ], offers: weeklyOffers,
  starts_at: '2026-09-21T07:00:00.000Z', ends_at: '2026-09-28T05:59:59.999Z',
};
const flashDeal = {
  id: 'flash-1', kind: 'flash', status: 'live', pricing_mode: 'offers',
  title_en: '50% off GHK-Cu', product_names: [GHK], offers: flashOffers,
  starts_at: '2026-09-23T12:00:00.000Z', ends_at: '2026-09-24T05:59:00.000Z',
};
const duringBoth = new Date('2026-09-23T18:00:00.000Z');

test('both promotions pool into one view, each offer tagged with its deal', () => {
  const combined = combineLiveDeals([weeklyDeal, flashDeal], duringBoth);
  const items = normalizeDealOffers(combined.offers).items;
  assert.equal(items.length, 2);
  assert.deepEqual(items.map((item) => item.deal_id).sort(), ['flash-1', 'weekly-1']);
  // The weekly deal anchors identity and countdown; the flash adds its offer.
  assert.equal(combined.id, 'weekly-1');
  assert.equal(combined.ends_at, weeklyDeal.ends_at);
  assert.deepEqual([...combined.product_names].sort(), [GHK, TIRZ].sort());
});

test('the winning offer reports which deal it came from', () => {
  const combined = combineLiveDeals([weeklyDeal, flashDeal], duringBoth);
  const small = chooseDealOffer(combined.offers, [line(GHK, 1, 70)], {});
  assert.equal(small.dealId, 'flash-1');
  const big = chooseDealOffer(combined.offers, [line(TIRZ, 5, 200)], {});
  assert.equal(big.dealId, 'weekly-1');
});

test('offer ids from two deals cannot collide', () => {
  const clash = { ...flashDeal, offers: { items: [{ ...flashOffers.items[0], id: 'mix-1' }] } };
  const combined = combineLiveDeals([weeklyDeal, clash], duringBoth);
  const items = normalizeDealOffers(combined.offers).items;
  assert.equal(new Set(items.map((item) => item.id)).size, 2);
});

test('an expired flash sale drops out of the pool on its own', () => {
  const afterFlash = new Date('2026-09-25T00:00:00.000Z');
  const combined = combineLiveDeals([weeklyDeal, flashDeal], afterFlash);
  assert.equal(normalizeDealOffers(combined.offers).items.length, 1);
  assert.equal(combined.id, 'weekly-1');
  assert.equal(isDealRunning(flashDeal, afterFlash), false);
});

test('a flash sale alone stands on its own', () => {
  const combined = combineLiveDeals([flashDeal], duringBoth);
  assert.equal(combined.id, 'flash-1');
  assert.equal(combined.pricing_mode, 'offers');
});

test('nothing running means no deal at all', () => {
  assert.equal(combineLiveDeals([], duringBoth), null);
  assert.equal(combineLiveDeals([{ ...flashDeal, status: 'ended' }], duringBoth), null);
});

test('a shelf weekly deal is never pooled, it is returned untouched', () => {
  const shelf = { ...weeklyDeal, pricing_mode: 'shelf', offers: null };
  const combined = combineLiveDeals([shelf, flashDeal], duringBoth);
  assert.equal(combined.pricing_mode, 'shelf');
  assert.equal(combined.id, 'weekly-1');
});
