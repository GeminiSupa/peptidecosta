// Every email an order sends, written onto the order itself.
//
// Until now nothing recorded a transactional send. `completion_notification_*`
// covers one email — the completion receipt — and an accounting-only resend
// deliberately leaves it alone, because that field describes what the customer
// received. So the honest answer to "did this customer get their receipt, and
// did PBAG get its copy?" was to go and read a mailbox. Twenty-one accounting
// copies were missing for two days before anyone could say which ones.
//
// These entries land in orders.activity_log, which already exists on every row
// and is already rendered in the order detail panel, so this needs no migration
// and no new screen. /api/admin/customer-timeline lifts them out again to build
// the per-contact history, next to the marketing deliveries it already shows.

// Explicit extension: this file is ESM and is loaded directly by node --test,
// which does not resolve extensionless paths the way the bundler does.
import { appendOrderActivity } from './orderActivity.js';

/** Human labels for the emails an order can send. */
const EMAIL_LABELS = {
  'admin-alert': 'Team order alert',
  'customer-receipt': 'Order receipt',
  'receipt-resend': 'Order receipt (resent)',
  'completion-receipt': 'Completion receipt',
  'accounting-copy': 'Accounting copy',
  'refund-notice': 'Refund notice',
  'payment-result': 'Payment result',
};

export function emailKindLabel(kind) {
  return EMAIL_LABELS[kind] || kind;
}

/**
 * One activity entry describing one email.
 *
 * A failure keeps its reason in the message: the reason is the whole value of
 * the entry, and a bare "failed" would send the reader back to the logs — which
 * is the position this is meant to end.
 */
export function orderEmailActivity({ kind, to = '', sent, error = '', skipped = '' }) {
  const label = emailKindLabel(kind);
  const target = String(to || '').trim();
  const suffix = target ? ` → ${target}` : '';

  if (skipped) {
    return { type: 'email', kind, ok: null, message: `${label} skipped (${skipped})` };
  }
  if (sent) {
    return { type: 'email', kind, ok: true, message: `${label} sent${suffix}` };
  }
  return {
    type: 'email',
    kind,
    ok: false,
    message: `${label} FAILED${suffix}${error ? ` — ${error}` : ''}`,
  };
}

/**
 * Write a batch of email entries onto one order. Never throws.
 *
 * Batched on purpose: a handler sends the team alert, the customer receipt and
 * the accounting copy in turn, and writing each one separately would mean three
 * read-modify-write cycles racing each other over the same JSONB column. One
 * write at the end of the handler keeps them all.
 *
 * Failing to record an email must never fail the send that already happened, so
 * every error here is logged and swallowed.
 */
export async function recordOrderEmails(supabase, order, entries, logPrefix = '[Order email log]') {
  const list = (entries || []).filter(Boolean);
  if (!supabase || !list.length) return { recorded: 0 };

  const id = order?.id || null;
  const orderNumber = order?.order_number || order?.orderNumber || null;
  if (!id && !orderNumber) return { recorded: 0 };

  try {
    let read = supabase.from('orders').select('id, activity_log');
    read = id ? read.eq('id', id) : read.eq('order_number', orderNumber);
    const { data: row, error: readError } = await read.maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!row) return { recorded: 0 };

    // Oldest first, so the newest email still ends up at the head of the log.
    let log = row.activity_log;
    for (const entry of list) log = appendOrderActivity(log, entry);

    const { error: writeError } = await supabase
      .from('orders')
      .update({ activity_log: log })
      .eq('id', row.id);
    if (writeError) throw new Error(writeError.message);

    return { recorded: list.length };
  } catch (error) {
    console.warn(`${logPrefix} Could not record email activity:`, error.message);
    return { recorded: 0, error: error.message };
  }
}
