import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  AFFILIATE_ACCESS_READ,
  AFFILIATE_ACCESS_READ_WRITE,
  AFFILIATE_TAB_IDS,
  affiliateAccessMode,
  affiliateCanWrite,
  affiliateIdForProfile,
  affiliateSafeOrder,
} from '../src/lib/affiliateAccess.mjs';
import {
  ASSIGNABLE_ADMIN_MODULE_IDS,
  getDefaultAdminTab,
  resolveAdminTabAccess,
} from '../src/lib/adminModules.js';
import { isAffiliateTier, isInternalStaff, isSubUser, profileTier } from '../src/lib/subUserTier.mjs';

/**
 * An affiliate login belongs to somebody outside the business. These are the
 * break-in attempts, written down: the tabs they must not reach, the rows they
 * must not read, and the customer details they must not be sent.
 */

const affiliate = { user_id: 'aff-1', tier: 'affiliate', status: 'active' };
const affiliateRW = { ...affiliate, affiliate_access: 'read_write' };
const staff = { user_id: 'staff-1', tier: 'staff', status: 'active', permissions: ['orders', 'customers'] };
const superadmin = { user_id: 'super-1', is_superadmin: true, status: 'active' };
const subUser = { user_id: 'sub-1', tier: 'sub_user', status: 'active', parent_agent_id: 'staff-1' };

test('an affiliate reaches their four screens and nothing else', () => {
  for (const tabId of AFFILIATE_TAB_IDS) {
    assert.equal(resolveAdminTabAccess(tabId, affiliate), true, `${tabId} should be reachable`);
  }
  // alwaysAvailable tabs are the dangerous ones: they are true for everybody
  // unless the tier is checked first.
  const forbidden = [
    'home', 'orders', 'customers', 'leads', 'spreadsheet', 'team', 'team_chat',
    'messenger', 'my_qr', 'my_team', 'my_earnings', 'marketing', 'deals',
    'affiliates', 'recycle_bin', 'analytics', 'chatwoot', 'whatsapp_ai',
  ];
  for (const tabId of forbidden) {
    assert.equal(resolveAdminTabAccess(tabId, affiliate), false, `${tabId} must be refused to an affiliate`);
  }
});

test('a suspended or pending affiliate reaches nothing at all', () => {
  for (const status of ['pending', 'suspended']) {
    for (const tabId of AFFILIATE_TAB_IDS) {
      assert.equal(resolveAdminTabAccess(tabId, { ...affiliate, status }), false);
    }
  }
});

test('the affiliate screens are invisible to the team, superadmins included', () => {
  for (const tabId of AFFILIATE_TAB_IDS) {
    assert.equal(resolveAdminTabAccess(tabId, staff), false, `${tabId} leaked to staff`);
    assert.equal(resolveAdminTabAccess(tabId, superadmin), false, `${tabId} leaked to a superadmin`);
    assert.equal(resolveAdminTabAccess(tabId, subUser), false, `${tabId} leaked to a sub-user`);
  }
});

test('affiliate screens cannot be handed out as permissions', () => {
  for (const tabId of AFFILIATE_TAB_IDS) {
    assert.equal(ASSIGNABLE_ADMIN_MODULE_IDS.has(tabId), false, `${tabId} must not be assignable`);
  }
  // And a permissions list naming other tabs changes nothing for an affiliate.
  const sneaky = { ...affiliate, permissions: ['orders', 'customers', 'team'] };
  assert.equal(resolveAdminTabAccess('orders', sneaky), false);
  assert.equal(resolveAdminTabAccess('team', sneaky), false);
});

test('an affiliate lands on a tab they can actually open', () => {
  assert.equal(getDefaultAdminTab(affiliate), 'my_links');
  assert.equal(resolveAdminTabAccess(getDefaultAdminTab(affiliate), affiliate), true);
});

test('the tier is recognised, and an affiliate is not counted as team', () => {
  assert.equal(profileTier(affiliate), 'affiliate');
  assert.equal(isAffiliateTier(affiliate), true);
  assert.equal(isSubUser(affiliate), false);
  assert.equal(isInternalStaff(affiliate), false);
  assert.equal(isInternalStaff(staff), true);
  assert.equal(isInternalStaff(subUser), true);
  // A row written before the migration has no tier and must still be staff.
  assert.equal(profileTier({ user_id: 'x' }), 'staff');
  assert.equal(isAffiliateTier({ user_id: 'x' }), false);
});

test('access is read-only unless it explicitly says otherwise', () => {
  assert.equal(affiliateAccessMode(affiliate), AFFILIATE_ACCESS_READ);
  assert.equal(affiliateAccessMode({ affiliate_access: 'READ_WRITE' }), AFFILIATE_ACCESS_READ_WRITE);
  assert.equal(affiliateCanWrite(affiliateRW), true);
  assert.equal(affiliateCanWrite(affiliate), false);
  // Junk, a typo or a half-applied migration can only take away, never grant.
  for (const value of ['', null, undefined, 'admin', 'write', 'delete', 'true']) {
    assert.equal(affiliateCanWrite({ affiliate_access: value }), false, `"${value}" must not grant write`);
  }
});

