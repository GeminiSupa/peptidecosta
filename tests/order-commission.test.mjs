import test from 'node:test';
import assert from 'node:assert/strict';
import {
  commissionRateLabel,
  computeOrderCommissionAmounts,
  decorateCommissionOrder,
  orderCommissionRate,
  summarizeOrderCommissions,
} from '../src/lib/orderCommission.mjs';
import {
  applySalesAgentReferral,
  commissionSourceLabel,
  isEligibleSalesAgentProfile,
  isSalesAgentAffiliate,
} from '../src/lib/salesAgentAffiliate.mjs';

const amounts = (order) => ({ usd: Number(order.total_usd || 0), crc: Number(order.total_crc || 0) });

test('an order without an override uses the agent profile commission rate', () => {
  const order = { total_usd: 500 };
  assert.equal(orderCommissionRate(order, 10), 10);

  const commission = computeOrderCommissionAmounts(order, 10, amounts);
  assert.equal(commission.usdCommission, 50);
  assert.equal(commission.crcCommission, 0);
});

test('a self-generated sale can pay 20% without changing the agent profile rate', () => {
  const order = {
    total_usd: 500,
    agent_commission_rate_override: 20,
    agent_commission_source: 'self_generated',
  };

  const commission = computeOrderCommissionAmounts(order, 10, amounts);
  assert.equal(commission.rate, 20);
  assert.equal(commission.source, 'self_generated');
  assert.equal(commission.usdCommission, 100);
});

test('a mixed week sums each order at its own rate', () => {
  const summary = summarizeOrderCommissions([
    { id: 'normal', total_usd: 1000 },
    { id: 'self', total_usd: 1000, agent_commission_rate_override: 20 },
  ], 10, amounts);

  assert.equal(summary.usdSales, 2000);
  assert.equal(summary.usdCommission, 300);
  assert.deepEqual(summary.rates, [10, 20]);
  assert.equal(commissionRateLabel(summary.rates, 10), 'Variable (10%, 20%)');
});

test('a sales-agent affiliate becomes one combined 20% payout', () => {
  const profile = {
    user_id: 'agent-1',
    name: 'Maria',
    email: 'maria@example.com',
    tier: 'staff',
    status: 'active',
    is_superadmin: false,
  };
  const attributed = applySalesAgentReferral({
    total_usd: 500,
    affiliate_commission_usd: 100,
  }, profile);

  assert.equal(attributed.sales_agent, 'Maria');
  assert.equal(attributed.agent_commission_rate_override, 20);
  assert.equal(attributed.agent_commission_source, 'agent_referral');
  assert.equal(attributed.affiliate_commission_usd, 0);
  assert.equal(computeOrderCommissionAmounts(attributed, 10).usdCommission, 100);
});

test('sub-users are excluded, while staff with superadmin access can still sell', () => {
  assert.equal(isEligibleSalesAgentProfile({ name: 'Sub', tier: 'sub_user', status: 'active' }), false);
  assert.equal(isEligibleSalesAgentProfile({ name: 'Owner', tier: 'staff', status: 'active', is_superadmin: true }), true);
  assert.equal(isEligibleSalesAgentProfile({ name: 'Agent', tier: 'staff', status: 'active' }), true);
});

test('linked affiliate detection supports the link column and kind marker', () => {
  assert.equal(isSalesAgentAffiliate({ admin_profile_user_id: 'agent-1' }), true);
  assert.equal(isSalesAgentAffiliate({ affiliate_kind: 'sales_agent' }), true);
  assert.equal(isSalesAgentAffiliate({ affiliate_kind: 'external' }), false);
});

test('decorated report orders identify the referral rate and earnings', () => {
  const row = decorateCommissionOrder({
    agent_commission_rate_override: 20,
    agent_commission_source: 'agent_referral',
    total_usd: 300,
  }, 10, undefined, commissionSourceLabel);

  assert.equal(row.commission_source_label, 'Agent referral');
  assert.equal(row.commission_rate_applied, 20);
  assert.equal(row.commission_earned_usd, 60);
});
