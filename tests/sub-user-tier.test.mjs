import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SUB_USER_CAP,
  assertCanInvite,
  canBecomeSubUser,
  canInviteSubUsers,
  childrenOf,
  isActiveProfile,
  isSubUser,
  profileTier,
  subUserSpotsUsed,
  validateSubUserParent,
} from '../src/lib/subUserTier.mjs';
import { getDefaultAdminTab, resolveAdminTabAccess } from '../src/lib/adminModules.js';

const MARIA = {
  user_id: 'maria-uuid',
  name: 'María Jiménez',
  tier: 'staff',
  status: 'active',
  parent_agent_id: null,
  permissions: ['orders', 'leads', 'my_team'],
};

const LUIS = {
  user_id: 'luis-uuid',
  name: 'Luis Vargas',
  tier: 'sub_user',
  status: 'active',
  parent_agent_id: 'maria-uuid',
  permissions: [],
};

// ---------------------------------------------------------------------------
// Two levels only — the rule the owner asked for
// ---------------------------------------------------------------------------

test('a sub-user cannot invite sub-users of their own', () => {
  assert.equal(canInviteSubUsers(MARIA), true);
  assert.equal(canInviteSubUsers(LUIS), false);

  const refusal = assertCanInvite(LUIS, [MARIA, LUIS]);
  assert.equal(refusal.ok, false);
  // The reason is shown to the person, so it has to read like a sentence.
  assert.match(refusal.reason, /two levels/i);
});

test('a sub-user cannot be attached to another sub-user', () => {
  assert.equal(validateSubUserParent(MARIA).ok, true);

  const refusal = validateSubUserParent(LUIS);
  assert.equal(refusal.ok, false);
  assert.match(refusal.reason, /cannot have sub-users/i);
});

test('a staff member who already has sub-users cannot be demoted into one', () => {
  // The edit path, not the insert path. Without this you reach three levels by
  // changing an existing row rather than adding a new one.
  const refusal = canBecomeSubUser(MARIA, { existingChildren: [LUIS] });
  assert.equal(refusal.ok, false);
  assert.match(refusal.reason, /already has sub-users/i);

  const childless = { ...MARIA, user_id: 'jose-uuid', name: 'José' };
  assert.equal(canBecomeSubUser(childless, { existingChildren: [] }).ok, true);
});

test('a superadmin is never demoted into a sub-user', () => {
  const owner = { ...MARIA, is_superadmin: true };
  assert.equal(canBecomeSubUser(owner, { existingChildren: [] }).ok, false);
});

// ---------------------------------------------------------------------------
// The tab allow-list — the UI half of the cap
// ---------------------------------------------------------------------------

test('a sub-user sees only their earnings and their referral link', () => {
  assert.equal(resolveAdminTabAccess('my_earnings', LUIS), true);
  assert.equal(resolveAdminTabAccess('my_qr', LUIS), true);

  // Everything else, including the tabs granted to every staff member.
  for (const tab of ['orders', 'customers', 'leads', 'analytics', 'team', 'spreadsheet']) {
    assert.equal(resolveAdminTabAccess(tab, LUIS), false, `${tab} must stay closed`);
  }
});

test('the four alwaysAvailable tabs do not leak to a sub-user', () => {
  // home, messenger (Facebook Inbox), my_qr and team_chat short-circuit to true
  // for staff. Only my_qr is meant for a sub-user; the rest would drop them into
  // the Facebook inbox and the internal team chat on first login.
  assert.equal(resolveAdminTabAccess('home', LUIS), false);
  assert.equal(resolveAdminTabAccess('messenger', LUIS), false);
  assert.equal(resolveAdminTabAccess('team_chat', LUIS), false);
  assert.equal(resolveAdminTabAccess('my_qr', LUIS), true);
});

test('there is no invite button for a sub-user to find', () => {
  assert.equal(resolveAdminTabAccess('my_team', MARIA), true);
  assert.equal(resolveAdminTabAccess('my_team', LUIS), false);
});

test('a permission granted by mistake still cannot open a tab for a sub-user', () => {
  // The allow-list is not advisory. Even if my_team lands in their permissions
  // array — a bad edit, a copied profile — the tier check refuses first.
  const overreaching = { ...LUIS, permissions: ['my_team', 'orders', 'customers'] };
  assert.equal(resolveAdminTabAccess('my_team', overreaching), false);
  assert.equal(resolveAdminTabAccess('orders', overreaching), false);
});

