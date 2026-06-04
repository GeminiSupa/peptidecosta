// Shared authorization for the external bot endpoints (/api/bot/*).
//
// Keyless by design: the caller is authorized by an ALLOWLIST of egress IPs
// and/or origins. This is the single place to manage who can reach the bot
// endpoints — edit the arrays below and redeploy. Fail-closed: if BOTH arrays
// are empty, every bot endpoint is disabled (503).

// ─── ALLOWLIST ──────────────────────────────────────────────────────────────
//   ALLOWED_IPS:     for server-to-server bots. Use the bot host's public
//                    outbound/egress IP(s). IPv4 or IPv6.

//   ALLOWED_ORIGINS: for browser-based callers (e.g. a future chat widget).
//                    Full origins like 'https://bot.yourdomain.com'.
export const ALLOWED_IPS = [
  '89.117.149.101',
];

export const ALLOWED_ORIGINS = [
  // 'https://bot.yourdomain.com',
];

/** True client IP as seen by the hosting proxy (not user-spoofable on Vercel). */
export function getClientIp(req) {
  const real = (req.headers.get('x-real-ip') || '').trim();
  if (real) return real;
  const xff = req.headers.get('x-forwarded-for') || '';
  return xff.split(',')[0].trim();
}

/** Normalized origin (scheme://host[:port]) from Origin or Referer header. */
export function getOriginHost(req) {
  const raw = req.headers.get('origin') || req.headers.get('referer') || '';
  if (!raw) return '';
  try {
    return new URL(raw).origin;
  } catch {
    return '';
  }
}

/**
 * Allowlist check.
 * @returns {{ configured: boolean, ok: boolean, ip: string, origin: string }}
 *   configured=false => allowlist empty (caller should return 503)
 *   ok=false         => caller not allowed (return 403)
 */
export function authorizeBot(req) {
  const configured = ALLOWED_IPS.length > 0 || ALLOWED_ORIGINS.length > 0;
  const ip = getClientIp(req);
  const origin = getOriginHost(req);

  if (!configured) return { configured: false, ok: false, ip, origin };

  const ok =
    (ip && ALLOWED_IPS.includes(ip)) ||
    (origin && ALLOWED_ORIGINS.includes(origin));

  return { configured: true, ok: Boolean(ok), ip, origin };
}
