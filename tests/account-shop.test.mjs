import test from 'node:test';
import assert from 'node:assert/strict';

import { addressRowFromOrder } from '../src/lib/accountAddress.mjs';
import { findCatalogProduct } from '../src/lib/accountProductImages.mjs';

test('an order address becomes a saved account address', () => {
  const row = addressRowFromOrder({
    customer_name: 'Ana',
    customer_phone: '88880000',
    shipping_address: 'Casa azul\nCarmen, Central, San José',
  }, 'user-1');

  assert.equal(row.customer_user_id, 'user-1');
  assert.equal(row.recipient_name, 'Ana');
  assert.match(row.detailed_address, /Casa azul/);
  assert.equal(row.province, 'San José');
  assert.equal(row.is_default, true);
});

test('a product photo is matched by name, ignoring a gift tag', () => {
  const catalog = [
    { product: 'GLP-1 50mg', imageUrl: 'https://example.com/glp.png', category: 'Weight' },
  ];
  assert.equal(findCatalogProduct('GLP-1 50mg (Free Gift)', catalog).imageUrl, 'https://example.com/glp.png');
  assert.equal(findCatalogProduct('Something else', catalog), null);
});
