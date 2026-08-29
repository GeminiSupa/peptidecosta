import crypto from 'crypto';
import { getPublicSiteUrl } from './publicUrl.js';

const CHECKOUT_TOKEN_TTL_SECONDS = 30 * 60;

function paymentLinkSecret() {
  return process.env.SHIELD_HUB_PAY_API_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
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

  const expected = signCardPaymentOrder(orderNumber);
  const expectedBuffer = Buffer.from(expected);
  const tokenBuffer = Buffer.from(String(token));

  if (expectedBuffer.length !== tokenBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, tokenBuffer);
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
  const secret = paymentLinkSecret();
  if (!secret || !token || !orderNumber) return null;
  const [payload, supplied, extra] = String(token).split('.');
  if (!payload || !supplied || extra) return null;

  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  if (expectedBuffer.length !== suppliedBuffer.length
      || !crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)) return null;

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
