/**
 * The billing address Shield Hub Pay is given for a card charge.
 *
 * This used to be two identical copies that trusted the shipping address to be
 * the catalog's three-line format:
 *
 *     line 0  street address
 *     line 1  district, canton, province
 *     line 2  postal code
 *
 * A catalog order is built by the checkout form, so it always is. A WhatsApp
 * order is typed by a person, and it is not. On 20 Aug 2026 a $918 order
 * (WPCR-MT1ZN6EG) went out for payment carrying
 *
 *     postal_code: "250 mts norte de la oficina de correos de Costa Rica"
 *     city:        "Juan ml Ramirez Madrigal"   (the recipient's name)
 *
 * — a 52-character sentence in a postal code field — and the gateway answered
 * HTTP 500. The customer sat on the payment page looking at "Shield Hub Pay
 * returned 500" with no idea what to do.
 *
 * So nothing typed by a human reaches the gateway unchecked any more. A line
 * that is not a postal code is replaced by one that is; free text is clamped
 * and reduced to ASCII, the same treatment cardholder names already get,
 * because this gateway is visibly unhappy with anything else.
 */

/** San José centro. Used whenever the order carries nothing usable. */
export const DEFAULT_CR_POSTAL_CODE = '10101';

/** Costa Rican postal codes are five digits; four to six is accepted as plausible. */
const POSTAL_CODE_PATTERN = /^\d{4,6}$/;

/**
 * Reduce free text to something a payment gateway will accept.
 *
 * Accents are stripped rather than passed through: cardholder names have
 * always been normalised this way for Shield Hub Pay, and the billing fields
 * beside them never were.
 */
export function gatewaySafeText(value, maxLength) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Letters, digits, spaces and the punctuation a street address needs.
    .replace(/[^a-zA-Z0-9\s.,\-#/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .trim();
}

/**
 * Keep only a value that actually looks like a postal code.
 *
 * "250 mts norte de la oficina de correos de Costa Rica" contains digits, so
 * pulling the digits out of it would yield "250" — a number that is not this
 * customer's postal code and only looks like one. Either the line IS a postal
 * code or it is discarded.
 */
export function normalizePostalCode(value) {
  const trimmed = String(value ?? '').trim();
  return POSTAL_CODE_PATTERN.test(trimmed) ? trimmed : DEFAULT_CR_POSTAL_CODE;
}

/**
 * @param {string} shippingAddress the order's stored shipping address
 * @returns {{address: string, postal_code: string, city: string, state: string, country: 'CR'}}
 */
export function parseBillingAddress(shippingAddress = '') {
  const lines = String(shippingAddress || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const address = gatewaySafeText(lines[0], 100) || 'N/A';
  const postal_code = normalizePostalCode(lines[2]);

  // areaParts should be [district, canton, province]; canton is the city.
  const areaParts = String(lines[1] || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  const city = gatewaySafeText(areaParts[1] || areaParts[0], 40) || 'San Jose';
  const state = gatewaySafeText(areaParts[0], 40) || 'San Jose';

  return { address, postal_code, city, state, country: 'CR' };
}
