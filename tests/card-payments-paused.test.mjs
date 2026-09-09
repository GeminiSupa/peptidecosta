import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  CARD_PAUSE_ENV_KEY,
  areCardPaymentsPaused,
} from '../src/lib/cardPaymentsPaused.mjs';
import { cardCheckoutMessage } from '../src/lib/cardCheckoutMessages.mjs';

const processCard = fs.readFileSync('src/app/api/shieldhubpay/process-card/route.js', 'utf8');
const payByLink = fs.readFileSync('src/app/api/card-payment-link/pay/route.js', 'utf8');
const adminLink = fs.readFileSync('src/app/api/admin/orders/card-payment-link/route.js', 'utf8');
const catalog = fs.readFileSync('src/app/catalog/page.js', 'utf8');
const payPage = fs.readFileSync('src/app/pay-card/page.js', 'utf8');

// ---------------------------------------------------------------------------
// The switch itself
// ---------------------------------------------------------------------------

test('the pause is off unless it is explicitly switched on', () => {
  // The shop's normal state. A typo, an empty value or a deleted variable must
  // never stop the till.
  for (const value of [undefined, '', 'false', '0', 'no', 'off', 'nope', ' ']) {
    assert.equal(
      areCardPaymentsPaused({ [CARD_PAUSE_ENV_KEY]: value }),
      false,
      `${JSON.stringify(value)} should not pause card payments`,
    );
  }
});

test('the spellings a person would actually type all pause payments', () => {
  for (const value of ['true', 'TRUE', ' True ', '1', 'yes', 'on', 'paused']) {
    assert.equal(
      areCardPaymentsPaused({ [CARD_PAUSE_ENV_KEY]: value }),
      true,
      `${JSON.stringify(value)} should pause card payments`,
    );
  }
});

test('a missing env object does not throw', () => {
  assert.equal(areCardPaymentsPaused(undefined), false);
  assert.equal(areCardPaymentsPaused({}), false);
});

// ---------------------------------------------------------------------------
// What the customer is told
// ---------------------------------------------------------------------------

test('the pause apologises, says nothing was charged, and says what to do', () => {
  const en = cardCheckoutMessage('paused', 'en');
  const es = cardCheckoutMessage('paused', 'es');

  assert.equal(en.code, 'paused');
  assert.equal(es.code, 'paused');

  // Sorry.
  assert.match(en.message, /sorry/i);
  assert.match(es.message, /lamentamos|disculpe/i);

  // Their money is safe. This is the sentence that stops the support call.
  assert.match(en.message, /nothing has been charged/i);
  assert.match(es.message, /ningún cargo/i);

  // And a way to still buy from us.
  assert.match(en.message, /whatsapp/i);
  assert.match(es.message, /whatsapp/i);
});

test('a paused checkout does not invite a retry', () => {
  // Retrying builds a NEW order number every attempt, and the double-charge
  // lock only covers a single order number — the same trap documented on
  // `unconfirmed`. During a pause a retry cannot succeed anyway.
  assert.equal(cardCheckoutMessage('paused', 'en').retryable, false);
  assert.equal(cardCheckoutMessage('paused', 'es').retryable, false);
});

// ---------------------------------------------------------------------------
// Every path that can charge a card is closed
// ---------------------------------------------------------------------------

