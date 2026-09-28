/**
 * Shopper Approved's checkout survey.
 *
 * Their popup runs in the customer's browser, on the thank-you page only, and
 * it reads the site id and the survey token from that page. Those two values
 * therefore cannot live only on the server. What this module refuses to do is
 * the rest: no hardcoded id, no hardcoded token, no fallback, and no reading of
 * the API token. The API token is a different secret and is never placed on a
 * page.
 *
 * The values come from the environment. Locally that is `.env.local`, which is
 * gitignored. On Vercel they are the same names in the project settings. If
 * either one is missing or does not look like the value Shopper Approved
 * issues, the survey is not shown.
 */

/** One-shot handoff from checkout to the thank-you page. Not the Google key. */
export const SA_STORAGE_KEY = 'sa_review_optin';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SITE_ID_PATTERN = /^\d{2,12}$/;
const SURVEY_TOKEN_PATTERN = /^[A-Za-z0-9]{4,64}$/;

const clean = (value, limit = 240) => String(value ?? '').trim().slice(0, limit);

/**
 * The site id and survey token, or null when they are not configured.
 *
 * Reads only `SHOPPER_APPROVED_SITE_ID` and `SHOPPER_APPROVED_SURVEY_TOKEN`.
 * Anything else in the environment, including an API token, is ignored.
 *
 * @param {object} [env]
 * @returns {{ siteId: string, token: string } | null}
 */
export function shopperApprovedConfig(env = process.env) {
  const siteId = clean(env?.SHOPPER_APPROVED_SITE_ID, 12);
  const token = clean(env?.SHOPPER_APPROVED_SURVEY_TOKEN, 64);
  if (!SITE_ID_PATTERN.test(siteId)) return null;
  if (!SURVEY_TOKEN_PATTERN.test(token)) return null;
  return { siteId, token };
}

/**
 * What checkout hands to the thank-you page for this survey.
 *
 * The email stays out of the URL. Session storage keeps it for this tab only.
 */
export function buildShopperApprovedRecord({ orderId, email, name } = {}) {
  return {
    orderId: clean(orderId, 120),
    email: clean(email, 240).toLowerCase(),
    name: clean(name, 160),
  };
}

/**
 * The object their thank-you script expects, or null when this order should
 * not be asked.
 *
 * A missing order number or email means the page was opened without a purchase
 * just made in this tab. Showing the survey then would ask the wrong person.
 *
 * @returns {object | null}
 */
export function shopperApprovedValues({ siteId, token, record = {} } = {}) {
  const config = shopperApprovedConfig({
    SHOPPER_APPROVED_SITE_ID: siteId,
    SHOPPER_APPROVED_SURVEY_TOKEN: token,
  });
  if (!config) return null;

  const orderId = clean(record.orderId, 120);
  const email = clean(record.email, 240).toLowerCase();
  const name = clean(record.name, 160);
  if (!orderId) return null;
  if (!EMAIL_PATTERN.test(email)) return null;

  const values = {
    site: Number(config.siteId),
    token: config.token,
    orderid: orderId,
    email,
  };
  if (name) values.name = name;
  return values;
}

/** Script address for a site id that has already passed the digit check. */
export function shopperApprovedScriptUrl(siteId) {
  if (!SITE_ID_PATTERN.test(clean(siteId, 12))) return null;
  return `https://www.shopperapproved.com/thankyou/rate/${clean(siteId, 12)}.js`;
}
