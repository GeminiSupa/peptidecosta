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
export function getTransactionalSmtpConfig() {
  const host = process.env.ORDER_SMTP_HOST || process.env.SMTP_HOST;
  const port = Number(process.env.ORDER_SMTP_PORT || process.env.SMTP_PORT || 465);
  // Nodemailer's `secure: true` means implicit TLS (normally port 465). Hosts
  // such as Elastic Email use STARTTLS on 2525/587 and need this off, so an
  // explicit 'false' has to survive the ORDER_SMTP_* -> SMTP_* fallback.
  const secure = (process.env.ORDER_SMTP_SECURE ?? process.env.SMTP_SECURE) !== 'false';
  const user = process.env.ORDER_SMTP_USER || process.env.SMTP_USER;
  const pass = process.env.ORDER_SMTP_PASS || process.env.SMTP_PASS;

  return {
    host,
    port,
    secure,
    user,
    pass,
    configured: Boolean(host && user && pass),
  };
}
