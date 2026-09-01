import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EXIT_INTENT_DEFAULTS,
  EXIT_INTENT_MIN_BROWSE_MS,
  formatCountdown,
  generateOfferCode,
  identityKeys,
  isOfferLive,
  normalizeOfferSettings,
  offerExpiryIso,
  offerRemainingMs,
  previewSavings,
  primaryIdentityKey,
  shouldOfferExitIntent,
} from '../src/lib/exitIntentOffer.mjs';

// Someone with a cart who has been reading for a while: the customer the offer
// exists for.
const leaving = {
  cartItemCount: 2,
  hasPromoApplied: false,
  gateVisible: false,
  checkoutBusy: false,
  offerSpent: false,
  msOnPage: 60_000,
};

test('a first-time shopper leaving with a cart is offered the discount', () => {
  assert.equal(shouldOfferExitIntent(leaving), true);
});

test('an empty cart is never offered anything', () => {
  // There is nothing to rescue, and nothing to take a percentage of.
  assert.equal(shouldOfferExitIntent({ ...leaving, cartItemCount: 0 }), false);
});

test('a cart that already has a code is left alone', () => {
  // The cart holds one code. Applying ours would replace theirs — and promo
  // codes carry affiliate_id, so it would take an affiliate's commission with it.
  assert.equal(shouldOfferExitIntent({ ...leaving, hasPromoApplied: true }), false);
});

test('never on top of the access gate', () => {
  assert.equal(shouldOfferExitIntent({ ...leaving, gateVisible: true }), false);
});

test('never over a checkout in progress', () => {
  assert.equal(shouldOfferExitIntent({ ...leaving, checkoutBusy: true }), false);
});

test('a visitor who already had their offer never gets a second one', () => {
  // The whole deadline depends on this: an offer that comes back is not a
  // deadline, it is a permanent discount with extra steps.
  assert.equal(shouldOfferExitIntent({ ...leaving, offerSpent: true }), false);
});

test('a bounce is not an exit', () => {
  assert.equal(shouldOfferExitIntent({ ...leaving, msOnPage: 3_000 }), false);
  assert.equal(
    shouldOfferExitIntent({ ...leaving, msOnPage: EXIT_INTENT_MIN_BROWSE_MS }),
    true,
  );
});

test('settings default when the row is missing or junk', () => {
  assert.deepEqual(normalizeOfferSettings(undefined), {
    enabled: true,
    discountPct: EXIT_INTENT_DEFAULTS.discountPct,
    windowMinutes: EXIT_INTENT_DEFAULTS.windowMinutes,
    minCartUsd: 0,
  });
  assert.equal(normalizeOfferSettings({ discountPct: 'ten' }).discountPct, 0.10);
});

test('a percent typed as 10 instead of 0.10 does not give the order away', () => {
  // The one edit here that costs real money. 10 would be read as 1000% off.
  assert.equal(normalizeOfferSettings({ discountPct: 10 }).discountPct, 0.10);
  assert.equal(normalizeOfferSettings({ discountPct: 0 }).discountPct, 0.10);
  assert.equal(normalizeOfferSettings({ discountPct: -0.5 }).discountPct, 0.10);
});

test('a real discount change is respected', () => {
  assert.equal(normalizeOfferSettings({ discountPct: 0.15 }).discountPct, 0.15);
  assert.equal(normalizeOfferSettings({ windowMinutes: 30 }).windowMinutes, 30);
  assert.equal(normalizeOfferSettings({ minCartUsd: 75 }).minCartUsd, 75);
});

test('the offer can be switched off in one edit', () => {
  assert.equal(normalizeOfferSettings({ enabled: false }).enabled, false);
  assert.equal(normalizeOfferSettings({}).enabled, true);
});

test('the window is capped at a day', () => {
  assert.equal(normalizeOfferSettings({ windowMinutes: 99_999 }).windowMinutes, 1440);
});

test('the expiry is the window from now', () => {
  const now = Date.parse('2026-09-01T12:00:00.000Z');
  assert.equal(offerExpiryIso(now, { windowMinutes: 20 }), '2026-09-01T12:20:00.000Z');
});

test('a minted code carries the offer and a private suffix', () => {
  const code = generateOfferCode(0.10, () => 0);
  assert.equal(code, 'AHORA10AAAAA');
  assert.match(generateOfferCode(0.15, () => 0.999), /^AHORA15[A-Z2-9]{5}$/);
});

