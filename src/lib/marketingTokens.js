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
