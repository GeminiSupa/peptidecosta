// What the running deployment actually sees when it sends mail.
//
// Vercel does not read encrypted values back — `vercel env pull` returns blanks
// for most of them — so a misconfigured mailbox is invisible from outside the
// box. Four days of the August outage went into guessing at variables from the
// dashboard. This asks the process itself instead.
//
// Nothing here returns a secret. Passwords are reported as a boolean, logins are
// masked, and every other value shown is already visible in a mail header.

const status = (raw) => {
  if (raw === undefined || raw === null) return 'unset';
  return String(raw).trim() === '' ? 'EMPTY' : 'set';
};

const read = (env, name) => {
  const raw = env[name];
  return typeof raw === 'string' ? raw.trim() : raw;
};

/** First and last two characters, so two logins can be told apart without exposing either. */
export function maskLogin(value) {
  const text = String(value ?? '');
  if (!text) return '(none)';
  if (text.length <= 6) return '*'.repeat(text.length);
  return `${text.slice(0, 2)}${'*'.repeat(text.length - 4)}${text.slice(-2)}`;
}

// A value that survived a copy-paste with a newline or a trailing space still
// looks correct in the dashboard, and the resulting failure names neither the
// variable nor the whitespace. Report the shape, not the secret.
export function whitespaceWarning(env, names) {
  return names.filter((name) => {
    const raw = env[name];
    return typeof raw === 'string' && raw !== '' && raw !== raw.trim();
  });
}

/**
 * The From header each sender will actually put on the wire.
 *
 * These mirror the four call sites exactly, including their differences: the
 * shipped-order receipt reads process.env untrimmed, the lead alert trims and
 * consults two extra variables, and /api/order-notification hardcodes the
 * company inbox. Recomputing them here is the whole point — a From that quietly
 * falls back to the SMTP login is invisible until a customer complains.
 */
export function resolveFromHeaders(env, transactionalUser) {
  const orderShipped = env.ORDER_NOTIFICATION_FROM
    || `Peptides Costa Rica <${transactionalUser || 'omerforce@gmail.com'}>`;

  const leadFromEmail = read(env, 'ORDER_NOTIFICATION_FROM_EMAIL')
    || read(env, 'CAMPAIGN_SMTP_FROM_EMAIL')
    || transactionalUser;
  const leadAlert = read(env, 'ORDER_NOTIFICATION_FROM')
    || `Peptides Costa Rica <${leadFromEmail}>`;

  const campaignFromEmail = read(env, 'CAMPAIGN_SMTP_FROM_EMAIL') || 'info@peptidescostarica.net';
  const campaign = read(env, 'CAMPAIGN_FROM') || `Peptides Costa Rica <${campaignFromEmail}>`;

  return {
    orderCompleteReceipt: orderShipped,
    newOrderNotification: 'Peptides Costa Rica <info@peptidescostarica.net>',
    leadAlert,
    campaign,
  };
}

/** True when a From header ended up carrying the SMTP login instead of a company address. */
export function fromLeaksLogin(from, login) {
  if (!login) return false;
  return String(from || '').toLowerCase().includes(String(login).toLowerCase());
}

const TRANSACTIONAL_KEYS = [
  'ORDER_SMTP_HOST', 'ORDER_SMTP_PORT', 'ORDER_SMTP_SECURE', 'ORDER_SMTP_USER', 'ORDER_SMTP_PASS',
];
const CAMPAIGN_KEYS = [
  'CAMPAIGN_SMTP_HOST', 'CAMPAIGN_SMTP_PORT', 'CAMPAIGN_SMTP_SECURE',
  'CAMPAIGN_SMTP_USER', 'CAMPAIGN_SMTP_PASS', 'CAMPAIGN_SMTP_FROM_EMAIL', 'CAMPAIGN_FROM',
];
const ADDRESSING_KEYS = [
  'ORDER_NOTIFICATION_FROM', 'ORDER_NOTIFICATION_FROM_EMAIL', 'ORDER_NOTIFICATION_TO',
  'ORDER_NOTIFICATION_REPLY_TO', 'TAX_RECORDS_CC_EMAIL', 'LEAD_NOTIFICATION_TO',
];

export function buildEmailDiagnostics({ env = process.env, transactional, campaign } = {}) {
  const user = transactional?.user || '';
  const from = resolveFromHeaders(env, user);

  const envReport = {};
  for (const key of [...TRANSACTIONAL_KEYS, ...CAMPAIGN_KEYS, ...ADDRESSING_KEYS]) {
    envReport[key] = status(env[key]);
  }

  const problems = [];
  if (!transactional?.configured) {
    problems.push('Transactional SMTP is NOT configured — every order and lead email is being skipped.');
  }
  if (transactional?.sharesCampaignIdentity) {
    problems.push('ORDER_SMTP_USER matches CAMPAIGN_SMTP_USER — refused, so a campaign throttle would stop orders.');
  }
  if (fromLeaksLogin(from.orderCompleteReceipt, user)) {
    problems.push('Order-complete receipts are sent FROM the SMTP login, not info@ — set ORDER_NOTIFICATION_FROM.');
  }
  if (fromLeaksLogin(from.leadAlert, user)) {
    problems.push('Lead alerts are sent FROM the SMTP login, not info@ — set ORDER_NOTIFICATION_FROM.');
  }
  const dirty = whitespaceWarning(env, [...TRANSACTIONAL_KEYS, ...CAMPAIGN_KEYS, ...ADDRESSING_KEYS]);
  if (dirty.length) {
    problems.push(`Value has leading/trailing whitespace: ${dirty.join(', ')}`);
  }

  return {
    checkedAt: new Date().toISOString(),
    transactional: {
      configured: Boolean(transactional?.configured),
      isolatedFromCampaign: Boolean(transactional?.isolated),
      sharesCampaignIdentity: Boolean(transactional?.sharesCampaignIdentity),
      provider: transactional?.provider || null,
      host: transactional?.host || '(unset)',
      port: transactional?.port ?? null,
      starttls: transactional?.secure === false,
      login: maskLogin(transactional?.user),
      passwordPresent: Boolean(transactional?.pass),
    },
    campaign: {
      configured: Boolean(campaign?.configured),
      host: campaign?.host || '(unset)',
      port: campaign?.port ?? null,
      login: maskLogin(campaign?.user),
      passwordPresent: Boolean(campaign?.pass),
    },
    fromHeaders: from,
    accountingCc: read(env, 'TAX_RECORDS_CC_EMAIL') || 'pbagcr@peptidescostarica.net (default)',
    envPresence: envReport,
    problems,
    healthy: problems.length === 0,
  };
}
