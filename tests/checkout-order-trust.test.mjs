// What /api/orders/create is allowed to take from the caller.
//
// The route is public and runs as service-role, so whatever it accepts is
// effectively world-writable. Two fields made that expensive:
//
//   - `status`. Posting 'Paid' created a settled order with no money behind it.
//     It looked real in the panel and satisfied the 'Paid' test the weekly
//     commission scan runs, so it was payable.
//   - `affiliate_commission_usd` / `_crc`. The browser sent them, the row stored
//     them, and the affiliate scan sums that column onto an invoice a superadmin
//     approves and pays.
//
// Both are now derived server-side. These tests pin that.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  CHECKOUT_CARD_STATUS,
  CHECKOUT_DEFAULT_STATUS,
  checkoutOrderStatus,
} from '../src/lib/checkoutOrderStatus.mjs';
import { affiliateCommissionPatch } from '../src/lib/affiliateCommission.mjs';

test('a card order opens waiting for the gateway', () => {
  assert.equal(checkoutOrderStatus('card'), CHECKOUT_CARD_STATUS);
  // The catalog posts a lowercase 'card'; an agent-typed value may not be.
  assert.equal(checkoutOrderStatus('Card'), CHECKOUT_CARD_STATUS);
  assert.equal(checkoutOrderStatus(' card '), CHECKOUT_CARD_STATUS);
});

test('every other method opens plainly pending', () => {
  assert.equal(checkoutOrderStatus('whatsapp'), CHECKOUT_DEFAULT_STATUS);
  assert.equal(checkoutOrderStatus('sinpe'), CHECKOUT_DEFAULT_STATUS);
  assert.equal(checkoutOrderStatus(''), CHECKOUT_DEFAULT_STATUS);
  assert.equal(checkoutOrderStatus(undefined), CHECKOUT_DEFAULT_STATUS);
});

test('no payment method can open an order as already settled', () => {
  // The whole point: there is no input to this function that yields a paid
  // status, so the public route cannot mint one.
  for (const method of ['card', 'whatsapp', 'sinpe', 'paypal', 'Paid', 'anything']) {
    const status = checkoutOrderStatus(method).toLowerCase();
    assert.ok(!status.includes('paid'), `${method} must not open as paid`);
    assert.ok(!status.includes('complet'), `${method} must not open as complete`);
  }
});

test('the checkout route sets the status itself rather than trusting the body', () => {
  const route = fs.readFileSync('src/app/api/orders/create/route.js', 'utf8');
  assert.match(route, /order\.status = checkoutOrderStatus\(order\.payment_method\)/);
});

test('commission is computed from the affiliate rate, not from the order body', () => {
  const order = {
    affiliate_id: 'aff-1',
    total_usd: 200,
    total_crc: 90000,
    shipping_cost_usd: 0,
    shipping_cost_crc: 0,
    // What a tampered checkout would send.
    affiliate_commission_usd: 999999,
    affiliate_commission_crc: 999999,
  };

  const patch = affiliateCommissionPatch(order, { commission_rate: 0.10 });

  assert.equal(patch.affiliate_commission_usd, 20);
  assert.equal(patch.affiliate_commission_crc, 9000);
});

test('shipping earns no commission', () => {
  const patch = affiliateCommissionPatch(
    {
      affiliate_id: 'aff-1',
      total_usd: 100,
      total_crc: 45000,
      shipping_cost_usd: 20,
      shipping_cost_crc: 9000,
    },
    { commission_rate: 0.10 },
  );

  assert.equal(patch.affiliate_commission_usd, 8);
  assert.equal(patch.affiliate_commission_crc, 3600);
});

test('an order with no affiliate earns nothing, whatever it claims', () => {
  const patch = affiliateCommissionPatch(
    { total_usd: 500, affiliate_commission_usd: 250, affiliate_commission_crc: 100000 },
    null,
  );

  assert.equal(patch.affiliate_commission_usd, 0);
  assert.equal(patch.affiliate_commission_crc, 0);
});

test('an affiliate id with no matching affiliate row earns nothing', () => {
  const patch = affiliateCommissionPatch(
    { affiliate_id: 'ghost', total_usd: 500, affiliate_commission_usd: 250 },
    null,
  );

  assert.equal(patch.affiliate_commission_usd, 0);
});

test('a negative base cannot produce a negative commission', () => {
  // Shipping above the total should floor at zero rather than claw money back.
  const patch = affiliateCommissionPatch(
    { affiliate_id: 'aff-1', total_usd: 10, shipping_cost_usd: 25 },
    { commission_rate: 0.10 },
  );

  assert.equal(patch.affiliate_commission_usd, 0);
});

test('the checkout route overwrites the posted commission fields', () => {
  const route = fs.readFileSync('src/app/api/orders/create/route.js', 'utf8');
  assert.match(route, /Object\.assign\(order, affiliateCommissionPatch\(order, affiliate\)\)/);
});

test('both routes share one commission formula', () => {
  const adminRoute = fs.readFileSync('src/app/api/admin/orders/update/route.js', 'utf8');
  const checkoutRoute = fs.readFileSync('src/app/api/orders/create/route.js', 'utf8');

  // The admin panel's local copy is gone; a second copy is how the storefront
  // came to disagree with it in the first place.
  assert.doesNotMatch(adminRoute, /function affiliateCommissionPatch/);
  assert.match(adminRoute, /from '@\/lib\/affiliateCommission\.mjs'/);
  assert.match(checkoutRoute, /from '@\/lib\/affiliateCommission\.mjs'/);
});
