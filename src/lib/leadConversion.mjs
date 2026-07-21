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

export function getLeadConversion(lead, orders = []) {
  if (!lead) return { converted: false };

  const leadEmails = uniqueValues([
    normalizeEmail(lead.contact_value),
    normalizeEmail(lead.email),
  ]);

  const leadPhoneTails = uniqueValues([
    normalizePhone(lead.contact_value),
    normalizePhone(lead.phone),
  ]
    .filter((phone) => phone.length >= 8)
    .map((phone) => phone.slice(-8)));

  if (leadEmails.length === 0 && leadPhoneTails.length === 0) {
    return { converted: false };
  }

  const match = (orders || []).find((order) => {
    if (!orderIsPaid(order)) return false;

    const orderEmails = uniqueValues([
      normalizeEmail(order.customer_email),
      normalizeEmail(order.email),
    ]);
    if (leadEmails.length > 0 && orderEmails.some((email) => leadEmails.includes(email))) {
      return true;
    }

    const orderPhoneTails = uniqueValues([
      normalizePhone(order.customer_phone),
      normalizePhone(order.phone),
    ]
      .filter((phone) => phone.length >= 8)
      .map((phone) => phone.slice(-8)));

    return leadPhoneTails.length > 0 && orderPhoneTails.some((phone) => leadPhoneTails.includes(phone));
  });

  return match ? { converted: true, order: match } : { converted: false };
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
