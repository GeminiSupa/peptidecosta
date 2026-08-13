import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  TAX_RECORDS_CC_EMAIL,
  taxRecordsCcForCompletedOrder,
  withTaxRecordsCc,
} from '../src/lib/taxRecordsEmail.mjs';

test('uses the established PBAG Costa Rica forwarding address', () => {
  assert.equal(TAX_RECORDS_CC_EMAIL, 'pbagcr@peptidescostarica.net');
  assert.equal(withTaxRecordsCc(), TAX_RECORDS_CC_EMAIL);
});

test('only adds the tax address to completed order receipts', () => {
  assert.equal(taxRecordsCcForCompletedOrder('Completed'), TAX_RECORDS_CC_EMAIL);
  assert.equal(taxRecordsCcForCompletedOrder('Order Complete'), TAX_RECORDS_CC_EMAIL);
  assert.equal(taxRecordsCcForCompletedOrder('Paid'), undefined);
  assert.equal(taxRecordsCcForCompletedOrder('Pending'), undefined);
  assert.equal(taxRecordsCcForCompletedOrder('Pending - Card'), undefined);
  assert.equal(taxRecordsCcForCompletedOrder('Shipped'), undefined);
});

test('keeps PBAGCR off shipping and unapproved weekly reports', () => {
  const orderRoute = fs.readFileSync('src/app/api/order-notification/route.js', 'utf8');
  const shippedRoute = fs.readFileSync('src/app/api/order-shipped-notification/route.js', 'utf8');
  const weeklyRoute = fs.readFileSync('src/app/api/admin/commissions/weekly-report/route.js', 'utf8');
  const approvalRoute = fs.readFileSync('src/app/api/admin/commissions/approve/route.js', 'utf8');

  assert.match(orderRoute, /customerReceiptOnly/);
  assert.match(orderRoute, /cc: taxRecordsCcForCompletedOrder\(order\.status\)/);
  assert.doesNotMatch(shippedRoute, /withTaxRecordsCc|taxRecordsCcForCompletedOrder/);
  assert.doesNotMatch(weeklyRoute, /withTaxRecordsCc|taxRecordsCcForCompletedOrder/);
  assert.match(approvalRoute, /cc: withTaxRecordsCc\(ADMIN_CC_EMAILS\)/);
});

test('does not duplicate the tax inbox when it is already in CC', () => {
  assert.equal(
    withTaxRecordsCc(`finance@example.com, ${TAX_RECORDS_CC_EMAIL.toUpperCase()}`),
    `finance@example.com, ${TAX_RECORDS_CC_EMAIL.toUpperCase()}`
  );
});
