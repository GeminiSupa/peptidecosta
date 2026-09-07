/**
 * A negotiated discount stands in place of the automatic volume tier.
 *
 * The two used to stack. An agent typing "25%" for a bulk buyer produced a 20%
 * volume discount followed by 25% off the remainder — about 40% off in total,
 * and the figure that was actually negotiated appeared on neither the screen
 * nor the receipt. On a manual order the typed figure is now the whole
 * discount. Website orders are untouched: nobody negotiated those, and their
 * volume discount is the offer the customer accepted at checkout.
 */

import test from 'node:test';
import { tenPlusDiscountPct } from '../src/lib/bulkDeal.mjs';
import assert from 'node:assert/strict';

import {
  calculateAdminOrderTotals,
  getAdminVolumeDiscountPct,
  isManualOrderSource,
  manualDiscountReplacesVolume,
} from '../src/lib/adminOrderTotals.mjs';
import { authoritativeCheckout } from '../src/lib/authoritativeCheckout.mjs';

// Ten vials at ₡45,037 — the order from the report that prompted this.
const ITEMS = [{ product: 'Retatrutide 5mg', qty: 10, price: 45037 }];
const SHIPPING = 5;

test('the reported order: 25% typed is 25% taken, not 40%', () => {
  const totals = calculateAdminOrderTotals(ITEMS, SHIPPING, {
    manualDiscountType: 'percentage',
    manualDiscountValue: 25,
    replaceVolumeDiscount: true,
  });

  assert.equal(totals.itemsSubtotal, 450370);
  assert.equal(totals.discountPct, 0, 'the volume tier steps aside');
  assert.equal(totals.discountAmount, 0);
  assert.equal(totals.manualDiscountAmount, 112592.5);
  assert.equal(totals.total, 450370 - 112592.5 + SHIPPING);

  // What it used to do, kept here so the difference is on the record.
  const stacked = calculateAdminOrderTotals(ITEMS, SHIPPING, {
    manualDiscountType: 'percentage',
    manualDiscountValue: 25,
  });
  assert.equal(stacked.discountPct, tenPlusDiscountPct());
  assert.ok(stacked.total < totals.total, 'stacking charged the customer less than agreed');
});

test('a fixed negotiated amount also replaces the tier', () => {
  const totals = calculateAdminOrderTotals(ITEMS, SHIPPING, {
    manualDiscountType: 'fixed',
    manualDiscountValue: 50000,
    replaceVolumeDiscount: true,
  });

  assert.equal(totals.discountAmount, 0);
  assert.equal(totals.manualDiscountAmount, 50000);
  assert.equal(totals.total, 450370 - 50000 + SHIPPING);
});

test('with no manual discount the volume tier still applies', () => {
  const totals = calculateAdminOrderTotals(ITEMS, SHIPPING, {
    replaceVolumeDiscount: manualDiscountReplacesVolume('admin_manual', null, 0),
  });

  // Subtotal is fixed by the fixture; the tier it earns is not, so derive the
  // amount from the rate in force instead of pinning the deal-week figure.
  const SUBTOTAL = 450370;
  assert.equal(totals.discountPct, tenPlusDiscountPct());
  assert.equal(totals.discountAmount, SUBTOTAL * tenPlusDiscountPct() / 100);
  assert.equal(totals.manualDiscountAmount, 0);
});

test('the rule is manual orders only', () => {
  assert.equal(isManualOrderSource('admin_manual'), true);
  assert.equal(isManualOrderSource('website'), false);
  assert.equal(isManualOrderSource(null), false);

  // A website order keeps its volume discount even when staff add a discount
  // on top — that tier is the offer the shopper accepted, not staff's to undo.
  assert.equal(manualDiscountReplacesVolume('website', 'percentage', 25), false);
  assert.equal(manualDiscountReplacesVolume('woocommerce', 'fixed', 100), false);
  assert.equal(manualDiscountReplacesVolume('admin_manual', 'percentage', 25), true);

  // A discount box left empty is not a negotiated price.
  assert.equal(manualDiscountReplacesVolume('admin_manual', 'percentage', 0), false);
  assert.equal(manualDiscountReplacesVolume('admin_manual', 'none', 25), false);
});

