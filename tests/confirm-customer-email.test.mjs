/**
 * The dialog that stands between a click and a customer's inbox.
 *
 * A stray click on the resend button put a second receipt in a real customer's
 * inbox. A send cannot be recalled, so every control that mails a customer now
 * asks first — and the dialog names the recipient, because "Are you sure?"
 * teaches people to click yes without reading.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSendMessage, confirmCustomerEmail } from '../src/lib/confirmCustomerEmail.mjs';

test('the dialog names who is about to be emailed', () => {
  const message = buildSendMessage('receipt', 'buyer@example.com', [
    'Order: WPCR-MTN4CIDP',
    'Total: ₡556,203',
  ]);

  assert.match(message, /buyer@example\.com/);
  assert.match(message, /WPCR-MTN4CIDP/);
  assert.match(message, /₡556,203/);
  assert.match(message, /cannot be taken back/);
  assert.match(message, /^Send this receipt\?/);
});

test('the wording works for a recipient who is not the customer', () => {
  // The same dialog guards the accountant's copy, so the opener names the
  // thing being sent and the To: line names who gets it.
  const message = buildSendMessage('accounting copy', 'the accountant', ['Order: X-1']);
  assert.match(message, /^Send this accounting copy\?/);
  assert.match(message, /To: the accountant/);
  assert.doesNotMatch(message, /to the customer/);
});

test('an order with no email says so rather than showing a blank line', () => {
  const message = buildSendMessage('receipt', '', []);
  assert.match(message, /No email address on this order/);
  assert.doesNotMatch(message, /To: *\n/);
});

test('absent details are dropped, never printed as false', () => {
  // Call sites build lines with `order.tracking && `Tracking: ${...}``, so
  // `false` and `undefined` arrive here routinely.
  const message = buildSendMessage('receipt', 'a@b.com', [
    'Order: X-1',
    false,
    undefined,
    null,
    '   ',
  ]);

  assert.doesNotMatch(message, /false|undefined|null/);
  assert.match(message, /Order: X-1/);
});

test('a send never proceeds by default outside a browser', () => {
  // No window means no operator saw a dialog, so nothing may be sent.
  assert.equal(typeof globalThis.window, 'undefined');
  assert.equal(confirmCustomerEmail('receipt', 'a@b.com'), false);
});
