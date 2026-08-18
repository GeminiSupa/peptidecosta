/**
 * Changing how an existing order will be paid.
 *
 * A customer who chose WhatsApp at checkout and then asks to pay by card used
 * to mean recreating the order by hand, which produces two records for one
 * sale — splitting the activity log, the agent attribution and the commission
 * the sale earns. Flipping the method on the order keeps all of that intact.
 *
 * Kept free of '@/lib' imports so tests/ can load it under `node --test`.
 */

export const ORDER_PAYMENT_METHODS = [
  { id: 'whatsapp', label: 'WhatsApp', icon: '💬' },
  { id: 'card', label: 'Credit card', icon: '💳' },
  { id: 'sinpe', label: 'SINPE', icon: '📱' },
  { id: 'paypal', label: 'PayPal', icon: '💳' },
];

const VALID = new Set(ORDER_PAYMENT_METHODS.map(method => method.id));

// Fields the card provider writes back. They describe one attempt at one
// method, so they cannot be allowed to trail behind onto another: a declined
// card attempt left in place would keep the order badged "Declined" after the
// customer has moved to SINPE, and payment_transaction_id would point at a
// transaction that no longer has anything to do with how this order was paid.
export const CARD_ATTEMPT_FIELDS = [
  'payment_transaction_id',
  'payment_provider_status',
  'payment_authorization',
  'payment_descriptor',
  'payment_provider_response',
];

export function normalizeOrderPaymentMethod(value) {
  const method = String(value || '').trim().toLowerCase();
  return VALID.has(method) ? method : null;
}

export function paymentMethodLabel(value) {
  const method = normalizeOrderPaymentMethod(value);
  return ORDER_PAYMENT_METHODS.find(entry => entry.id === method)?.label || (value || 'unknown');
}

/** Money has already moved, so the record of how it arrived must not change. */
export function orderPaymentIsSettled(order) {
  const status = String(order?.status || '').toLowerCase();
  const providerStatus = String(order?.payment_provider_status || '').toLowerCase();
  return status.includes('paid')
    || status.includes('complete')
    || providerStatus === 'approved'
    || providerStatus === 'completed';
}

/**
 * Decide whether an order's payment method may be changed, and to what.
 *
 * @returns {{ok: true, from: string, to: string, clearsCardAttempt: boolean}
 *          |{ok: false, error: string, status: number}}
 */
export function planPaymentMethodChange(order, requested) {
  const to = normalizeOrderPaymentMethod(requested);
  if (!to) {
    return {
      ok: false,
      status: 400,
      error: `Unknown payment method. Choose one of: ${ORDER_PAYMENT_METHODS.map(m => m.id).join(', ')}.`,
    };
  }

  const from = String(order?.payment_method || '').trim().toLowerCase() || 'unknown';
  if (from === to) {
    return { ok: false, status: 409, error: `This order is already set to ${paymentMethodLabel(to)}.` };
  }

  // A cancelled order should be reopened rather than quietly re-plumbed for a
  // payment nobody is expecting.
  if (String(order?.status || '').toLowerCase().includes('cancel')) {
    return { ok: false, status: 409, error: 'This order is cancelled. Reopen it before changing how it will be paid.' };
  }

  if (orderPaymentIsSettled(order)) {
    return {
      ok: false,
      status: 409,
      error: 'This order is already paid. Changing the method now would misstate how the money actually arrived.',
    };
  }

  return { ok: true, from, to, clearsCardAttempt: from === 'card' };
}

/** The row patch for an approved change. */
export function paymentMethodPatch(plan) {
  const patch = { payment_method: plan.to };
  if (plan.clearsCardAttempt) {
    for (const field of CARD_ATTEMPT_FIELDS) patch[field] = null;
  }
  return patch;
}

/**
 * The activity line.
 *
 * Deliberately not a `status_change`, and deliberately free of the words the
 * weekly commission scan looks for ("Paid", "Complet") when it decides which
 * week an order belongs to. A payment method change must not move an order
 * into a different commission period.
 */
export function paymentMethodActivity(plan, actorEmail) {
  return {
    type: 'payment_method_change',
    message: `Payment method changed from ${paymentMethodLabel(plan.from)} to ${paymentMethodLabel(plan.to)}`,
    by: actorEmail || 'admin',
  };
}
