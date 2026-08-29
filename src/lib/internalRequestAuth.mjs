import crypto from 'node:crypto';

const SIGNATURE_HEADER = 'x-costa-internal-signature';
const TIMESTAMP_HEADER = 'x-costa-internal-timestamp';
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

function signingSecret() {
  return String(
    process.env.INTERNAL_API_SECRET
      || process.env.SUPABASE_SERVICE_ROLE_KEY
      || ''
  ).trim();
}

function signatureFor(path, timestamp, rawBody, secret = signingSecret()) {
  if (!secret) throw new Error('INTERNAL_API_SECRET is not configured');
  return crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}\n${path}\n${rawBody}`)
    .digest('base64url');
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Headers for a server-to-server call to a privileged internal route. */
export function internalJsonHeaders(rawBody, path, { timestamp = Date.now(), secret } = {}) {
  const body = String(rawBody || '');
  const stamp = String(timestamp);
  return {
    'Content-Type': 'application/json',
    [TIMESTAMP_HEADER]: stamp,
    [SIGNATURE_HEADER]: signatureFor(path, stamp, body, secret),
  };
}

/** Verify a short-lived, body-bound server signature. */
export function verifyInternalRequest(request, rawBody, path, {
  now = Date.now(),
  secret = signingSecret(),
} = {}) {
  if (!secret) return false;

  const timestamp = request.headers.get(TIMESTAMP_HEADER);
  const supplied = request.headers.get(SIGNATURE_HEADER);
  const timestampMs = Number(timestamp);
  if (!timestamp || !supplied || !Number.isFinite(timestampMs)) return false;
  if (Math.abs(now - timestampMs) > MAX_CLOCK_SKEW_MS) return false;

  return safeEqual(supplied, signatureFor(path, timestamp, String(rawBody || ''), secret));
}

export const INTERNAL_SIGNATURE_MAX_AGE_MS = MAX_CLOCK_SKEW_MS;
