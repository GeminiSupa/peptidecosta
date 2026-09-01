/**
 * The exit-intent discount offer.
 *
 * When someone who has never bought from us tries to leave the catalog with a
 * cart, they are offered a personal discount code that dies in twenty minutes.
 *
 * The code itself is an ordinary promo_codes row, so nothing here re-implements
 * discount validity: `valid_until` is the deadline, `usage_limit` is the single
 * use, and api/orders/create already refuses an expired or spent code. What
 * lives here is only what the storefront and the minting endpoint have to agree
 * on — when to offer, who counts as the same person, and how long is left.
 *
 * Kept out of the component for the same reason as catalogGate.mjs: these are
 * the conditions worth testing, and they should not require mounting a
 * 5,000-line page to reach.
 */

export const EXIT_INTENT_DEFAULTS = {
  enabled: true,
  // A fraction, matching promo_codes.discount_pct. 0.10 is 10%.
  discountPct: 0.10,
  windowMinutes: 20,
  // Carts below this never see the offer. Zero means every cart qualifies.
  minCartUsd: 0,
};

/**
 * How long someone must have been on the page before an exit can trigger the
 * offer. A pointer that leaves the window two seconds after landing is a
 * mis-click or a bounce, not a customer having second thoughts.
 */
export const EXIT_INTENT_MIN_BROWSE_MS = 20_000;

/** The offer is stored here so a refresh does not lose the running clock. */
export const EXIT_INTENT_STORAGE_KEY = 'exit_intent_offer';

const toFiniteNumber = (value, fallback) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

/**
 * Turn the site_settings row into usable numbers.
 *
 * Every field is clamped rather than trusted. This value is edited by hand in
 * the Supabase dashboard, and a typo in the discount is the one mistake here
 * that costs real money — "10" meaning ten percent would be read as 1000% off
 * and hand every cart away for nothing.
 */
export function normalizeOfferSettings(raw) {
  const source = (raw && typeof raw === 'object') ? raw : {};

  const pct = toFiniteNumber(source.discountPct, EXIT_INTENT_DEFAULTS.discountPct);
  const minutes = toFiniteNumber(source.windowMinutes, EXIT_INTENT_DEFAULTS.windowMinutes);
  const floor = toFiniteNumber(source.minCartUsd, EXIT_INTENT_DEFAULTS.minCartUsd);

  return {
    enabled: source.enabled !== false,
    // A percent can never exceed the whole order, and a zero or negative
    // discount is not an offer — it falls back to the default rather than
    // minting a code that gives nothing.
    discountPct: pct > 0 && pct <= 1 ? pct : EXIT_INTENT_DEFAULTS.discountPct,
    windowMinutes: minutes > 0 ? Math.min(minutes, 24 * 60) : EXIT_INTENT_DEFAULTS.windowMinutes,
    minCartUsd: floor > 0 ? floor : 0,
  };
}

/** When a code minted now should stop working. */
export function offerExpiryIso(nowMs, settings) {
  const { windowMinutes } = normalizeOfferSettings(settings);
  return new Date(nowMs + windowMinutes * 60_000).toISOString();
}

/**
 * Whether the storefront should try to make an offer at all.
 *
 * Purely the conditions the browser can see. Whether this particular person is
 * ALLOWED one — never ordered before, never had a code already — is decided by
 * the server, which is the only side that can read the orders table.
 */
export function shouldOfferExitIntent({
  cartItemCount = 0,
  hasPromoApplied = false,
  gateVisible = false,
  checkoutBusy = false,
  offerSpent = false,
  msOnPage = Infinity,
  minBrowseMs = EXIT_INTENT_MIN_BROWSE_MS,
} = {}) {
  // No cart, nothing to save. This is the whole point of the offer: it is aimed
  // at someone who chose products and stopped, not at a passing visitor.
  if (Number(cartItemCount) <= 0) return false;

  // A code is already applied. Applying ours would REPLACE it — the cart holds
  // one code — and promo codes carry affiliate_id, so overwriting one quietly
  // takes an affiliate's commission off the order they earned. A customer who
  // already has a discount is also not the customer this offer is for.
  if (hasPromoApplied) return false;

  // Never two overlays at once. The access gate is already a full-screen ask.
  if (gateVisible) return false;

  // They are submitting, or the order is already placed. Nothing to rescue.
  if (checkoutBusy) return false;

  // One offer per visitor, ever. Once the twenty minutes lapse the offer is
  // genuinely gone — which is the only thing that makes the deadline true.
  if (offerSpent) return false;

  if (Number(msOnPage) < Number(minBrowseMs)) return false;

  return true;
}

