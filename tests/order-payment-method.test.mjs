import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CARD_ATTEMPT_FIELDS,
  normalizeOrderPaymentMethod,
  orderPaymentIsSettled,
  paymentMethodActivity,
  paymentMethodLabel,
  paymentMethodPatch,
  planPaymentMethodChange,
} from '../src/lib/orderPaymentMethod.mjs';

const whatsappOrder = { payment_method: 'whatsapp', status: 'Pending' };

test('the case that prompted this: WhatsApp to card on a pending order', () => {
  const plan = planPaymentMethodChange(whatsappOrder, 'card');
  assert.equal(plan.ok, true);
  assert.equal(plan.from, 'whatsapp');
  assert.equal(plan.to, 'card');
  assert.equal(plan.clearsCardAttempt, false);
});

test('an unknown method is refused rather than written', () => {
  for (const value of ['', null, undefined, 'bitcoin', 'CARD ']) {
    const plan = planPaymentMethodChange(whatsappOrder, value);
    if (value === 'CARD ') {
      // Trimmed and lowercased — an agent's stray whitespace is not an error.
      assert.equal(plan.ok, true, 'CARD  should normalize');
    } else {
      assert.equal(plan.ok, false, String(value));
      assert.equal(plan.status, 400);
    }
  }
});

test('a paid order cannot have its method rewritten', () => {
  // The money already arrived one way. Changing the record afterwards would
  // misstate how, which is the kind of thing an accountant finds later.
  for (const order of [
    { payment_method: 'whatsapp', status: 'Paid' },
    { payment_method: 'whatsapp', status: 'Completed' },
    { payment_method: 'card', status: 'Pending', payment_provider_status: 'Approved' },
  ]) {
    const plan = planPaymentMethodChange(order, 'sinpe');
    assert.equal(plan.ok, false);
    assert.equal(plan.status, 409);
    assert.match(plan.error, /already paid/i);
  }
});

test('a cancelled order is refused with its own reason', () => {
  const plan = planPaymentMethodChange({ payment_method: 'whatsapp', status: 'Cancelled' }, 'card');
  assert.equal(plan.ok, false);
  assert.match(plan.error, /cancelled/i);
});

test('setting the method it already has is refused, not written as a no-op', () => {
  const plan = planPaymentMethodChange(whatsappOrder, 'whatsapp');
  assert.equal(plan.ok, false);
  assert.equal(plan.status, 409);
});

test('a declined card attempt does not trail onto the next method', () => {
  // Otherwise the order keeps its "Declined" badge and a transaction id that
  // has nothing to do with how it now gets paid.
  const order = {
    payment_method: 'card',
    status: 'Declined',
    payment_provider_status: 'Declined',
    payment_transaction_id: 'txn_123',
  };
  const plan = planPaymentMethodChange(order, 'whatsapp');
  assert.equal(plan.ok, true);
  assert.equal(plan.clearsCardAttempt, true);

  const patch = paymentMethodPatch(plan);
  assert.equal(patch.payment_method, 'whatsapp');
  for (const field of CARD_ATTEMPT_FIELDS) {
    assert.equal(patch[field], null, field);
  }
});

test('moving TO card leaves the provider fields alone', () => {
  const patch = paymentMethodPatch(planPaymentMethodChange(whatsappOrder, 'card'));
  assert.deepEqual(Object.keys(patch), ['payment_method']);
});

test('the activity line cannot move an order into another commission week', () => {
  // The weekly scan picks an order's period from the last activity_log entry
  // whose type is status_change and whose message mentions Paid or Complet.
  const entry = paymentMethodActivity(planPaymentMethodChange(whatsappOrder, 'card'), 'ana@peptides.com');
  assert.notEqual(entry.type, 'status_change');
  assert.doesNotMatch(entry.message, /Paid|Complet/);
  assert.equal(entry.by, 'ana@peptides.com');
  assert.match(entry.message, /WhatsApp to Credit card/);
});

test('settled detection reads both the status and the provider', () => {
  assert.equal(orderPaymentIsSettled({ status: 'Paid' }), true);
  assert.equal(orderPaymentIsSettled({ payment_provider_status: 'approved' }), true);
  assert.equal(orderPaymentIsSettled({ status: 'Pending' }), false);
  assert.equal(orderPaymentIsSettled({}), false);
});

test('labels and normalisation cover every method the shop uses', () => {
  assert.equal(normalizeOrderPaymentMethod('WhatsApp'), 'whatsapp');
  assert.equal(paymentMethodLabel('card'), 'Credit card');
  assert.equal(paymentMethodLabel('sinpe'), 'SINPE');
  assert.equal(paymentMethodLabel('paypal'), 'PayPal');
});
