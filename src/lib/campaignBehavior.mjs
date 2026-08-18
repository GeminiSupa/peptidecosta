/**
 * Behavioural targeting, layered on top of the four audience scopes.
 *
 * The scope answers "which list" — subscribers, leads, both. This answers
 * "which of them", from what they have actually done: opened, clicked, bought,
 * or gone quiet. Before this, targeting was tags only, so the one segment
 * everyone wants first — people who still read the mail — could not be
 * expressed at all, and re-engagement campaigns went to the whole list.
 *
 * A filter never widens an audience. It only ever removes people from the
 * scope, so it cannot mail someone the scope had excluded.
 */

export const ENGAGED_WINDOW_DAYS = 90;
export const DORMANT_WINDOW_DAYS = 180;

export const BEHAVIOR_FILTERS = [
  {
    id: 'none',
    label: 'Everyone in this group',
    hint: 'no behavioural filter',
  },
  {
    id: 'engaged',
    label: 'Opened or clicked recently',
    hint: `engaged in the last ${ENGAGED_WINDOW_DAYS} days`,
  },
  {
    id: 'clicked',
    label: 'Clicked recently',
    hint: `clicked a link in the last ${ENGAGED_WINDOW_DAYS} days`,
  },
  {
    id: 'dormant',
    label: 'Gone quiet',
    hint: `no open or click in ${DORMANT_WINDOW_DAYS} days — for win-back`,
  },
  {
    id: 'customers',
    label: 'Has ordered before',
    hint: 'at least one order on this address',
  },
  {
    id: 'prospects',
    label: 'Never ordered',
    hint: 'on the list, no order yet',
  },
];

const VALID = new Set(BEHAVIOR_FILTERS.map(filter => filter.id));

export function normalizeBehaviorFilter(value) {
  const filter = String(value || '').trim().toLowerCase();
  return VALID.has(filter) ? filter : 'none';
}

export function behaviorFilterLabel(value) {
  const filter = normalizeBehaviorFilter(value);
  return BEHAVIOR_FILTERS.find(entry => entry.id === filter)?.label || filter;
}

/** Whether a filter needs engagement history loaded to be resolved. */
export function behaviorNeedsEngagement(value) {
  return ['engaged', 'clicked', 'dormant'].includes(normalizeBehaviorFilter(value));
}

/** Whether a filter needs order history loaded to be resolved. */
export function behaviorNeedsOrders(value) {
  return ['customers', 'prospects'].includes(normalizeBehaviorFilter(value));
}

function withinDays(timestamp, days, now) {
  if (!timestamp) return false;
  const at = new Date(timestamp).getTime();
  if (!Number.isFinite(at)) return false;
  return now - at <= days * 24 * 60 * 60 * 1000;
}

/**
 * @param {object} signals what we know about this one address
 *   @param {string|null} signals.lastOpenAt
 *   @param {string|null} signals.lastClickAt
 *   @param {number} signals.orderCount
 */
export function matchesBehaviorFilter(filter, signals = {}, now = Date.now()) {
  const { lastOpenAt = null, lastClickAt = null, orderCount = 0 } = signals;

  switch (normalizeBehaviorFilter(filter)) {
    case 'engaged':
      return withinDays(lastOpenAt, ENGAGED_WINDOW_DAYS, now) || withinDays(lastClickAt, ENGAGED_WINDOW_DAYS, now);
    case 'clicked':
      return withinDays(lastClickAt, ENGAGED_WINDOW_DAYS, now);
    case 'dormant':
      // Someone who has never engaged counts as dormant: they are exactly who a
      // win-back campaign is for, and excluding them would leave the filter
      // meaning "used to be active", which is a different and smaller thing.
      return !withinDays(lastOpenAt, DORMANT_WINDOW_DAYS, now) && !withinDays(lastClickAt, DORMANT_WINDOW_DAYS, now);
    case 'customers':
      return orderCount > 0;
    case 'prospects':
      return orderCount === 0;
    case 'none':
    default:
      return true;
  }
}

/**
 * Fold raw event rows into a per-address signal map.
 * Keys are lowercase emails so subscribers, leads and orders can all meet.
 */
export function buildBehaviorSignals({ opens = [], clicks = [], orders = [], subscriberEmails = new Map() } = {}) {
  const signals = new Map();

  const entry = (email) => {
    const key = String(email || '').trim().toLowerCase();
    if (!key) return null;
    if (!signals.has(key)) signals.set(key, { lastOpenAt: null, lastClickAt: null, orderCount: 0 });
    return signals.get(key);
  };

  const laterOf = (a, b) => (!a || String(b) > String(a) ? b : a);

  for (const row of opens) {
    const record = entry(subscriberEmails.get(row.subscriber_id));
    if (record) record.lastOpenAt = laterOf(record.lastOpenAt, row.created_at);
  }
  for (const row of clicks) {
    const record = entry(subscriberEmails.get(row.subscriber_id));
    if (record) record.lastClickAt = laterOf(record.lastClickAt, row.created_at);
  }
  for (const row of orders) {
    const record = entry(row.customer_email || row.email);
    if (record) record.orderCount += 1;
  }

  return signals;
}

export function signalsFor(signalMap, email) {
  return signalMap.get(String(email || '').trim().toLowerCase())
    || { lastOpenAt: null, lastClickAt: null, orderCount: 0 };
}
