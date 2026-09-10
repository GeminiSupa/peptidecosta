/**
 * The abuse limits that guard the public checkout.
 *
 * Two different jobs, deliberately kept apart, because conflating them is what
 * locked a real customer out of the shop for a day:
 *
 *   - The IP limit counts ATTEMPTS. Its job is to stop one machine hammering
 *     the endpoint, so a refused attempt has to count — that is the thing it
 *     exists to notice.
 *
 *   - The email and phone limits count ORDERS THAT SAVED. Their job is to cap
 *     how much one person can buy in a day, and an attempt the server itself
 *     refused is not a purchase. Counting those meant a customer stuck behind
 *     a bug spent her whole daily allowance on failures and was then told,
 *     wrongly, to press the button again.
 *
 * The caller therefore peeks at the contact limits, does the work, and consumes
 * from them only once an order row exists.
 */

/**
 * Attempts per IP address per hour.
 *
 * Held high on purpose. Costa Rican mobile carriers put large numbers of
 * subscribers behind a single public address, so this counter sees a whole
 * carrier's customers as one visitor. Set tight it blocks strangers for each
 * other's traffic; this is a bot brake, and the contact limits below are what
 * actually cap a person.
 */
export const ORDER_ATTEMPTS_PER_IP_PER_HOUR = 40;

/** Saved orders per email address, and separately per phone number, per day. */
export const ORDERS_PER_CONTACT_PER_DAY = 15;

export const ORDER_IP_WINDOW_SECONDS = 60 * 60;
export const ORDER_CONTACT_WINDOW_SECONDS = 24 * 60 * 60;

/** Digits only, so +506 8706-3824 and 50687063824 are one person. */
export function normalizeOrderPhoneKey(phone) {
  return String(phone || '').replace(/\D/g, '');
}

export function normalizeOrderEmailKey(email) {
  return String(email || '').trim().toLowerCase();
}

/**
 * The per-person limits this order has to clear.
 *
 * Email and phone are separate buckets rather than one combined key. A single
 * key let anyone reset their allowance by changing one character of their email
 * address, and it is also not what was asked for: the rule is fifteen a day for
 * this email AND fifteen a day for this phone number.
 *
 * A bucket is only returned when its value is present. An absent email would
 * otherwise hash to the same empty key for every guest on the site and put all
 * of them into one shared allowance — the exact failure this module exists to
 * prevent, arrived at from the other direction.
 */
export function orderContactLimits(order) {
  const limits = [];

  const email = normalizeOrderEmailKey(order?.customer_email);
  if (email) {
    limits.push({
      bucket: 'order-create-email',
      key: email,
      limit: ORDERS_PER_CONTACT_PER_DAY,
      windowSeconds: ORDER_CONTACT_WINDOW_SECONDS,
    });
  }

  const phone = normalizeOrderPhoneKey(order?.customer_phone);
  if (phone) {
    limits.push({
      bucket: 'order-create-phone',
      key: phone,
      limit: ORDERS_PER_CONTACT_PER_DAY,
      windowSeconds: ORDER_CONTACT_WINDOW_SECONDS,
    });
  }

  return limits;
}

/**
 * What the customer reads when a limit stops them.
 *
 * Short on purpose. A stopped customer needs one instruction, not an
 * explanation of our abuse controls: the only useful thing she can do is talk
 * to a person, so that is the whole message. What it must never do is repeat
 * the old copy's mistake and tell her to press the button again, which sent
 * her straight back into the counter that was blocking her.
 */
export function tooManyAttemptsMessage(lang = 'es') {
  return lang === 'en'
    ? 'We detected unusual activity. Message us on WhatsApp and we will place your order.'
    : 'Detectamos actividad inusual. Escríbanos por WhatsApp y hacemos su pedido.';
}

export function tooManyAttemptsTitle(lang = 'es') {
  return lang === 'en' ? 'Too many attempts' : 'Demasiados intentos';
}

/**
 * Shown when the limiter itself cannot be reached.
 *
 * Kept separate from the message above because it is not the customer's doing
 * and it is not permanent, so this one may say "try again".
 */
export function limiterUnavailableMessage(lang = 'es') {
  return lang === 'en'
    ? 'Please try again in a minute, or message us on WhatsApp.'
    : 'Inténtelo de nuevo en un minuto o escríbanos por WhatsApp.';
}