test('the code alphabet has no characters that can be misread', () => {
  const samples = Array.from({ length: 200 }, () => generateOfferCode(0.10));
  for (const code of samples) {
    assert.doesNotMatch(code.slice(7), /[IO01]/, `${code} contains an ambiguous glyph`);
  }
});

test('two codes minted in a row are different', () => {
  // The suffix is the only thing stopping a screenshot being reusable.
  const codes = new Set(Array.from({ length: 50 }, () => generateOfferCode(0.10)));
  assert.ok(codes.size > 45, `expected distinct codes, got ${codes.size} of 50`);
});

test('identities are listed strongest first', () => {
  assert.deepEqual(
    identityKeys({ email: 'Ana@Example.com', phone: '+506 8888 7777', sessionId: 'session_abc' }),
    ['email:ana@example.com', 'phone:88887777', 'session:session_abc'],
  );
});

test('a phone matches whether or not it carries the country code', () => {
  // The checkout stores E.164; older CRM rows do not. Same customer.
  assert.deepEqual(identityKeys({ phone: '+50688887777' }), identityKeys({ phone: '8888 7777' }));
});

test('an address that would break a PostgREST filter is dropped, not escaped', () => {
  assert.deepEqual(identityKeys({ email: 'a,b@example.com' }), []);
  assert.deepEqual(identityKeys({ email: 'not-an-email' }), []);
  assert.deepEqual(identityKeys({ email: '(x)@example.com' }), []);
});

test('a visitor with no contact details is still known by their session', () => {
  // They added to the cart before the access gate ever asked. Without this the
  // offer would be unlimited for exactly the people it cannot identify.
  assert.deepEqual(identityKeys({ sessionId: 'session_xyz' }), ['session:session_xyz']);
  assert.equal(primaryIdentityKey({ sessionId: 'session_xyz' }), 'session:session_xyz');
});

test('a short phone number is not an identity', () => {
  assert.deepEqual(identityKeys({ phone: '911' }), []);
});

test('the countdown runs against the server clock, not the device clock', () => {
  // A device an hour fast would otherwise show an offer as dead while the order
  // endpoint still honours it — or keep counting one it has already refused.
  const offer = { expiresAt: '2026-09-01T12:20:00.000Z', skewMs: -3_600_000 };
  const deviceNow = Date.parse('2026-09-01T13:10:00.000Z'); // device is an hour fast
  assert.equal(offerRemainingMs(offer, deviceNow), 10 * 60_000);
});

test('an offer with no expiry is not live', () => {
  assert.equal(offerRemainingMs({ expiresAt: 'nonsense' }, Date.now()), 0);
  assert.equal(isOfferLive({ code: 'AHORA10ABCDE' }, Date.now()), false);
  assert.equal(isOfferLive(null), false);
});

test('an offer past its expiry is not live', () => {
  const offer = { code: 'AHORA10ABCDE', expiresAt: '2026-09-01T12:00:00.000Z' };
  assert.equal(isOfferLive(offer, Date.parse('2026-09-01T11:59:59.000Z')), true);
  assert.equal(isOfferLive(offer, Date.parse('2026-09-01T12:00:00.000Z')), false);
});

test('the clock reads as minutes and seconds', () => {
  assert.equal(formatCountdown(19 * 60_000 + 59_000), '19:59');
  assert.equal(formatCountdown(60_000), '1:00');
  assert.equal(formatCountdown(9_000), '0:09');
  assert.equal(formatCountdown(0), '0:00');
  assert.equal(formatCountdown(-5), '0:00');
});

test('the saving quoted is the saving the checkout will show', () => {
  // The volume discount comes off first, exactly as getPromoDiscountAmount does
  // it. Quoting 10% of the list price would promise money the cart never takes off.
  assert.equal(
    previewSavings({ discountableSubtotal: 100_000, volumePct: 20, discountPct: 0.10, currency: 'CRC' }),
    8_000,
  );
});

test('colones are whole and dollars carry cents', () => {
  assert.equal(
    previewSavings({ discountableSubtotal: 33_333, volumePct: 0, discountPct: 0.10, currency: 'CRC' }),
    3_333,
  );
  assert.equal(
    previewSavings({ discountableSubtotal: 67.85, volumePct: 0, discountPct: 0.10, currency: 'USD' }),
    6.79,
  );
});

test('an empty cart saves nothing', () => {
  assert.equal(previewSavings({ discountableSubtotal: 0, discountPct: 0.10, currency: 'CRC' }), 0);
  assert.equal(previewSavings({ discountableSubtotal: -5, discountPct: 0.10, currency: 'CRC' }), 0);
});
