// The things a refund has to reach besides the order itself.
//
// Refunding an order was correct in the order table and nowhere else: the
// customer's own account still said "payment pending", the affiliate kept the
// commission on money that had gone back, the rep's referral figures dropped
// the sale entirely rather than reducing it, and ticking "put the stock back"
// on a one-bottle refund returned all five. One test per gap.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  orderDeliveryState,
  orderPaymentState,
  paymentLabel,
} from '../src/lib/customerOrderView.mjs';
import { affiliateCommissionPatch } from '../src/lib/affiliateCommission.mjs';
import { buildReferralStats } from '../src/lib/referralStats.mjs';
import { planPartialRestock, restockableRemaining } from '../src/lib/inventoryRestore.mjs';

// Maria paid $100 for 5 bottles. $30 came back. She keeps $70 and 4 bottles.
const maria = (over = {}) => ({
  id: 'o1',
  status: 'Partly Refunded',
  total_usd: 100,
  total_crc: 50000,
  currency: 'USD',
  created_at: '2026-08-10T12:00:00Z',
  refunded_amount_usd: 30,
  refunded_amount_crc: 15000,
  ...over,
});

// ------------------------------------------- what the customer is told

test('a refunded customer is not told their payment is pending', () => {
  // "Refunded" matched none of the status lists, so it fell through to the
  // catch-all and told someone who had just been paid back that they still
  // owed money — in Spanish too.
  const refunded = maria({ status: 'Refunded', refunded_amount_usd: 100, refunded_amount_crc: 50000 });

  assert.equal(orderPaymentState(refunded), 'refunded');
  assert.equal(paymentLabel(refunded, 'en'), 'Refunded');
  assert.equal(paymentLabel(refunded, 'es'), 'Reembolsado');
  assert.notEqual(orderPaymentState(refunded), 'pending');
});

test('a partly refunded order says so, and is not shown as unpaid', () => {
  assert.equal(orderPaymentState(maria()), 'partly_refunded');
  assert.equal(paymentLabel(maria(), 'en'), 'Partly refunded');
  assert.equal(paymentLabel(maria(), 'es'), 'Reembolso parcial');
});

test('a refund does not tell the customer their parcel is awaiting payment', () => {
  // The refund overwrote the status that said where the parcel was, so the
  // tracking number decides. Never "awaiting_payment" — that is the label that
  // reads as "you still have to pay us".
  assert.equal(orderDeliveryState(maria({ tracking_number: 'CR123' })), 'shipped');
  assert.equal(orderDeliveryState(maria()), 'preparing');
  assert.equal(orderDeliveryState(maria({ status: 'Refunded' })), 'cancelled');
});

test('every customer-facing state still has a label in both languages', () => {
  // paymentLabel indexes the map directly, so a state with no entry throws in
  // the customer's browser rather than degrading.
  for (const status of ['Paid', 'Refunded', 'Partly Refunded', 'Cancelled', 'Pending', 'Declined']) {
    for (const lang of ['en', 'es']) {
      assert.equal(typeof paymentLabel({ status }, lang), 'string', status + '/' + lang);
    }
  }
});

// ------------------------------------------------- the affiliate's cut

test('an affiliate earns on what the customer kept, not on what came back', () => {
  const affiliate = { commission_rate: 0.10 };
  const patch = affiliateCommissionPatch(maria({ affiliate_id: 'aff1' }), affiliate);

  assert.equal(patch.affiliate_commission_usd, 7, '10% of the $70 kept, not of $100');
  assert.equal(patch.affiliate_commission_crc, 3500);
});

test('a fully refunded order earns an affiliate nothing', () => {
  const full = maria({ affiliate_id: 'aff1', refunded_amount_usd: 100, refunded_amount_crc: 50000 });

  assert.deepEqual(affiliateCommissionPatch(full, { commission_rate: 0.10 }), {
    affiliate_commission_usd: 0,
    affiliate_commission_crc: 0,
  });
});

