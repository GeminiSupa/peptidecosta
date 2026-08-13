// Secrets get pasted into dashboards and piped in from shells, so a stray
// newline or space rides along more often than not. A trailing "\n" on the host
// survives all the way to the DNS lookup, which then fails with an error that
// names neither the variable nor the whitespace.
function readEnv(name) {
  const raw = process.env[name];
  return typeof raw === 'string' ? raw.trim() : raw;
}

const CAMPAIGN_FROM_EMAIL = readEnv('CAMPAIGN_SMTP_FROM_EMAIL')
  || 'info@peptidescostarica.net';

function resolveSecureMode(port) {
  const raw = readEnv('CAMPAIGN_SMTP_SECURE');
  const normalized = String(raw || '').trim().toLowerCase();

  if (port === 465) return normalized === 'false' ? false : true;
  if (normalized === 'false') return false;

  // Nodemailer `secure: true` means implicit TLS, which is normally only port
  // 465. Campaign providers such as Elastic Email use STARTTLS on 2525/587.
  return false;
}

export function getCampaignSmtpConfig() {
  // Marketing mail is intentionally isolated from the generic SMTP_* mailbox.
  // If Elastic Email is missing or rejected, campaigns must stop visibly; they
  // must never inherit the Rackspace mailbox that receives business mail.
  const host = readEnv('CAMPAIGN_SMTP_HOST');
  const port = Number(readEnv('CAMPAIGN_SMTP_PORT') || 2525);
  const secure = resolveSecureMode(port);
  const user = readEnv('CAMPAIGN_SMTP_USER');
  const pass = readEnv('CAMPAIGN_SMTP_PASS');
  const from = readEnv('CAMPAIGN_FROM') || `Peptides Costa Rica <${CAMPAIGN_FROM_EMAIL}>`;
  const replyTo = readEnv('CAMPAIGN_REPLY_TO') || CAMPAIGN_FROM_EMAIL;

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

export function identifyCampaignSmtpProvider(host = '') {
  if (/elasticemail/i.test(host)) return 'Elastic Email';
  if (/rackspace|emailsrvr/i.test(host)) return 'Rackspace';
  return 'SMTP';
}

export function isElasticCampaignSmtp(config = getCampaignSmtpConfig()) {
  return /(^|\.)smtp\.elasticemail\.com$/i.test(config.host || '');
}
