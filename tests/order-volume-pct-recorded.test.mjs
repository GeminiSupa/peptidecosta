/**
 * An order keeps the volume rate it was charged.
 *
 * The tier percentages are not constants — a deal week raised the 10+ vial
 * tier from 20% to 35%. Every reader that worked the rate out from the item
 * count therefore reported the CURRENT offer against a HISTORIC total: the
 * orders list relabelled deal-week orders as 20% the moment the deal lapsed,
 * and reopening one in the detail panel recomputed its total at the lower
 * tier, ready for a member of staff to save a figure the customer never agreed
 * to.
 *
 * The rate is now written onto the order when it is priced and read back
 * verbatim. Rows older than the column keep falling back to the item count,
 * which is the best guess available for them.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAdminOrderTotals,
  storedOrderVolumePct,
} from '../src/lib/adminOrderTotals.mjs';
import { authoritativeCheckout } from '../src/lib/authoritativeCheckout.mjs';
import { BULK_DEAL_END_MS } from '../src/lib/bulkDeal.mjs';

const ITEMS = [{ product: 'BPC-157', qty: 10, price: 60 }];
const PRODUCTS = [{
  product: 'BPC-157', price_usd: 60, price_crc: 30000,
  status: 'In Stock', inventory_count: null,
}];

/** Run a function with the clock moved to a fixed instant. */
function at(ms, fn) {
  const real = Date.now;
  Date.now = () => ms;
  try { return fn(); } finally { Date.now = real; }
}

test('storedOrderVolumePct reads a recorded rate and ignores an absent one', () => {
  assert.equal(storedOrderVolumePct({ volume_discount_pct: 35 }), 35);
  assert.equal(storedOrderVolumePct({ volume_discount_pct: '35' }), 35);
  assert.equal(storedOrderVolumePct({ volume_discount_pct: 0 }), 0);

  // Older rows, and a database that has not had the migration pasted in yet.
  assert.equal(storedOrderVolumePct({ volume_discount_pct: null }), null);
  assert.equal(storedOrderVolumePct({}), null);
  assert.equal(storedOrderVolumePct(null), null);
  assert.equal(storedOrderVolumePct({ volume_discount_pct: 'n/a' }), null);
});

test('a deal-week order keeps its rate after the deal lapses', () => {
  // Priced while the deal ran.
  const priced = at(BULK_DEAL_END_MS - 60_000, () => authoritativeCheckout({
    postedOrder: { items: ITEMS, currency: 'USD' },
    products: PRODUCTS,
    promo: null,
    exchangeRate: 500,
  }));
  assert.equal(priced.ok, true);
  assert.equal(priced.volumeDiscountPct, 35);

  const order = { volume_discount_pct: priced.volumeDiscountPct };

  // Read back a week later, when the tier is 20% again.
  at(BULK_DEAL_END_MS + 7 * 24 * 3600_000, () => {
    const totals = calculateAdminOrderTotals(ITEMS, 15, {
      volumeDiscountPct: storedOrderVolumePct(order),
    });
    assert.equal(totals.discountPct, 35, 'the badge must still report what was charged');
    assert.equal(totals.discountAmount, 600 * 0.35);
    assert.equal(totals.total, 600 - 210 + 15);
  });
});

test('re-pricing an existing order does not move it onto today\'s tier', () => {
  // The edit route replays the order through authoritativeCheckout. Pinned to
  // the recorded rate, an edit after the deal must not quietly cheapen it.
  const repriced = at(BULK_DEAL_END_MS + 7 * 24 * 3600_000, () => authoritativeCheckout({
    postedOrder: { items: ITEMS, currency: 'USD' },
    products: PRODUCTS,
    promo: null,
    exchangeRate: 500,
    volumeDiscountPctOverride: 35,
  }));
  assert.equal(repriced.ok, true);
  assert.equal(repriced.volumeDiscountPct, 35);

  // With no recorded rate the old behaviour stands: work it out from the cart.
  const legacy = at(BULK_DEAL_END_MS + 7 * 24 * 3600_000, () => authoritativeCheckout({
    postedOrder: { items: ITEMS, currency: 'USD' },
    products: PRODUCTS,
    promo: null,
    exchangeRate: 500,
    volumeDiscountPctOverride: storedOrderVolumePct({}),
  }));
  assert.equal(legacy.volumeDiscountPct, 20);
});

test('a negotiated discount still replaces the tier, recorded rate or not', () => {
  const totals = calculateAdminOrderTotals(ITEMS, 15, {
    manualDiscountType: 'percentage',
    manualDiscountValue: 25,
    replaceVolumeDiscount: true,
    volumeDiscountPct: 35,
  });
  assert.equal(totals.discountPct, 0);
  assert.equal(totals.discountAmount, 0);
});

test('a brand new order with no recorded rate uses the tier in force', () => {
  at(BULK_DEAL_END_MS - 60_000, () => {
    const totals = calculateAdminOrderTotals(ITEMS, 0, { volumeDiscountPct: null });
    assert.equal(totals.discountPct, 35);
  });
  at(BULK_DEAL_END_MS + 60_000, () => {
    const totals = calculateAdminOrderTotals(ITEMS, 0, { volumeDiscountPct: null });
    assert.equal(totals.discountPct, 20);
  });
});
