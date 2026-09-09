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
// The pay-by-link page still offers a way to pay
// ---------------------------------------------------------------------------

test('the pay-by-link page offers WhatsApp with the order number', () => {
  // This customer has an order already agreed and only needs another way to
  // pay it; sending them back to the catalog to start again would lose it.
  assert.match(payPage, /buildWhatsAppLink\(/);
  assert.match(payPage, /Order #\$\{orderNumber\}/);
  assert.match(payPage, /useBusinessLinks/);
  assert.match(
    fs.readFileSync('src/app/globals.css', 'utf8'),
    /\.card-paused-whatsapp \{/,
  );
});

test('the checkout does not pop anything up when the card tile is tapped', () => {
  // Reverted deliberately. The card option is a plain disabled tile during a
  // pause; the apology under the payment methods is the whole of the message.
  for (const gone of ['cardPausedPromptOpen', 'card-paused-modal', 'divert:']) {
    assert.ok(!catalog.includes(gone), `${gone} is still in the checkout`);
  }
  assert.match(catalog, /disabled: !CARD_CHECKOUT_AVAILABLE/);
});

// ---------------------------------------------------------------------------
// Staff are told, so a deliberate pause does not read as a broken admin panel
// ---------------------------------------------------------------------------

const adminBanner = fs.readFileSync('src/components/admin/CardPaymentsPausedBanner.js', 'utf8');
const adminPage = fs.readFileSync('src/app/admin/page.js', 'utf8');
const orderPanel = fs.readFileSync('src/components/admin/OrderDetailPanel.js', 'utf8');
const methodRoute = fs.readFileSync('src/app/api/admin/orders/payment-method/route.js', 'utf8');

test('the banner renders nothing while card payments are running', () => {
  // It sits permanently in the admin layout, so the off state has to cost
  // nothing and show nothing.
  assert.match(adminBanner, /if \(!CARD_PAYMENTS_PAUSED\) return null;/);
  assert.match(adminBanner, /areCardPaymentsPausedForClient\(\)/);
});

test('the banner says what staff can and cannot do', () => {
  assert.match(adminBanner, /Card payments are paused for maintenance/);
  // The three things a person on the phone to a customer actually needs.
  assert.match(adminBanner, /cannot pay by card/i);
  assert.match(adminBanner, /payment links/i);
  // JSX wraps the sentence across lines, so match across the whitespace.
  assert.match(adminBanner, /WhatsApp,\s+SINPE\s+or\s+bank\s+transfer/);
});

test('the banner is on every admin tab, not just Orders', () => {
  // A pause changes what the whole team can promise; the person who needs to
  // know may be in Leads or the Facebook inbox.
  assert.match(adminPage, /import CardPaymentsPausedBanner from '@\/components\/admin\/CardPaymentsPausedBanner'/);
  assert.match(adminPage, /<\/header>\s*(\{\/\*[\s\S]*?\*\/\}\s*)?<CardPaymentsPausedBanner \/>/);
});

test('the copy-payment-link button disables itself rather than erroring', () => {
  // The route refuses either way, but a button that visibly cannot be pressed
  // explains itself; one that errors on click reads as a broken panel.
  assert.match(orderPanel, /disabled=\{cardLinkLoading \|\| CARD_PAYMENTS_PAUSED\}/);
  assert.match(orderPanel, /'Card payments paused'/);
  assert.match(orderPanel, /<CardPaymentsPausedBanner compact \/>/);
});

test('switching an order to card explains why no link came back', () => {
  // The change is still allowed — an order can be marked as a card order ready
  // for when payments resume — but no link is minted that would be refused.
  assert.match(methodRoute, /import \{ areCardPaymentsPaused \} from '@\/lib\/cardPaymentsPaused\.mjs'/);
  assert.match(methodRoute, /if \(areCardPaymentsPaused\(\)\) \{\s*paymentLinkError =/);
  assert.match(methodRoute, /card payments are paused for maintenance, so no payment link was created/);
});

test('the admin banner has styling', () => {
  const css = fs.readFileSync('src/app/globals.css', 'utf8');
  assert.match(css, /\.admin-card-paused-banner \{/);
  assert.match(css, /\.admin-card-paused-banner\.compact \{/);
});
