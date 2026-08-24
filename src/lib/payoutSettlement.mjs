export const PAYOUT_SETTLEMENT_STATUSES = ['Approved', 'Payment Initiated', 'Paid', 'Failed'];
export const PAYOUT_RESERVED_STATUSES = ['Approved', 'Payment Initiated', 'Paid', 'Failed'];

const clean = (value) => String(value ?? '').trim();

export function planPayoutSettlement(currentStatus, input = {}, now = new Date()) {
  const from = clean(currentStatus);
  const status = clean(input.status);
  const method = clean(input.paymentMethod);
  const reference = clean(input.paymentReference);
  const receiptUrl = clean(input.receiptUrl);
  const note = clean(input.note);
  const failureReason = clean(input.failureReason);
  const timestamp = now.toISOString();

  if (!PAYOUT_SETTLEMENT_STATUSES.includes(from)) {
    return { ok: false, status: 409, error: 'Only an approved payout can enter settlement.' };
  }
  if (from === 'Paid') {
    return { ok: false, status: 409, error: 'A paid payout is immutable. Record a separate adjustment instead.' };
  }
  if (!['Payment Initiated', 'Paid', 'Failed'].includes(status)) {
    return { ok: false, status: 400, error: 'Choose Payment Initiated, Paid, or Failed.' };
  }
  if (status !== 'Failed' && !method) {
    return { ok: false, status: 400, error: 'Payment method is required.' };
  }
  if (status === 'Paid' && !reference) {
    return { ok: false, status: 400, error: 'A payment reference is required before marking a payout Paid.' };
  }
  if (status === 'Failed' && !failureReason) {
    return { ok: false, status: 400, error: 'Describe why the payment failed.' };
  }

  return {
    ok: true,
    patch: {
      status,
      payment_method: method || null,
      payment_reference: reference || null,
      payment_receipt_url: receiptUrl || null,
      payment_note: note || null,
      payment_recorded_by: clean(input.recordedBy) || null,
      payment_initiated_at: status === 'Payment Initiated' ? timestamp : (input.paymentInitiatedAt || null),
      paid_at: status === 'Paid' ? timestamp : null,
      payment_failed_at: status === 'Failed' ? timestamp : null,
      payment_failure_reason: status === 'Failed' ? failureReason : null,
    },
  };
}

export function payoutStatusTone(status) {
  if (status === 'Paid') return 'paid';
  if (status === 'Payment Initiated') return 'initiated';
  if (status === 'Approved') return 'approved';
  if (status === 'Failed') return 'failed';
  if (status === 'Rejected') return 'rejected';
  return 'pending';
}
