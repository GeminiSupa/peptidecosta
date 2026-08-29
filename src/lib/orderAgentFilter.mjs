export const ALL_ORDER_AGENTS = 'all';
export const UNASSIGNED_ORDER_AGENT = 'unassigned';

const normalizeAgent = (value) => String(value || '').trim().toLowerCase();

export function orderAgentFilterValue(agent) {
  return `agent:${String(agent || '').trim()}`;
}

/** Include active agents plus historic owners still present on loaded orders. */
export function orderAgentFilterOptions(agents = [], orders = [], currentAgentName = '') {
  const byIdentity = new Map();
  const values = [
    currentAgentName,
    ...(Array.isArray(agents) ? agents : []),
    ...(Array.isArray(orders) ? orders.map((order) => order?.sales_agent) : []),
  ];

  for (const value of values) {
    const label = String(value || '').trim();
    const identity = normalizeAgent(label);
    if (identity && !byIdentity.has(identity)) byIdentity.set(identity, label);
  }

  return [...byIdentity.values()]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map((label) => ({ label, value: orderAgentFilterValue(label) }));
}

export function orderMatchesAgentFilter(order, filter) {
  if (!filter || filter === ALL_ORDER_AGENTS) return true;
  const assignedAgent = normalizeAgent(order?.sales_agent);
  if (filter === UNASSIGNED_ORDER_AGENT) return !assignedAgent;
  if (!String(filter).startsWith('agent:')) return true;
  return assignedAgent === normalizeAgent(String(filter).slice('agent:'.length));
}
