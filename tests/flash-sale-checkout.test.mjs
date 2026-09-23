import test from 'node:test';
import assert from 'node:assert/strict';
import { authoritativeCheckout } from '../src/lib/authoritativeCheckout.mjs';
import { combineLiveDeals } from '../src/lib/dealOfWeek.mjs';

const GHK = 'GHK-CU 50mg';
const TIRZ = 'Tirzepatide 20mg';

const products = [
  { id: '1', product: GHK, price_usd: '$70', price_crc: '31407', status: 'In Stock', inventory_count: 18 },
  { id: '2', product: TIRZ, price_usd: '$200', price_crc: '89734', status: 'In Stock', inventory_count: 50 },
];

const weeklyDeal = {
  id: 'weekly-1', kind: 'weekly', status: 'live', pricing_mode: 'offers',
  product_names: [GHK, TIRZ],
  offers: { items: [{ id: 'mix-1', type: 'mix', enabled: true, product_names: [GHK, TIRZ], min_units: 2, discount_pct: 0.10 }] },
  starts_at: '2026-09-21T07:00:00.000Z', ends_at: '2026-09-28T05:59:59.999Z',
};
const flashDeal = {
  id: 'flash-1', kind: 'flash', status: 'live', pricing_mode: 'offers',
  product_names: [GHK],
  offers: { items: [{ id: 'flash-1', type: 'flat', enabled: true, product_names: [GHK], discount_pct: 0.50 }] },
  starts_at: '2026-09-23T12:00:00.000Z', ends_at: '2026-09-24T05:59:00.000Z',
};
const during = new Date('2026-09-23T18:00:00.000Z');

const run = (items, deals) => authoritativeCheckout({
  postedOrder: { currency: 'USD', items, lang: 'en', research_ack: true },
  products,
  exchangeRate: 500,
  dealOffers: deals ? combineLiveDeals(deals, during)?.offers : null,
});

test('one vial of the flash product is charged at half price', () => {
  const result = run([{ product: GHK, qty: 1 }], [weeklyDeal, flashDeal]);
  assert.equal(result.ok, true);
  assert.equal(result.subtotal, 70);
  assert.equal(result.promoDiscount, 35);
  assert.equal(result.dealOffer, 'flat');
  assert.equal(result.dealOfferDealId, 'flash-1');
});

test('the flash discount never reaches products that are not on sale', () => {
  const result = run([{ product: GHK, qty: 1 }, { product: TIRZ, qty: 1 }], [weeklyDeal, flashDeal]);
  // $270 of goods. Flash saves $35 (half of the GHK). The weekly 10% would
  // save $27, so the flash wins - but only the GHK line is marked down.
  assert.equal(result.promoDiscount, 35);
  assert.equal(result.dealOffer, 'flat');
});

test('the weekly deal still wins, and is still credited, when it saves more', () => {
  // Four vials, so the 5+ volume tier is not in play and the two offers are
  // judged against each other: $670 of goods, weekly 10% = $67 beats $35.
  const result = run([{ product: GHK, qty: 1 }, { product: TIRZ, qty: 3 }], [weeklyDeal, flashDeal]);
  assert.equal(result.dealOffer, 'mix');
  assert.equal(result.dealOfferDealId, 'weekly-1');
  assert.equal(result.promoDiscount, 67);
});

test('the volume tier still outranks both offers on a large order', () => {
  // Six vials, $1070. The 5+ tier saves more than the weekly 10% or the flash,
  // so it is what the customer gets - a flash sale cannot take that away.
  const result = run([{ product: GHK, qty: 1 }, { product: TIRZ, qty: 5 }], [weeklyDeal, flashDeal]);
  assert.equal(result.dealOffer, 'volume');
  assert.equal(result.promoDiscount, 0);
  assert.ok(result.volumeDiscountAmount > 107);
});

test('the two discounts never both land on one order', () => {
  const result = run([{ product: GHK, qty: 2 }], [weeklyDeal, flashDeal]);
  const subtotal = 140;
  assert.equal(result.subtotal, subtotal);
  // Flash 50% = $70, weekly 10% = $14. Only the larger may be taken.
  assert.equal(result.promoDiscount, 70);
  assert.equal(result.volumeDiscountAmount, 0, 'the volume tier must not also apply');
  assert.equal(result.total, subtotal - 70 + result.shipping);
});

test('a customer is never worse off than with no flash sale at all', () => {
  for (const items of [
    [{ product: GHK, qty: 1 }],
    [{ product: GHK, qty: 3 }],
    [{ product: TIRZ, qty: 2 }],
    [{ product: GHK, qty: 2 }, { product: TIRZ, qty: 4 }],
    [{ product: GHK, qty: 10 }, { product: TIRZ, qty: 10 }],
  ]) {
    const withFlash = run(items, [weeklyDeal, flashDeal]);
    const withoutFlash = run(items, [weeklyDeal]);
    assert.ok(
      withFlash.total <= withoutFlash.total,
      `${JSON.stringify(items)}: ${withFlash.total} must not exceed ${withoutFlash.total}`,
    );
  }
});

test('once the flash sale ends, prices go back on their own', () => {
  const after = new Date('2026-09-25T00:00:00.000Z');
  const offers = combineLiveDeals([weeklyDeal, flashDeal], after)?.offers;
  const result = authoritativeCheckout({
    postedOrder: { currency: 'USD', items: [{ product: GHK, qty: 1 }], lang: 'en' },
    products,
    exchangeRate: 500,
    dealOffers: offers,
  });
  assert.equal(result.promoDiscount, 0);
  assert.equal(result.subtotal, 70);
});

test('a small promo code cannot cancel a bigger deal', () => {
  const code = { code: 'SAVE10', discount_pct: 0.10, target_product: null };
  const items = [{ product: GHK, qty: 2 }];
  const withCode = authoritativeCheckout({
    postedOrder: { currency: 'USD', items, lang: 'en' },
    products, exchangeRate: 500, promo: code,
    dealOffers: combineLiveDeals([weeklyDeal, flashDeal], during)?.offers,
  });
  // Flash sale saves $70; the code would save $14. The customer keeps the $70.
  assert.equal(withCode.promoDiscount, 70);
  assert.equal(withCode.dealOffer, 'flat');
  assert.equal(withCode.promoApplied, false);
});

test('a bigger promo code does beat the deal', () => {
  const code = { code: 'HALF', discount_pct: 0.60, target_product: null };
  const items = [{ product: GHK, qty: 2 }];
  const r = authoritativeCheckout({
    postedOrder: { currency: 'USD', items, lang: 'en' },
    products, exchangeRate: 500, promo: code,
    dealOffers: combineLiveDeals([weeklyDeal, flashDeal], during)?.offers,
  });
  assert.equal(r.promoApplied, true);
  assert.equal(r.promoDiscount, 84);
});
