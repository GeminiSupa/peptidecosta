import crypto from 'node:crypto';

export class RequestBodyError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'RequestBodyError';
    this.status = status;
  }
}

export async function readLimitedJson(request, maxBytes) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > maxBytes) throw new RequestBodyError('Request body too large', 413);

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, 'utf8') > maxBytes) {
    throw new RequestBodyError('Request body too large', 413);
  }

  try {
    return { rawBody, body: JSON.parse(rawBody) };
  } catch {
    throw new RequestBodyError('Invalid JSON body', 400);
  }
}

export function getRequestIp(request) {
  const forwarded = request.headers.get('x-forwarded-for')
    || request.headers.get('x-real-ip')
    || '';
  return forwarded.split(',')[0].trim() || 'unknown';
}

function isCompanyHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  return host === 'peptidescostarica.net' || host.endsWith('.peptidescostarica.net');
}

/**
 * Browser POSTs must originate on the storefront/company domain. This is a
 * CSRF/cross-site abuse control, not a substitute for the durable limiter.
 */
export function isTrustedStorefrontRequest(request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;

  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);
    if (originUrl.origin === requestUrl.origin) return true;
    if (originUrl.protocol === 'https:' && isCompanyHost(originUrl.hostname)) return true;

    return process.env.NODE_ENV !== 'production'
      && ['localhost', '127.0.0.1', '::1'].includes(originUrl.hostname);
  } catch {
    return false;
  }
}

function rateLimitHash(value) {
  const salt = process.env.API_RATE_LIMIT_SALT
    || process.env.INTERNAL_API_SECRET
    || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!salt) throw new Error('API rate-limit salt is not configured');
  return crypto.createHmac('sha256', salt).update(String(value || 'unknown')).digest('hex');
}

function firstRpcRow(data) {
  if (Array.isArray(data)) return data[0] || null;
  return data && typeof data === 'object' ? data : null;
}

/**
 * Consume an atomic Postgres-backed limit. The migration deliberately grants
 * this RPC only to service_role, so public clients cannot reset their counters.
 */
export async function consumeDurableRateLimit(supabase, {
  bucket,
  key,
  limit,
  windowSeconds,
}) {
  const { data, error } = await supabase.rpc('consume_api_rate_limit', {
    p_bucket: String(bucket),
    p_key_hash: rateLimitHash(key),
    p_limit: Number(limit),
    p_window_seconds: Number(windowSeconds),
  });

  if (error) {
    console.error(`[security] Durable rate limiter unavailable for ${bucket}:`, error.message);
    return { allowed: false, unavailable: true, retryAfter: 60 };
  }

  const row = firstRpcRow(data) || {};
  return {
    allowed: row.allowed === true,
    remaining: Math.max(0, Number(row.remaining) || 0),
    retryAfter: Math.max(1, Number(row.retry_after) || windowSeconds),
  };
}

export function rateLimitHeaders(result) {
  return {
    'Retry-After': String(result.retryAfter || 60),
    'Cache-Control': 'no-store',
  };
}
