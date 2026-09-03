// Transactional (non-campaign) mail: order receipts, shipping notices, agent
// pay reports, inquiry replies, review requests.
//
// Transactional and marketing mail must use different Elastic Email users.
// Generic SMTP_* and CAMPAIGN_SMTP_* are intentionally ignored so a restricted
// Rackspace mailbox or a throttled campaign account can never block orders.
// Secrets get pasted into dashboards and piped in from shells, so a stray
// newline or space rides along more often than not. A trailing "\n" on the host
// survives all the way to the DNS lookup, which then fails with an error that
// names neither the variable nor the whitespace.
export function readEnv(name) {
  const raw = process.env[name];
  return typeof raw === 'string' ? raw.trim() : raw;
}

export function getTransactionalSmtpConfig() {
  const host = readEnv('ORDER_SMTP_HOST') || readEnv('SMTP_HOST');
  const port = Number(readEnv('ORDER_SMTP_PORT') || readEnv('SMTP_PORT') || 2525);
  const rawSecure = readEnv('ORDER_SMTP_SECURE') || readEnv('SMTP_SECURE');
  // Nodemailer's `secure: true` is implicit TLS. Elastic Email ports 2525 and
  // 587 use STARTTLS, so they must always start with an unencrypted socket.
  const secure = port === 465 ? rawSecure !== 'false' : false;
  const user = readEnv('ORDER_SMTP_USER') || readEnv('SMTP_USER');
  const pass = readEnv('ORDER_SMTP_PASS') || readEnv('SMTP_PASS');
  const elastic = /(^|\.)smtp\.elasticemail\.com$/i.test(host || '');
  const campaignUser = readEnv('CAMPAIGN_SMTP_USER');
  const sharesCampaignIdentity = Boolean(user && campaignUser && user.toLowerCase() === campaignUser.toLowerCase());

  // Allow Rackspace or any other SMTP provider if explicitly configured.
  const usable = Boolean(host && user && pass);

  return {
    host,
    port,
    secure,
    user,
    pass,
    configured: usable,
    isolated: usable && !sharesCampaignIdentity,
    sharesCampaignIdentity,
    provider: elastic ? 'Elastic Email' : (host?.includes('emailsrvr.com') ? 'Rackspace' : 'Other'),
  };
}

/**
 * The transactional sender, resolved now rather than at module load.
 *
 * Next evaluates a route module once, when it is first loaded. A route that
 * destructures this config at module scope captures whatever process.env held
 * at that instant and keeps it for the life of the deployment — so a build that
 * ran before ORDER_SMTP_* existed froze `undefined`, and every send behind a
 * `if (!SMTP_HOST) skip` guard quietly did nothing while still answering 200.
 * That is what silently dropped days of order mail; call this inside the
 * handler instead.
 */
export function getOrderMailSettings() {
  const smtp = getTransactionalSmtpConfig();
  return {
    smtp,
    from: process.env.ORDER_NOTIFICATION_FROM
      || `Peptides Costa Rica <${smtp.user || 'omerforce@gmail.com'}>`,
  };
}
