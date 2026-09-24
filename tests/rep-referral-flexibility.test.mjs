import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReferralLink } from '../src/lib/referralLink.mjs';
import { chooseRepReferralCode } from '../src/lib/repReferralCode.mjs';
import {
  applySalesAgentReferral,
  salesAgentReferralRate,
  SALES_AGENT_REFERRAL_RATE,
} from '../src/lib/salesAgentAffiliate.mjs';

const profile = { name: 'Edgar Sibaja Brenes', tier: 'staff', status: 'active', is_superadmin: false };

test('a rep is paid the rate on their own affiliate row, not a fixed 20', () => {
  assert.equal(salesAgentReferralRate({ commission_rate: 0.25 }), 25);
  assert.equal(salesAgentReferralRate({ commission_rate: 0.155 }), 15.5);

  const order = applySalesAgentReferral({ total_usd: 500 }, profile, {
    rate: salesAgentReferralRate({ commission_rate: 0.25 }),
  });
  assert.equal(order.agent_commission_rate_override, 25);
});

test('a rate nobody has set still pays exactly what it paid before', () => {
  // The whole point of the fallback: an unconfigured rep must not silently
  // change what they earn the day this ships.
  for (const affiliate of [null, {}, { commission_rate: 0 }, { commission_rate: null }, { commission_rate: 'abc' }]) {
    assert.equal(salesAgentReferralRate(affiliate), SALES_AGENT_REFERRAL_RATE);
  }
  // A fraction is not a percent. 20 in the column would mean 2000%.
  assert.equal(salesAgentReferralRate({ commission_rate: 20 }), SALES_AGENT_REFERRAL_RATE);
  assert.equal(salesAgentReferralRate({ commission_rate: -0.5 }), SALES_AGENT_REFERRAL_RATE);

  assert.equal(
    applySalesAgentReferral({ total_usd: 500 }, profile).agent_commission_rate_override,
    SALES_AGENT_REFERRAL_RATE
  );
});

test("a rep's link carries their code, so it discounts as well as credits", () => {
  const url = new URL(buildReferralLink('Edgar Sibaja Brenes', 'https://catalog.peptidescostarica.net/catalog?lang=es', { promoCode: 'EDGAR5' }));
  assert.equal(url.searchParams.get('promo_code'), 'EDGAR5');
  // Attribution must survive unchanged — this is what credits the sale.
  assert.equal(url.searchParams.get('sales_agent'), 'Edgar Sibaja Brenes');
});

test('no code means the link is exactly the old link', () => {
  const base = 'https://catalog.peptidescostarica.net/catalog?lang=es';
  const plain = buildReferralLink('Edgar Sibaja Brenes', base);
  assert.equal(plain, buildReferralLink('Edgar Sibaja Brenes', base, {}));
  assert.equal(plain, buildReferralLink('Edgar Sibaja Brenes', base, { promoCode: '   ' }));
  assert.ok(!plain.includes('promo_code'));
});

test('a one-person code is never put on a shared link', () => {
  // These are minted per visitor. On a printed QR everybody would share one.
  assert.equal(chooseRepReferralCode([
    { code: 'WELCOME-ABC', is_active: true, auto_issued: true, created_at: '2026-09-20' },
  ]), null);
});

test('one rep with several codes always gets the same link', () => {
  const promos = [
    { code: 'OLDER', is_active: true, created_at: '2026-01-01' },
    { code: 'NEWER', is_active: true, created_at: '2026-09-01' },
  ];
  assert.equal(chooseRepReferralCode(promos), 'NEWER');
  assert.equal(chooseRepReferralCode([...promos].reverse()), 'NEWER');
});

test('a dead code is left off the link rather than promising a discount', () => {
  const now = new Date('2026-09-24T00:00:00Z');
  assert.equal(chooseRepReferralCode([{ code: 'OFF', is_active: false, created_at: '2026-09-01' }], now), null);
  assert.equal(chooseRepReferralCode([{ code: 'EXPIRED', is_active: true, valid_until: '2026-09-01', created_at: '2026-08-01' }], now), null);
  assert.equal(chooseRepReferralCode([{ code: 'EARLY', is_active: true, valid_from: '2026-12-01', created_at: '2026-08-01' }], now), null);
  assert.equal(chooseRepReferralCode([{ code: 'USEDUP', is_active: true, usage_limit: 3, usage_count: 3, created_at: '2026-08-01' }], now), null);
  assert.equal(chooseRepReferralCode([{ code: 'HIDDEN', is_active: true, hidden: true, created_at: '2026-08-01' }], now), null);
});