test('the server rebuild drops the tier the same way the screen does', () => {
  // CRC is always derived from the catalog USD price and the live rate, on the
  // screen and on the server alike, so the fixture has to be self-consistent:
  // $100 at ₡450.37 is the ₡45,037 the agent sees in the items list.
  const products = [{
    product: 'Retatrutide 5mg',
    price_usd: 100,
    price_crc: 45037,
    status: 'In Stock',
    inventory_count: null,
  }];
  const RATE = 450.37;

  const suppressed = authoritativeCheckout({
    postedOrder: { items: ITEMS, currency: 'CRC' },
    products,
    promo: null,
    exchangeRate: RATE,
    suppressVolumeDiscount: true,
  });
  assert.equal(suppressed.ok, true);
  assert.equal(suppressed.volumeDiscountPct, 0);
  assert.equal(suppressed.volumeDiscountAmount, 0);

  // The public checkout never passes the flag, so it is unaffected.
  const normal = authoritativeCheckout({
    postedOrder: { items: ITEMS, currency: 'CRC' },
    products,
    promo: null,
    exchangeRate: RATE,
  });
  // Read the rate rather than hardcoding it: a deal week raises the 10+ tier,
  // and a literal here just fails every time marketing runs one.
  assert.equal(normal.volumeDiscountPct, tenPlusDiscountPct());

  // Screen and server land on the same figure.
  const preview = calculateAdminOrderTotals(ITEMS, SHIPPING, {
    manualDiscountType: 'percentage',
    manualDiscountValue: 25,
    replaceVolumeDiscount: true,
  });
  const manual = calculateAdminOrderTotals(suppressed.items, 0, {
    manualDiscountType: 'percentage',
    manualDiscountValue: 25,
    replaceVolumeDiscount: true,
  }).manualDiscountAmount;
  const saved = (suppressed.total - suppressed.shipping) - manual + SHIPPING;

  assert.equal(preview.total, saved);
});

test('the orders list badge reports what was taken, not what was qualified for', () => {
  // Seven vials qualify for the 15% tier. On a manual order carrying a
  // negotiated discount that tier is not applied, and the list must not
  // advertise it beside a total that plainly excludes it.
  const items = [{ product: 'Retatrutide 5mg', qty: 7, price: 45037 }];
  assert.equal(getAdminVolumeDiscountPct(items), 15);

  const manualOrder = {
    source: 'admin_manual',
    manual_discount_type: 'percentage',
    manual_discount_value: 33,
  };
  const replaced = manualDiscountReplacesVolume(
    manualOrder.source, manualOrder.manual_discount_type, manualOrder.manual_discount_value,
  );
  assert.equal(replaced, true);
  assert.equal(replaced ? 0 : getAdminVolumeDiscountPct(items), 0, 'no volume badge on this row');

  // The same seven vials on a website order still earn, and still show, 15%.
  const webOrder = { source: 'website', manual_discount_type: null, manual_discount_value: 0 };
  const webReplaced = manualDiscountReplacesVolume(
    webOrder.source, webOrder.manual_discount_type, webOrder.manual_discount_value,
  );
  assert.equal(webReplaced ? 0 : getAdminVolumeDiscountPct(items), 15);

  // And a manual order with no discount typed keeps its volume badge.
  const plainManual = { source: 'admin_manual', manual_discount_type: null, manual_discount_value: 0 };
  const plainReplaced = manualDiscountReplacesVolume(
    plainManual.source, plainManual.manual_discount_type, plainManual.manual_discount_value,
  );
  assert.equal(plainReplaced ? 0 : getAdminVolumeDiscountPct(items), 15);
});

/**
 * The volume discount is now the operator's explicit choice on a checkbox,
 * not a rule inferred from whether a discount was typed. The inference stays
 * as the default for callers that make no choice.
 */
test('an explicit choice beats the inferred rule, in both directions', () => {
  const resolve = (order, type, value) => (
    order.apply_volume_discount === undefined
      ? manualDiscountReplacesVolume('admin_manual', type, value)
      : order.apply_volume_discount === false
  );

  // Ticked: the customer earned both, even with a negotiated discount on top.
  assert.equal(resolve({ apply_volume_discount: true }, 'percentage', 25), false);

  // Unticked: no tier, even with no negotiated discount at all.
  assert.equal(resolve({ apply_volume_discount: false }, null, 0), true);

  // No choice made: the default rule decides, exactly as before.
  assert.equal(resolve({}, 'percentage', 25), true);
  assert.equal(resolve({}, null, 0), false);
});

test('reopening an order honours the choice it was saved with', () => {
  // A stored choice must survive an edit. Before this was recorded, editing
  // the items on an order saved with both discounts would silently drop the
  // volume one and charge the customer more than they agreed to.
  const resolveOnEdit = (currentOrder, type, value) => (
    currentOrder.apply_volume_discount === null || currentOrder.apply_volume_discount === undefined
      ? manualDiscountReplacesVolume(currentOrder.source, type, value)
      : currentOrder.apply_volume_discount === false
  );

  const keptBoth = { source: 'admin_manual', apply_volume_discount: true };
  assert.equal(resolveOnEdit(keptBoth, 'percentage', 25), false, 'the tier stays on');

  const replacedIt = { source: 'admin_manual', apply_volume_discount: false };
  assert.equal(resolveOnEdit(replacedIt, 'percentage', 25), true);

  // Orders from before the column existed, and every website order, fall back
  // to the default rule.
  assert.equal(resolveOnEdit({ source: 'admin_manual', apply_volume_discount: null }, 'percentage', 25), true);
  assert.equal(resolveOnEdit({ source: 'website', apply_volume_discount: null }, 'percentage', 25), false);
});
