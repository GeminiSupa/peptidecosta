import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseDealOffer,
  dealOfferProductNames,
  dealOffersError,
  dealOfferSummaries,
  freeVialLine,
  normalizeDealOffers,
} from '../src/lib/dealOffers.mjs';
import { isGiftLine, stripGiftSuffix } from '../src/lib/bacWater.mjs';

// The two offers as the owner wrote them: 2+ vials = 10% off the whole order,
// and buy 4 of the same vial = 1 free.
const OFFERS = {
  mix: { enabled: true, product_names: ['Retatrutide 12mg', 'Tirzepatide 40mg', 'BPC-157 10mg'], min_units: 2, discount_pct: 0.10 },
  bundle: { enabled: true, product_names: ['Retatrutide 12mg', 'Tirzepatide 40mg'], buy_qty: 4, free_qty: 1 },
};
const line = (product, qty, unitPrice, inventoryCount = null) => ({ product, qty, unitPrice, inventoryCount });

test('2 vials unlock 10% off the whole order, BAC water included', () => {
  const choice = chooseDealOffer(OFFERS, [
    line('BPC-157 10mg', 2, 100),
    line('Bacteriostatic Water 3ml', 1, 10),
  ], { volumePct: 0, bacCharge: 10 });
  assert.equal(choice.kind, 'mix');
  assert.equal(choice.savings, 21); // 10% of 200 + 10
});

test('BAC water does not count toward the 2-vial minimum', () => {
  const choice = chooseDealOffer(OFFERS, [
    line('BPC-157 10mg', 1, 100),
    line('Bacteriostatic Water 3ml', 5, 10),
  ], { bacCharge: 50 });
  assert.equal(choice.mix.units, 1);
  assert.equal(choice.kind, 'none');
});

test('buy 4 of the same product gets 1 free, and wins when it saves more', () => {
  const choice = chooseDealOffer(OFFERS, [line('Retatrutide 12mg', 4, 150)]);
  assert.equal(choice.kind, 'bundle');
  assert.deepEqual(choice.bundle.freeLines, [{ product: 'Retatrutide 12mg', qty: 1, unitPrice: 150 }]);
  assert.equal(choice.savings, 150); // beats 10% of 600 = 60
});

test('8 of the same product gets 2 free, 12 gets 3', () => {
  assert.equal(chooseDealOffer(OFFERS, [line('Tirzepatide 40mg', 8, 100)]).bundle.freeLines[0].qty, 2);
  assert.equal(chooseDealOffer(OFFERS, [line('Tirzepatide 40mg', 12, 100)]).bundle.freeLines[0].qty, 3);
});

test('the 4 must be the same product: 2 + 2 earns nothing free', () => {
  const choice = chooseDealOffer(OFFERS, [line('Retatrutide 12mg', 2, 150), line('Tirzepatide 40mg', 2, 150)]);
  assert.equal(choice.bundle.possibleFreeLines.length, 0);
  assert.equal(choice.kind, 'mix');
});

test('the offers never stack: only the bigger saving applies', () => {
  // 4 cheap vials: the free vial (40) is worth less than 10% of the order (4*40 + 10*300 = 3160 -> 316).
  const choice = chooseDealOffer(OFFERS, [line('Tirzepatide 40mg', 4, 40), line('BPC-157 10mg', 10, 300)], { volumePct: 0 });
  assert.equal(choice.kind, 'mix');
  assert.deepEqual(choice.bundle.freeLines, []);
});

test('a better everyday volume tier is kept rather than a smaller deal', () => {
  // 5 vials: the 15% tier beats 10% off.
  const choice = chooseDealOffer(OFFERS, [line('BPC-157 10mg', 5, 100)], { volumePct: 15 });
  assert.equal(choice.kind, 'volume');
});

test('a free vial is only given if it is in stock', () => {
  const choice = chooseDealOffer(OFFERS, [line('Retatrutide 12mg', 8, 150, 9)]);
  assert.equal(choice.bundle.freeLines[0].qty, 1); // earned 2, only 1 spare
  assert.deepEqual(choice.bundle.shortByStock, ['Retatrutide 12mg']);
  const none = chooseDealOffer({ bundle: OFFERS.bundle }, [line('Retatrutide 12mg', 4, 150, 4)]);
  assert.equal(none.kind, 'none');
});

test('products outside an offer earn nothing from it', () => {
  const choice = chooseDealOffer(OFFERS, [line('BPC-157 10mg', 4, 100)]);
  assert.equal(choice.bundle.possibleFreeLines.length, 0);
});

test('a disabled offer never applies', () => {
  const choice = chooseDealOffer({ ...OFFERS, mix: { ...OFFERS.mix, enabled: false } }, [line('BPC-157 10mg', 3, 100)]);
  assert.equal(choice.kind, 'none');
});

test('free vials are recorded as gift lines that resolve to the real product', () => {
  const free = freeVialLine('Retatrutide 12mg', 1, 'en');
  assert.equal(free.price, 0);
  assert.equal(isGiftLine(free), true);
  assert.equal(stripGiftSuffix(free.product), 'Retatrutide 12mg');
  assert.equal(freeVialLine('Retatrutide 12mg', 1, 'es').product, 'Retatrutide 12mg (Regalo)');
});

