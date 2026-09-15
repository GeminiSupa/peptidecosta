import test from 'node:test';
import assert from 'node:assert/strict';

import {
  decideOwnerChange,
  findActiveProfile,
  resolveManualOrderOwner,
} from '../src/lib/orderOwnership.mjs';

test('the 14 Sep case: staff cannot take a completed order whose customer is Dani\'s', () => {
  // WPCR-MTYORQAN: entered by Dani with the owner left blank, completed, then
  // picked up by another agent. Jimmy had three earlier orders with Dani.
  const decision = decideOwnerChange({
    currentOwner: '',
    customerOwner: 'Dani',
    targetOwner: 'Pollita',
    actorOwner: 'Pollita',
    isSuperadmin: false,
    status: 'Order Complete',
  });
  assert.equal(decision.outcome, 'needs_approval');
  assert.match(decision.message, /Dani/);
});

test('a new customer\'s unpaid order can be claimed by whoever gets there first', () => {
  const decision = decideOwnerChange({
    targetOwner: 'Yese',
    actorOwner: 'Yese',
    status: 'Pending',
  });
  assert.equal(decision.outcome, 'apply');
});

test('an agent may claim an order from their own returning customer', () => {
  const decision = decideOwnerChange({
    customerOwner: 'korinne',
    targetOwner: 'Korinne',
    actorOwner: 'Korinne',
    status: 'Payment Pending',
  });
  assert.equal(decision.outcome, 'apply');
});

test('a returning customer stays with their agent even while unpaid', () => {
  const decision = decideOwnerChange({
    customerOwner: 'Korinne',
    targetOwner: 'Yese',
    actorOwner: 'Yese',
    status: 'Pending',
  });
  assert.equal(decision.outcome, 'needs_approval');
});

test('once paid, an unowned order needs a superadmin', () => {
  for (const status of ['Paid', 'Processing', 'Order Complete']) {
    const decision = decideOwnerChange({ targetOwner: 'Yese', actorOwner: 'Yese', status });
    assert.equal(decision.outcome, 'needs_approval', status);
  }
});

test('staff can never replace an existing owner, even for themselves', () => {
  const decision = decideOwnerChange({
    currentOwner: 'Dani',
    targetOwner: 'Pollita',
    actorOwner: 'Pollita',
    status: 'Pending',
  });
  assert.equal(decision.outcome, 'needs_approval');
});

test('staff cannot hand an unowned order to somebody else', () => {
  const decision = decideOwnerChange({ targetOwner: 'Dani', actorOwner: 'Yese', status: 'Pending' });
  assert.equal(decision.outcome, 'needs_approval');
});

test('a superadmin replacing an owner must give a reason', () => {
  const base = { currentOwner: 'Pollita', targetOwner: 'Dani', isSuperadmin: true, status: 'Order Complete' };
  assert.equal(decideOwnerChange(base).outcome, 'refused');
  assert.equal(decideOwnerChange({ ...base, reason: 'ok' }).outcome, 'refused');
  assert.equal(decideOwnerChange({ ...base, reason: 'Dani took this sale' }).outcome, 'apply');
});

test('a superadmin assigning an unowned order needs no reason', () => {
  const decision = decideOwnerChange({ targetOwner: 'Dani', isSuperadmin: true, status: 'Order Complete' });
  assert.equal(decision.outcome, 'apply');
});

test('the same owner in different case is not a change', () => {
  const decision = decideOwnerChange({ currentOwner: 'dani', targetOwner: 'Dani', actorOwner: 'Yese' });
  assert.equal(decision.outcome, 'unchanged');
});

test('a superadmin must choose an owner or a house sale on a manual order', () => {
  assert.ok(resolveManualOrderOwner({ isSuperadmin: true }).error);
  assert.deepEqual(
    resolveManualOrderOwner({ isSuperadmin: true, houseSale: true }),
    { owner: null, fromHistory: false, houseSale: true },
  );
  assert.equal(resolveManualOrderOwner({ isSuperadmin: true, requestedOwner: 'Dani' }).owner, 'Dani');
});

test('staff entering an order for a colleague\'s customer credits the colleague', () => {
  const result = resolveManualOrderOwner({ customerOwner: 'Dani', actorOwner: 'Yese' });
  assert.equal(result.owner, 'Dani');
  assert.equal(result.fromHistory, true);
  assert.match(result.note, /Dani/);
});

test('staff entering an order for a new customer, or their own, are credited', () => {
  assert.equal(resolveManualOrderOwner({ actorOwner: 'Yese' }).owner, 'Yese');
  const own = resolveManualOrderOwner({ customerOwner: 'yese', actorOwner: 'Yese' });
  assert.equal(own.owner, 'Yese');
  assert.equal(own.fromHistory, false);
});

test('only active team members hold customers, superadmins included', () => {
  const profiles = [
    { name: 'Dani', email: 'elainedrb@gmail.com', is_superadmin: true, status: 'active' },
    { name: 'Shey', email: 'sheybrunette@gmail.com', status: 'suspended' },
  ];
  assert.equal(findActiveProfile(profiles, 'dani')?.name, 'Dani');
  assert.equal(findActiveProfile(profiles, 'elainedrb')?.name, 'Dani');
  assert.equal(findActiveProfile(profiles, 'Shey'), null);
  assert.equal(findActiveProfile(profiles, 'Maria Fernanda'), null);
  assert.equal(findActiveProfile(profiles, ''), null);
});
