/**
 * Approving a payout must price the week exactly the way the weekly scan
 * priced it. The approval route used to recompute commission as
 * `usdSales * profile_rate`, which silently repriced any order carrying its own
 * rate — an agent referral promised at a combined 20% was paid at 10% the moment
 * a superadmin clicked Approve. It also emailed the raw `orders` rows, which
 * carry no per-order commission fields, so every line of the statement table
 * rendered "0% · earned ₡0" underneath a non-zero total.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  commissionRateLabel,
  decorateCommissionOrder,
  summarizeOrderCommissions,
} from '../src/lib/orderCommission.mjs';
import { commissionSourceLabel } from '../src/lib/salesAgentAffiliate.mjs';

const RATE = 454.48;

/** Mirrors getOrderSalesAmounts: every order is expressed in BOTH currencies. */
const amounts = (order) => {
  let usd = Number(order.total_usd || 0);
  let crc = Number(order.total_crc || 0);
  if (usd > 0 && crc === 0) crc = usd * RATE;
  else if (crc > 0 && usd === 0) usd = crc / RATE;
  return { usd, crc };
};

const WEEK = [
  { id: 'plain', total_usd: 1000, currency: 'USD', created_at: '2026-08-04T12:00:00Z' },
  {
    id: 'referral',
    total_usd: 1000,
    currency: 'USD',
    created_at: '2026-08-05T12:00:00Z',
    agent_commission_rate_override: 20,
    agent_commission_source: 'agent_referral',
  },
];

test('approval prices each order at its own rate, not the flat profile rate', () => {
  const summary = summarizeOrderCommissions(WEEK, 10, amounts);

  assert.equal(summary.usdSales, 2000);
  // 10% of the standard sale + 20% of the referral.
  assert.equal(summary.usdCommission, 300);

  // What the old approval route computed instead — $100 short.
  const flatRate = summary.usdSales * 0.1;
  assert.equal(flatRate, 200);
  assert.notEqual(summary.usdCommission, flatRate);
});

test('a decorated statement row carries the rate and earnings the email prints', () => {
  const rows = WEEK.map((order) => decorateCommissionOrder(order, 10, amounts, commissionSourceLabel));

  // The symptom this guards: an undecorated row falls back to 0 for all three.
  for (const row of rows) {
    assert.ok(Number(row.commission_rate_applied) > 0, `${row.id} lost its rate`);
    assert.ok(Number(row.commission_earned_usd) > 0, `${row.id} lost its USD earnings`);
    assert.ok(Number(row.commission_earned_crc) > 0, `${row.id} lost its CRC earnings`);
  }

  const referral = rows.find((row) => row.id === 'referral');
  assert.equal(referral.commission_rate_applied, 20);
  assert.equal(referral.commission_source_label, 'Agent referral');
  assert.equal(referral.commission_earned_usd, 200);
});

test('per-order earnings add up to the payout total the agent is promised', () => {
  const summary = summarizeOrderCommissions(WEEK, 10, amounts);
  const rows = WEEK.map((order) => decorateCommissionOrder(order, 10, amounts, commissionSourceLabel));

  const rowsTotal = rows.reduce((sum, row) => sum + Number(row.commission_earned_usd), 0);
  assert.equal(rowsTotal, summary.usdCommission);
});

test('a mixed week is labelled variable rather than as one flat rate', () => {
  const summary = summarizeOrderCommissions(WEEK, 10, amounts);
  assert.equal(commissionRateLabel(summary.rates, 10), 'Variable (10%, 20%)');
});

/**
 * The USD and CRC figures on a payout are one amount in two currencies, never
 * two amounts to add together — which is why every surface must join them with
 * OR. If this ratio ever stops holding, the "choose one currency" wording in the
 * statement is wrong and someone gets paid twice.
 */
test('USD and CRC commission stay a mirrored pair, not two separate debts', () => {
  const summary = summarizeOrderCommissions(WEEK, 10, amounts);
  assert.ok(
    Math.abs(summary.crcCommission - summary.usdCommission * RATE) < 1,
    `${summary.crcCommission} is not ${summary.usdCommission} converted`
  );
});
