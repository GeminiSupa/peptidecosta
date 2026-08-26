import nodemailer from 'nodemailer';

// Accounting stays on the same dedicated Elastic transport as the other
// transactional mail. Its recipient happens to live on Rackspace, so the only
// special handling is the From identity: use Elastic's external authenticated
// identity instead of presenting info@peptidescostarica.net from outside that
// domain. A separately configured Rackspace mailbox is fallback-only.

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

const emailDomain = (value) => {
  const match = String(value || '').trim().match(/@([^>\s]+)>?$/);
  return match?.[1]?.toLowerCase() || '';
};

export function taxRecordsFallbackFrom({ env = process.env, fallbackFrom = '', fallbackUser = '' } = {}) {
  const explicit = read(env, 'TAX_RECORDS_FROM');
  if (explicit) return explicit;

  // Elastic has already authenticated this identity. When its domain is not
  // the Rackspace-hosted business domain, using it in From avoids Rackspace's
  // same-domain spoof rule without inventing or spoofing a third-party sender.
  if (fallbackUser && emailDomain(fallbackUser) !== 'peptidescostarica.net') {
    return `Peptides Costa Rica Records <${String(fallbackUser).trim()}>`;
  }

  return String(fallbackFrom || '').trim();
}

/**
 * Resolve the transport used only for the accountant's private copy.
 *
 * A caller always supplies its normal Elastic transport as a safe fallback.
 * Elastic is always first when the caller has its transactional transport.
 * Rackspace (or an explicit accounting transport) is retained only as a retry
 * path. Reading the environment here keeps warm serverless instances from
 * freezing a deployment's old credentials.
 */
export function resolveTaxRecordsMailer({
  fallbackTransporter = null,
  fallbackFrom = '',
  fallbackUser = '',
  env = process.env,
  createTransport = (config) => nodemailer.createTransport(config),
} = {}) {
  const smtp = getTaxRecordsSmtpConfig(env);
  const externalFallbackFrom = taxRecordsFallbackFrom({ env, fallbackFrom, fallbackUser });
  if (fallbackTransporter && !smtp.configured) {
    return {
      transporter: fallbackTransporter,
      from: externalFallbackFrom,
      source: externalFallbackFrom !== String(fallbackFrom || '').trim()
        ? 'transactional-external-identity'
        : 'transactional-fallback',
      configured: Boolean(fallbackTransporter),
    };
  }

  if (!fallbackTransporter && !smtp.configured) {
    return {
      transporter: null,
      from: externalFallbackFrom,
      source: 'unconfigured',
      configured: false,
    };
  }

  const secondaryTransporter = createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
    ...SMTP_TIMEOUTS,
  });

  // Elastic is the proven, shared transactional path. If it refuses the send
  // at submission time, retry once through the optional accounting mailbox.
  const transporter = fallbackTransporter
    ? {
        async sendMail(message) {
          try {
            return await fallbackTransporter.sendMail({
              ...message,
              from: externalFallbackFrom,
            });
          } catch (primaryError) {
            console.error(`[Tax records transport] Elastic transactional send failed; retrying through ${smtp.source}: ${primaryError.message}`);
            return secondaryTransporter.sendMail({
              ...message,
              from: smtp.from,
            });
          }
        },
      }
    : secondaryTransporter;

  return {
    transporter,
    from: fallbackTransporter ? externalFallbackFrom : smtp.from,
    source: fallbackTransporter
      ? `transactional-external-identity-with-${smtp.source}-fallback`
      : smtp.source,
    configured: true,
  };
}
