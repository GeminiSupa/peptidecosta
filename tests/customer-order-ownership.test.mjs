import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CustomerSessionError,
  applyCustomerOrderOwnership,
  readBearerToken,
  resolveCustomerOrderOwner,
} from '../src/lib/customerOrderOwnership.mjs';

test('guest checkout has no customer owner', async () => {
  const authClient = { auth: { getUser: () => assert.fail('guest checkout must not call auth') } };
  assert.equal(await resolveCustomerOrderOwner(authClient, null), null);
  assert.deepEqual(applyCustomerOrderOwnership({ order_number: 'GUEST-1' }, null), { order_number: 'GUEST-1' });
});

test('a verified Supabase bearer session owns the order', async () => {
  const authClient = {
    auth: {
      getUser: async (token) => {
        assert.equal(token, 'valid-token');
        return { data: { user: { id: 'customer-uuid', email: ' Customer@Example.com ' } }, error: null };
      },
    },
  };

  const owner = await resolveCustomerOrderOwner(authClient, 'Bearer valid-token');
  assert.deepEqual(owner, { id: 'customer-uuid', email: 'customer@example.com' });
  assert.deepEqual(
    applyCustomerOrderOwnership({ order_number: 'ACCOUNT-1' }, owner.id),
    { order_number: 'ACCOUNT-1', customer_user_id: 'customer-uuid' },
  );
});

test('a browser cannot forge order ownership', () => {
  assert.deepEqual(
    applyCustomerOrderOwnership({ order_number: 'FORGED-1', customer_user_id: 'attacker-uuid' }, null),
    { order_number: 'FORGED-1' },
  );
  assert.deepEqual(
    applyCustomerOrderOwnership({ order_number: 'FORGED-2', customer_user_id: 'attacker-uuid' }, 'real-uuid'),
    { order_number: 'FORGED-2', customer_user_id: 'real-uuid' },
  );
});

test('malformed or invalid sessions fail instead of silently becoming guest orders', async () => {
  assert.throws(() => readBearerToken('Basic credentials'), CustomerSessionError);

  const authClient = {
    auth: { getUser: async () => ({ data: { user: null }, error: new Error('expired') }) },
  };
  await assert.rejects(
    resolveCustomerOrderOwner(authClient, 'Bearer expired-token'),
    CustomerSessionError,
  );
});

