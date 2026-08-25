/**
 * Keeps a returning customer with the agent who first closed them.
 *
 * Every company WhatsApp number was banned, and the sales team lost the chat
 * history that told them whose customer was whose. This rebuilds that ownership
 * from the order book instead: match a new lead or order to past orders on the
 * same phone OR the same email, and credit the agent who closed the earliest
 * one.
 *
 * Two rules decide money, and both were set by the client:
 *
 *  1. Earliest closed order wins. If a customer's phone points at one agent and
 *     their email at another, whoever closed first keeps them.
 *  2. A referral link wins for the order it came in on. History only fills the
 *     gap when an order arrives with no agent attached, so this can never
 *     overwrite — or double up on — an existing referral payout.
 *
 * Deliberately dependency-free: `agentOrders.js` imports the `@/` alias, which
 * only resolves inside the Next bundler, so the status list lives here where
 * the unit tests can reach it and `agentOrders.js` imports it back.
 */

/**
 * An order only counts as "closed" once it reaches one of these statuses.
 *
 * 'Partly Refunded' belongs here even though money went back. The agent still
 * closed a sale — the customer kept part of it — and Omer's rule is that they
 * earn on the part that stuck. Leaving it out would pay them nothing on an
 * order the customer largely kept. What stops them earning on the returned
 * portion is getOrderSalesAmounts, which nets refunds off the sale before any
 * rate is applied.
 *
 * 'Refunded' is deliberately absent: nothing was kept, so there is no sale to
 * report and a zero-value line would only clutter the statement.
 *
 * 'Paid' belongs here because a cleared payment is reportable revenue even
 * before fulfilment changes the order to Completed. This list is shared by
 * revenue, agent commissions and affiliate payouts so all three reports count
 * the same order statuses.
 */
export const COMMISSION_ELIGIBLE_ORDER_STATUSES = ['Paid', 'Completed', 'Order Complete', 'Partly Refunded'];

const ELIGIBLE_STATUSES = new Set(
  COMMISSION_ELIGIBLE_ORDER_STATUSES.map((status) => status.toLowerCase()),
);

/** Attribution written by this module, so payout reports can tell it apart. */
export const CUSTOMER_HISTORY_SOURCE = 'customer_history';

export function isClosedOrder(order) {
  return ELIGIBLE_STATUSES.has(String(order?.status || '').trim().toLowerCase());
}

/**
 * Last 8 digits, matching how the abandoned-cart cleanup already matches phones
 * in api/orders/create. Costa Rican numbers are 8 digits, so this treats
 * +506 8404 6973, 50684046973 and 8404-6973 as one person regardless of how
 * each agent typed it. Shorter than 8 digits is too weak to own a customer on.
 */
export function phoneKey(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length >= 8 ? digits.slice(-8) : '';
}

/**
 * A LIKE pattern for a phone key that survives however the number was typed.
 *
 * `orders.customer_phone` is free text and real rows include "8878-9080",
 * "83-81-63-11", "8324 8738" and "+(619)6515619". A plain `%88789080%` never
 * matches any of those, so returning customers whose number was saved with
 * separators silently lost their agent.
 *
 * Wildcards go between every digit instead, which matches the digits in order
 * regardless of what sits between them. It is deliberately loose: it can pull
 * extra rows, and `buildAgentHistory` re-derives the strict 8-digit key from
 * each row, so a near-miss is dropped in JS rather than credited.
 */
export function phoneLikePattern(key) {
  const digits = String(key ?? '').replace(/\D/g, '');
  return digits ? `%${digits.split('').join('%')}%` : '';
}

export function emailKey(value) {
  const email = String(value ?? '').trim().toLowerCase();
  return email.includes('@') ? email : '';
}

/**
 * Splits a `catalog_leads` row into the two keys attribution matches on.
 *
 * The table stores one free-text `contact_value` plus a `contact_method`, so
 * which of the two it holds has to be worked out before it can be looked up.
 * The `@` check overrules `contact_method`: the catalog gate takes one field
 * for "WhatsApp or email" and tags plenty of addresses as 'whatsapp'.
 */
export function contactKeysFor(contactMethod, contactValue) {
  const value = String(contactValue ?? '').trim();
  if (!value) return { phone: '', email: '' };
  if (contactMethod === 'email' || value.includes('@')) return { phone: '', email: value };
  return { phone: value, email: '' };
}

function orderClosedAt(order) {
  const raw = order?.created_at || order?.updated_at || order?.order_date || null;
  const time = raw ? new Date(raw).getTime() : NaN;
  return Number.isNaN(time) ? Infinity : time;
}

