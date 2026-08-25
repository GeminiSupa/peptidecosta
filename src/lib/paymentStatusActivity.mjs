import { appendOrderActivity } from './orderActivity.js';

/**
 * Add the audit entry that accompanies a gateway-driven status transition.
 *
 * Admin status changes already write this entry, but the three Shield Hub Pay
 * paths update the database directly. Keeping the patch construction here
 * makes duplicate webhooks idempotent and stops one payment path from silently
 * losing the history while the others retain it.
 */
export function withPaymentStatusActivity(
  order,
  patch,
  { by = 'Shield Hub Pay' } = {},
) {
  const nextStatus = String(patch?.status || '').trim();
  const currentStatus = String(order?.status || '').trim();
  if (!nextStatus || nextStatus === currentStatus) return { ...patch };

  return {
    ...patch,
    activity_log: appendOrderActivity(order?.activity_log, {
      type: 'status_change',
      message: `Status changed to ${nextStatus}`,
      by,
    }),
  };
}
