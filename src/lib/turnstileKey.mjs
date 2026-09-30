/**
 * Cloudflare publishes a few site keys and secrets that always pass and
 * print "For testing only" on the page. Those must never be treated as the
 * live shop check.
 */
export function isDummyTurnstileKey(value) {
  const key = String(value || '').trim();
  return !key || /^[123]x/i.test(key);
}