function agentName(order) {
  return String(order?.sales_agent || '').trim();
}

/**
 * Collapses the ways one agent is written on an order into their profile name.
 *
 * `orders.sales_agent` is free text, and some closed orders carry an agent's
 * email instead of their name. Left alone, "korinneda@icloud.com" would read as
 * a different person from "Korinne" and split her customers across two owners.
 *
 * Falls back to the original text so an agent who has since left the team still
 * matches their own past orders rather than vanishing from the history.
 */
export function buildAgentNameResolver(profiles) {
  const byKey = new Map();

  for (const profile of Array.isArray(profiles) ? profiles : []) {
    const name = String(profile?.name || '').trim();
    const email = String(profile?.email || '').trim().toLowerCase();
    const canonical = name || email;
    if (!canonical) continue;

    if (name) byKey.set(name.toLowerCase(), canonical);
    if (email) {
      byKey.set(email, canonical);
      const local = email.split('@')[0];
      if (local) byKey.set(local, canonical);
    }
  }

  return (value) => {
    const raw = String(value || '').trim();
    return byKey.get(raw.toLowerCase()) || raw;
  };
}

/**
 * Folds the order book into `contact key -> earliest closing agent`.
 *
 * Both the phone key and the email key of an order point at the same entry, so
 * a customer who later orders with only one of the two is still recognised.
 */
/**
 * Contact details that turned out to belong to more than one person.
 *
 * The order book is full of them. `abc@abc.com` sits on 24 different
 * customers, `korinneda@icloud.com` on 13 — an agent's own address typed into
 * the customer field — `info@peptidescostarica.net` on 3, and 41 phone numbers
 * are shared the same way. Treating those as an identity would hand every one
 * of those customers to whoever happened to close the earliest of them.
 *
 * Nothing is hard-coded: a key is disqualified when the order book itself
 * shows it against two different people. A customer's own details naturally
 * stay with one person and survive.
 *
 * Deliberately quick to disqualify. A false positive costs one attribution an
 * agent can still make by hand; a false negative pays the wrong person.
 */
/** Spanish name particles, which carry no identity on their own. */
const NAME_PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'da', 'do', 'dos', 'van', 'von']);

/**
 * The meaningful words of a name, accent- and case-insensitive.
 *
 * "Mariela Álvarez" and "mariela alvarez campos" have to reduce to overlapping
 * words, or the same person reads as two.
 */
export function nameTokens(value) {
  return new Set(
    String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length >= 3 && !NAME_PARTICLES.has(word)),
  );
}

/**
 * Whether two names on one contact detail can be the same human.
 *
 * One shared word is enough. Two strangers who happen to share a phone almost
 * never also share a name word, while one person's own orders routinely differ
 * by a middle name, an abbreviated surname or a nickname — "kenneth alfaro h"
 * and "kenneth alfaro hutchinson", "elodie" and "elodie ramirez".
 *
 * A nameless order is not evidence of anybody, so it matches whatever it sits
 * beside rather than inventing a second person.
 */
function couldBeSamePerson(a, b) {
  if (a.size === 0 || b.size === 0) return true;
  for (const word of a) if (b.has(word)) return true;
  return false;
}

/** How many distinct people a contact detail appears to belong to. */
function distinctPeopleOn(nameSets) {
  const clusters = [];
  for (const tokens of nameSets) {
    const hit = clusters.find((cluster) => cluster.some((seen) => couldBeSamePerson(seen, tokens)));
    if (hit) hit.push(tokens);
    else clusters.push([tokens]);
  }
  return clusters.length;
}

export function findAmbiguousContactKeys(orders) {
  const names = new Map();
  const counterparts = new Map();

  for (const order of Array.isArray(orders) ? orders : []) {
    if (!isClosedOrder(order)) continue;
    const phone = phoneKey(order?.customer_phone);
    const email = emailKey(order?.customer_email);
    const tokens = nameTokens(order?.customer_name);

    for (const key of [phone, email]) {
      if (!key) continue;
      if (!names.has(key)) names.set(key, []);
      names.get(key).push(tokens);
    }
    // Kept only as a backstop for rows with no usable name — see below.
    for (const [key, other] of [[phone, email], [email, phone]]) {
      if (!key || !other) continue;
      if (!counterparts.has(key)) counterparts.set(key, new Set());
      counterparts.get(key).add(other);
    }
  }

  const ambiguous = new Set();
  for (const [key, nameSets] of names) {
    if (distinctPeopleOn(nameSets) > 1) ambiguous.add(key);
  }
  // A detail carrying three or more different counterparts is a placeholder
  // even when the names are blank or unreadable. Two is left alone: a real
  // customer having a second email address is ordinary, and treating that as
  // two people is what stripped 26 customers of their agent.
  for (const [key, seen] of counterparts) {
    if (seen.size >= 3) ambiguous.add(key);
  }
  return ambiguous;
}

