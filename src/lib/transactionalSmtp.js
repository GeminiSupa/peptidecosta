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
  const host = readEnv('ORDER_SMTP_HOST');
  const port = Number(readEnv('ORDER_SMTP_PORT') || 2525);
  const rawSecure = readEnv('ORDER_SMTP_SECURE');
  // Nodemailer's `secure: true` is implicit TLS. Elastic Email ports 2525 and
  // 587 use STARTTLS, so they must always start with an unencrypted socket.
  const secure = port === 465 ? rawSecure !== 'false' : false;
  const user = readEnv('ORDER_SMTP_USER');
  const pass = readEnv('ORDER_SMTP_PASS');
  const elastic = /(^|\.)smtp\.elasticemail\.com$/i.test(host || '');
  const campaignUser = readEnv('CAMPAIGN_SMTP_USER');
  const sharesCampaignIdentity = Boolean(user && campaignUser && user.toLowerCase() === campaignUser.toLowerCase());

  // Sharing one login with the campaign account is bad — it shares a daily
  // quota, so a blast that hits "421 Daily limit exceeded" can take order
  // receipts with it. Refusing to send at all is worse. That refusal ran from
  // 15 Aug 2026 and silently dropped every receipt, every accountant tax copy
  // and every lead alert for days, because the deployment only ever had the one
  // Elastic credential. Send on a shared login and report it loudly instead:
  // `isolated` stays false and /api/admin/email-diagnostics keeps naming it
  // until a second credential exists.
  const usable = Boolean(host && user && pass && elastic);

  return {
    host,
    port,
    secure,
    user,
    pass,
    configured: usable,
    isolated: usable && !sharesCampaignIdentity,
    sharesCampaignIdentity,
    provider: elastic ? 'Elastic Email' : null,
  };
}
