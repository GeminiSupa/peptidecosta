// Reusable Tilopay hosted-payment-link client.
//
// Mirrors the proven flow in src/app/api/tilopay/create-payment/route.js
// (login -> createLinkPayment) but as a standalone, importable function so the
// bot checkout endpoint can generate shareable single-use payment links without
// duplicating gateway logic. The existing route is intentionally left untouched.

const TILOPAY_BASE = process.env.TILOPAY_BASE_URL || 'https://app.tilopay.com';
const TILOPAY_API_USER = process.env.TILOPAY_API_USER;
const TILOPAY_API_PASS = process.env.TILOPAY_API_PASS;
const TILOPAY_API_KEY = process.env.TILOPAY_API_KEY;
const TILOPAY_REDIRECT_URL = process.env.TILOPAY_REDIRECT_URL || 'https://catalog.peptidescostarica.net/catalog';

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export const TILOPAY_METHODS = ['tilopay', 'sinpe', 'sinpemovil'];

export function isTilopayConfigured() {
  return Boolean(TILOPAY_API_USER && TILOPAY_API_PASS && TILOPAY_API_KEY);
}

function buildMethodFields({ paymentMethod, customerIdType, customerIdNumber }) {
  if (paymentMethod === 'sinpe' || paymentMethod === 'sinpemovil') {
    const dni = (customerIdNumber || '').replace(/\s+/g, '');
    return {
      method: 'sinpemovil',
      paymentMethod: 'sinpemovil',
      typeDni: Number(customerIdType || 1),
      dni,
    };
  }
  return {};
}

async function getToken() {
  const res = await fetch(`${TILOPAY_BASE}/api/v1/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': BROWSER_UA,
      Accept: 'application/json',
    },
    body: JSON.stringify({
      email: TILOPAY_API_USER,
      password: TILOPAY_API_PASS,
      api_key: TILOPAY_API_KEY,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Tilopay authentication failed (${res.status}): ${err || res.statusText}`);
  }

  const data = await res.json().catch(() => ({}));
  const token = data?.token || data?.access_token || data?.data?.token;
  if (!token) throw new Error('Tilopay did not return an access token');
  return token;
}

/**
 * Create a single-use Tilopay hosted payment link.
 *
 * @param {Object} args
 * @param {number} args.amount            Amount in the given currency.
 * @param {'USD'|'CRC'} args.currency
 * @param {string} args.orderNumber       Used as the Tilopay reference.
 * @param {string} args.customerName
 * @param {'tilopay'|'sinpe'|'sinpemovil'} [args.paymentMethod='tilopay']
 * @param {string|number} [args.customerIdType]   Required for SINPE.
 * @param {string} [args.customerIdNumber]        Required for SINPE.
 * @param {string} [args.description]
 * @returns {Promise<{ paymentUrl: string }>}
 */
export async function createTilopayPaymentLink({
  amount,
  currency,
  orderNumber,
  customerName,
  paymentMethod = 'tilopay',
  customerIdType,
  customerIdNumber,
  description,
}) {
  if (!isTilopayConfigured()) {
    throw new Error('Tilopay credentials are not configured');
  }
  if (!TILOPAY_METHODS.includes(paymentMethod)) {
    throw new Error(`Unsupported Tilopay method: ${paymentMethod}`);
  }

  const token = await getToken();

  const formattedAmount = currency === 'CRC'
    ? String(Math.round(amount))
    : String(Number(amount).toFixed(2));

  const payload = {
    key: TILOPAY_API_KEY,
    amount: formattedAmount,
    currency,
    reference: orderNumber,
    type: 1, // single-use payment link
    description: description || `Costa Peptides Order ${orderNumber}`,
    client: (customerName || 'Customer').trim(),
    callback_url: TILOPAY_REDIRECT_URL,
    ...buildMethodFields({ paymentMethod, customerIdType, customerIdNumber }),
  };

  const res = await fetch(`${TILOPAY_BASE}/api/v1/createLinkPayment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'User-Agent': BROWSER_UA,
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  const paymentUrl = data?.url || data?.data?.url || data?.redirectUrl;

  if (!res.ok || !paymentUrl) {
    throw new Error(
      data?.description || data?.message || `Tilopay did not return a payment URL (${res.status})`
    );
  }

  return { paymentUrl };
}