export function buildAgentHistory(orders, { resolveAgent = (value) => value } = {}) {
  const history = new Map();
  const ambiguous = findAmbiguousContactKeys(orders);

  for (const order of Array.isArray(orders) ? orders : []) {
    if (!isClosedOrder(order)) continue;
    const agent = resolveAgent(agentName(order));
    if (!agent) continue;

    const closedAt = orderClosedAt(order);
    for (const key of [phoneKey(order?.customer_phone), emailKey(order?.customer_email)]) {
      if (!key || ambiguous.has(key)) continue;
      const current = history.get(key);
      // Strictly earlier only: the first agent to close keeps the customer, so
      // a later order by another agent never takes them over.
      if (!current || closedAt < current.closedAt) {
        history.set(key, { agent, closedAt });
      }
    }
  }

  return history;
}

/**
 * Resolves the owning agent for a contact, or null when the customer is new.
 *
 * When phone and email disagree, the earlier close wins. On an exact tie the
 * email match is preferred, matching the lead routes, which already treat email
 * as the more stable identity.
 */
export function findHistoricalAgent(history, { phone, email } = {}) {
  if (!(history instanceof Map) || history.size === 0) return null;

  const byPhone = history.get(phoneKey(phone)) || null;
  const byEmail = history.get(emailKey(email)) || null;

  if (!byPhone) return byEmail;
  if (!byEmail) return byPhone;
  return byPhone.closedAt < byEmail.closedAt ? byPhone : byEmail;
}

/**
 * The fields to merge into an order, or null to leave it untouched.
 *
 * Returns nothing when the order already has an agent — that is the referral
 * link winning. The commission rate is deliberately NOT overridden: the 20%
 * override belongs to referral links, so a history-attributed order pays the
 * standard rate and stays visible as a separate source in the payout report.
 */
export function historicalAttributionFor(order, history) {
  if (!order || agentName(order)) return null;

  const match = findHistoricalAgent(history, {
    phone: order.customer_phone,
    email: order.customer_email,
  });
  if (!match) return null;

  return {
    sales_agent: match.agent,
    agent_commission_source: CUSTOMER_HISTORY_SOURCE,
  };
}

/**
 * Fetches just this customer's closed orders and resolves their agent.
 *
 * Checkout is on the critical path, so this narrows to the two contact keys
 * rather than reading the order book. The Supabase client is a parameter so the
 * tests can drive it with a stub.
 */
export async function lookupHistoricalAgent(supabase, { phone, email, resolveAgent } = {}) {
  const phoneMatch = phoneKey(phone);
  const emailMatch = emailKey(email);
  if (!supabase || (!phoneMatch && !emailMatch)) return null;

  // customer_name is fetched so findAmbiguousContactKeys can still tell two
  // people apart here, not just in the backfill.
  const columns = 'sales_agent, status, created_at, customer_name, customer_phone, customer_email';
  const queries = [];
  if (phoneMatch) {
    queries.push(supabase
      .from('orders')
      .select(columns)
      .in('status', COMMISSION_ELIGIBLE_ORDER_STATUSES)
      .ilike('customer_phone', phoneLikePattern(phoneMatch)));
  }
  if (emailMatch) {
    // ilike without wildcards is an exact match that ignores casing, so an
    // address saved as Joe@Example.com still matches.
    queries.push(supabase
      .from('orders')
      .select(columns)
      .in('status', COMMISSION_ELIGIBLE_ORDER_STATUSES)
      .ilike('customer_email', emailMatch));
  }

  const results = await Promise.all(queries);
  const orders = results.flatMap((result) => result?.data || []);
  const history = buildAgentHistory(orders, resolveAgent ? { resolveAgent } : undefined);
  return findHistoricalAgent(history, { phone, email });
}

/** Same resolution for a CRM lead, which carries one contact value, not two. */
export function historicalAgentForLead(lead, history) {
  if (!lead) return null;
  const value = lead.contact_value ?? '';
  const match = findHistoricalAgent(history, {
    phone: lead.phone ?? value,
    email: lead.email ?? value,
  });
  return match ? match.agent : null;
}