// No I, O, 0 or 1: the code is shown on screen and read aloud to support often
// enough that ambiguous glyphs turn into "the code doesn't work".
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_SUFFIX_LENGTH = 5;

/**
 * A code belonging to one person.
 *
 * The prefix carries the offer ("AHORA10") so it still reads as a discount when
 * someone screenshots it; the suffix is what makes it un-shareable. A code
 * passed to a friend is useless anyway — it dies in twenty minutes and can be
 * used once — but a guessable one would not be.
 *
 * @param {() => number} random injected so the suffix can be asserted in tests
 */
export function generateOfferCode(discountPct, random = Math.random) {
  const pct = Math.round(normalizeOfferSettings({ discountPct }).discountPct * 100);
  let suffix = '';
  for (let i = 0; i < CODE_SUFFIX_LENGTH; i += 1) {
    const index = Math.floor(random() * CODE_ALPHABET.length) % CODE_ALPHABET.length;
    suffix += CODE_ALPHABET[index];
  }
  return `AHORA${pct}${suffix}`;
}

const EMAIL_KEY_PATTERN = /^[^\s,()@]+@[^\s,()@]+\.[^\s,()@]+$/;

/**
 * Every name we might already know this person by.
 *
 * Returned strongest first. An email or a phone survives a cleared browser; a
 * session id does not, but it is the only handle we have on a visitor who
 * added to their cart before the access gate ever asked for contact details.
 *
 * Values are shaped so they are safe to hand to a PostgREST `in.(...)` filter,
 * which is comma-and-paren delimited — an address containing either is dropped
 * rather than escaped, since it cannot be a real one we mailed.
 */
export function identityKeys({ email, phone, sessionId } = {}) {
  const keys = [];

  const cleanEmail = String(email || '').trim().toLowerCase();
  if (cleanEmail && cleanEmail.length <= 254 && EMAIL_KEY_PATTERN.test(cleanEmail)) {
    keys.push(`email:${cleanEmail}`);
  }

  // Digits only: the checkout stores E.164, the CRM has older rows without the
  // country code, and "+506 8888 8888" is the same customer as "88888888".
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length >= 8) keys.push(`phone:${digits.slice(-8)}`);

  const session = String(sessionId || '').trim();
  if (session) keys.push(`session:${session}`);

  return keys;
}

/** The single key a newly minted code is filed under. Strongest wins. */
export function primaryIdentityKey(identity) {
  return identityKeys(identity)[0] || null;
}

/**
 * Milliseconds left on an offer.
 *
 * `skewMs` is the gap measured between the server's clock and this browser's at
 * the moment the code was minted. Without it the countdown is whatever the
 * device thinks the time is, and a wrong clock either expires a live offer on
 * screen or keeps counting down one the order endpoint has already stopped
 * honouring.
 */
export function offerRemainingMs(offer, nowMs = Date.now()) {
  const expiry = Date.parse(offer?.expiresAt ?? '');
  if (!Number.isFinite(expiry)) return 0;
  const skew = toFiniteNumber(offer?.skewMs, 0);
  return Math.max(0, expiry - (nowMs + skew));
}

/** Is there still an offer to show? */
export function isOfferLive(offer, nowMs = Date.now()) {
  if (!offer || !offer.code) return false;
  return offerRemainingMs(offer, nowMs) > 0;
}

/** "19:59" — minutes and seconds, never a bare seconds count. */
export function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(Number(ms) || 0) / 1000);
  const whole = Math.floor(total);
  const minutes = Math.floor(whole / 60);
  const seconds = whole % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * What the customer actually saves, in the currency on screen.
 *
 * Mirrors getPromoDiscountAmount in the catalog: the automatic volume discount
 * comes off first, and the code takes its percentage of what is left. Quoting
 * the pre-volume figure would promise a saving the checkout then fails to show.
 */
export function previewSavings({ discountableSubtotal, volumePct = 0, discountPct, currency }) {
  const base = toFiniteNumber(discountableSubtotal, 0);
  if (base <= 0) return 0;

  const vol = Math.min(100, Math.max(0, toFiniteNumber(volumePct, 0)));
  const pct = Math.min(1, Math.max(0, toFiniteNumber(discountPct, 0)));
  const saving = base * (1 - vol / 100) * pct;

  return currency === 'USD' ? Math.round(saving * 100) / 100 : Math.round(saving);
}
