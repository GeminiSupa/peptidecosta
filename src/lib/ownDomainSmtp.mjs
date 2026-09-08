/**
 * Mail addressed to our own domain has to leave from our own mail host.
 *
 * WHY THIS EXISTS
 *
 * peptidescostarica.net receives mail at Rackspace (MX: mx1.emailsrvr.com).
 * Everything the app sends goes out through Elastic Email. Rackspace treats
 * inbound mail that claims to be from its own hosted domain, arriving from
 * anywhere other than Rackspace, as spoofing and refuses it at its boundary —
 * SPF authorising Elastic does not change that; it is a separate own-domain
 * rule.
 *
 * The failure is silent, which is what made it expensive. Elastic accepts the
 * submission and returns success, so the app logs "sent" and moves on. The
 * rejection happens later, at Rackspace, with nothing in the app to record it.
 * From 12 Aug 2026 every new-order alert to info@peptidescostarica.net was
 * lost this way while the dashboard reported delivery, and the workaround was
 * a personal address CC'd onto the recipient list ("Joe (temp CC until info@
 * fixed)").
 *
 * The accounting report hit the same wall and was given its own Rackspace
 * mailbox (TAX_RECORDS_SMTP_*, see taxRecordsSmtp.mjs). This is the same
 * remedy for order notifications.
 *
 * WHY IT IS DELIBERATELY NARROW
 *
 * Only recipients AT our own domain are moved. Everyone else — gmail, icloud,
 * hotmail, the whole rest of the list — keeps going through Elastic exactly as
 * before. Rackspace is a small business mailbox, not a sending platform, and
 * pushing general volume through it is how a mailbox gets rate-limited or
 * blocked. This is the owner's explicit instruction: Rackspace carries the
 * own-domain copy and nothing else.
 *
 * MARKETING MUST NEVER USE THIS. Campaigns and broadcasts stay on Elastic
 * under CAMPAIGN_SMTP_*. Routing bulk mail through the business mailbox is
 * what caused the 12 Aug abuse block in the first place; campaignSmtp.js
 * carries the same warning.
 *
 * WITHOUT CONFIGURATION this module reports "not configured" and every caller
 * falls back to the single Elastic send it did before — degraded exactly as
 * today, never broken.
 *
 * TO ENABLE: set OWN_DOMAIN_SMTP_HOST / _PORT / _USER / _PASS to a Rackspace
 * mailbox on peptidescostarica.net (secure.emailsrvr.com:465). Optionally
 * OWN_DOMAIN_SMTP_FROM; it defaults to the mailbox's own address, which is
 * the point — Rackspace accepts its own user sending as itself.
 */

export const OWN_MAIL_DOMAIN = 'peptidescostarica.net';

const read = (env, name) => {
  const raw = env?.[name];
  return typeof raw === 'string' ? raw.trim() : raw;
};

/** The address part of "Name <a@b.com>", lowercased. */
export function emailAddressOf(entry) {
  const raw = String(entry || '').trim();
  if (!raw) return '';
  const angled = raw.match(/<([^>]+)>/);
  return (angled ? angled[1] : raw).trim().toLowerCase();
}

/** True when this recipient is a mailbox on our own domain. */
export function isOwnDomainAddress(entry, domain = OWN_MAIL_DOMAIN) {
  const address = emailAddressOf(entry);
  return address.endsWith(`@${String(domain).toLowerCase()}`);
}

export function getOwnDomainSmtpConfig(env = process.env) {
  const host = read(env, 'OWN_DOMAIN_SMTP_HOST');
  const port = Number(read(env, 'OWN_DOMAIN_SMTP_PORT') || 465);
  const rawSecure = read(env, 'OWN_DOMAIN_SMTP_SECURE');
  // 465 is implicit TLS; anything else (587/2525) is STARTTLS.
  const secure = port === 465 ? rawSecure !== 'false' : rawSecure === 'true';
  const user = read(env, 'OWN_DOMAIN_SMTP_USER');
  const pass = read(env, 'OWN_DOMAIN_SMTP_PASS');
  const from = read(env, 'OWN_DOMAIN_SMTP_FROM')
    || (user ? `Peptides Costa Rica <${user}>` : '');

  return {
    host,
    port,
    secure,
    user,
    pass,
    from,
    configured: Boolean(host && user && pass),
  };
}

/**
 * Split an addressing block into the copy Rackspace must carry and the copy
 * Elastic keeps.
 *
 * The own-domain addresses are collapsed into a single `to` on the Rackspace
 * copy: cc and bcc distinctions exist to show the team who else was informed,
 * and preserving them across a split would show each side an incomplete list —
 * more misleading than a plain to.
 */
export function splitOwnDomainRecipients(addressing = {}, domain = OWN_MAIL_DOMAIN) {
  const pick = (list) => (Array.isArray(list) ? list : (list ? [list] : []));
  const own = [];
  const rest = {};

  for (const field of ['to', 'cc', 'bcc']) {
    const kept = [];
    for (const entry of pick(addressing[field])) {
      if (isOwnDomainAddress(entry, domain)) own.push(entry);
      else kept.push(entry);
    }
    rest[field] = kept;
  }

  // De-duplicate: the same mailbox listed twice would be mailed twice.
  const seen = new Set();
  const ownRecipients = own.filter((entry) => {
    const key = emailAddressOf(entry);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    ownRecipients,
    rest,
    hasOwn: ownRecipients.length > 0,
    hasRest: Boolean(rest.to.length || rest.cc.length || rest.bcc.length),
  };
}
