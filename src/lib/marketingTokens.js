import crypto from 'crypto';

function getSecret() {
  return process.env.UNSUBSCRIBE_SECRET || process.env.NEXTAUTH_SECRET || process.env.EMAIL_PASS || 'local-marketing-secret';
}

function sign(value) {
  return crypto.createHmac('sha256', getSecret()).update(value).digest('base64url');
}

export function createUnsubscribeToken(subscriberId) {
  const id = String(subscriberId || '');
  return `${id}.${sign(id)}`;
}

export function verifyUnsubscribeToken(token) {
  const raw = String(token || '');
  const separator = raw.lastIndexOf('.');
  if (separator <= 0) return null;

  const id = raw.slice(0, separator);
  const signature = raw.slice(separator + 1);
  const expected = sign(id);

  if (signature.length !== expected.length) return null;

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) return null;

  return id;
}

// Broadcast recipients (order customers, custom lists) are not always in
// email_subscribers, so their unsubscribe link cannot carry a subscriber id.
// These tokens embed the email address itself, signed with the same secret.
const EMAIL_TOKEN_PREFIX = 'em!';

export function createEmailUnsubscribeToken(email) {
  const id = `${EMAIL_TOKEN_PREFIX}${Buffer.from(String(email || '').trim().toLowerCase()).toString('base64url')}`;
  return `${id}.${sign(id)}`;
}

// Returns the email address when the verified token id is an email-based one,
// otherwise null (meaning: treat the id as a subscriber id, the classic path).
export function decodeEmailUnsubscribeId(id) {
  if (!String(id || '').startsWith(EMAIL_TOKEN_PREFIX)) return null;
  try {
    const email = Buffer.from(String(id).slice(EMAIL_TOKEN_PREFIX.length), 'base64url').toString('utf8');
    return email.includes('@') ? email : null;
  } catch {
    return null;
  }
}

export function createJourneyTrackingToken(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${sign(encoded)}`;
}

export function verifyJourneyTrackingToken(token) {
  const raw = String(token || '');
  const separator = raw.lastIndexOf('.');
  if (separator <= 0) return null;
  const encoded = raw.slice(0, separator);
  const signature = raw.slice(separator + 1);
  const expected = sign(encoded);
  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}
