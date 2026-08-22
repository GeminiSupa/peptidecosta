import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { broadcastFailureRecovery } from '../src/lib/broadcastFailureRecovery.mjs';
import { liveDealProductConflicts, preserveLiveDealFields } from '../src/lib/dealProductProtection.mjs';

const currentDealProduct = {
  product: 'BPC-157 10mg',
  price_usd: '$85',
  price_crc: '₡38,630',
  original_price_usd: '$100',
  original_price_crc: '₡45,448',
  discount: '15% Deal of the Week',
  sale_start_time: '2026-08-22T12:00:47.321Z',
  sale_end_time: '2026-08-24T05:59:59.999Z',
  inventory_count: 12,
};

test('Products accepts a fresh deal row and ignores unrelated inventory edits', () => {
  const submitted = {
    ...currentDealProduct,
    sale_start_time: '2026-08-22T06:00:00-06:00',
    sale_end_time: '2026-08-23T23:59:00-06:00',
    inventory_count: 11,
  };
  assert.deepEqual(liveDealProductConflicts({
    submittedRows: [submitted],
    currentRows: [currentDealProduct],
    productNames: [currentDealProduct.product],
  }), []);

  const [protectedRow] = preserveLiveDealFields(
    [{ ...submitted, price_crc: '₡99', original_price_crc: '₡100' }],
    [currentDealProduct],
    [currentDealProduct.product],
  );
  assert.equal(protectedRow.price_crc, currentDealProduct.price_crc);
  assert.equal(protectedRow.original_price_crc, currentDealProduct.original_price_crc);
  assert.equal(protectedRow.inventory_count, 11, 'unrelated edits remain writable');
});

test('Products rejects a stale price or a missing live-deal product', () => {
  assert.deepEqual(liveDealProductConflicts({
    submittedRows: [{ ...currentDealProduct, price_usd: '$100' }],
    currentRows: [currentDealProduct],
    productNames: [currentDealProduct.product],
  }), [currentDealProduct.product]);

  assert.deepEqual(liveDealProductConflicts({
    submittedRows: [],
    currentRows: [currentDealProduct],
    productNames: [currentDealProduct.product],
  }), [currentDealProduct.product]);
});

test('one failed broadcast cannot change settled or later broadcasts to failed', () => {
  assert.deepEqual(
    broadcastFailureRecovery(['a', 'b', 'c'], ['a'], 'b'),
    { failedIds: ['b'], requeueIds: ['c'] },
  );
  assert.deepEqual(
    broadcastFailureRecovery(['a', 'b', 'c'], ['a'], null),
    { failedIds: [], requeueIds: ['b', 'c'] },
  );
});

test('Weekly Deal refreshes Products and uses message-mode WhatsApp templates', () => {
  const adminPage = fs.readFileSync('src/app/admin/page.js', 'utf8');
  const dealPanel = fs.readFileSync('src/components/admin/DealOfWeekPanel.js', 'utf8');
  const broadcasts = fs.readFileSync('src/components/admin/BroadcastsPanel.js', 'utf8');

  assert.match(adminPage, /onProductsChanged=\{loadAdminData\}/);
  assert.match(dealPanel, /await onProductsChanged\?\.\(\)/);
  assert.match(broadcasts, /draft\.sourceDealId \? 'message'/);
  assert.match(broadcasts, /<option value="message">Message Composer text<\/option>/);
});
