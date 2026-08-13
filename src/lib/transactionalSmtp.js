// Transactional (non-campaign) mail: order receipts, shipping notices, agent
// pay reports, inquiry replies, review requests.
//
// ORDER_SMTP_* wins whenever it is set. Otherwise transactional mail reuses the
// dedicated Elastic Email CAMPAIGN_SMTP_* account. Generic SMTP_* settings are
// intentionally ignored so a legacy Rackspace mailbox can never be selected.
// Secrets get pasted into dashboards and piped in from shells, so a stray
// newline or space rides along more often than not. A trailing "\n" on the host
// survives all the way to the DNS lookup, which then fails with an error that
// names neither the variable nor the whitespace.
export function readEnv(name) {
  const raw = process.env[name];
  return typeof raw === 'string' ? raw.trim() : raw;
}

export function getTransactionalSmtpConfig() {
  const host = readEnv('ORDER_SMTP_HOST') || readEnv('CAMPAIGN_SMTP_HOST');
  const port = Number(readEnv('ORDER_SMTP_PORT') || readEnv('CAMPAIGN_SMTP_PORT') || 2525);
  const rawSecure = readEnv('ORDER_SMTP_SECURE') ?? readEnv('CAMPAIGN_SMTP_SECURE');
  // Nodemailer's `secure: true` is implicit TLS. Elastic Email ports 2525 and
  // 587 use STARTTLS, so they must always start with an unencrypted socket.
  const secure = port === 465 ? rawSecure !== 'false' : false;
  const user = readEnv('ORDER_SMTP_USER') || readEnv('CAMPAIGN_SMTP_USER');
  const pass = readEnv('ORDER_SMTP_PASS') || readEnv('CAMPAIGN_SMTP_PASS');
  const elastic = /(^|\.)smtp\.elasticemail\.com$/i.test(host || '');

  return {
    host,
    port,
    secure,
    user,
    pass,
    configured: Boolean(host && user && pass && elastic),
    provider: elastic ? 'Elastic Email' : null,
  };
}
