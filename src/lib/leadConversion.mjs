const PAID_ORDER_STATUSES = new Set([
  'paid',
  'completed',
  'order complete',
  'processing',
]);

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return email.includes('@') ? email : '';
}

function normalizePhone(value) {
  return String(value || '').replace(/[^0-9]/g, '');
}

function orderIsPaid(order) {
  return PAID_ORDER_STATUSES.has(String(order?.status || '').trim().toLowerCase());
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
