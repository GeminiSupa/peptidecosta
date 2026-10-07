export const ACCOUNT_TURNSTILE_ACTION = 'account_login';

export function isExpectedAccountTurnstileResult(result, requestUrl) {
  if (!result?.success || result.action !== ACCOUNT_TURNSTILE_ACTION) return false;

  try {
    const expectedHost = new URL(requestUrl).hostname.toLowerCase().replace(/\.$/, '');
    const responseHost = String(result.hostname || '').toLowerCase().replace(/\.$/, '');
    return Boolean(responseHost) && responseHost === expectedHost;
  } catch {
    return false;
  }
}

/**
 * Keep post-login navigation inside the private account area.
 *
 * Search params are attacker-controlled. Restricting them to a local path
 * prevents open redirects, protocol-relative URLs, and surprising jumps back
 * into a public checkout after the customer has just authenticated.
 */
export function safeAccountNext(value) {
  const candidate = String(value || '').trim();
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) {
    return '/account';
  }

  try {
    const parsed = new URL(candidate, 'https://account.invalid');
    const accountPath = parsed.pathname === '/account' || parsed.pathname.startsWith('/account/');
    if (parsed.origin !== 'https://account.invalid' || !accountPath) return '/account';
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/account';
  }
}
