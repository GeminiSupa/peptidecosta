/**
 * The wa.me link behind every "Order on WhatsApp" button.
 *
 * Split out of whatsapp.ts, which reaches for Supabase and localStorage, so the
 * one thing a customer actually reads — the pre-filled sentence — can be tested
 * on its own.
 */

/**
 * The opening line used when a caller has no message of its own — the nav bar,
 * the catalog's sticky CTA, the footer. Keyed by the site's language toggle.
 *
 * Spanish is the fallback because the storefront itself defaults to Spanish
 * (`useState('es')`); an English default meant a Costa Rican customer reading a
 * Spanish page opened WhatsApp holding an English sentence.
 *
 * Kept ungendered ("me interesa", not "estoy interesado/a") — the customer is
 * the one who appears to have written it.
 */
export const DEFAULT_GREETING = {
  en: "Hello I'm interested",
  es: 'Hola, me interesa',
};

/**
 * A WhatsApp link whose pre-filled text is only what the customer would write.
 *
 * This used to append `[Source: email (Camp: spring_sale)]` so an agent could
 * read the campaign off the chat. It came out because the customer sends that
 * line, under their own name: internal campaign slugs in someone's outgoing
 * message look like the shop pasted its own notes into their mouth. The
 * attribution now goes to `logWhatsAppSource`, which records it against the
 * click instead of showing it to the person clicking.
 *
 * @param {string} phone - recipient in E.164 without the '+'
 * @param {string|null} [baseMessage] - message to pre-fill; falsy picks the greeting for `lang`
 * @param {string} [lang] - 'es' | 'en', the language the customer is reading in
 * @returns {string}
 */
export function buildWhatsAppLink(phone, baseMessage, lang = 'es') {
  const greeting = baseMessage || DEFAULT_GREETING[lang] || DEFAULT_GREETING.es;
  return `https://wa.me/${phone}?text=${encodeURIComponent(greeting)}`;
}

/**
 * The attribution for one WhatsApp click, read from where the storefront
 * already stashes it.
 *
 * Returns plain values for the caller to store. Kept pure — it takes the store
 * rather than touching `localStorage` itself — because the interesting cases
 * (nothing set, a referrer but no campaign, a malformed referrer) are otherwise
 * only reachable in a browser.
 *
 * @param {{getItem: (k: string) => string|null}} store - localStorage, or a stub
 * @param {string} [lang]
 * @returns {{utm_source: string, utm_medium: string, utm_campaign: string, referrer: string, lang: string}}
 */
export function readClickAttribution(store, lang = '') {
  const get = (key) => {
    try {
      return String(store?.getItem?.(key) ?? '').trim();
    } catch {
      // Safari in private mode throws on localStorage rather than returning null.
      return '';
    }
  };

  const referrer = get('lead_referrer');
  let referrerHost = '';
  if (referrer) {
    try {
      referrerHost = new URL(referrer).hostname.replace(/^www\./, '');
    } catch {
      // A referrer that is not a URL is not worth storing.
      referrerHost = '';
    }
  }

  return {
    utm_source: get('lead_utm_source'),
    utm_medium: get('lead_utm_medium'),
    utm_campaign: get('lead_utm_campaign'),
    referrer: referrerHost,
    lang: String(lang || '').trim(),
  };
}
