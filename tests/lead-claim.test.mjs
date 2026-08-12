import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decideClaimOwner,
  mayTransferLead,
  normalizeLeadIdentities,
} from '../src/lib/leadClaim.mjs';

test('email and Costa Rica phone formats collapse into stable lead identities', () => {
  assert.deepEqual(normalizeLeadIdentities({
    email: ' Customer@Example.COM ',
    phone: '+506 8404-6973',
  }), [
    { identity_type: 'email', identity_value: 'customer@example.com' },
    { identity_type: 'phone', identity_value: '84046973' },
  ]);
});

test('an existing CRM owner beats every new claim', () => {
  assert.deepEqual(decideClaimOwner({
    existingOwner: 'Korinne',
    historicalOwner: 'Yese',
    actorOwner: 'Joe',
  }), { owner: 'Korinne', source: 'existing', canClaim: false });
});

test('closed-order history beats a first claim', () => {
  assert.deepEqual(decideClaimOwner({
    historicalOwner: 'Korinne',
    actorOwner: 'Joe',
  }), { owner: 'Korinne', source: 'order_history', canClaim: false });
});

test('a genuinely new lead belongs to the first agent who records it', () => {
  assert.deepEqual(decideClaimOwner({ actorOwner: 'Joe' }), {
    owner: 'Joe',
    source: 'first_claim',
    canClaim: true,
  });
});

test('staff can claim only unowned leads for themselves', () => {
  assert.equal(mayTransferLead({ targetOwner: 'Joe', actorOwner: 'Joe' }).allowed, true);
  assert.equal(mayTransferLead({ targetOwner: 'Korinne', actorOwner: 'Joe' }).allowed, false);
  assert.equal(mayTransferLead({ currentOwner: 'Korinne', targetOwner: 'Joe', actorOwner: 'Joe' }).allowed, false);
});

test('superadmins may transfer owned leads but must give a reason', () => {
  assert.deepEqual(mayTransferLead({
    currentOwner: 'Korinne',
    targetOwner: 'Joe',
    isSuperadmin: true,
  }), { allowed: true, requiresReason: true });
  assert.deepEqual(mayTransferLead({
    historicalOwner: 'Korinne',
    targetOwner: 'Korinne',
    isSuperadmin: true,
  }), { allowed: true, requiresReason: false });
});