test('offer setup is validated', () => {
  assert.equal(dealOffersError(OFFERS), '');
  assert.match(dealOffersError({}), /at least one offer/);
  assert.match(dealOffersError({ mix: { enabled: true, product_names: [], discount_pct: 0.1 } }), /pick at least one/);
  assert.match(dealOffersError({ mix: { enabled: true, product_names: ['X'], discount_pct: 0 } }), /between 1% and 99%/);
  assert.match(dealOffersError({ bundle: { enabled: true, product_names: ['X'], buy_qty: 1, free_qty: 2 } }), /cannot outnumber/);
  assert.match(dealOffersError({ bundle: { enabled: true, product_names: ['Bacteriostatic Water 3ml'] } }), /BAC Water/);
});

test('product names and summaries cover both offers', () => {
  assert.deepEqual(dealOfferProductNames(OFFERS), ['Retatrutide 12mg', 'Tirzepatide 40mg', 'BPC-157 10mg']);
  assert.deepEqual(dealOfferSummaries(OFFERS, 'en'), [
    'Buy 2+ vials, get 10% off your whole order',
    'Buy 4 of the same vial, get 1 free',
  ]);
  assert.equal(normalizeDealOffers(null).mix.enabled, false);
});

// --- The server's authoritative checkout, with the offers switched on ---
import { authoritativeCheckout } from '../src/lib/authoritativeCheckout.mjs';

const PRODUCTS = [
  { product: 'Retatrutide 12mg', price_usd: '150', price_crc: '75000', status: 'In Stock', inventory_count: 20 },
  { product: 'BPC-157 10mg', price_usd: '100', price_crc: '50000', status: 'In Stock', inventory_count: null },
  { product: 'Bacteriostatic Water 3ml', price_usd: '10', price_crc: '5000', status: 'In Stock', inventory_count: null },
];
const checkout = (items, extra = {}) => authoritativeCheckout({
  postedOrder: { currency: 'USD', lang: 'en', items, total_usd: 0 },
  products: PRODUCTS,
  exchangeRate: 500,
  dealOffers: OFFERS,
  ...extra,
});

test('checkout: Mix & Match takes 10% off the whole order, water included', () => {
  const result = checkout([{ product: 'BPC-157 10mg', qty: 2 }, { product: 'Bacteriostatic Water 3ml', qty: 2 }]);
  assert.equal(result.dealOffer, 'mix');
  assert.equal(result.volumeDiscountPct, 0);
  assert.equal(result.promoDiscount, 22); // 10% of (200 + 20)
  assert.equal(result.total, 220 - 22 + result.shipping);
});

test('checkout: buy 4 adds the free 5th as a zero-priced gift line', () => {
  const result = checkout([{ product: 'Retatrutide 12mg', qty: 4 }]);
  assert.equal(result.dealOffer, 'bundle');
  assert.equal(result.promoDiscount, 0);
  assert.equal(result.total, 600);
  const free = result.items.find((item) => item.product === 'Retatrutide 12mg (Free Gift)');
  assert.deepEqual(free, { product: 'Retatrutide 12mg (Free Gift)', qty: 1, price: 0 });
});

test('checkout: a free line posted by the browser is ignored, never trusted', () => {
  const result = checkout([
    { product: 'BPC-157 10mg', qty: 1 },
    { product: 'BPC-157 10mg (Free Gift)', qty: 10, price: 0 },
  ]);
  assert.equal(result.items.some((item) => /Free Gift/.test(item.product) && !/water/i.test(item.product)), false);
  const plain = authoritativeCheckout({
    postedOrder: { currency: 'USD', items: [{ product: 'BPC-157 10mg', qty: 1 }, { product: 'BPC-157 10mg (Free Gift)', qty: 10, price: 0 }] },
    products: PRODUCTS,
    exchangeRate: 500,
  });
  assert.equal(plain.items.some((item) => item.product === 'BPC-157 10mg (Free Gift)'), false);
});

test('checkout: an admin edit keeps a free vial already on the order', () => {
  const result = authoritativeCheckout({
    postedOrder: { currency: 'USD', items: [{ product: 'Retatrutide 12mg', qty: 4 }, { product: 'Retatrutide 12mg (Free Gift)', qty: 1, price: 0 }] },
    products: PRODUCTS,
    exchangeRate: 500,
    keepPostedGifts: true,
  });
  assert.equal(result.items.find((item) => item.product === 'Retatrutide 12mg (Free Gift)')?.qty, 1);
  assert.equal(result.total, 600);
});

test('checkout: a promo code switches the offers off', () => {
  const result = checkout([{ product: 'Retatrutide 12mg', qty: 4 }], { promo: { discount_pct: 0.05, target_product: 'Retatrutide 12mg', is_flash_sale: true, exact_target_match: true } });
  assert.equal(result.dealOffer, null);
  assert.equal(result.items.some((item) => /Free Gift/.test(item.product) && /Retatrutide/.test(item.product)), false);
});

import { dealOfferCartMessage } from '../src/lib/dealOffers.mjs';

test('the cart message says which offer applied, or how to reach one', () => {
  const deal = { offers: OFFERS };
  assert.match(dealOfferCartMessage(chooseDealOffer(OFFERS, [line('BPC-157 10mg', 2, 100)]), deal, 'en'), /10% off your whole order is applied/);
  assert.match(dealOfferCartMessage(chooseDealOffer(OFFERS, [line('Retatrutide 12mg', 4, 150)]), deal, 'en'), /1 × Retatrutide 12mg FREE/);
  assert.match(dealOfferCartMessage(chooseDealOffer(OFFERS, [line('BPC-157 10mg', 1, 100)]), deal, 'en'), /add 1 more deal vial for 10%.*or buy 4 of the same/);
  assert.match(dealOfferCartMessage(chooseDealOffer(OFFERS, [line('BPC-157 10mg', 5, 100)], { volumePct: 15 }), deal, 'es'), /descuento por volumen/);
});
