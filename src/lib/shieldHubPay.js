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
