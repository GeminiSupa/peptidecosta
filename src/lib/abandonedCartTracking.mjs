// Abandoned-cart tracking rules.
//
// This table used to be written straight from the browser under a
// `FOR ALL TO public USING (true)` policy plus `GRANT ALL ... TO anon`. Because
// the anon key ships inside the JS bundle, that combination let anyone read
// every shopper's name, phone, email, IP, geolocation, device string and cart
// contents — and delete the table row by row. The storefront now goes through
// /api/cart/track on the service role instead, so those grants can be revoked.
//
// The rules live here, apart from the route, so they can be tested without a
// database or a request.

// Ids are minted by the browser as `session_<random>` and also arrive from
// recovery links. Bound the shape so a session id cannot smuggle in something
// unexpected, while staying permissive enough for historical ids.
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export function isValidSessionId(value) {
  return SESSION_ID_PATTERN.test(String(value ?? ''));
}

/**
 * Is this cart worth a row?
 *
 * A cart with no name, phone or email cannot be recovered — nobody can be
 * contacted about it — so storing one only accumulates personal data (IP,
 * geolocation, device) about someone who can never be mailed. This mirrors the
 * check the catalog already made before writing.
 */
export function shouldTrackCart({ customerName, customerPhone, customerEmail } = {}) {
  return Boolean(
    String(customerName || '').trim()
    || String(customerPhone || '').trim()
    || String(customerEmail || '').trim(),
  );
}

const clean = (value) => {
  const trimmed = String(value ?? '').trim();
  return trimmed || null;
};

/**
 * The row written for an active cart.
 *
 * `ip_address` and `device_info` are taken from the request rather than the
 * body. The browser used to self-report both, which meant the CRM's "where did
 * this shopper come from" column was whatever the page chose to send. The
 * request headers are the only version of those two facts a client cannot
 * rewrite. Geolocation still comes from the body — it is looked up client-side
 * against a geo API and has no server-side equivalent here.
 */
export function buildAbandonedCartRow({
  sessionId,
  cart,
  customerName,
  customerPhone,
  customerEmail,
  metadata,
  lang,
  currency,
  requestIp,
  userAgent,
} = {}) {
  return {
    session_id: sessionId,
    cart_data: Array.isArray(cart) ? cart : [],
    customer_name: clean(customerName),
    customer_phone: clean(customerPhone),
    customer_email: clean(customerEmail),
    ip_address: clean(requestIp) || clean(metadata?.ip_address),
    location_data: metadata?.location_data || null,
    device_info: clean(userAgent) || clean(metadata?.device_info),
    last_updated: new Date().toISOString(),
    status: 'active',
    lang: lang === 'en' ? 'en' : 'es',
    currency: currency === 'USD' ? 'USD' : 'CRC',
  };
}

/**
 * What a recovery link is allowed to read back.
 *
 * Deliberately not `select('*')`. A recovery URL is a capability — whoever
 * holds the link gets the row — so it returns only the fields the checkout form
 * repopulates, and never the IP, geolocation or device fingerprint the CRM
 * stores alongside them.
 */
export function recoveredCartPayload(row) {
  if (!row) return null;
  return {
    session_id: row.session_id,
    cart_data: Array.isArray(row.cart_data) ? row.cart_data : [],
    customer_name: row.customer_name || null,
    customer_phone: row.customer_phone || null,
    customer_email: row.customer_email || null,
  };
}
