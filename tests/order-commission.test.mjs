import test from 'node:test';
import assert from 'node:assert/strict';
import {
  commissionRateLabel,
  computeOrderCommissionAmounts,
  orderCommissionRate,
  summarizeOrderCommissions,
} from '../src/lib/orderCommission.mjs';

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
