// A card order's stock, and the team's alert, after the ChargX hand-off.
//
// The hand-off moved the moment an order becomes paid off our own server and
// into /api/chargx/webhook. Two things were left behind by that move: nothing
// took the vials out of stock any more, and the team's held new-order alert
// had nothing left to release it when a customer abandoned the payment page.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { reservePaidOrderInventory } from '../src/lib/orderInventoryServer.js';

function makeSupabase({ products = [], ordersUpdateError = null } = {}) {
  const writes = { products: [], orders: [], notifications: [] };
  const supabase = {
    from(table) {
      if (table === 'products') {
        return {
          select: async () => ({ data: products, error: null }),
          update: (patch) => ({
            eq: async (_column, value) => {
              writes.products.push({ product: value, patch });
              return { error: null };
            },
          }),
        };
      }
      if (table === 'orders') {
        return {
          update: (patch) => ({
            eq: async (_column, value) => {
              writes.orders.push({ id: value, patch });
              return { error: ordersUpdateError };
            },
          }),
        };
      }
      if (table === 'admin_notifications') {
        return {
          insert: async (row) => {
            writes.notifications.push(row);
            return { error: null };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
  return { supabase, writes };
}

const PRODUCTS = [
  { product: 'BPC-157 5mg', inventory_count: 10, low_stock_threshold: 5 },
  { product: 'GHK-Cu 50mg', inventory_count: 4, low_stock_threshold: 5 },
];

const paidOrder = (overrides = {}) => ({
  id: 'row-1',
  order_number: 'CARD-ABC123',
  items: [{ product: 'BPC-157 5mg', qty: 2 }],
  inventory_deducted: [],
  ...overrides,
});

test('a paid card order takes its vials out of stock', async () => {
  const { supabase, writes } = makeSupabase({ products: PRODUCTS });

  const result = await reservePaidOrderInventory(supabase, paidOrder());

  assert.equal(result.reserved, true);
  assert.deepEqual(writes.products, [{ product: 'BPC-157 5mg', patch: { inventory_count: 8 } }]);
  assert.deepEqual(writes.orders, [{
    id: 'row-1',
    patch: { inventory_deducted: [{ product: 'BPC-157 5mg', qty: 2 }] },
  }]);
});

test('a second delivery of the same payment does not deduct twice', async () => {
  const { supabase, writes } = makeSupabase({ products: PRODUCTS });

  const result = await reservePaidOrderInventory(
    supabase,
    paidOrder({ inventory_deducted: [{ product: 'BPC-157 5mg', qty: 2 }] }),
  );

  assert.equal(result.reserved, false);
  assert.equal(result.skipped, 'already-reserved');
  assert.deepEqual(writes.products, []);
  assert.deepEqual(writes.orders, []);
});

test('a legacy row with no reservation column is left alone', async () => {
  const { supabase, writes } = makeSupabase({ products: PRODUCTS });

  const result = await reservePaidOrderInventory(supabase, paidOrder({ inventory_deducted: undefined }));

  assert.equal(result.reserved, false);
  assert.deepEqual(writes.products, []);
});

test('stock dropping to the threshold still raises the low-stock alert', async () => {
  const { supabase, writes } = makeSupabase({ products: PRODUCTS });

  await reservePaidOrderInventory(supabase, paidOrder({
    items: [{ product: 'GHK-Cu 50mg', qty: 4 }],
  }));

  assert.equal(writes.notifications.length, 1);
  assert.equal(writes.notifications[0].type, 'low_inventory');
  assert.match(writes.notifications[0].title, /Out of Stock: GHK-Cu 50mg/);
});

test('a stock write that fails is rolled back and reported, never thrown', async () => {
  const { supabase, writes } = makeSupabase({
    products: PRODUCTS,
    ordersUpdateError: { message: 'inventory_deducted missing' },
  });

  const result = await reservePaidOrderInventory(supabase, paidOrder(), { logPrefix: '[test]' });

  assert.equal(result.reserved, false);
  // Deducted, then put back, so a failed write cannot eat the stock.
  assert.deepEqual(writes.products.map((write) => write.patch.inventory_count), [8, 10]);
  assert.equal(writes.notifications.length, 1);
  assert.equal(writes.notifications[0].type, 'inventory_reservation_failed');
  assert.match(writes.notifications[0].title, /CARD-ABC123/);
});

test('the ChargX webhook is what reserves stock for a card order now', () => {
  const route = fs.readFileSync('src/app/api/chargx/webhook/route.js', 'utf8');
  assert.match(route, /reservePaidOrderInventory\(supabase, orderRow/);
  // Inside the Paid branch, not on a decline.
  const paidBranch = route.slice(route.indexOf("if (statusText === 'Paid')"));
  assert.match(paidBranch, /reservePaidOrderInventory/);
});

test('one copy of the stock rule, shared by both payment paths', () => {
  const card = fs.readFileSync('src/app/api/shieldhubpay/process-card/route.js', 'utf8');
  assert.match(card, /import \{ reservePaidOrderInventory \} from '@\/lib\/orderInventoryServer'/);
  assert.equal(card.includes('async function reserveInventoryAfterApprovedPayment'), false);
});

test('handing the customer to ChargX sends the team alert that was held back', () => {
  const route = fs.readFileSync('src/app/api/shieldhubpay/process-card/route.js', 'utf8');
  const redirectBranch = route.slice(route.indexOf('ORDER_STATUS.CARD_3DS && transaction.redirect_url'));
  assert.match(redirectBranch, /await sendHeldTeamAlert\(orderNumber/);
  // Team only: the customer must not be told "processing" before the payment
  // is confirmed, which is why sendCardHandoffReceipt was removed.
  assert.equal(route.includes('sendCardHandoffReceipt'), false);
});

test('the webhook no longer claims to be the team first sight of the order', () => {
  const route = fs.readFileSync('src/app/api/chargx/webhook/route.js', 'utf8');
  assert.match(route, /firstTeamAlert: false/);
});
