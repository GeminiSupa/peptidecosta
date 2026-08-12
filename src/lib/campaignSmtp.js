// Secrets get pasted into dashboards and piped in from shells, so a stray
// newline or space rides along more often than not. A trailing "\n" on the host
// survives all the way to the DNS lookup, which then fails with an error that
// names neither the variable nor the whitespace.
function readEnv(name) {
  const raw = process.env[name];
  return typeof raw === 'string' ? raw.trim() : raw;
}

const CAMPAIGN_FROM_EMAIL = readEnv('CAMPAIGN_SMTP_FROM_EMAIL')
  || readEnv('SMTP_FROM')
  || readEnv('SMTP_USER')
  || 'info@peptidescostarica.net';

function resolveSecureMode(port) {
  const raw = readEnv('CAMPAIGN_SMTP_SECURE') ?? readEnv('SMTP_SECURE');
  const normalized = String(raw || '').trim().toLowerCase();

  if (port === 465) return normalized === 'false' ? false : true;
  if (normalized === 'false') return false;

  // Nodemailer `secure: true` means implicit TLS, which is normally only port
  // 465. Campaign providers such as Elastic Email use STARTTLS on 2525/587.
  return false;
}

export function getCampaignSmtpConfig() {
  const host = readEnv('CAMPAIGN_SMTP_HOST') || readEnv('SMTP_HOST');
  const port = Number(readEnv('CAMPAIGN_SMTP_PORT') || readEnv('SMTP_PORT') || 465);
  const secure = resolveSecureMode(port);
  const user = readEnv('CAMPAIGN_SMTP_USER') || readEnv('SMTP_USER');
  const pass = readEnv('CAMPAIGN_SMTP_PASS') || readEnv('SMTP_PASS');
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

// Campaign volume through the Rackspace mailbox is what got
// info@peptidescostarica.net blocked for "Spam/Abuse Pattern Detected" on
// 2026-08-12, after ~1,400 marketing emails went out in two hours. Rackspace
// warned that a repeat may block the mailbox for good, which would take down
// receiving for the whole business, not just sending.
//
// So campaigns now fail closed. When the campaign sender is rejected -- daily
// cap, bad credentials, anything -- the send errors out visibly instead of
// silently rerouting marketing through the shared inbox. Transactional mail
// keeps its own SMTP_* fallback (see transactionalSmtp.js); only campaign
// volume is barred. Set CAMPAIGN_SMTP_ALLOW_RACKSPACE_FALLBACK=true to opt
// back in once the mailbox is provably safe for bulk again.
export function getCampaignRackspaceFallbackSmtpConfig(primary) {
  if (readEnv('CAMPAIGN_SMTP_ALLOW_RACKSPACE_FALLBACK') !== 'true') return null;

  const host = readEnv('SMTP_HOST');
  const port = Number(readEnv('SMTP_PORT') || 465);
  const user = readEnv('SMTP_USER');
  const pass = readEnv('SMTP_PASS');
  if (!host || !user || !pass) return null;

  const isSameAsPrimary = primary
    && primary.host === host
    && Number(primary.port) === port
    && primary.user === user;
  if (isSameAsPrimary) return null;

  const fromEmail = readEnv('SMTP_FROM') || user || 'info@peptidescostarica.net';
  return {
    host,
    port,
    secure: readEnv('SMTP_SECURE') !== 'false',
    user,
    pass,
    from: readEnv('CAMPAIGN_FROM') || `Peptides Costa Rica <${fromEmail}>`,
    replyTo: readEnv('CAMPAIGN_REPLY_TO') || readEnv('SMTP_REPLY_TO') || fromEmail,
    configured: true,
  };
}
