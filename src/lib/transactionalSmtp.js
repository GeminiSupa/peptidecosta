// Transactional (non-campaign) mail: order receipts, shipping notices, agent
// pay reports, inquiry replies, review requests.
//
// ORDER_SMTP_* wins whenever it is set, so transactional mail can be pointed at
// a dedicated sending provider while SMTP_* stays behind untouched as the
// legacy account. Campaign delivery still falls back to SMTP_* on its own (see
// getCampaignRackspaceFallbackSmtpConfig), so leaving SMTP_* configured keeps
// that safety net intact rather than retiring the old provider outright.
//
// Deployments that only ever set SMTP_* keep working unchanged.
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
  const port = Number(readEnv('ORDER_SMTP_PORT') || readEnv('SMTP_PORT') || 465);
  // Nodemailer's `secure: true` means implicit TLS (normally port 465). Hosts
  // such as Elastic Email use STARTTLS on 2525/587 and need this off, so an
  // explicit 'false' has to survive the ORDER_SMTP_* -> SMTP_* fallback.
  const secure = (readEnv('ORDER_SMTP_SECURE') ?? readEnv('SMTP_SECURE')) !== 'false';
  const user = readEnv('ORDER_SMTP_USER') || readEnv('SMTP_USER');
  const pass = readEnv('ORDER_SMTP_PASS') || readEnv('SMTP_PASS');

  return {
    host,
    port,
    secure,
    user,
    pass,
    configured: Boolean(host && user && pass),
  };
}