test('the sub-user screen is not offered to staff', () => {
  assert.equal(resolveAdminTabAccess('my_earnings', MARIA), false);
});

test('each tier lands on the right first screen', () => {
  assert.equal(getDefaultAdminTab(LUIS), 'my_earnings');
  assert.equal(getDefaultAdminTab({ ...MARIA, is_superadmin: true }), 'home');
});

// ---------------------------------------------------------------------------
// Approval actually gates access
// ---------------------------------------------------------------------------

test('a pending sub-user reaches nothing until approved', () => {
  const pending = { ...LUIS, status: 'pending' };
  assert.equal(isActiveProfile(pending), false);
  assert.equal(resolveAdminTabAccess('my_earnings', pending), false);
  assert.equal(resolveAdminTabAccess('my_qr', pending), false);
});

test('suspending someone closes the dashboard, staff included', () => {
  assert.equal(resolveAdminTabAccess('orders', { ...MARIA, status: 'suspended' }), false);
  assert.equal(resolveAdminTabAccess('my_earnings', { ...LUIS, status: 'suspended' }), false);
});

test('a suspended staff member cannot invite anyone', () => {
  assert.equal(canInviteSubUsers({ ...MARIA, status: 'suspended' }), false);
});

// ---------------------------------------------------------------------------
// Safe to deploy before the migration is pasted into Supabase
// ---------------------------------------------------------------------------

test('a profile with no tier or status column behaves exactly as before', () => {
  // Migrations here are applied by hand, so this code ships first and runs
  // against rows that have neither column. Every one of them must read as an
  // ordinary active staff member.
  const legacy = { user_id: 'old-uuid', name: 'José Solano', permissions: ['orders', 'leads'] };

  assert.equal(profileTier(legacy), 'staff');
  assert.equal(isSubUser(legacy), false);
  assert.equal(isActiveProfile(legacy), true);
  assert.equal(resolveAdminTabAccess('orders', legacy), true);
  assert.equal(resolveAdminTabAccess('home', legacy), true);
  assert.equal(resolveAdminTabAccess('team', legacy), false);
  assert.equal(canInviteSubUsers(legacy), true);
});

test('an unrecognised status is treated as active, never as a lockout', () => {
  assert.equal(isActiveProfile({ ...MARIA, status: 'ACTIVE' }), true);
  assert.equal(isActiveProfile({ ...MARIA, status: '' }), true);
  assert.equal(isActiveProfile({ ...MARIA, status: null }), true);
});

// ---------------------------------------------------------------------------
// The cap
// ---------------------------------------------------------------------------

test('only active sub-users use up a spot', () => {
  const team = [
    MARIA,
    LUIS,
    { ...LUIS, user_id: 'sofia-uuid', name: 'Sofía Mena' },
    { ...LUIS, user_id: 'diego-uuid', name: 'Diego Ruiz', status: 'pending' },
    { ...LUIS, user_id: 'karla-uuid', name: 'Karla Soto', status: 'suspended' },
  ];

  assert.equal(childrenOf(MARIA, team).length, 4);
  assert.equal(subUserSpotsUsed(MARIA, team), 2);
  assert.equal(assertCanInvite(MARIA, team).ok, true);
});

test('a full roster is refused with the number in the message', () => {
  const full = [MARIA];
  for (let i = 0; i < DEFAULT_SUB_USER_CAP; i += 1) {
    full.push({ ...LUIS, user_id: `sub-${i}`, name: `Sub ${i}` });
  }

  const refusal = assertCanInvite(MARIA, full);
  assert.equal(refusal.ok, false);
  assert.match(refusal.reason, new RegExp(String(DEFAULT_SUB_USER_CAP)));
});

test("one staff member's people are not counted against another's cap", () => {
  const jose = { ...MARIA, user_id: 'jose-uuid', name: 'José Solano' };
  const team = [MARIA, jose, LUIS];

  assert.equal(subUserSpotsUsed(MARIA, team), 1);
  assert.equal(subUserSpotsUsed(jose, team), 0);
});
