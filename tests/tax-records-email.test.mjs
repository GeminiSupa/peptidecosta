import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { TAX_RECORDS_CC_EMAIL, withTaxRecordsCc } from '../src/lib/taxRecordsEmail.mjs';

test('uses the established PBAG Costa Rica forwarding address', () => {
  assert.equal(TAX_RECORDS_CC_EMAIL, 'pbagcr@peptidescostarica.net');
  assert.equal(withTaxRecordsCc(), TAX_RECORDS_CC_EMAIL);
});

test('keeps the tax address on completed order receipts and weekly pay reports', () => {
  const orderRoute = fs.readFileSync('src/app/api/order-notification/route.js', 'utf8');
  const weeklyRoute = fs.readFileSync('src/app/api/admin/commissions/weekly-report/route.js', 'utf8');

  assert.match(orderRoute, /customerReceiptOnly/);
  assert.match(orderRoute, /cc: withTaxRecordsCc\(\)/);
  assert.equal((weeklyRoute.match(/cc: withTaxRecordsCc\(\)/g) || []).length, 2);
});

test('does not duplicate the tax inbox when it is already in CC', () => {
  assert.equal(
    withTaxRecordsCc(`finance@example.com, ${TAX_RECORDS_CC_EMAIL.toUpperCase()}`),
    `finance@example.com, ${TAX_RECORDS_CC_EMAIL.toUpperCase()}`
  );
});
