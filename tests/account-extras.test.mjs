import test from 'node:test';
import assert from 'node:assert/strict';

import { orderDeliveryDate } from '../src/lib/customerOrderView.mjs';
import {
  helpTopicSubject,
  isCatalogOutOfStock,
  orderNotifications,
  purchasedProductNames,
  stockAlertSubject,
  toggleFavorite,
} from '../src/lib/accountExtras.mjs';

test('a delivery date stays empty when the order has none', () => {
  assert.equal(orderDeliveryDate({ status: 'Paid' }), '');
  assert.equal(orderDeliveryDate({ estimated_delivery: '   ' }), '');
  assert.equal(orderDeliveryDate({}), '');
});

test('a real delivery date is shown', () => {
  assert.match(orderDeliveryDate({ delivery_date: '2026-10-02' }, 'en'), /2026/);
});

test('help and stock subjects stay on a fixed list', () => {
  assert.equal(helpTopicSubject('shipping'), 'Account: Shipping issue');
  assert.equal(helpTopicSubject('dose'), '');
  assert.equal(stockAlertSubject('  BPC-157  '), 'Back in stock: BPC-157');
  assert.equal(stockAlertSubject(''), '');
});

test('out of stock is only the sold-out status', () => {
  assert.equal(isCatalogOutOfStock('Out of Stock'), true);
  assert.equal(isCatalogOutOfStock('Agotado'), true);
  assert.equal(isCatalogOutOfStock('In Stock'), false);
  assert.equal(isCatalogOutOfStock(''), false);
});

test('a favorite toggles without duplicating a different spelling', () => {
  assert.deepEqual(toggleFavorite([], 'BPC-157'), ['BPC-157']);
  assert.deepEqual(toggleFavorite(['BPC-157'], 'bpc-157'), []);
});

test('notifications follow the order and stay empty when there are none', () => {
  assert.deepEqual(orderNotifications([]), []);
  const rows = orderNotifications([
    { id: '1', order_number: 'A-1', status: 'Order Complete' },
  ], 'en');
  assert.deepEqual(rows.map((row) => row.id), ['1-placed', '1-shipped', '1-delivered']);
});

test('purchased names skip the free vial', () => {
  const names = purchasedProductNames([
    { items: [{ product: 'BPC-157 10mg', qty: 1, price: 40 }] },
  ]);
  assert.deepEqual(names, ['BPC-157 10mg']);
});
