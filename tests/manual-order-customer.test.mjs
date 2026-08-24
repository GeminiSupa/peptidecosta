import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  buildManualOrderCustomerOptions,
  resolveManualOrderCustomerPrefill,
} from '../src/lib/manualOrderCustomer.mjs';

test('customer search options are alphabetical and keep the newest order details', () => {
  const options = buildManualOrderCustomerOptions([
    { customer_name: 'Zoe', customer_email: 'zoe@example.com', shipping_address: 'Old', created_at: '2026-01-01' },
    { customer_name: 'Ana', customer_email: 'ana@example.com', created_at: '2026-03-01' },
    { customer_name: 'Zoe', customer_email: 'ZOE@example.com', shipping_address: 'New', created_at: '2026-04-01' },
  ]);
  assert.deepEqual(options.map((customer) => customer.name), ['Ana', 'Zoe']);
  assert.equal(options[1].shippingAddress, 'New');
});

test('customer handoff fills missing ID and shipping fields from their newest order', () => {
  const prefill = resolveManualOrderCustomerPrefill(
    { name: 'Ana Updated', email: 'ana@example.com' },
    [{
      customer_name: 'Ana', customer_email: 'ANA@example.com', customer_phone: '+506 8888 1111',
      customer_id_number: '123', customer_id_type: '1', shipping_address: 'San José', created_at: '2026-04-01',
    }]
  );
  assert.equal(prefill.name, 'Ana Updated');
  assert.equal(prefill.phone, '+506 8888 1111');
  assert.equal(prefill.customerIdNumber, '123');
  assert.equal(prefill.shippingAddress, 'San José');
});

test('manual customer search uses a themed combobox instead of an Apple-native datalist', async () => {
  const modal = await readFile(new URL('../src/components/admin/ManualOrderModal.js', import.meta.url), 'utf8');
  const combobox = await readFile(new URL('../src/components/admin/ManualCustomerCombobox.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/app/admin.css', import.meta.url), 'utf8');

  assert.match(modal, /<ManualCustomerCombobox/);
  assert.doesNotMatch(modal, /<datalist|list="manual-order-customer-options"/);
  assert.match(combobox, /role="combobox"/);
  assert.match(combobox, /role="listbox"/);
  assert.match(css, /\.manual-customer-combobox-list[\s\S]*?background:\s*#0e1626[\s\S]*?color:\s*#e2e8f0/);
});
