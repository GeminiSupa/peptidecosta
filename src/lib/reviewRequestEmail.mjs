/**
 * The five-day review request: where it points, and what it says.
 *
 * The cron that sends it (src/app/api/cron/review-requests/route.js) is a
 * network job end to end — Supabase, SMTP, the WhatsApp Graph API — so the two
 * things worth getting right are pulled out here where they can be tested
 * without any of it: which review page each button opens, and the HTML.
 */

import {
  FACEBOOK_REVIEW_URL,
  GOOGLE_REVIEW_URL,
  getFacebookReviewUrl,
} from './businessLinks.js';

const trim = (value) => String(value ?? '').trim();

/** Names go into HTML unescaped otherwise; "Ana & Co <lab>" would break the email. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Where the review buttons point.
 *
 * The admin CMS is the source, the way it is for every other review link on the
 * site — the same `site_settings` row the storefront badges read, so changing a
 * profile in one place changes it everywhere. The REVIEW_LINK_* variables still
 * win where they are set, because they were the only control before this and
 * silently ignoring one that is already configured in Vercel would be worse
 * than honouring it.
 *
 * Trustpilot is deliberately not defaulted. Google and Facebook are pages this
 * shop owns and can always be linked; Trustpilot only appears in the email if
 * someone has explicitly set REVIEW_LINK_TRUSTPILOT.
 */
export function reviewDestinations(links = {}, env = process.env) {
  return {
    // GOOGLE_REVIEW_URL, not the listing: this is an ask for a review, so it
    // must land on the rating form rather than the map card.
    google: trim(env.REVIEW_LINK_GOOGLE) || trim(links.googleReviewUrl) || GOOGLE_REVIEW_URL,
    facebook: trim(env.REVIEW_LINK_FACEBOOK) || getFacebookReviewUrl(links) || FACEBOOK_REVIEW_URL,
    trustpilot: trim(env.REVIEW_LINK_TRUSTPILOT),
  };
}

/**
 * One review button.
 *
 * A table wrapping the anchor rather than a bare inline-block <a>, because
 * Outlook drops the padding off an anchor and renders the button as a plain
 * link. The background sits on the <td> so there is still a coloured box even
 * where the anchor's own styling is stripped, and `color:#ffffff !important`
 * stops Gmail and Outlook repainting the label in their own link blue — the
 * same guard the shipped-order email uses.
 */
function button(href, label, background) {
  return `
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 10px auto;border-collapse:separate;">
            <tr>
              <td align="center" bgcolor="${background}" style="border-radius:8px;">
                <a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;min-width:210px;padding:13px 28px;background:${background};color:#ffffff !important;font-family:sans-serif;font-size:15px;font-weight:bold;line-height:1.2;text-align:center;text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a>
              </td>
            </tr>
          </table>`;
}

const COPY = {
  es: {
    subject: '¿Cómo va tu investigación? 🧪',
    heading: '¡Nos encantaría saber tu opinión!',
    greeting: (name) => (name ? `Hola ${name},` : '¡Hola!'),
    intro: 'Han pasado unos días desde que se completó tu pedido de Peptides Costa Rica. ¡Esperamos que tu investigación vaya de maravilla!',
    ask: 'Si tienes un momento, nos ayudaría muchísimo que nos dejaras una reseña. Elige donde te resulte más cómodo:',
    google: 'Reseñar en Google',
    facebook: 'Reseñar en Facebook',
    trustpilot: 'O deja tu reseña en Trustpilot',
    signoff: 'Gracias,<br/>El equipo de Peptides Costa Rica',
  },
  en: {
    subject: 'How is your research going? 🧪',
    heading: "We'd love to hear from you!",
    greeting: (name) => (name ? `Hi ${name},` : 'Hi there,'),
    intro: "It's been a few days since your Peptides Costa Rica order was completed. We hope your research is going perfectly!",
    ask: "If you have a moment, a review would help us enormously. Pick whichever is easiest for you:",
    google: 'Review us on Google',
    facebook: 'Review us on Facebook',
    trustpilot: 'Or leave your review on Trustpilot',
    signoff: 'Thank you,<br/>The Peptides Costa Rica Team',
  },
};

const LOGO_URL = 'https://catalog.peptidescostarica.net/logo.png?v=2';

/**
 * Subject and HTML for one customer.
 *
 * Two buttons rather than one, stacked rather than side by side: side-by-side
 * cells collapse unpredictably on narrow screens across email clients, and
 * stacked full-width targets are the easier tap on a phone, which is where most
 * of these are opened. Google leads on position — it is the listing the seller
 * rating and the search result hang off — with Facebook the equal-weight second
 * ask rather than a hidden text link.
 */
export function buildReviewRequestEmail({ customerName, lang = 'es', destinations = {} } = {}) {
  const copy = COPY[lang === 'en' ? 'en' : 'es'];
  const name = escapeHtml(trim(customerName));

  const buttons = [
    destinations.google ? button(destinations.google, copy.google, '#10b981') : '',
    destinations.facebook ? button(destinations.facebook, copy.facebook, '#1877F2') : '',
  ].join('');

  // A quiet text link, not a third button: it only exists when someone has set
  // the variable, and three equal calls to action is one more decision than a
  // customer doing us a favour should have to make.
  const trustpilot = destinations.trustpilot
    ? `\n          <p style="margin:4px 0 0;font-size:13px;"><a href="${escapeHtml(destinations.trustpilot)}" target="_blank" rel="noopener noreferrer" style="color:#0f766e;">${escapeHtml(copy.trustpilot)}</a></p>`
    : '';

  const html = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#333;">
          <img src="${LOGO_URL}" alt="Peptides Costa Rica" width="96" height="81" style="display:block;width:96px;height:81px;margin:0 auto 14px auto;border:0;outline:none;text-decoration:none;border-radius:10px;">
          <h2>${copy.heading}</h2>
          <p>${copy.greeting(name)}</p>
          <p>${copy.intro}</p>
          <p>${copy.ask}</p>
          <div style="margin:22px 0;text-align:center;">${buttons}${trustpilot}
          </div>
          <p>${copy.signoff}</p>
        </div>
      `;

  return { subject: copy.subject, html };
}
