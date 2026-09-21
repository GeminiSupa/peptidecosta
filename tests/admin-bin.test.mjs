import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBinRecord,
  isKnownBinEntity,
  isMissingBinTable,
  restoreTarget,
  summarizeBinItem,
} from '../src/lib/adminBin.mjs';
import { buildDeleteMessage } from '../src/lib/confirmDelete.mjs';
import { adminPermissionsForPath } from '../src/lib/adminApiPermissions.mjs';
import { ASSIGNABLE_ADMIN_MODULE_IDS, resolveAdminTabAccess } from '../src/lib/adminModules.js';

test('the bin tab is a normal assignable dashboard module', () => {
  assert.equal(ASSIGNABLE_ADMIN_MODULE_IDS.has('bin'), true);
  assert.equal(
    resolveAdminTabAccess('bin', { status: 'active', tier: 'staff', permissions: ['orders'] }),
    false,
  );
  assert.equal(
    resolveAdminTabAccess('bin', { status: 'active', tier: 'staff', permissions: ['bin'] }),
    true,
  );
  assert.equal(
    resolveAdminTabAccess('bin', { status: 'active', tier: 'staff', is_superadmin: true, permissions: [] }),
    true,
  );
});

test('the bin API sits behind the bin permission', () => {
  assert.deepEqual(adminPermissionsForPath('/api/admin/bin'), ['bin']);
});

test('order, lead, cart and inquiry snapshots keep a restore id and a readable summary', () => {
  const order = buildBinRecord({
    entityType: 'order',
    row: { id: 'ord-1', order_number: 'WPCR-1', customer_name: 'Ana', status: 'Pending' },
    deletedBy: 'omer@example.com',
  });
  assert.equal(order.entity_type, 'order');
  assert.equal(order.entity_id, 'ord-1');
  assert.match(order.summary, /#WPCR-1/);
  assert.equal(order.payload.table, 'orders');
  assert.equal(restoreTarget(order)?.table, 'orders');

  const lead = buildBinRecord({
    entityType: 'lead',
    row: { id: 'lead-1', name: 'Luis', phone: '70195752', status: 'New' },
  });
  assert.match(lead.summary, /Luis/);
  assert.equal(lead.payload.table, 'catalog_leads');

  const cart = buildBinRecord({
    entityType: 'cart',
    row: { id: 'cart-1', session_id: 'sess-1', customer_name: 'Maria', customer_email: 'm@test.com' },
  });
  assert.equal(cart.entity_id, 'cart-1');
  assert.equal(cart.payload.table, 'abandoned_carts');

  const inquiry = buildBinRecord({
    entityType: 'inquiry',
    row: { id: 'inq-1', name: 'Jose', email: 'j@test.com', message: 'Need BPC-157 for a protocol' },
  });
  assert.match(inquiry.summary, /Jose/);
  assert.equal(inquiry.payload.table, 'customer_inquiries');
});

test('unknown types and rows without an id are refused before anything is stored', () => {
  assert.equal(isKnownBinEntity('product'), false);
  assert.throws(() => buildBinRecord({ entityType: 'product', row: { id: 'x' } }), /Unknown bin entity/);
  assert.throws(() => buildBinRecord({ entityType: 'order', row: { customer_name: 'Ana' } }), /no id/);
});

test('a missing-table Postgres error is recognised so deletes can still finish', () => {
  assert.equal(isMissingBinTable({ code: '42P01', message: 'relation "admin_bin" does not exist' }), true);
  assert.equal(isMissingBinTable({ message: 'Could not find the table public.admin_bin in the schema cache' }), true);
  assert.equal(isMissingBinTable({ message: 'permission denied' }), false);
});

test('recoverable deletes tell the admin the row is going to the bin', () => {
  const message = buildDeleteMessage('order', ['#WPCR-1', 'Ana'], { recoverable: true });
  assert.match(message, /Bin/);
  assert.doesNotMatch(message, /cannot be undone/);
});

test('lead summaries keep a contact line even when the name is missing', () => {
  assert.equal(summarizeBinItem('lead', { email: 'a@test.com', status: 'New' }), 'Lead · a@test.com · New');
});
