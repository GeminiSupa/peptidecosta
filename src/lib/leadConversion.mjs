const PAID_ORDER_STATUSES = new Set([
  'paid',
  'completed',
  'order complete',
  'processing',
]);

export function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return email.includes('@') ? email : '';
}

export function normalizePhone(value) {
  return String(value || '').replace(/[^0-9]/g, '');
}

export function orderIsPaid(order) {
  const status = String(order?.status || '').trim().toLowerCase();
  if (PAID_ORDER_STATUSES.has(status)) return true;
  if (status.includes('complete')) return true;
  if (status.includes('payment received')) return true;
  if (/\bpaid\b/.test(status)) {
    return !status.includes('unpaid') && !status.includes('not paid') && !status.includes('pending');
  }
  return false;
}

function uniqueValues(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function phoneTails(values) {
  return uniqueValues(values.map(normalizePhone).filter((phone) => phone.length >= 8).map((phone) => phone.slice(-8)));
}

function contactEmails(record, fields) {
  return uniqueValues(fields.map((field) => normalizeEmail(record?.[field])));
}

/**
 * Indexes the paid orders by the identities a lead can be matched on.
 *
 * Re-scanning every order for every lead is O(leads x orders) — on live data
 * that is ~2.9M string comparisons, and because the admin dashboard recomputed
 * it on every render, a single keystroke anywhere froze the page for seconds.
 * Build this once per orders list and each lead becomes two map lookups.
 *
 * `position` is the order's place in the original list, so a lead that matches
 * several orders still resolves to the same one the old linear scan returned.
 */
export function createPaidOrderIndex(orders = []) {
  const byEmail = new Map();
  const byPhoneTail = new Map();

  (orders || []).forEach((order, position) => {
    if (!orderIsPaid(order)) return;

    for (const email of contactEmails(order, ['customer_email', 'email'])) {
      if (!byEmail.has(email)) byEmail.set(email, { order, position });
    }
    for (const tail of phoneTails([order?.customer_phone, order?.phone])) {
      if (!byPhoneTail.has(tail)) byPhoneTail.set(tail, { order, position });
    }
  });

  return { byEmail, byPhoneTail, isPaidOrderIndex: true };
}

function asPaidOrderIndex(ordersOrIndex) {
  return ordersOrIndex?.isPaidOrderIndex ? ordersOrIndex : createPaidOrderIndex(ordersOrIndex);
}

/** Accepts either a raw orders array or a createPaidOrderIndex() result. */
export function getLeadConversion(lead, ordersOrIndex = []) {
  if (!lead) return { converted: false };

  const leadEmails = contactEmails(lead, ['contact_value', 'email']);
  const leadPhoneTails = phoneTails([lead.contact_value, lead.phone]);
  if (leadEmails.length === 0 && leadPhoneTails.length === 0) {
    return { converted: false };
  }

  const index = asPaidOrderIndex(ordersOrIndex);
  let match = null;
  const consider = (hit) => {
    if (hit && (!match || hit.position < match.position)) match = hit;
  };
  for (const email of leadEmails) consider(index.byEmail.get(email));
  for (const tail of leadPhoneTails) consider(index.byPhoneTail.get(tail));

  return match ? { converted: true, order: match.order } : { converted: false };
}

export function leadIsActiveForPipeline(lead, ordersOrIndex = []) {
  return !getLeadConversion(lead, ordersOrIndex).converted;
}

function parseDateMs(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function orderCouldResolveCart(cart, order, { ignoreTiming = false } = {}) {
  if (ignoreTiming) return true;

  const cartTime = parseDateMs(cart?.created_at || cart?.last_updated);
  const orderTime = parseDateMs(order?.created_at);

  if (cartTime === null || orderTime === null) return true;

  const twoHoursMs = 2 * 60 * 60 * 1000;
  return orderTime >= cartTime - twoHoursMs;
}

export function getAbandonedCartConversion(cart, orders = [], options = {}) {
  if (!cart) return { converted: false };

  const cartEmails = uniqueValues([
    normalizeEmail(cart.customer_email),
    normalizeEmail(cart.user_email),
    normalizeEmail(cart.email),
  ]);

  const cartPhoneTails = uniqueValues([
    normalizePhone(cart.customer_phone),
    normalizePhone(cart.user_phone),
    normalizePhone(cart.phone),
  ]
    .filter((phone) => phone.length >= 8)
    .map((phone) => phone.slice(-8)));

  if (cartEmails.length === 0 && cartPhoneTails.length === 0) {
    return { converted: false };
  }

  const match = (orders || []).find((order) => {
    if (!orderIsPaid(order) || !orderCouldResolveCart(cart, order, options)) return false;

    const orderEmails = uniqueValues([
      normalizeEmail(order.customer_email),
      normalizeEmail(order.email),
    ]);
    if (cartEmails.length > 0 && orderEmails.some((email) => cartEmails.includes(email))) {
      return true;
    }

    const orderPhoneTails = uniqueValues([
      normalizePhone(order.customer_phone),
      normalizePhone(order.phone),
    ]
      .filter((phone) => phone.length >= 8)
      .map((phone) => phone.slice(-8)));

    return cartPhoneTails.length > 0 && orderPhoneTails.some((phone) => cartPhoneTails.includes(phone));
  });

  return match ? { converted: true, order: match } : { converted: false };
}
