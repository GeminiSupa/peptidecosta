import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ASSIGNABLE_ADMIN_MODULE_IDS,
  resolveAdminTabAccess,
} from '../src/lib/adminModules.js';
import { adminPermissionsForPath, profileHasAnyAdminPermission } from '../src/lib/adminApiPermissions.mjs';

// The Facebook inbox and team chat used to be always-available: every active
// staff profile reached both whatever their permissions column said. That broke
// the moment a login was handed to someone outside the company — an affiliate
// given an account to watch their own commission could read customer
// conversations and internal staff talk.

const OWNER = { user_id: 'owner', name: 'Omer', tier: 'staff', status: 'active', is_superadmin: true, permissions: [] };
const STAFF = { user_id: 'kattia', name: 'Kattia', tier: 'staff', status: 'active', permissions: ['orders', 'messenger', 'team_chat'] };
// An outside affiliate given a login purely to watch their own commission.
const AFFILIATE = { user_id: 'tatiana', name: 'Tatiana', tier: 'staff', status: 'active', permissions: ['orders'] };
const SUB_USER = { user_id: 'luis', name: 'Luis', tier: 'sub_user', status: 'active', parent_agent_id: 'kattia', permissions: [] };

for (const tab of ['messenger', 'team_chat']) {
  test(`${tab} is refused to a staff login without the permission`, () => {
    assert.equal(resolveAdminTabAccess(tab, AFFILIATE), false);
  });

  test(`${tab} still opens for staff who are granted it`, () => {
    assert.equal(resolveAdminTabAccess(tab, STAFF), true);
  });

  test(`${tab} still opens for the owner with no permissions listed`, () => {
    assert.equal(resolveAdminTabAccess(tab, OWNER), true);
  });

  test(`${tab} stays shut for a sub-user even if the key is granted by mistake`, () => {
    assert.equal(resolveAdminTabAccess(tab, SUB_USER), false);
    assert.equal(resolveAdminTabAccess(tab, { ...SUB_USER, permissions: [tab] }), false);
  });

  test(`${tab} is refused to a suspended profile that holds the permission`, () => {
    assert.equal(resolveAdminTabAccess(tab, { ...STAFF, status: 'suspended' }), false);
    assert.equal(resolveAdminTabAccess(tab, { ...STAFF, status: 'pending' }), false);
  });

  test(`${tab} now appears as a tickbox in Team Management`, () => {
    // Always-available modules are filtered out of the assignable list, so
    // before this there was no box to untick even for the owner.
    assert.equal(ASSIGNABLE_ADMIN_MODULE_IDS.has(tab), true);
  });
}

test('the messenger API rule refuses a staff login without the permission', () => {
  // adminApiPermissions has mapped these routes to 'messenger' all along. The
  // rule never refused anyone, because resolveAdminTabAccess short-circuited to
  // true for every staff member before it read the permissions array.
  for (const path of ['/api/messenger/inbox', '/api/facebook/reply']) {
    const required = adminPermissionsForPath(path);
    assert.deepEqual(required, ['messenger']);
    assert.equal(profileHasAnyAdminPermission(AFFILIATE, required), false);
    assert.equal(profileHasAnyAdminPermission(STAFF, required), true);
    assert.equal(profileHasAnyAdminPermission(OWNER, required), true);
  }
});

test('the tabs every staff member keeps without a tickbox are unchanged', () => {
  // home, my_qr and my_team stay always-available on purpose: a new staff member
  // must reach their own dashboard, their own referral link and their own
  // recruiting screen before anyone has ticked anything for them.
  const fresh = { user_id: 'new', name: 'Nueva', tier: 'staff', status: 'active', permissions: [] };
  for (const tab of ['home', 'my_qr', 'my_team']) {
    assert.equal(resolveAdminTabAccess(tab, fresh), true, `${tab} must stay open`);
  }
});
