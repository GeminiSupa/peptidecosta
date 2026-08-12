/** Append an entry to an order's activity_log JSONB array. */
export function appendOrderActivity(existingLog, entry) {
  const log = Array.isArray(existingLog) ? [...existingLog] : [];
  log.unshift({
    at: new Date().toISOString(),
    ...entry,
  });
  return log.slice(0, 100);
}

export function formatActivityType(type) {
  const labels = {
    created: 'Order created',
    status_change: 'Status updated',
    note: 'Note added',
    tracking: 'Tracking updated',
    payment_proof: 'Payment proof uploaded',
    manual_entry: 'Manual order entry',
    shipping_cost: 'Shipping cost updated',
    contact_updated: 'Customer contact updated',
    items_updated: 'Order items updated',
    manual_discount_applied: 'Order discount applied',
    manual_discount_removed: 'Order discount removed',
  };
  return labels[type] || type;
}
