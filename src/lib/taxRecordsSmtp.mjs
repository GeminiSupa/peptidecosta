import nodemailer from 'nodemailer';

// Accounting uses its own SMTP mailbox whenever one is configured. PBAG is a
// Rackspace mailbox, and an Elastic submission can be accepted synchronously
// but rejected later at Rackspace's boundary. Treating that acceptance as
// delivery produced false success reports, so Elastic must never outrank the
// accounting mailbox.

const SMTP_TIMEOUTS = {
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 20000,
};

const read = (env, name) => {
  const raw = env?.[name];
  return typeof raw === 'string' ? raw.trim() : raw;
};

export function isRackspaceMailHost(host) {
  return /(^|\.)emailsrvr\.com$/i.test(String(host || '').trim());
}

export function getTaxRecordsSmtpConfig(env = process.env) {
  const dedicatedHost = read(env, 'TAX_RECORDS_SMTP_HOST');
  const legacyHost = read(env, 'SMTP_HOST');
  const useDedicated = Boolean(dedicatedHost);
  // The legacy SMTP_* account is inherited only when it is the Rackspace
  // mailbox. Elastic accepts a submission and can still have it refused at
  // Rackspace's boundary later, so an Elastic login here would report a
  // delivery to the accountant that never happened.
  const useRackspaceMailbox = !useDedicated && isRackspaceMailHost(legacyHost);

  const prefix = useDedicated ? 'TAX_RECORDS_SMTP_' : 'SMTP_';
  const host = useDedicated
    ? dedicatedHost
    : (useRackspaceMailbox ? legacyHost : '');
  const port = Number(read(env, `${prefix}PORT`) || 465);
  const rawSecure = read(env, `${prefix}SECURE`);
  const secure = port === 465 ? rawSecure !== 'false' : false;
  const user = host ? read(env, `${prefix}USER`) : '';
  const pass = host ? read(env, `${prefix}PASS`) : '';
  const configured = Boolean(host && user && pass);
  const explicitFrom = read(env, 'TAX_RECORDS_SMTP_FROM');
  const from = explicitFrom || (user ? `Peptides Costa Rica Records <${user}>` : '');

  return {
    host,
    port,
    secure,
    user,
    pass,
    from,
    configured,
    source: useDedicated
      ? 'dedicated-accounting-smtp'
      : (useRackspaceMailbox ? 'rackspace-local-mailbox' : 'transactional-fallback'),
    provider: isRackspaceMailHost(host) ? 'Rackspace' : (host ? 'Custom SMTP' : null),
  };
}

/**
 * Resolve the transport used only for the accountant's private copy.
 *
 * Accounting SMTP is required. Failures are surfaced instead of being hidden
 * behind an Elastic submission that is known not to prove delivery to PBAG.
 * Reading the environment here keeps warm serverless instances from freezing
 * a deployment's old credentials.
 */
export function resolveTaxRecordsMailer({
  env = process.env,
  createTransport = (config) => nodemailer.createTransport(config),
} = {}) {
  const smtp = getTaxRecordsSmtpConfig(env);
  if (!smtp.configured) {
    return {
      transporter: null,
      from: smtp.from,
      source: 'unconfigured',
      configured: false,
    };
  }

  const accountingTransporter = createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
    ...SMTP_TIMEOUTS,
  });

  return {
    transporter: accountingTransporter,
    from: smtp.from,
    source: smtp.source,
    configured: true,
  };
}