test('the storefront charge route refuses while paused', () => {
  assert.match(processCard, /import \{ areCardPaymentsPaused \} from '@\/lib\/cardPaymentsPaused\.mjs'/);
  assert.match(processCard, /if \(areCardPaymentsPaused\(\)\) \{\s*return stopCheckout\('paused'/);
});

test('the pay-by-link route refuses while paused', () => {
  // A link already in a customer's hand keeps working on its own, so the
  // storefront switch alone would leave this path charging cards.
  assert.match(payByLink, /import \{ areCardPaymentsPaused \} from '@\/lib\/cardPaymentsPaused\.mjs'/);
  assert.match(payByLink, /if \(areCardPaymentsPaused\(\)\) \{\s*return stopPayment\('paused'/);
});

test('the pause is checked before the gateway is configured or reached', () => {
  // Order matters: a paused shop must answer "we are sorry, we are working on
  // it", not "card payment is not available" or, worse, a real charge.
  for (const [name, source, configured] of [
    ['process-card', processCard, 'isShieldHubPayConfigured'],
    ['pay-by-link', payByLink, 'isShieldHubPayConfigured'],
  ]) {
    const pauseAt = source.indexOf('areCardPaymentsPaused()');
    const configuredAt = source.indexOf(`if (!${configured}())`);
    const chargeAt = source.indexOf('processShieldHubPayTransaction(');
    assert.ok(pauseAt > 0, `${name} does not check the pause at all`);
    assert.ok(pauseAt < configuredAt, `${name} checks the pause after the gateway config check`);
    assert.ok(pauseAt < chargeAt, `${name} checks the pause after charging the card`);
  }
});

test('staff cannot mint a payment link that would be refused', () => {
  assert.match(adminLink, /import \{ areCardPaymentsPaused \} from '@\/lib\/cardPaymentsPaused\.mjs'/);
  assert.match(adminLink, /if \(areCardPaymentsPaused\(\)\)/);
  assert.match(adminLink, /Card payments are paused for maintenance/);
  assert.match(adminLink, /status: 503/);
});

// ---------------------------------------------------------------------------
// And nothing offers a card form while it is paused
// ---------------------------------------------------------------------------

test('the checkout hides the card option and shows the apology', () => {
  // Client components must use the spelled-out reader: Next.js inlines
  // NEXT_PUBLIC_* by matching the literal text, so a dynamic lookup would
  // compile to undefined and the pause would not reach the browser at all.
  assert.match(catalog, /areCardPaymentsPausedForClient\(\)/);
  assert.match(catalog, /const CARD_CHECKOUT_AVAILABLE = CARD_CHECKOUT_ENABLED && !CARD_PAYMENTS_PAUSED/);
  assert.match(catalog, /card-paused-notice/);
  assert.match(catalog, /cardCheckoutMessage\('paused', lang\)/);

  // The card form itself, and the submit path behind it, are both closed.
  assert.match(catalog, /paymentMethod === 'card' && CARD_CHECKOUT_AVAILABLE \?/);
  assert.match(catalog, /if \(CARD_PAYMENTS_PAUSED\) \{/);
});

test('the pay-by-link page shows the apology instead of a card form', () => {
  assert.match(payPage, /areCardPaymentsPausedForClient\(\)/);
  assert.match(payPage, /\{CARD_PAYMENTS_PAUSED \? \(/);
  // Both languages: the order is never loaded during a pause, so the page has
  // nothing to guess the customer's language from.
  assert.match(payPage, /cardCheckoutMessage\('paused', 'es'\)\.message/);
  assert.match(payPage, /cardCheckoutMessage\('paused', 'en'\)\.message/);
});

test('the notice has styling, so it is not invisible text on the checkout', () => {
  const css = fs.readFileSync('src/app/globals.css', 'utf8');
  assert.match(css, /\.card-paused-notice \{/);
});

// ---------------------------------------------------------------------------
// A paused card option offers WhatsApp, rather than a dead end
// ---------------------------------------------------------------------------

test('the paused card tile stays clickable and opens the WhatsApp prompt', () => {
  // A `disabled` button cannot be tapped, focused or read out by a screen
  // reader, so a customer who wanted to pay by card would get no answer and no
  // next step. During a pause the tile diverts instead of refusing.
  assert.match(catalog, /divert: CARD_PAYMENTS_PAUSED/);
  assert.match(catalog, /disabled: !CARD_CHECKOUT_ENABLED/);
  assert.ok(
    !catalog.includes('disabled: !CARD_CHECKOUT_AVAILABLE'),
    'the card tile is still hard-disabled during a pause, so the prompt is unreachable',
  );
  assert.match(catalog, /if \(method\.divert\) \{\s*setCardPausedPromptOpen\(true\)/);
});

test('the prompt hands the customer to the WhatsApp order they can still finish', () => {
  assert.match(catalog, /\{cardPausedPromptOpen && \(/);
  // The primary action switches method and drops them on the submit button, so
  // the order goes through the ordinary WhatsApp checkout — same record, same
  // receipt — rather than a second, parallel order path.
  assert.match(catalog, /setPaymentMethod\('whatsapp'\);\s*setCardPausedPromptOpen\(false\);\s*revealField\('orderSubmit'\)/);
  assert.match(catalog, /id="field-orderSubmit"/);
  // And a way out for someone who has not filled the form in yet.
  assert.match(catalog, /logWhatsAppSource\('card_paused_prompt', lang\)/);
  assert.match(catalog, /buildWhatsAppLink\(\s*links\.whatsappNumber/);
});

test('the pay-by-link page offers WhatsApp with the order number', () => {
  // This customer has an order already agreed; sending them back to the
  // catalog to start again would lose the sale.
  assert.match(payPage, /buildWhatsAppLink\(/);
  assert.match(payPage, /Order #\$\{orderNumber\}/);
  assert.match(payPage, /useBusinessLinks/);
});

test('the prompt and the paused tile both have styling', () => {
  const css = fs.readFileSync('src/app/globals.css', 'utf8');
  assert.match(css, /\.card-paused-modal \{/);
  assert.match(css, /\.card-paused-modal__cta \{/);
  assert.match(css, /\.payment-method-card\.paused \{/);
});
