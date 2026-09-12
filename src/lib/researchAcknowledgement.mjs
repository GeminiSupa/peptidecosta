/**
 * The research-use acknowledgement that gates checkout.
 *
 * Our card processor's bank requires that nobody — person or crawler — can
 * reach a payment form without first passing a screen that states what these
 * products are and having them agree to it in the affirmative. Their wording:
 *
 *   "Before a customer can enter the checkout/payment page, there should be a
 *    required acknowledgment ... They would need to check that box before
 *    continuing. Once accepted, the checkout page opens."
 *
 * So this is a gate, not a footnote at the bottom of the form: the checkout
 * fields are not rendered until it is ticked, and api/orders/create refuses a
 * payload that did not carry it. The card route needs no separate check —
 * its signed token is only ever minted by orders/create, so that one door
 * covers both the card and the WhatsApp path.
 *
 * What this is NOT is an anti-forgery measure. A script that can post an order
 * can post `accepted: true` with it, exactly as it can invent a name. The
 * requirement is that the flow presents the acknowledgement and the server
 * declines anything that skipped it, which is what a bank audit looks at.
 *
 * The rule lives here, away from the 5,000-line catalog page, because both the
 * browser and the API have to agree on it and it is worth testing on its own.
 */

/**
 * Bump this when the wording below changes.
 *
 * The version travels with the order, so a row saved today can still be read
 * back as "agreed to *this* text" after the text is next revised. An order
 * carrying an unrecognised version is refused rather than silently accepted
 * against wording nobody can produce any more.
 */
export const RESEARCH_ACK_VERSION = '2026-09-research-only';

/**
 * The exact sentence the customer agrees to, in the language they are reading
 * the site in. The processor supplied the English; the Spanish is the same
 * undertaking, and it is the one most of our customers will actually see —
 * the storefront defaults to Spanish for Costa Rica.
 */
export function researchAckText(lang) {
  return lang === 'en'
    ? 'I acknowledge and agree that all products are for research purposes only and are not intended for human or animal consumption.'
    : 'Reconozco y acepto que todos los productos son únicamente para fines de investigación y no están destinados al consumo humano ni animal.';
}

/** Heading above the tick box. */
export function researchAckTitle(lang) {
  return lang === 'en' ? 'Before you continue' : 'Antes de continuar';
}

/** The line under the heading, explaining why the gate is there. */
export function researchAckIntro(lang) {
  return lang === 'en'
    ? 'Please confirm the following to open the checkout form.'
    : 'Confirme lo siguiente para abrir el formulario de pago.';
}

/** The button that opens the checkout once the box is ticked. */
export function researchAckContinue(lang) {
  return lang === 'en' ? 'Continue to checkout' : 'Continuar al pago';
}

/**
 * Is this payload's acknowledgement one we can accept?
 *
 * Deliberately no timestamp from the browser. An earlier draft had the client
 * send when it ticked the box, which hands the decision to the device clock —
 * and a customer whose laptop is a week out would have had a valid order
 * refused for a reason nobody could see. The server stamps the time itself
 * (see `researchAckRecord`), so a wrong clock cannot cost us an order.
 */
export function validateResearchAck(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'ackMissing' };
  if (raw.accepted !== true) return { ok: false, reason: 'ackMissing' };
  if (String(raw.version || '') !== RESEARCH_ACK_VERSION) return { ok: false, reason: 'ackStale' };
  return { ok: true };
}

/**
 * What gets written onto the order row.
 *
 * `at` is the server's clock at the moment the order was accepted, which is
 * also the only moment we can actually vouch for.
 */
export function researchAckRecord(now = new Date()) {
  return {
    research_ack_version: RESEARCH_ACK_VERSION,
    research_ack_at: now.toISOString(),
  };
}

/**
 * Why the order was refused, in the customer's language.
 *
 * `ackStale` is what a customer sees if they had the page open across a deploy
 * that changed the wording: their tab is agreeing to text we no longer show.
 * Reloading re-presents the current text, so that is what the message asks for
 * rather than leaving them pressing a button that will not work.
 */
export function researchAckMessage(reason, lang) {
  if (reason === 'ackStale') {
    return lang === 'en'
      ? 'Please refresh the page and confirm the research-use acknowledgement again before ordering.'
      : 'Recargue la página y confirme de nuevo el aviso de uso exclusivo para investigación antes de ordenar.';
  }
  return lang === 'en'
    ? 'Please confirm the research-use acknowledgement before continuing.'
    : 'Confirme el aviso de uso exclusivo para investigación antes de continuar.';
}
