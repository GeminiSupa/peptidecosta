import crypto from 'crypto';

/**
 * Meta signs every webhook delivery with HMAC-SHA256 over the raw request body,
 * keyed by the app secret, and sends it as `X-Hub-Signature-256: sha256=<hex>`.
 *
 * Without this check the WhatsApp, Facebook and Messenger endpoints accept any
 * POST that reaches the URL, so anyone who learns it can invent conversations,
 * leads and team alerts. The `hub.verify_token` on the GET handler only guards
 * the one-time subscription handshake; it says nothing about the messages that
 * follow it.
 */

const clean = (value) => String(value ?? '').trim();

/** Per-channel secret first, so a channel living in its own Meta app still works. */
const CHANNEL_SECRET_VARS = {
  whatsapp: 'WHATSAPP_APP_SECRET',
  facebook: 'FACEBOOK_APP_SECRET',
  messenger: 'MESSENGER_APP_SECRET',
};

/**
 * The app secret for one channel.
 *
 * Resolution order, first non-empty wins:
 *   1. the channel's own var — for a channel moved into its own Meta app
 *   2. `META_APP_SECRET` — the shared secret, if one is set up
 *   3. `FACEBOOK_APP_SECRET` — see below
 *
 * WhatsApp, Facebook and Messenger all sit under one Meta app here (a single
 * `FACEBOOK_APP_ID`), and one app has one secret, which signs every webhook it
 * sends whichever product raised it. `FACEBOOK_APP_SECRET` was already in the
 * environment and wired to nothing, so falling back to it means verification
 * starts working on deploy instead of waiting on a new setting — the difference
 * between three endpoints being fixed and three endpoints returning 503.
 *
 * @param {string} channel - 'whatsapp' | 'facebook' | 'messenger'
 * @param {object} [env] - defaults to process.env; injectable for tests
 * @returns {string} the secret, or '' when none is configured
 */
export function metaAppSecret(channel, env = process.env) {
  const channelVar = CHANNEL_SECRET_VARS[channel];
  return clean(channelVar ? env[channelVar] : '')
    || clean(env.META_APP_SECRET)
    || clean(env.FACEBOOK_APP_SECRET);
}

/**
 * Whether `header` is Meta's signature for `rawBody` under `secret`.
 *
 * The body must be the exact bytes Meta sent. Re-serializing parsed JSON
 * reorders nothing but does change spacing, which breaks every signature — so
 * callers read the body as text and parse only after this returns true.
 *
 * @param {string} rawBody - the unparsed request body
 * @param {string} header - the X-Hub-Signature-256 header value
 * @param {string} secret - the Meta app secret
 * @returns {boolean}
 */
export function metaSignatureMatches(rawBody, header, secret) {
  const key = clean(secret);
  if (!key) return false;

  // Meta always prefixes the digest. Anything else is not a signature we know
  // how to check, and guessing at it would defeat the point of checking.
  const supplied = clean(header).toLowerCase();
  if (!supplied.startsWith('sha256=')) return false;
  const suppliedHex = supplied.slice('sha256='.length);
  if (!/^[0-9a-f]{64}$/.test(suppliedHex)) return false;

  const expectedHex = crypto
    .createHmac('sha256', key)
    .update(String(rawBody ?? ''), 'utf8')
    .digest('hex');

  // Both are known-length hex by this point, so timingSafeEqual can never throw
  // on a length mismatch — but compare lengths anyway rather than rely on it.
  const expectedBuffer = Buffer.from(expectedHex, 'utf8');
  const suppliedBuffer = Buffer.from(suppliedHex, 'utf8');
  return expectedBuffer.length === suppliedBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, suppliedBuffer);
}

/**
 * The header name Meta signs with, exported so routes and tests agree on it.
 */
export const META_SIGNATURE_HEADER = 'x-hub-signature-256';