test('an affiliate is resolved from their login, never from a request', () => {
  const rows = [
    { id: 'A', admin_profile_user_id: 'aff-1' },
    { id: 'B', admin_profile_user_id: 'aff-2' },
  ];
  assert.equal(affiliateIdForProfile(affiliate, rows), 'A');
  assert.equal(affiliateIdForProfile({ user_id: 'aff-2' }, rows), 'B');
  // No link means no rows, not every row.
  assert.equal(affiliateIdForProfile({ user_id: 'nobody' }, rows), null);
  assert.equal(affiliateIdForProfile({}, rows), null);
  assert.equal(affiliateIdForProfile(affiliate, []), null);
  // A row whose link is null must never match a profile with no user_id.
  assert.equal(affiliateIdForProfile({ user_id: undefined }, [{ id: 'C', admin_profile_user_id: null }]), null);
});

test('an order sent to an affiliate carries no way to contact the customer', () => {
  const safe = affiliateSafeOrder({
    id: 'o1',
    order_number: 'PCR-1042',
    customer_name: 'Maria Rodriguez',
    customer_phone: '+50688887777',
    customer_email: 'maria@example.com',
    customer_address: '200m sur de la iglesia, Atenas',
    province: 'Alajuela',
    items: [{ name: 'BPC-157', qty: 2 }],
    total_usd: 180,
    notes: 'internal note',
    sales_agent: 'Kattia',
  });
  assert.deepEqual(Object.keys(safe).sort(), [
    'affiliate_commission_crc', 'affiliate_commission_usd', 'created_at', 'currency',
    'customer_name', 'id', 'items', 'order_number', 'status', 'total_crc', 'total_usd',
  ]);
  assert.equal(safe.customer_name, 'Maria Rodriguez');
  for (const leaked of ['customer_phone', 'customer_email', 'customer_address', 'province', 'notes', 'sales_agent']) {
    assert.equal(leaked in safe, false, `${leaked} must not reach an affiliate`);
  }
});

// ---------------------------------------------------------------------------
// Static guards: the rules above are only true while the routes keep to them.
// ---------------------------------------------------------------------------

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

test('only the affiliate routes let an affiliate in', () => {
  const offenders = [];
  for (const file of walk('src')) {
    if (!fs.readFileSync(file, 'utf8').includes('allowAffiliate')) continue;
    const normalised = file.split(path.sep).join('/');
    const allowed = normalised.endsWith('src/lib/adminAuth.js')
      || normalised.endsWith('src/lib/affiliateSession.js')
      // Names the flag in its own doc comment, and calls nothing.
      || normalised.endsWith('src/lib/affiliateAccess.mjs');
    if (!allowed) offenders.push(normalised);
  }
  assert.deepEqual(offenders, [],
    `these open a route to affiliates outside the dashboard:\n${offenders.join('\n')}`);
});

test('every affiliate route goes through the session helper', () => {
  const routes = walk('src/app/api/affiliate');
  assert.ok(routes.length >= 4, 'expected the four affiliate routes');
  for (const file of routes) {
    const source = fs.readFileSync(file, 'utf8');
    assert.ok(
      source.includes('requireAffiliateSession'),
      `${file} must resolve the affiliate from the session`
    );
    // The whole guarantee is that no affiliate id ever arrives from outside.
    assert.equal(
      /searchParams\.get\(\s*['"]affiliate/i.test(source) || /body\.affiliate_?[Ii]d/.test(source),
      false,
      `${file} takes an affiliate id from the request - it must come from the session`
    );
  }
});

test('an affiliate route never selects a customer contact column', () => {
  for (const file of walk('src/app/api/affiliate')) {
    const source = fs.readFileSync(file, 'utf8');
    for (const column of ['customer_phone', 'customer_email', 'customer_address', 'whatsapp_number']) {
      assert.equal(source.includes(column), false, `${file} selects ${column}`);
    }
  }
});

/**
 * The desktop sidebar is built from two hand-written lists inside
 * src/app/admin/page.js, not from ADMIN_NAV_GROUPS — that only feeds the
 * mobile "More" sheet. So a tab can be permitted, rendered and reachable by
 * URL, and still be invisible to every superadmin on a desktop. Requests
 * shipped that way.
 */
test('Requests is in the desktop sidebar, not only in the mobile sheet', () => {
  const page = fs.readFileSync(path.join(process.cwd(), 'src/app/admin/page.js'), 'utf8');
  const list = page.match(/const desktopPrimaryTabIds = \(([\s\S]*?)\)\.filter/);
  assert.ok(list, 'desktopPrimaryTabIds should still exist');
  assert.match(list[1], /'requests'/, 'Requests must be in the desktop sidebar list');
});
