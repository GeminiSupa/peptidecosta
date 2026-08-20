/**
 * What a customer is told when a card checkout stops before the bank answers.
 *
 * These paths used to return their internal wording straight to the browser,
 * and the checkout printed it verbatim under "The card payment did not go
 * through". A buyer could be shown "Shield Hub Pay credentials are not
 * configured", "Card payments are currently configured for USD only", "Order
 * not found", or — on a timeout — the raw exception text. None of that means
 * anything to them, and the first one names our payment vendor and our own
 * misconfiguration to the public.
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

  already_paid: {
    retryable: false,
    en: 'This order has already been paid — there is nothing more to do. Your receipt is on its way by email.',
    es: 'Este pedido ya fue pagado — no hay nada más que hacer. Su comprobante va en camino por correo.',
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
