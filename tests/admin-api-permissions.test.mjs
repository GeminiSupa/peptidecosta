import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  adminPermissionsForPath,
  profileHasAnyAdminPermission,
} from '../src/lib/adminApiPermissions.mjs';

const staff = (permissions = []) => ({
  is_superadmin: false,
  permissions,
  status: 'active',
  tier: 'staff',
});

test('admin API path rules map sensitive routes to dashboard modules', () => {
  assert.deepEqual(adminPermissionsForPath('/api/admin/analytics-dashboard'), ['analytics']);
  assert.deepEqual(adminPermissionsForPath('/api/admin/orders/update'), ['orders']);
  assert.deepEqual(adminPermissionsForPath('/api/admin/abandoned-carts/update'), ['carts']);
  assert.deepEqual(adminPermissionsForPath('/api/admin/products'), ['spreadsheet']);
  assert.deepEqual(adminPermissionsForPath('/api/admin/promo/create'), ['affiliates', 'broadcasts', 'deals']);
  assert.deepEqual(adminPermissionsForPath('/api/admin/live-chat'), ['live_chat']);
  assert.deepEqual(adminPermissionsForPath('/api/admin/leads'), ['leads']);
  assert.deepEqual(adminPermissionsForPath('/api/admin/whatsapp-channels'), ['whatsapp_ai']);
  assert.deepEqual(adminPermissionsForPath('/api/admin/prospects/search'), ['prospects']);
  assert.deepEqual(adminPermissionsForPath('/api/admin/prospects/enrich'), ['prospects']);
  assert.deepEqual(adminPermissionsForPath('/api/admin/prospects/enrichment-jobs'), ['prospects']);
  assert.deepEqual(adminPermissionsForPath('/api/admin/whatsapp-conversations'), ['whatsapp_ai', 'wa_session']);
  assert.deepEqual(adminPermissionsForPath('/api/messenger/inbox'), ['messenger']);
  assert.deepEqual(adminPermissionsForPath('/api/admin/campaigns/stats'), ['marketing']);
  // Saved templates carry campaign designs, so they sit behind the same module.
  assert.deepEqual(adminPermissionsForPath('/api/admin/campaign-templates'), ['marketing']);
  assert.deepEqual(adminPermissionsForPath('/api/admin/marketing-segments'), ['marketing']);
  // Changing how an order gets paid sits behind the same module as the order.
  assert.deepEqual(adminPermissionsForPath('/api/admin/orders/payment-method'), ['orders']);
  assert.deepEqual(adminPermissionsForPath('/api/admin/users/avatar'), []);
});

test('staff must have at least one mapped permission', () => {
  assert.equal(profileHasAnyAdminPermission(staff(['orders']), ['orders']), true);
  assert.equal(profileHasAnyAdminPermission(staff(['leads']), ['orders']), false);
  assert.equal(profileHasAnyAdminPermission(staff(['broadcasts']), ['affiliates', 'broadcasts']), true);
});

test('superadmin can pass superadmin-only mapped permissions', () => {
  assert.equal(
    profileHasAnyAdminPermission({ is_superadmin: true, status: 'active' }, ['team']),
    true
  );
});
