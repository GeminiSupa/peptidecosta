import crypto from 'crypto';

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
  const params = new URLSearchParams({
    order: String(orderNumber),
    token,
  });
  return `/pay-card?${params.toString()}`;
}

export function getPublicBaseUrl(requestUrl) {
  return (process.env.NEXT_PUBLIC_SITE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
    || new URL(requestUrl).origin).replace(/\/$/, '');
}
