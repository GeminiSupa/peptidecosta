function hostOf(value) {
  try {
    return new URL(String(value)).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Hosts an unsigned tracking link is still allowed to reach.
 *
 * Mail already sitting in an inbox carries links minted before destinations
 * were signed, and there is no way to re-sign it. Those stay clickable as long
 * as they point back at our own site, which is what almost every campaign link
 * does. Anything off-domain has to prove it was one of ours.
 */
export function trackingSafeHosts(liveSiteUrl, env = process.env) {
  return new Set(
    [env.NEXT_PUBLIC_BASE_URL, env.NEXT_PUBLIC_SITE_URL, liveSiteUrl]
      .map(hostOf)
      .filter(Boolean),
  );
}

/**
 * The destination a tracking hop may send the browser to.
 *
 * The destination rides in a query parameter so the click can be recorded
 * before the redirect. Unchecked, that makes the endpoint an open redirect:
 * anyone can hand out a link on our own domain that lands wherever they like.
 * For a business whose deliverability is the product, hosting a phishing hop
 * costs more than the redirect itself.
 *
 * @param {string} rawUrl the `url` query parameter, already decoded
 * @param {{isSigned?: boolean, safeHosts?: Set<string>}} options
 * @returns {URL|null} null means "refuse, and send them to the homepage"
 */
export function resolveTrackingDestination(rawUrl, { isSigned = false, safeHosts = new Set() } = {}) {
  let target;
  try {
    target = new URL(String(rawUrl || ''));
  } catch {
    return null;
  }

  // javascript: and data: never reach a redirect, signature or not.
  if (!['http:', 'https:'].includes(target.protocol)) return null;
  if (isSigned) return target;
  return safeHosts.has(target.host.toLowerCase()) ? target : null;
}
