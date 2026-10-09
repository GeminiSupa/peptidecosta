/**
 * Proof that a webhook request really came from Twilio.
 *
 * The voice webhook cannot use an admin session — Twilio calls it server to
 * server, with no login. Twilio signs every request instead: it hashes the
 * exact URL plus the posted fields with the account's auth token and sends the
 * result in X-Twilio-Signature. Anyone can POST to the URL; only Twilio can
 * produce that header.
 *
 * Two things make the URL tricky in production:
 *   - Twilio signs the public URL it dialled, not the one the app sees behind
 *     Vercel's proxy, so the host comes from x-forwarded-host / host.
 *   - The scheme is always https in production; x-forwarded-proto can say http
 *     on the inside hop.
 *
 * Free of `@/` imports so tests/ can load it under `node --test`.
 */

export const SIGNATURE_HEADER = 'x-twilio-signature';

/**
 * Rebuild the URL exactly as Twilio saw it, including the query string.
 *
 * A mismatch here is the usual reason a correct signature is rejected, so the
 * pieces are taken from the forwarded headers rather than request.url.
 */
export function publicWebhookUrl(request) {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = forwardedHost || request.headers.get('host') || url.host;
  const forwardedProto = request.headers.get('x-forwarded-proto');
  // Localhost is the only place http is legitimate.
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);
  const proto = isLocal ? (forwardedProto || url.protocol.replace(':', '')) : 'https';
  return `${proto}://${host}${url.pathname}${url.search}`;
}

/**
 * Is this request allowed to be acted on?
 *
 * Returns { ok, reason }. Outside production an unsigned request is let
 * through so the endpoint stays testable from a terminal; in production a
 * missing or wrong signature is refused. A missing auth token is refused
 * everywhere — without it nothing can be verified, and silently trusting the
 * caller is how an open relay happens.
 */
export function checkTwilioSignature({
  signature,
  authToken,
  url,
  params = {},
  validate,
  isProduction = true,
} = {}) {
  if (!signature) {
    return isProduction
      ? { ok: false, reason: 'missing signature' }
      : { ok: true, reason: 'unsigned request allowed outside production' };
  }
  if (!authToken) return { ok: false, reason: 'no auth token to verify against' };
  if (typeof validate !== 'function') return { ok: false, reason: 'no validator supplied' };

  let valid = false;
  try {
    valid = validate(authToken, signature, url, params);
  } catch {
    valid = false;
  }
  return valid ? { ok: true, reason: 'signature verified' } : { ok: false, reason: 'bad signature' };
}
