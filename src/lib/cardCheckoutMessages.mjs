/**
 * What a customer is told when a card checkout stops before the bank answers.
 *
 * These paths used to return their internal wording straight to the browser,
 * and the checkout printed it verbatim under "The card payment did not go
 * through". A buyer could be shown "Shield Hub Pay credentials are not
 * configured", "Card payments are currently configured for USD only", "Order
 * not found", or — on a timeout — the raw exception text. None of that means
 * anything to them, and the first one names our payment vendor and our own
 * misconfiguration to the public. The two rate-limit stops were the last
 * holdouts: correct wording for a customer, but English only, so every Spanish
 * buyer who hit one got it in a language they had not asked for.
 *
 * A decline is NOT in here: the gateway's own reason ("insufficient funds",
 * "Card brand not allowed") is genuinely useful and is passed through as-is.
 *
 * `retryable` is what the checkout does next. False means the submit button
 * stays locked — pressing it again cannot help, and in the `unconfirmed` case
 * it is actively dangerous.
 */

const MESSAGES = {
  // Card payment cannot run at all: not configured, wrong currency, the order
  // row has gone. Nothing the customer does will change it.
  unavailable: {
    retryable: false,
    en: 'Card payment is not available right now. Nothing has been charged — please message us on WhatsApp and we will take your order.',
    es: 'El pago con tarjeta no está disponible en este momento. No se ha realizado ningún cargo — escríbanos por WhatsApp y tomamos su pedido.',
  },

  /**
   * Card payment is switched off on purpose while we fix something, rather
   * than broken by accident. Distinct from `unavailable` because the customer
   * is owed an apology and an explanation here, not a shrug — and because a
   * deliberate pause is a state we want to be able to find in the logs.
   *
   * Not retryable: the button stays locked, because pressing it again during a
   * maintenance window cannot work and only invites the double-charge shape
   * described under `unconfirmed`.
   */
  paused: {
    retryable: false,
    en: 'We are very sorry — card payments are temporarily paused while we carry out maintenance on our payment system. Nothing has been charged to your card. Please message us on WhatsApp and we will take your order right away, or try again a little later. We apologise for the inconvenience.',
    es: 'Lamentamos mucho las molestias — los pagos con tarjeta están pausados temporalmente mientras realizamos mantenimiento en nuestro sistema de pagos. No se ha realizado ningún cargo a su tarjeta. Escríbanos por WhatsApp y tomamos su pedido de inmediato, o intente de nuevo más tarde. Disculpe las molestias.',
  },

  card_details: {
    retryable: true,
    en: 'Please check your card number, expiry date and security code, then try again.',
    es: 'Revise el número de su tarjeta, la fecha de vencimiento y el código de seguridad, e intente de nuevo.',
  },

  missing_details: {
    retryable: true,
    en: 'Some of your details are missing. Please check the form above and try again.',
    es: 'Faltan algunos de sus datos. Revise el formulario e intente de nuevo.',
  },

  // Only the pay-by-link page asks for this: the order was taken on
  // WhatsApp, so we may have no address for the receipt yet.
  email_required: {
    retryable: true,
    en: 'Please enter an email address so we can send you the receipt.',
    es: 'Ingrese un correo electrónico para poder enviarle el comprobante.',
  },

  // A payment link that is malformed, expired, tampered with, or points at
  // an order that no longer exists. Pressing the button again cannot help.
  link_invalid: {
    retryable: false,
    en: 'This payment link is no longer valid. Message us on WhatsApp and we will send you a fresh one.',
    es: 'Este enlace de pago ya no es válido. Escríbanos por WhatsApp y le enviamos uno nuevo.',
  },

  already_paid: {
    retryable: false,
    en: 'This order has already been paid — there is nothing more to do. Your receipt is on its way by email.',
    es: 'Este pedido ya fue pagado — no hay nada más que hacer. Su comprobante va en camino por correo.',
  },

  // Both rate-limit stops happen before the gateway is touched, so the card was
  // never used and a later retry is safe. The limiter fails closed: when the
  // check itself is down the customer is turned away too, and being told
  // "too many attempts" for our outage would simply be untrue.
  rate_limited: {
    retryable: true,
    en: 'Too many card attempts on this order. Please wait a few minutes before trying again, or message us on WhatsApp and we will finish it for you.',
    es: 'Demasiados intentos de pago con tarjeta para este pedido. Espere unos minutos antes de intentar de nuevo, o escríbanos por WhatsApp y lo completamos por usted.',
  },

  protection_unavailable: {
    retryable: true,
    en: 'We could not run our payment security check just now, so this attempt was stopped before your card was used. Please try again in a minute, or message us on WhatsApp.',
    es: 'No pudimos ejecutar nuestra verificación de seguridad en este momento, así que el intento se detuvo antes de usar su tarjeta. Intente de nuevo en un minuto, o escríbanos por WhatsApp.',
  },

  in_progress: {
    retryable: true,
    en: 'A payment for this order is already going through. Please wait a moment before trying again.',
    es: 'Ya hay un pago en curso para este pedido. Espere un momento antes de intentar de nuevo.',
  },

  /**
   * The one that matters.
   *
   * The charge threw instead of answering, so we do not know whether the money
   * moved — a gateway that captures and then times out looks identical here to
   * one that was never reached. Telling the customer "nothing has been
   * charged" would be a guess, and inviting a retry is worse than a guess: the
   * checkout builds a NEW order number every attempt, and the double-charge
   * lock only protects a single order number. So the retry that our own error
   * message invited is exactly how the same customer gets billed twice.
   */
  unconfirmed: {
    retryable: false,
    en: 'We could not confirm whether this payment went through. Please do not try again — message us on WhatsApp with your order number and we will check it and finish your order for you.',
    es: 'No pudimos confirmar si este pago se realizó. Por favor no lo intente de nuevo — escríbanos por WhatsApp con su número de pedido y lo verificamos y completamos por usted.',
  },
};

/**
 * @param {string} key one of the keys above
 * @param {string} lang 'en' or anything else for Spanish
 * @returns {{ message: string, retryable: boolean, code: string }}
 */
export function cardCheckoutMessage(key, lang) {
  const entry = MESSAGES[key] || MESSAGES.unavailable;
  const code = MESSAGES[key] ? key : 'unavailable';
  return {
    code,
    retryable: entry.retryable,
    message: lang === 'en' ? entry.en : entry.es,
  };
}

export const CARD_CHECKOUT_MESSAGE_KEYS = Object.keys(MESSAGES);
