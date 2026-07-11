const TRUSTPILOT_OAUTH_URL = 'https://api.trustpilot.com/v1/oauth/oauth-business-users-for-applications/accesstoken';
const TRUSTPILOT_INVITATIONS_BASE = 'https://invitations-api.trustpilot.com/v1/private/business-units';

function readEnv(key) {
  const value = process.env[key];
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function compactObject(value) {
  if (Array.isArray(value)) {
    return value.map(compactObject).filter(item => item !== undefined);
  }

  if (!value || typeof value !== 'object') {
    return value === '' || value === undefined ? undefined : value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key, compactObject(item)])
      .filter(([, item]) => item !== undefined)
  );
}

function slugTag(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

function getReferenceNumber(order) {
  return String(order?.order_number || order?.id || '').trim();
}

export function isTrustpilotConfigured() {
  return (
    readEnv('TRUSTPILOT_REVIEW_INVITES_ENABLED') === 'true' &&
    Boolean(readEnv('TRUSTPILOT_API_KEY')) &&
    Boolean(readEnv('TRUSTPILOT_API_SECRET')) &&
    Boolean(readEnv('TRUSTPILOT_BUSINESS_UNIT_ID')) &&
    Boolean(readEnv('TRUSTPILOT_SERVICE_TEMPLATE_ID'))
  );
}

export function getTrustpilotConfigStatus() {
  return {
    enabled: readEnv('TRUSTPILOT_REVIEW_INVITES_ENABLED') === 'true',
    hasApiKey: Boolean(readEnv('TRUSTPILOT_API_KEY')),
    hasApiSecret: Boolean(readEnv('TRUSTPILOT_API_SECRET')),
    hasBusinessUnitId: Boolean(readEnv('TRUSTPILOT_BUSINESS_UNIT_ID')),
    hasServiceTemplateId: Boolean(readEnv('TRUSTPILOT_SERVICE_TEMPLATE_ID')),
    hasBusinessUserId: Boolean(readEnv('TRUSTPILOT_BUSINESS_USER_ID')),
  };
}

export function getTrustpilotLocale(order) {
  const explicitLocale = readEnv('TRUSTPILOT_INVITE_LOCALE');
  if (explicitLocale) return explicitLocale;
  return String(order?.currency || '').toUpperCase() === 'CRC' ? 'es-CR' : 'en-US';
}

export async function getTrustpilotAccessToken() {
  const apiKey = readEnv('TRUSTPILOT_API_KEY');
  const apiSecret = readEnv('TRUSTPILOT_API_SECRET');

  if (!apiKey || !apiSecret) {
    throw new Error('Trustpilot API key and secret are required.');
  }

  const response = await fetch(TRUSTPILOT_OAUTH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(`Trustpilot token request failed (${response.status}): ${text.slice(0, 300)}`);
  }

  if (!data?.access_token) {
    throw new Error('Trustpilot token response did not include an access_token.');
  }

  return data.access_token;
}

export async function createTrustpilotServiceInvitation(order) {
  if (!isTrustpilotConfigured()) {
    throw new Error('Trustpilot review invitations are not fully configured.');
  }

  const consumerEmail = String(order?.customer_email || '').trim();
  const referenceNumber = getReferenceNumber(order);

  if (!consumerEmail) {
    throw new Error('Order is missing customer_email.');
  }

  if (!referenceNumber) {
    throw new Error('Order is missing an order reference.');
  }

  const accessToken = await getTrustpilotAccessToken();
  const businessUnitId = readEnv('TRUSTPILOT_BUSINESS_UNIT_ID');
  const businessUserId = readEnv('TRUSTPILOT_BUSINESS_USER_ID');
  const templateId = readEnv('TRUSTPILOT_SERVICE_TEMPLATE_ID');
  const senderEmail = readEnv('TRUSTPILOT_SENDER_EMAIL') || readEnv('SMTP_USER');
  const replyTo = readEnv('TRUSTPILOT_REPLY_TO') || senderEmail;
  const senderName = readEnv('TRUSTPILOT_SENDER_NAME') || 'Peptides Costa Rica';
  const currencyTag = slugTag(order?.currency || 'unknown_currency');
  const paymentTag = slugTag(order?.payment_method || 'unknown_payment');

  if (!senderEmail || !replyTo) {
    throw new Error('Trustpilot sender email/reply-to is required. Set TRUSTPILOT_SENDER_EMAIL or SMTP_USER.');
  }

  const tags = [
    'verified_purchase',
    'order_complete',
    currencyTag && `currency_${currencyTag}`,
    paymentTag && `payment_${paymentTag}`,
  ].filter(Boolean);

  const payload = compactObject({
    replyTo,
    locale: getTrustpilotLocale(order),
    senderName,
    senderEmail,
    locationId: readEnv('TRUSTPILOT_LOCATION_ID'),
    referenceNumber,
    consumerName: String(order?.customer_name || '').trim() || 'Peptides Costa Rica customer',
    consumerEmail,
    type: 'email',
    serviceReviewInvitation: {
      templateId,
      preferredSendTime: readEnv('TRUSTPILOT_PREFERRED_SEND_TIME'),
      redirectUri: readEnv('TRUSTPILOT_REDIRECT_URI'),
      tags,
    },
  });

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  if (businessUserId) {
    headers['x-business-user-id'] = businessUserId;
  }

  const response = await fetch(`${TRUSTPILOT_INVITATIONS_BASE}/${businessUnitId}/email-invitations`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text || null;
  }

  if (!response.ok) {
    throw new Error(`Trustpilot invitation failed (${response.status}): ${text.slice(0, 500)}`);
  }

  return {
    ok: true,
    referenceNumber,
    response: data,
  };
}
