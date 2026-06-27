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
