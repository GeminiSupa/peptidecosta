import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPaidOrderIndex,
  computeOverrideAmounts,
  hasBeenPaid,
  overrideRateFor,
  payableChildrenOf,
  splitOrderCommission,
  subUserRateFor,
} from '../src/lib/subUserCommission.mjs';

const MARIA = { user_id: 'maria-uuid', email: 'maria@peptides.com', name: 'María', tier: 'staff', status: 'active', override_rate: 2 };
const LUIS = { user_id: 'luis-uuid', email: 'luis@example.com', name: 'Luis', tier: 'sub_user', status: 'active', parent_agent_id: 'maria-uuid', commission_rate: 8 };

// ---------------------------------------------------------------------------
// The split
// ---------------------------------------------------------------------------

test('a $1,000 order pays the sub-user $80 and their staff member $20', () => {
  const split = splitOrderCommission({ amount: 1000, subUserRate: 8, overrideRate: 2 });
  assert.equal(split.subUser, 80);
  assert.equal(split.override, 20);
  // The whole point of the 8/2 shape: total cost is 10%, not 12%.
  assert.equal(split.total, 100);
});

test('the two halves always add up to the total commission cost', () => {
  for (const amount of [1, 37.55, 249.99, 1000, 12345.67]) {
    const split = splitOrderCommission({ amount, subUserRate: 8, overrideRate: 2 });
    assert.equal(split.total, split.subUser + split.override, `broke at ${amount}`);
    // And never more than 10% of the order.
    assert.ok(split.total <= Math.round(amount * 0.1 * 100) / 100 + 0.01, `over 10% at ${amount}`);
  }
});

test('a pending or suspended sub-user earns nothing, and neither does their parent', () => {
  const pending = splitOrderCommission({ amount: 1000, active: false });
  assert.deepEqual(pending, { subUser: 0, override: 0, total: 0 });
});

test('rates are per person, not hardcoded', () => {
  const generous = splitOrderCommission({ amount: 1000, subUserRate: 10, overrideRate: 3 });
  assert.equal(generous.subUser, 100);
  assert.equal(generous.override, 30);
  assert.equal(generous.total, 130);
});

test('the defaults are 8 and 2, including when a column is blank', () => {
  assert.equal(subUserRateFor(LUIS), 8);
  assert.equal(subUserRateFor({}), 8);
  assert.equal(subUserRateFor({ commission_rate: null }), 8);
  assert.equal(overrideRateFor(MARIA), 2);
  assert.equal(overrideRateFor({}), 2);
  // An explicit zero is a real choice and must survive.
  assert.equal(overrideRateFor({ override_rate: 0 }), 0);
});

test('money is rounded to cents, not carried as float dust', () => {
  const split = splitOrderCommission({ amount: 33.33, subUserRate: 8, overrideRate: 2 });
  assert.equal(split.subUser, 2.67);
  assert.equal(split.override, 0.67);
});

test('a zero or nonsense order amount pays nobody', () => {
  assert.equal(splitOrderCommission({ amount: 0 }).total, 0);
  assert.equal(splitOrderCommission({ amount: -500 }).total, 0);
  assert.equal(splitOrderCommission({ amount: 'abc' }).total, 0);
  assert.equal(splitOrderCommission().total, 0);
});

test('a week of sales converts to an override in both currencies', () => {
  const { overrideUsd, overrideCrc } = computeOverrideAmounts({
    usdSales: 3120,
    crcSales: 1_600_000,
    overrideRate: 2,
  });
  assert.equal(overrideUsd, 62.4);
  assert.equal(overrideCrc, 32000);
});

// ---------------------------------------------------------------------------
// Who the override is owed on
// ---------------------------------------------------------------------------

test('only approved, active sub-users earn their parent an override', () => {
  const team = [
    MARIA,
    LUIS,
    { ...LUIS, user_id: 'diego-uuid', name: 'Diego', status: 'pending' },
    { ...LUIS, user_id: 'karla-uuid', name: 'Karla', status: 'suspended' },
  ];
  const payable = payableChildrenOf(MARIA, team);
  assert.deepEqual(payable.map((p) => p.name), ['Luis']);
});

test("a staff member earns nothing from another staff member's people", () => {
  const jose = { ...MARIA, user_id: 'jose-uuid', email: 'jose@peptides.com', name: 'José' };
  assert.equal(payableChildrenOf(jose, [MARIA, jose, LUIS]).length, 0);
});

test('a staff member is never her own child', () => {
  // Guards a self-parent data error turning into commission on her own sales.
  assert.equal(payableChildrenOf(MARIA, [{ ...MARIA, parent_agent_id: 'maria-uuid' }]).length, 0);
});

// ---------------------------------------------------------------------------
// The double-count guard — the bug that would have silently eaten the override
// ---------------------------------------------------------------------------

test("approving the sub-user's payout does not erase their parent's override", () => {
  // Order #1042 legitimately pays two people. Luis's payout is approved first.
  const approved = [
    { agent_email: 'luis@example.com', orders_data: [{ id: 'order-1042' }], override_orders_data: [] },
  ];
  const index = buildPaidOrderIndex(approved);

  // Settled for Luis...
  assert.equal(hasBeenPaid(index, 'luis@example.com', 'order-1042'), true);
  // ...but still outstanding for María. A flat Set of order ids would have
  // returned true here and her 2% would have vanished with no error.
  assert.equal(hasBeenPaid(index, 'maria@peptides.com', 'order-1042'), false);
});

test('once the override is approved the same order is not paid to the parent twice', () => {
  const approved = [
    { agent_email: 'luis@example.com', orders_data: [{ id: 'order-1042' }] },
    { agent_email: 'maria@peptides.com', orders_data: [], override_orders_data: [{ id: 'order-1042' }] },
  ];
  const index = buildPaidOrderIndex(approved);
  assert.equal(hasBeenPaid(index, 'maria@peptides.com', 'order-1042'), true);
  assert.equal(hasBeenPaid(index, 'luis@example.com', 'order-1042'), true);
});

test('agent email matching is case and whitespace insensitive', () => {
  const index = buildPaidOrderIndex([
    { agent_email: '  Maria@Peptides.com ', orders_data: [{ id: 'order-9' }] },
  ]);
  assert.equal(hasBeenPaid(index, 'maria@peptides.com', 'order-9'), true);
  assert.equal(hasBeenPaid(index, 'MARIA@PEPTIDES.COM', 'order-9'), true);
});

test('malformed payout rows are skipped rather than crashing the Monday scan', () => {
  const index = buildPaidOrderIndex([
    null,
    { agent_email: null, orders_data: [{ id: 'order-1' }] },
    { agent_email: 'x@y.com', orders_data: null },
    { agent_email: 'x@y.com', orders_data: [{ noId: true }, null] },
    { agent_email: 'x@y.com', orders_data: [{ id: 'order-2' }] },
  ]);
  assert.equal(hasBeenPaid(index, 'x@y.com', 'order-2'), true);
  assert.equal(hasBeenPaid(index, 'x@y.com', 'order-1'), false);
  assert.equal(hasBeenPaid(index, 'x@y.com', undefined), false);
});

test('an empty history means nothing has been paid yet', () => {
  const index = buildPaidOrderIndex([]);
  assert.equal(hasBeenPaid(index, 'maria@peptides.com', 'order-1042'), false);
  assert.equal(hasBeenPaid(buildPaidOrderIndex(), 'anyone@x.com', 'order-1'), false);
});
