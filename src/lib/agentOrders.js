/** Lowercase keys used to match order.sales_agent to a profile. */
export function agentMatchKeys(profile) {
  const keys = new Set();
  if (!profile) return keys;
  const name = String(profile.name || '').trim().toLowerCase();
  const email = String(profile.email || '').trim().toLowerCase();
  if (name) keys.add(name);
  if (email) {
    keys.add(email);
    const local = email.split('@')[0];
    if (local) keys.add(local);
  }
  return keys;
}

/** Order is credited to this agent (for pay / commission). */
export function orderBelongsToAgent(order, profile) {
  if (!order || !profile) return false;
  const orderAgent = String(order.sales_agent || '').trim().toLowerCase();
  if (!orderAgent) return false;
  return agentMatchKeys(profile).has(orderAgent);
}

/** Orders tab: own assigned orders + unassigned (no sales_agent). */
export function filterOrdersVisibleToAgent(orders, profile) {
  if (!profile || profile.is_superadmin) return orders || [];
  return (orders || []).filter((o) => {
    const agent = String(o.sales_agent || '').trim();
    if (!agent) return true;
    return orderBelongsToAgent(o, profile);
  });
}

/** Strict filter — only orders assigned to this agent (My Pay, earnings). */
export function filterOrdersForAgent(orders, profile) {
  if (!profile || profile.is_superadmin) return orders || [];
  return (orders || []).filter((o) => orderBelongsToAgent(o, profile));
}

export function getOrderSalesAmounts(order) {
  let usd = Number(order.total_usd || 0);
  let crc = Number(order.total_crc || 0);
  if (!usd && !crc && order.total != null) {
    const total = Number(order.total || 0);
    if (order.currency === 'USD') usd = total;
    else crc = total;
  }
  return { usd, crc };
}

export function orderVisibleToAgent(order, profile) {
  if (!profile || profile.is_superadmin) return true;
  const agent = String(order?.sales_agent || '').trim();
  if (!agent) return true;
  return orderBelongsToAgent(order, profile);
}
