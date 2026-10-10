import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * A card payment link never expires: one sent on WhatsApp last week still
 * opens today. The secret that signs it was named after the old gateway
 * (SHIELD_HUB_PAY_API_SECRET), so moving to a Chargex-era name has to be done
 * without turning every link already in a customer's hands into "invalid
 * link" - which is what a plain rename would do.
 *
 * Links are signed with the newest secret and accepted if they match any.
 * The module reads the environment at call time, so each case sets the
 * variables and imports a fresh copy.
 */
const SHIELD = 'old-gateway-secret-value';
const CHARGX_ERA = 'new-card-payment-link-secret';

async function freshModule(env) {
  for (const key of ['CARD_PAYMENT_LINK_SECRET', 'SHIELD_HUB_PAY_API_SECRET', 'SUPABASE_SERVICE_ROLE_KEY']) {
    delete process.env[key];
  }
  Object.assign(process.env, env);
  // A query string gives each case its own module instance.
  return import(`../src/lib/cardPaymentLink.js?case=${encodeURIComponent(JSON.stringify(env))}`);
}

test('a link signed with the old secret still works after the new one is added', async () => {
  const before = await freshModule({ SHIELD_HUB_PAY_API_SECRET: SHIELD });
  const link = before.signCardPaymentOrder('WPCR-TEST-1');
  assert.equal(before.verifyCardPaymentOrderToken('WPCR-TEST-1', link), true);
  // Taken while the old secret is the only one set: the module reads the
  // environment on every call, so this has to be captured now, not later.
  const signedTheOldWay = before.signCardPaymentOrder('WPCR-TEST-2');

  // The day CARD_PAYMENT_LINK_SECRET is set in Vercel.
  const after = await freshModule({
    CARD_PAYMENT_LINK_SECRET: CHARGX_ERA,
    SHIELD_HUB_PAY_API_SECRET: SHIELD,
  });
  assert.equal(
    after.verifyCardPaymentOrderToken('WPCR-TEST-1', link),
    true,
    'a link already in a customer\'s hands must keep working',
  );

  // And new links are signed with the new secret.
  const fresh = after.signCardPaymentOrder('WPCR-TEST-2');
  assert.notEqual(fresh, signedTheOldWay, 'new links use the new secret');
  assert.equal(after.verifyCardPaymentOrderToken('WPCR-TEST-2', fresh), true);
});

test('once the old secret is removed, only links signed with the new one open', async () => {
  const before = await freshModule({ SHIELD_HUB_PAY_API_SECRET: SHIELD });
  const oldLink = before.signCardPaymentOrder('WPCR-TEST-3');

  const afterCleanup = await freshModule({ CARD_PAYMENT_LINK_SECRET: CHARGX_ERA });
  assert.equal(afterCleanup.verifyCardPaymentOrderToken('WPCR-TEST-3', oldLink), false);

  const newLink = afterCleanup.signCardPaymentOrder('WPCR-TEST-3');
  assert.equal(afterCleanup.verifyCardPaymentOrderToken('WPCR-TEST-3', newLink), true);
});

test('a checkout token issued before the change still completes its payment', async () => {
  const before = await freshModule({ SHIELD_HUB_PAY_API_SECRET: SHIELD });
  const token = before.createCardCheckoutToken('WPCR-TEST-4', 'order-id-4');

  const after = await freshModule({
    CARD_PAYMENT_LINK_SECRET: CHARGX_ERA,
    SHIELD_HUB_PAY_API_SECRET: SHIELD,
  });
  const claims = after.verifyCardCheckoutToken(token, 'WPCR-TEST-4');
  assert.ok(claims, 'a payment already in flight must not be refused');
  assert.equal(claims.orderId, 'order-id-4');
});

test('a forged token is refused whichever secrets are configured', async () => {
  const mod = await freshModule({
    CARD_PAYMENT_LINK_SECRET: CHARGX_ERA,
    SHIELD_HUB_PAY_API_SECRET: SHIELD,
  });
  assert.equal(mod.verifyCardPaymentOrderToken('WPCR-TEST-5', 'not-a-real-token'), false);
  assert.equal(mod.verifyCardPaymentOrderToken('WPCR-TEST-5', ''), false);
  assert.equal(mod.verifyCardCheckoutToken('junk.signature', 'WPCR-TEST-5'), null);

  // A token for one order must not open another.
  const token = mod.signCardPaymentOrder('WPCR-TEST-6');
  assert.equal(mod.verifyCardPaymentOrderToken('WPCR-TEST-7', token), false);
});

test('an expired checkout token is still refused', async () => {
  const mod = await freshModule({ CARD_PAYMENT_LINK_SECRET: CHARGX_ERA });
  const token = mod.createCardCheckoutToken('WPCR-TEST-8', 'order-id-8', { ttlSeconds: 1 });
  assert.ok(mod.verifyCardCheckoutToken(token, 'WPCR-TEST-8'));
  assert.equal(
    mod.verifyCardCheckoutToken(token, 'WPCR-TEST-8', { now: Date.now() + 5000 }),
    null,
  );
});
