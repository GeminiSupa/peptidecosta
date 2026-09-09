/**
 * The card payment kill switch.
 *
 * Set NEXT_PUBLIC_CARD_PAYMENTS_PAUSED=true in Vercel to stop every card
 * charge across the site while the payment system is being worked on.
 * Unset it (or set it to anything else) to turn card payments back on.
 *
 * WHY ONE VARIABLE, AND WHY NEXT_PUBLIC_
 *
 * The pause has to hold in two places at once: the storefront, so nobody is
 * offered a card form that cannot work, and the server routes, so a stale tab,
 * an old payment link or a direct POST cannot charge anyone behind our back.
 * Two separate variables would let those two halves disagree — which is
 * precisely the failure this exists to prevent — so it is deliberately one
 * name. NEXT_PUBLIC_ is readable on the server too, so the same value drives
 * both sides and the checkout can never advertise what the route will refuse.
 *
 * IT FAILS OPEN, ON PURPOSE. An unset variable means "card payments work",
 * because that is the normal state of the shop; a typo must not quietly stop
 * the till. The pause is switched ON explicitly and read back explicitly
 * (see the deploy check in docs/card-payments-pause.md).
 *
 * Kept free of '@/lib' imports so tests/ can load it under `node --test`.
 */

export const CARD_PAUSE_ENV_KEY = 'NEXT_PUBLIC_CARD_PAYMENTS_PAUSED';

/**
 * Truthy spellings a person might reasonably type into the Vercel dashboard.
 * 'false', '0', '' and anything unrecognised all mean "not paused".
 */
const PAUSED_VALUES = new Set(['true', '1', 'yes', 'on', 'paused']);

export function areCardPaymentsPaused(env = process.env) {
  const raw = env?.[CARD_PAUSE_ENV_KEY];
  return PAUSED_VALUES.has(String(raw ?? '').trim().toLowerCase());
}

/**
 * Next.js inlines process.env.NEXT_PUBLIC_* at build time by matching the
 * literal text `process.env.NEXT_PUBLIC_...`, so a client bundle cannot read
 * this through the dynamic lookup above — it would compile to undefined and
 * the storefront would cheerfully show a card form during the pause.
 *
 * Client components must therefore use this function, which spells the name
 * out for the compiler to find. Server code can use either.
 */
export function areCardPaymentsPausedForClient() {
  return PAUSED_VALUES.has(
    String(process.env.NEXT_PUBLIC_CARD_PAYMENTS_PAUSED ?? '').trim().toLowerCase()
  );
}