test('commission still comes off merchandise only, never the shipping fee', () => {
  const shipped = maria({
    affiliate_id: 'aff1',
    total_usd: 110,
    shipping_cost_usd: 10,
    refunded_amount_usd: 30,
    total_crc: 0,
    refunded_amount_crc: 0,
  });

  // (110 - 10 shipping - 30 refunded) * 10%
  assert.equal(affiliateCommissionPatch(shipped, { commission_rate: 0.10 }).affiliate_commission_usd, 7);
});

test('an over-refund never turns into a negative commission', () => {
  const over = maria({ affiliate_id: 'aff1', refunded_amount_usd: 500, refunded_amount_crc: 500000 });

  const patch = affiliateCommissionPatch(over, { commission_rate: 0.10 });
  assert.equal(patch.affiliate_commission_usd, 0);
  assert.equal(patch.affiliate_commission_crc, 0);
});

test('the refund rewrites the stored commission rather than leaving it', () => {
  // It lives in a column written when the order was placed. Nothing else ever
  // revisits it, so the refund has to.
  const route = fs.readFileSync('src/app/api/admin/orders/refund/route.js', 'utf8');

  assert.match(route, /affiliateCommissionPatch\(updated, affiliate\)/);
  assert.match(route, /from\('affiliates'\)/);
});

// --------------------------------------------------- the rep's figures

test('a part refund reduces a rep\'s referral total instead of erasing it', () => {
  const scans = [{ sales_agent: 'Juan', promo_code: 'JUAN10', created_at: '2026-08-09T12:00:00Z' }];
  const rows = buildReferralStats(scans, [maria({ sales_agent: 'Juan', promo_code: 'JUAN10' })], 454.48);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].orders, 1, 'the sale happened and must still be counted');
  assert.equal(rows[0].revenueUsd, 70, 'at what was kept, not the full 100 and not zero');
});

test('a fully refunded order leaves a rep nothing', () => {
  const scans = [{ sales_agent: 'Juan', promo_code: 'JUAN10', created_at: '2026-08-09T12:00:00Z' }];
  const full = maria({
    sales_agent: 'Juan',
    promo_code: 'JUAN10',
    status: 'Refunded',
    refunded_amount_usd: 100,
    refunded_amount_crc: 50000,
  });

  const rows = buildReferralStats(scans, [full], 454.48);
  assert.equal(rows[0]?.revenueUsd ?? 0, 0);
});

// -------------------------------------------------------------- stock

