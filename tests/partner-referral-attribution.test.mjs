import test from 'node:test';
import assert from 'node:assert/strict';
import { partnerReferralAffiliate, affiliateCommissionPatch } from '../src/lib/affiliateCommission.mjs';

/**
 * A partner's link used to credit nobody.
 *
 * It carries their name in sales_agent, and the sales-rep path only resolves
 * names that belong to a staff profile. So an order from a partner with a
 * dashboard and no discount code saved with affiliate_id null: it paid them
 * nothing and never showed up in their own My Orders, while the dashboard told
 * them orders through the link are credited automatically.
 */

const partner = {
  id: 'aff-1',
  name: 'Ana Rojas',
  commission_rate: 0.2,
  admin_profile_user_id: 'user-1',
};
const partnerLogin = { user_id: 'user-1', tier: 'affiliate', status: 'active' };

test('a partner with a dashboard is matched by the name on their link', () => {
  const match = partnerReferralAffiliate([partner], [partnerLogin], 'ana rojas');
  assert.equal(match?.id, 'aff-1');
});

test('matching ignores case and stray spacing, because the name is typed by hand too', () => {
  assert.equal(partnerReferralAffiliate([partner], [partnerLogin], '  ANA ROJAS ')?.id, 'aff-1');
});

test('an affiliate with no login is left alone', () => {
  const noLogin = { ...partner, admin_profile_user_id: null };
  assert.equal(partnerReferralAffiliate([noLogin], [], 'ana rojas'), null);
});

test('a staff login on an affiliate row is left to the sales-agent path', () => {
  const staff = { user_id: 'user-1', tier: 'staff', status: 'active' };
  assert.equal(partnerReferralAffiliate([partner], [staff], 'ana rojas'), null);
});

test('a sub-user login never earns here', () => {
  const sub = { user_id: 'user-1', tier: 'sub_user', status: 'active' };
  assert.equal(partnerReferralAffiliate([partner], [sub], 'ana rojas'), null);
});

test('a suspended partner earns nothing', () => {
  const suspended = { ...partnerLogin, status: 'suspended' };
  assert.equal(partnerReferralAffiliate([partner], [suspended], 'ana rojas'), null);
});

test('an empty name matches nobody', () => {
  assert.equal(partnerReferralAffiliate([partner], [partnerLogin], ''), null);
  assert.equal(partnerReferralAffiliate([partner], [partnerLogin], '   '), null);
});

test('a name nobody holds matches nobody', () => {
  assert.equal(partnerReferralAffiliate([partner], [partnerLogin], 'someone else'), null);
});

test('the commission comes from the affiliate row, never from the order', () => {
  const order = {
    affiliate_id: 'aff-1',
    total_usd: 120,
    shipping_cost_usd: 20,
    total_crc: 60000,
    shipping_cost_crc: 10000,
    affiliate_commission_usd: 999,
  };
  const patch = affiliateCommissionPatch(order, partner);
  assert.equal(patch.affiliate_commission_usd, 20); // 20% of 100, shipping excluded
  assert.equal(patch.affiliate_commission_crc, 10000);
});
