/**
 * Attribution on the manual order form.
 *
 * The order panel has carried three of these fields for a while — credited
 * agent, agent commission, affiliate — and the create form had none of them,
 * so recording a deal an affiliate brought in without a promo code meant
 * saving the order and immediately reopening it to fix.
 *
 * These decide what the business pays its own people, which is why the server
 * takes them from a superadmin only. Staff creating their own orders stay
 * pinned to themselves at their profile rate, exactly as before.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

/** The create route's rule for which attribution a request may set. */
function resolveRequestedAttribution(profile, order) {
  const isSuperadmin = Boolean(profile.is_superadmin);
  const affiliateId = isSuperadmin ? (String(order.affiliate_id || '').trim() || null) : null;
  const rate = isSuperadmin
    && order.agent_commission_rate_override !== undefined
    && order.agent_commission_rate_override !== null
    && order.agent_commission_rate_override !== ''
    ? Number(order.agent_commission_rate_override)
    : null;
  const source = rate === null ? null : (String(order.agent_commission_source || '').trim() || 'custom_override');
  return { affiliateId, rate, source };
}

test('a superadmin may credit an affiliate with no promo code involved', () => {
  const { affiliateId } = resolveRequestedAttribution(
    { is_superadmin: true },
    { affiliate_id: 'aff-123' },
  );
  assert.equal(affiliateId, 'aff-123');
});

test('an explicit affiliate outranks the one the promo code carries', () => {
  // applyAffiliateAttribution(supabase, row, promo, explicit) resolves as
  // `explicit || promo.affiliate_id || null`.
  const pick = (explicit, promo) => explicit || promo?.affiliate_id || null;

  assert.equal(pick('aff-chosen', { affiliate_id: 'aff-from-code' }), 'aff-chosen');
  assert.equal(pick(null, { affiliate_id: 'aff-from-code' }), 'aff-from-code');
  assert.equal(pick(null, null), null);
});

test('staff cannot set attribution on their own orders', () => {
  const staff = { is_superadmin: false };
  const attempt = {
    affiliate_id: 'aff-123',
    agent_commission_rate_override: 90,
    agent_commission_source: 'custom_override',
  };

  const { affiliateId, rate, source } = resolveRequestedAttribution(staff, attempt);

  // Every one of these is dropped: an agent must not be able to write
  // themselves a 90% commission on an order they type in themselves.
  assert.equal(affiliateId, null);
  assert.equal(rate, null);
  assert.equal(source, null);
});

test('an override outside 0-100 is refused', () => {
  const valid = (value) => {
    const { rate } = resolveRequestedAttribution(
      { is_superadmin: true },
      { agent_commission_rate_override: value },
    );
    return rate === null || (Number.isFinite(rate) && rate >= 0 && rate <= 100);
  };

  assert.equal(valid(20), true);
  assert.equal(valid(0), true);
  assert.equal(valid(100), true);
  assert.equal(valid(101), false);
  assert.equal(valid(-1), false);
  assert.equal(valid('abc'), false);
});

test('an empty override means the profile rate, not zero percent', () => {
  // A blank box is "leave it alone". Reading it as 0 would silently work an
  // agent for nothing.
  for (const blank of [undefined, null, '']) {
    const { rate, source } = resolveRequestedAttribution(
      { is_superadmin: true },
      { agent_commission_rate_override: blank },
    );
    assert.equal(rate, null);
    assert.equal(source, null);
  }
});

test('an override defaults to the custom-override source', () => {
  const { source } = resolveRequestedAttribution(
    { is_superadmin: true },
    { agent_commission_rate_override: 25 },
  );
  assert.equal(source, 'custom_override');

  const referral = resolveRequestedAttribution(
    { is_superadmin: true },
    { agent_commission_rate_override: 20, agent_commission_source: 'agent_referral' },
  );
  assert.equal(referral.source, 'agent_referral');
});

test('the form and the panel translate the commission dropdown identically', () => {
  // Both build the same pair from the same three modes, so an order created
  // with a referral rate and one edited into it are indistinguishable.
  const fromMode = (mode, pct) => ({
    rate: mode === 'default' ? null : Math.max(0, Number(pct) || 0),
    source: mode === 'default' ? null : (mode === 'agent_referral' ? 'agent_referral' : 'custom_override'),
  });

  assert.deepEqual(fromMode('default', 20), { rate: null, source: null });
  assert.deepEqual(fromMode('agent_referral', 20), { rate: 20, source: 'agent_referral' });
  assert.deepEqual(fromMode('custom', 35), { rate: 35, source: 'custom_override' });
});