test('a partial refund puts back only the bottles that were named', () => {
  // The whole-order restore returns every line and stamps the row so it can
  // only ever run once. On a one-bottle refund that returned all five and then
  // blocked the rest from ever coming back.
  const route = fs.readFileSync('src/app/api/admin/orders/refund/route.js', 'utf8');

  assert.match(route, /planPartialRestock\(order, body\?\.restockItems\)/, 'the request must be capped');
  assert.match(route, /restoreSelectedQuantities\(supabase, updated, restockLines/);
  assert.match(route, /restocked: restockLines/, 'and recorded on the refund event');

  // The whole-order path must stay behind the full-refund branch.
  const stockBlock = route.slice(route.indexOf('--- stock ---'), route.indexOf("--- the affiliate's cut"));
  assert.match(stockBlock, /if \(!plan\.fullyRefunded\)/);
  assert.ok(
    stockBlock.indexOf('restoreInventoryForOrder') > stockBlock.indexOf('plan.restoreStock'),
    'the whole-order restore belongs to the full-refund branch only',
  );
});

test('the refund box asks full or partial before anything else', () => {
  const dialog = fs.readFileSync('src/components/admin/RefundDialog.js', 'utf8');

  assert.match(dialog, /const \[kind, setKind\] = useState\(null\)/, 'nothing is filled in before it is answered');
  assert.match(dialog, /if \(kind === null\)/, 'the choice is its own step');
  assert.match(dialog, /Full refund/);
  assert.match(dialog, /Partial refund/);
});

test('the box offers the bottle picker on a partial refund only', () => {
  const dialog = fs.readFileSync('src/components/admin/RefundDialog.js', 'utf8');

  assert.match(dialog, /restockableRemaining\(order\)/, 'it offers only what can still go back');
  assert.match(dialog, /Which bottles came back\?/);
  assert.match(dialog, /restoreStock: isFull && restoreStock/, 'whole-order restore is full-refund only');
  assert.match(dialog, /restockItems: isFull \? \[\] : restockLines/, 'named bottles are partial-refund only');
});

test('only what is left can be put back', () => {
  const order = { items: [{ product: 'Retatrutide 20mg', qty: 2 }, { product: 'NAD+ 500mg', qty: 1 }] };

  assert.deepEqual(restockableRemaining(order), [
    { product: 'Retatrutide 20mg', qty: 2 },
    { product: 'NAD+ 500mg', qty: 1 },
  ]);

  // One already came back on an earlier refund.
  const afterOne = { ...order, refund_events: [{ restocked: [{ product: 'Retatrutide 20mg', qty: 1 }] }] };
  assert.deepEqual(restockableRemaining(afterOne), [
    { product: 'Retatrutide 20mg', qty: 1 },
    { product: 'NAD+ 500mg', qty: 1 },
  ]);
});

test('asking for more bottles than were bought puts back only what is owed', () => {
  // Stock that exists only in the database ends as an order nobody can ship,
  // so the browser's number is a request, never an instruction.
  const order = { items: [{ product: 'Retatrutide 20mg', qty: 2 }] };

  assert.deepEqual(
    planPartialRestock(order, [{ product: 'Retatrutide 20mg', qty: 99 }]),
    [{ product: 'Retatrutide 20mg', qty: 2 }],
  );
});

test('a product that was never on the order is ignored', () => {
  const order = { items: [{ product: 'Retatrutide 20mg', qty: 2 }] };

  assert.deepEqual(planPartialRestock(order, [{ product: 'Something Else', qty: 3 }]), []);
  assert.deepEqual(planPartialRestock(order, [{ product: 'Retatrutide 20mg', qty: 0 }]), []);
  assert.deepEqual(planPartialRestock(order, [{ product: '', qty: 2 }]), []);
  assert.deepEqual(planPartialRestock(order, null), []);
});

test('nothing can come back once the whole order already has', () => {
  const restored = {
    items: [{ product: 'Retatrutide 20mg', qty: 2 }],
    inventory_restored_at: '2026-08-20T12:00:00Z',
  };

  assert.deepEqual(restockableRemaining(restored), []);
  assert.deepEqual(planPartialRestock(restored, [{ product: 'Retatrutide 20mg', qty: 1 }]), []);
});

test('two partial refunds cannot between them return more than was bought', () => {
  const order = { items: [{ product: 'Retatrutide 20mg', qty: 3 }] };

  const first = planPartialRestock(order, [{ product: 'Retatrutide 20mg', qty: 2 }]);
  assert.deepEqual(first, [{ product: 'Retatrutide 20mg', qty: 2 }]);

  const afterFirst = { ...order, refund_events: [{ restocked: first }] };
  const second = planPartialRestock(afterFirst, [{ product: 'Retatrutide 20mg', qty: 2 }]);
  assert.deepEqual(second, [{ product: 'Retatrutide 20mg', qty: 1 }], 'only the third bottle is left');
});

// ------------------------------- the money screens that were still raw

test('journey earnings drop unpaid orders and net the refunded ones', () => {
  const route = fs.readFileSync('src/app/api/admin/journeys/route.js', 'utf8');

  assert.match(route, /orderNetRevenueUsd\(order\)/);
  // It used to skip only cancelled, so pending and declined counted as earnings.
  assert.ok(!route.includes("=== 'cancelled') continue"), 'the cancelled-only check must be gone');
  assert.match(route, /refunded_amount_usd/, 'and it must fetch what the rule reads');
});

test('analytics breakdowns by payment method and source are netted', () => {
  const dash = fs.readFileSync('src/components/admin/AnalyticsDashboard.js', 'utf8');

  assert.match(dash, /paymentBreakdown\[method\]\.revenue \+= orderNetRevenue\(o\)\.usd/);
  assert.match(dash, /orderSourceBreakdown\[source\]\.revenue \+= orderNetRevenue\(o\)\.usd/);
});

test('the rep report fetches the refund columns it now reads', () => {
  const route = fs.readFileSync('src/app/api/admin/referral-stats/route.js', 'utf8');

  assert.match(route, /refunded_amount_usd/);
  assert.match(route, /refunded_amount_crc/);
});
