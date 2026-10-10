import crypto from 'crypto';
import { getPublicSiteUrl } from './publicUrl.js';

const CHECKOUT_TOKEN_TTL_SECONDS = 30 * 60;

/**
 * Every secret a card-payment link may have been signed with, newest first.
 *
 * A payment link has no expiry: one sent on WhatsApp last week is still a
 * working link today. So the secret cannot simply be swapped - signing with a
 * new one while checking against only that one would turn every link already
 * in a customer's hands into "invalid link" the moment it was rotated.
 *
 * Links are therefore signed with the first secret present and accepted if
 * they match any of them. `SHIELD_HUB_PAY_API_SECRET` is named after a gateway
 * we no longer use and is kept purely so old links keep working; once
 * CARD_PAYMENT_LINK_SECRET is set and the old links have been used or
 * reissued, it can be deleted from Vercel.
 */
function paymentLinkSecrets() {
  return [
    process.env.CARD_PAYMENT_LINK_SECRET,
    process.env.SHIELD_HUB_PAY_API_SECRET,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

function paymentLinkSecret() {
  return paymentLinkSecrets()[0] || '';
}

/** Constant-time compare that does not leak which secret matched. */
function matchesAnySecret(makeExpected, supplied) {
  const suppliedBuffer = Buffer.from(String(supplied));
  let matched = false;
  for (const secret of paymentLinkSecrets()) {
    const expectedBuffer = Buffer.from(makeExpected(secret));
    if (expectedBuffer.length !== suppliedBuffer.length) continue;
    if (crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)) matched = true;
  }
  return matched;
}

export function canSignCardPaymentLinks() {
  return Boolean(paymentLinkSecret());
}

export function signCardPaymentOrder(orderNumber) {
  const secret = paymentLinkSecret();
  if (!secret) {
    throw new Error('Card payment link secret is not configured');
  }

  return crypto
    .createHmac('sha256', secret)
    .update(String(orderNumber || ''))
    .digest('base64url');
}

export function verifyCardPaymentOrderToken(orderNumber, token) {
  if (!paymentLinkSecret() || !orderNumber || !token) return false;

  return matchesAnySecret(
    (secret) => crypto.createHmac('sha256', secret).update(String(orderNumber || '')).digest('base64url'),
    token,
  );
}

/**
 * Short-lived authorization issued only after /api/orders/create has persisted
 * a card order. Unlike a payment-link token, this also binds the database id and
 * expires, so an order number alone cannot be submitted to the card gateway.
 */
export function createCardCheckoutToken(orderNumber, orderId, {
  now = Date.now(),
  ttlSeconds = CHECKOUT_TOKEN_TTL_SECONDS,
} = {}) {
  const secret = paymentLinkSecret();
  if (!secret) throw new Error('Card checkout token secret is not configured');
  const claims = {
    orderNumber: String(orderNumber || ''),
    orderId: String(orderId || ''),
    exp: Math.floor(now / 1000) + ttlSeconds,
  };
  if (!claims.orderNumber || !claims.orderId) throw new Error('Card checkout token requires an order');

  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyCardCheckoutToken(token, orderNumber, { now = Date.now() } = {}) {
  if (!paymentLinkSecret() || !token || !orderNumber) return null;
  const [payload, supplied, extra] = String(token).split('.');
  if (!payload || !supplied || extra) return null;

  // Checked against every secret too: a checkout token issued minutes before a
  // secret change must still complete the payment it was issued for.
  if (!matchesAnySecret(
    (candidate) => crypto.createHmac('sha256', candidate).update(payload).digest('base64url'),
    supplied,
  )) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (claims.orderNumber !== String(orderNumber)) return null;
    if (!claims.orderId || !Number.isFinite(claims.exp) || claims.exp < Math.floor(now / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}

export const CARD_CHECKOUT_TOKEN_TTL_SECONDS = CHECKOUT_TOKEN_TTL_SECONDS;

export function buildCardPaymentPath(orderNumber) {
  const token = signCardPaymentOrder(orderNumber);
  return `/pay-card/${encodeURIComponent(String(orderNumber))}/${encodeURIComponent(token)}`;
}

export function getPublicBaseUrl(requestUrl) {
  return getPublicSiteUrl(requestUrl);
}
