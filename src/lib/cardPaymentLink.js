import crypto from 'crypto';
import { getPublicSiteUrl } from '@/lib/publicUrl';

const PAYMENT_LINK_SECRET = process.env.SHIELD_HUB_PAY_API_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export function canSignCardPaymentLinks() {
  return Boolean(PAYMENT_LINK_SECRET);
}

export function signCardPaymentOrder(orderNumber) {
  if (!PAYMENT_LINK_SECRET) {
    throw new Error('Card payment link secret is not configured');
  }

  return crypto
    .createHmac('sha256', PAYMENT_LINK_SECRET)
    .update(String(orderNumber || ''))
    .digest('base64url');
}

export function verifyCardPaymentOrderToken(orderNumber, token) {
  if (!PAYMENT_LINK_SECRET || !orderNumber || !token) return false;

  const expected = signCardPaymentOrder(orderNumber);
  const expectedBuffer = Buffer.from(expected);
  const tokenBuffer = Buffer.from(String(token));

  if (expectedBuffer.length !== tokenBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, tokenBuffer);
}

export function buildCardPaymentPath(orderNumber) {
  const token = signCardPaymentOrder(orderNumber);
  return `/pay-card/${encodeURIComponent(String(orderNumber))}/${encodeURIComponent(token)}`;
}

export function getPublicBaseUrl(requestUrl) {
  return getPublicSiteUrl(requestUrl);
}
