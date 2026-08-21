// Server-side guard against double-charging a card order.
//
// The front-end submit locks stop the common double-click, but two requests can
// still reach the gateway at once — two tabs, a retry after a slow response, or a
// flaky connection resending. A "read status, then charge" check cannot stop that
// because both requests read "not paid yet" before either charges.
//
// This uses an atomic compare-and-swap on the order row instead. Claiming flips
// the status to PROCESSING_STATUS in a single UPDATE that only matches rows which
// are neither already settled nor already being processed. Postgres serialises the
// two UPDATEs on the same row, so exactly one request matches and wins the claim;
// the loser matches zero rows and is rejected. The winner charges once, then its
// terminal status update (Paid/Declined/…) releases the lock.

export const PROCESSING_STATUS = 'Processing - Card';

// The status the order returns to if a charge attempt throws before reaching a
// terminal status — a plain "awaiting card payment" state the customer can retry.
const DEFAULT_RETRY_STATUS = 'Pending - Card';

/**
 * Atomically claim an order for card processing.
 * Only one concurrent caller can win; the rest get { claimed: false }.
 *
 * The winner also gets the order's stored money columns back, because the
 * charge that follows must be priced from the database rather than from the
 * request that asked for it. The UPDATE already returns the row it changed, so
 * carrying the amount out of here costs nothing and removes the need for a
 * separate "what is this order worth" read that a caller could forget to do.
 *
 * @returns {Promise<{ claimed: boolean, order?: object, error?: any }>}
 */
export async function claimOrderForPayment(supabase, orderNumber) {
  if (!supabase || !orderNumber) return { claimed: false };

  // Compare-and-swap: match only rows that are not already paid/complete and not
  // already locked, then flip them to PROCESSING_STATUS. `.select()` returns the
  // rows this UPDATE actually changed — one row means we won, zero means we lost.
  const { data, error } = await supabase
    .from('orders')
    .update({ status: PROCESSING_STATUS })
    .eq('order_number', orderNumber)
    .not('status', 'ilike', '%paid%')
    .not('status', 'ilike', '%complete%')
    .neq('status', PROCESSING_STATUS)
    .select('order_number, total_usd, total_crc, currency');

  if (error) return { claimed: false, error };
  const claimed = Array.isArray(data) && data.length > 0;
  return claimed ? { claimed: true, order: data[0] } : { claimed: false };
}

/**
 * Release a claim by restoring a retryable status — but only if the row is still
 * in PROCESSING_STATUS, so this never clobbers a terminal status that the charge
 * or a webhook may have already written.
 */
export async function releaseOrderClaim(supabase, orderNumber, restoreStatus = DEFAULT_RETRY_STATUS) {
  if (!supabase || !orderNumber) return;
  try {
    await supabase
      .from('orders')
      .update({ status: restoreStatus })
      .eq('order_number', orderNumber)
      .eq('status', PROCESSING_STATUS);
  } catch (err) {
    console.error('[cardPaymentLock] Failed to release claim:', err?.message || err);
  }
}

/**
 * Explain why a claim failed, for an accurate HTTP response.
 * @returns {Promise<'settled'|'processing'|'not_found'|'other'>}
 */
export async function describeOrderPaymentState(supabase, orderNumber) {
  if (!supabase || !orderNumber) return 'other';
  const { data } = await supabase
    .from('orders')
    .select('status')
    .eq('order_number', orderNumber)
    .maybeSingle();

  if (!data) return 'not_found';
  const s = String(data.status || '').toLowerCase();
  if (s.includes('paid') || s.includes('complete')) return 'settled';
  if (data.status === PROCESSING_STATUS) return 'processing';
  return 'other';
}
