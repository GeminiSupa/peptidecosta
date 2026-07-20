const CAMPAIGN_FROM_EMAIL = process.env.CAMPAIGN_SMTP_FROM_EMAIL
  || process.env.SMTP_FROM
  || process.env.SMTP_USER
  || 'info@peptidescostarica.net';

function resolveSecureMode(port) {
  const raw = process.env.CAMPAIGN_SMTP_SECURE ?? process.env.SMTP_SECURE;
  const normalized = String(raw || '').trim().toLowerCase();

  if (port === 465) return normalized === 'false' ? false : true;
  if (normalized === 'false') return false;

  // Nodemailer `secure: true` means implicit TLS, which is normally only port
  // 465. Campaign providers such as Elastic Email use STARTTLS on 2525/587.
  return false;
}

export function getCampaignSmtpConfig() {
  const host = process.env.CAMPAIGN_SMTP_HOST || process.env.SMTP_HOST;
  const port = Number(process.env.CAMPAIGN_SMTP_PORT || process.env.SMTP_PORT || 465);
  const secure = resolveSecureMode(port);
  const user = process.env.CAMPAIGN_SMTP_USER || process.env.SMTP_USER;
  const pass = process.env.CAMPAIGN_SMTP_PASS || process.env.SMTP_PASS;
  const from = process.env.CAMPAIGN_FROM || `Peptides Costa Rica <${CAMPAIGN_FROM_EMAIL}>`;
  const replyTo = process.env.CAMPAIGN_REPLY_TO || CAMPAIGN_FROM_EMAIL;

  return {
    host,
    port,
    secure,
    user,
    pass,
    from,
    replyTo,
    configured: Boolean(host && user && pass),
  };
}

export function isCampaignRackspaceSmtp(config = getCampaignSmtpConfig()) {
  return /(emailsrvr|rackspace)/i.test(config.host || '');
}
