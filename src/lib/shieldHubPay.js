import crypto from 'crypto';

const SHIELD_HUB_PAY_BASE_URL = process.env.SHIELD_HUB_PAY_BASE_URL || 'https://pgw.shieldhubpay.com';
const SHIELD_HUB_PAY_CLIENT_ID = process.env.SHIELD_HUB_PAY_CLIENT_ID;
const SHIELD_HUB_PAY_API_SECRET = process.env.SHIELD_HUB_PAY_API_SECRET;

export function isShieldHubPayConfigured() {
  return Boolean(SHIELD_HUB_PAY_CLIENT_ID && SHIELD_HUB_PAY_API_SECRET);
}

export function buildShieldHubPayHash(amount, transactionReference) {
  return crypto
    .createHash('sha256')
    .update(`${SHIELD_HUB_PAY_CLIENT_ID}${amount}${transactionReference}${SHIELD_HUB_PAY_API_SECRET}`)
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
export async function getShieldHubPayTransaction(transactionId) {
  if (!isShieldHubPayConfigured()) {
    throw new Error('Shield Hub Pay credentials are not configured');
  }

  const hash = crypto
    .createHash('sha256')
    .update(`${SHIELD_HUB_PAY_CLIENT_ID}${transactionId}${SHIELD_HUB_PAY_API_SECRET}`)
    .digest('hex');

  const response = await fetch(`${SHIELD_HUB_PAY_BASE_URL}/api/transaction/${encodeURIComponent(transactionId)}`, {
    headers: {
      Accept: 'application/json',
      'client-id': SHIELD_HUB_PAY_CLIENT_ID,
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

export async function processShieldHubPayTransaction(payload) {
  if (!isShieldHubPayConfigured()) {
    throw new Error('Shield Hub Pay credentials are not configured');
  }

  const response = await fetch(`${SHIELD_HUB_PAY_BASE_URL}/api/transaction`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'client-id': SHIELD_HUB_PAY_CLIENT_ID,
      'client-hash': buildShieldHubPayHash(payload.amount, payload.transaction_reference),
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error?.messsage || data?.error?.message || `Shield Hub Pay returned ${response.status}`);
  }

  return data;
}
