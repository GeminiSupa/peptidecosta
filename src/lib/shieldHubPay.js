import crypto from 'crypto';

const SHIELD_HUB_PAY_BASE_URL = process.env.SHIELD_HUB_PAY_BASE_URL || 'https://pgw.shieldhubpay.com';
const SHIELD_HUB_PAY_CLIENT_ID = process.env.SHIELD_HUB_PAY_CLIENT_ID;
const SHIELD_HUB_PAY_API_SECRET = process.env.SHIELD_HUB_PAY_API_SECRET;

// Sandbox credentials for admin-only payment testing. The gateway uses the same
// URL for both modes; which account a charge hits is decided purely by the
// credential pair. Nothing customer-facing ever passes mode='test' — the only
// caller is the superadmin test-payment route.
const SHIELD_HUB_PAY_TEST_CLIENT_ID = process.env.SHIELD_HUB_PAY_TEST_CLIENT_ID;
const SHIELD_HUB_PAY_TEST_API_SECRET = process.env.SHIELD_HUB_PAY_TEST_API_SECRET;

function getCreds(mode = 'live') {
  return mode === 'test'
    ? { clientId: SHIELD_HUB_PAY_TEST_CLIENT_ID, apiSecret: SHIELD_HUB_PAY_TEST_API_SECRET }
    : { clientId: SHIELD_HUB_PAY_CLIENT_ID, apiSecret: SHIELD_HUB_PAY_API_SECRET };
}

export function isShieldHubPayConfigured(mode = 'live') {
  const { clientId, apiSecret } = getCreds(mode);
  return Boolean(clientId && apiSecret);
}

export function buildShieldHubPayHash(amount, transactionReference, mode = 'live') {
  const { clientId, apiSecret } = getCreds(mode);
  return crypto
    .createHash('sha256')
    .update(`${clientId}${amount}${transactionReference}${apiSecret}`)
    .digest('hex');
}

export function normalizeShieldHubPayName(value, fallback = 'Customer') {
  const clean = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (clean) return clean;
  if (fallback && fallback !== value) return normalizeShieldHubPayName(fallback, 'Customer');
  return 'Customer';
}

// Authoritative transaction lookup (GET /api/transaction/{id}). Uses a different
// hash recipe than payments: sha256(clientId + transactionId + apiSecret).
// The gateway returns HTTP 200 even for auth failures ({errorCode: "002"}), so
// success is detected by the body echoing the requested transaction id.
export async function getShieldHubPayTransaction(transactionId, { mode = 'live' } = {}) {
  if (!isShieldHubPayConfigured(mode)) {
    throw new Error('Shield Hub Pay credentials are not configured');
  }

  const { clientId, apiSecret } = getCreds(mode);
  const hash = crypto
    .createHash('sha256')
    .update(`${clientId}${transactionId}${apiSecret}`)
    .digest('hex');

  const response = await fetch(`${SHIELD_HUB_PAY_BASE_URL}/api/transaction/${encodeURIComponent(transactionId)}`, {
    headers: {
      Accept: 'application/json',
      'client-id': clientId,
      'client-hash': hash,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || String(data?.id) !== String(transactionId)) {
    throw new Error(
      data?.errorMessage || data?.error?.messsage || data?.error?.message
        || `Shield Hub Pay transaction lookup failed (${response.status})`
    );
  }

  return data;
}

export async function processShieldHubPayTransaction(payload, { mode = 'live' } = {}) {
  if (!isShieldHubPayConfigured(mode)) {
    throw new Error('Shield Hub Pay credentials are not configured');
  }

  const { clientId } = getCreds(mode);
  const response = await fetch(`${SHIELD_HUB_PAY_BASE_URL}/api/transaction`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'client-id': clientId,
      'client-hash': buildShieldHubPayHash(payload.amount, payload.transaction_reference, mode),
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error?.messsage || data?.error?.message || `Shield Hub Pay returned ${response.status}`);
  }

  return data;
}
