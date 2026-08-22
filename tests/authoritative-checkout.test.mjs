import test from 'node:test';
import assert from 'node:assert/strict';
import { activeDealForOrder, authoritativeCheckout } from '../src/lib/authoritativeCheckout.mjs';

const RATE = 454.48;
const peptide = {
  id: 'p1',
  product: 'BPC-157 10mg',
  price_usd: '$100',
  price_crc: '₡45,448',
  status: 'In Stock',
  inventory_count: 20,
};

function posted(items, total = 0, currency = 'USD') {
  return {
    currency,
    lang: 'en',
    items,
    total_usd: currency === 'USD' ? total : 0,
    total_crc: currency === 'CRC' ? total : 0,
  };
}

test('server pricing detects a stale or tampered checkout total', () => {
  const result = authoritativeCheckout({
    postedOrder: posted([{ product: peptide.product, qty: 1, price: 1 }], 6.5),
    products: [peptide],
    exchangeRate: RATE,
  });

  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.equal(result.total, 105.5);
  assert.deepEqual(result.items[0], { product: peptide.product, qty: 1, price: 100 });
  assert.equal(result.items[1].price, 0, 'the canonical packing gift is added server-side');
});

test('a reviewed current total is accepted and volume pricing is authoritative', () => {
  const result = authoritativeCheckout({
    postedOrder: posted([{ product: peptide.product, qty: 5, price: 100 }], 425),
    products: [peptide],
    exchangeRate: RATE,
  });

  assert.equal(result.ok, true);
  assert.equal(result.changed, false);
  assert.equal(result.volumeDiscountPct, 15);
  assert.equal(result.volumeDiscountAmount, 75);
  assert.equal(result.shipping, 0);
  assert.equal(result.total, 425);
});

test('duplicate posted lines are combined before inventory is checked', () => {
  const result = authoritativeCheckout({
    postedOrder: posted([
      { product: peptide.product, qty: 3, price: 100 },
      { product: peptide.product, qty: 3, price: 100 },
    ]),
    products: [{ ...peptide, inventory_count: 5 }],
    exchangeRate: RATE,
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /only 5 available/);
});

test('an in-stock product with untracked inventory remains purchasable', () => {
  const untracked = { ...peptide, inventory_count: null };
  const result = authoritativeCheckout({
    postedOrder: posted([{ product: untracked.product, qty: 1, price: 100 }], 105.5),
    products: [untracked],
    exchangeRate: RATE,
  });

  assert.equal(result.ok, true);
  assert.equal(result.changed, false);
});

test('server rejects retired BAC sizes and water-only carts below their floor', () => {
  const retired = authoritativeCheckout({
    postedOrder: posted([{ product: 'Bacteriostatic Water 2ml', qty: 5, price: 10 }]),
    products: [{ ...peptide, product: 'Bacteriostatic Water 2ml', price_usd: '$10' }],
    exchangeRate: RATE,
  });
  assert.equal(retired.ok, false);
  assert.match(retired.error, /no longer sold/);

  const tooSmall = authoritativeCheckout({
    postedOrder: posted([{ product: 'Bacteriostatic Water 3ml', qty: 1, price: 10 }]),
    products: [{ ...peptide, product: 'Bacteriostatic Water 3ml', price_usd: '$10' }],
    exchangeRate: RATE,
  });
  assert.equal(tooSmall.ok, false);
  assert.match(tooSmall.error, /at least 5 vials/);
});

test('flash-sale promo requires its target product on the server', () => {
  const result = authoritativeCheckout({
    postedOrder: posted([{ product: peptide.product, qty: 1, price: 100 }]),
    products: [peptide],
    promo: { discount_pct: 0.2, is_flash_sale: true, target_product: 'GHK-Cu' },
    exchangeRate: RATE,
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /requires GHK-Cu/);
});

test('deal attribution is derived from live dates and canonical item names', () => {
  const deals = [
    { id: 'old', status: 'ended', starts_at: '2026-08-01T00:00:00Z', ends_at: '2026-08-20T00:00:00Z', product_names: [peptide.product] },
    { id: 'live', status: 'live', starts_at: '2026-08-20T00:00:00Z', ends_at: '2026-08-24T00:00:00Z', product_names: [peptide.product] },
  ];
  assert.equal(activeDealForOrder(deals, [{ product: peptide.product, qty: 1 }], new Date('2026-08-22T00:00:00Z'))?.id, 'live');
  assert.equal(activeDealForOrder(deals, [{ product: 'Other', qty: 1 }], new Date('2026-08-22T00:00:00Z')), null);
});
