export const ANALYTICS_ROOT_DOMAIN = 'peptidescostarica.net';

const LOCAL_ANALYTICS_ORIGINS = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

/**
 * Allow the production apex and every HTTPS subdomain while refusing lookalike
 * domains such as peptidescostarica.net.example.com.
 */
export function isAllowedAnalyticsOrigin(origin) {
  const candidate = String(origin || '').trim();
  if (!candidate) return false;
  if (LOCAL_ANALYTICS_ORIGINS.has(candidate)) return true;

  try {
    const url = new URL(candidate);
    const hostname = url.hostname.toLowerCase();
    return url.origin === candidate
      && url.protocol === 'https:'
      && (hostname === ANALYTICS_ROOT_DOMAIN || hostname.endsWith(`.${ANALYTICS_ROOT_DOMAIN}`));
  } catch {
    return false;
  }
}

export function allowedAnalyticsCorsOrigin(origin) {
  return isAllowedAnalyticsOrigin(origin) ? String(origin).trim() : '';
}
