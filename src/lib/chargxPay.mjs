import crypto from 'crypto';

const CHARGX_BASE_URL = process.env.CHARGX_API_BASE_URL || 'https://api.chargx.io';

function publishableKey(mode = 'live') {
  return mode === 'test'
    ? process.env.CHARGX_TEST_PUBLISHABLE_API_KEY
    : process.env.CHARGX_PUBLISHABLE_API_KEY;
}

export function isChargxConfigured(mode = 'live') {
  return Boolean(publishableKey(mode));
}

function parseJson(text) {
  const clean = String(text || '').replace(/^\uFEFF/, '').trim();
  if (!clean) return {};
  try {
    return JSON.parse(clean);
  } catch {
    return { message: clean.slice(0, 300) };
  }
}

async function chargxRequest(path, { mode = 'live', method = 'GET', body } = {}) {
  const key = publishableKey(mode);
  if (!key) throw new Error('Chargex credentials are not configured');

  const response = await fetch(`${CHARGX_BASE_URL}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      'x-publishable-api-key': key,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = parseJson(await response.text());
  return { ok: response.ok, status: response.status, data };
}

function assertHttpsTokenUrl(url) {
  let parsed;
  try {
    parsed = new URL(String(url || ''));
  } catch {
    throw new Error('Chargex did not return a card token address');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Chargex card token address is not secure');
  }
  return parsed.toString();
}

/**
 * Turn a tokenize response into the opaqueData object /transact expects.
 * Throws when the processor refused the card details.
 */
export function opaqueDataFromTokenResponse(data) {
  const opaque = data?.opaqueData;
  if (opaque?.dataDescriptor && opaque?.dataValue) {
    return { dataDescriptor: String(opaque.dataDescriptor), dataValue: String(opaque.dataValue) };
  }
  if (opaque?.token) return { token: String(opaque.token) };
  if (data?.token) return { token: String(data.token) };

  const resultCode = String(data?.messages?.resultCode || '');
  if (resultCode && resultCode.toLowerCase() !== 'ok') {
    const first = data.messages?.message?.[0];
    const text = typeof first === 'string' ? first : first?.text;
    throw new Error(text || 'Card could not be tokenized');
  }

  throw new Error('Chargex did not return a card token');
}

/**
 * Map a /transact body onto the status shape the checkout routes already store.
 * Returns null when the answer is not a clear approval or a clear decline.
 */
export function transactionFromChargxResponse(data, httpOk) {
  const message = String(data?.message || '').trim();
  const errors = Array.isArray(data?.error) ? data.error : [];
  const errorText = errors.map((entry) => entry?.errorText).filter(Boolean).join(' ').trim()
    || (typeof data?.error?.message === 'string' ? data.error.message.trim() : '');
  const theirId = data?.result?.orderId ? String(data.result.orderId) : null;
  const displayId = data?.result?.orderDisplayId ? String(data.result.orderDisplayId) : null;

  if (httpOk && /^ok$/i.test(message) && theirId) {
    return {
      id: theirId,
      status: 'Approved',
      authorization: displayId,
      descriptor_text: 'Chargex',
      message: 'Ok',
    };
  }

  if (errors.length || /declin|error/i.test(message)) {
    const reason = errorText || message || 'This transaction has been declined.';
    return {
      id: theirId,
      status: 'Declined',
      authorization: displayId,
      descriptor_text: 'Chargex',
      message: reason,
      error: { message: reason },
    };
  }

  return null;
}

function countryCode3(country) {
  const value = String(country || '').trim().toUpperCase();
  if (value === 'CR' || value === 'CRI' || value === 'COSTA RICA') return 'CRI';
  if (value === 'US' || value === 'USA' || value === 'UNITED STATES') return 'USA';
  if (/^[A-Z]{3}$/.test(value)) return value;
  return 'CRI';
}

function billingAddressForChargx(billing = {}, phone = '') {
  return {
    street: billing.address || 'N/A',
    unit: '',
    city: billing.city || 'San Jose',
    state: billing.state || 'San Jose',
    zipCode: billing.postal_code || '10101',
    countryCode: countryCode3(billing.country),
    phone: phone || undefined,
  };
}

/**
 * Tokenize the card with Chargex, then charge it.
 *
 * The card number is posted only to the token address Chargex just handed us.
 * It is not written to the order, and it is not included in the error text.
 *
 * mode 'test' refuses to continue when that key belongs to a live store.
 */
export async function processChargxCardPayment({
  amount,
  orderId,
  customer = {},
  billing = {},
  card = {},
}, { mode = 'live' } = {}) {
  if (!isChargxConfigured(mode)) {
    throw new Error('Chargex credentials are not configured');
  }

  const pre = await chargxRequest('/pretransact', { mode });
  if (!pre.ok || !pre.data?.cardTokenRequestUrl || !pre.data?.cardTokenRequestParams) {
    throw new Error(`Chargex pretransact failed (${pre.status})`);
  }
  if (mode === 'test' && pre.data.isProduction === true) {
    throw new Error('Chargex test key belongs to a live store. Refusing the charge.');
  }

  const expirationDate = `${String(card.expiry_month || '').padStart(2, '0')}${String(card.expiry_year || '')}`;
  const tokenBody = JSON.parse(
    JSON.stringify(pre.data.cardTokenRequestParams)
      .replaceAll('#cardNumber#', String(card.number || ''))
      .replaceAll('#expirationDate#', expirationDate)
      .replaceAll('#cardCode#', String(card.cvv || '')),
  );

  const tokenUrl = assertHttpsTokenUrl(pre.data.cardTokenRequestUrl);
  const tokenResponse = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(tokenBody),
  });
  const tokenData = parseJson(await tokenResponse.text());
  if (!tokenResponse.ok && !tokenData?.opaqueData && !tokenData?.token) {
    throw new Error(`Chargex card tokenization failed (${tokenResponse.status})`);
  }
  const opaqueData = opaqueDataFromTokenResponse(tokenData);

  const charged = await chargxRequest('/transact', {
    mode,
    method: 'POST',
    body: {
      currency: 'USD',
      amount: String(amount),
      type: 'fiat',
      opaqueData,
      cvv: String(card.cvv || ''),
      customer: {
        name: customer.name,
        email: customer.email,
        ...(customer.phone ? { phone: customer.phone } : {}),
      },
      billingAddress: billingAddressForChargx(billing, customer.phone),
      orderId: String(orderId),
    },
  });

  const transaction = transactionFromChargxResponse(charged.data, charged.ok);
  if (!transaction) {
    throw new Error(`Chargex charge was not confirmed (${charged.status})`);
  }
  return transaction;
}

/** HMAC of `{timestamp}.{rawBody}`, matching the Chargex webhook signature header. */
export function verifyChargxWebhookSignature({ secret, timestamp, signatureHeader, rawBody }) {
  if (!secret || !timestamp || !signatureHeader || rawBody == null) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  const offered = String(signatureHeader)
    .split(/\s+/)
    .map((part) => (part.startsWith('v1=') ? part.slice(3) : part))
    .filter((part) => part.length === expected.length);

  const expectedBuf = Buffer.from(expected);
  return offered.some((part) => crypto.timingSafeEqual(Buffer.from(part), expectedBuf));
}
