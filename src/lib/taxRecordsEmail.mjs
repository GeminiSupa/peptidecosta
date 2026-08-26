// The accountant's copy of a completed sale.
//
// This used to ride along as a CC on the customer's own receipt. That was wrong
// three ways:
//
//   1. It shared the customer's fate. The CC is a header on their message, so a
//      failed customer send — a typo'd address, a bounce, a full mailbox — took
//      accounting's copy down with it.
//   2. Nothing was ever logged. A CC produces no separate result, so there was
//      no way to answer "did PBAG get the September sales?" short of asking them.
//   3. Customers could read the accountant's address, straight out of the CC
//      header of every completed order. Whatever TAX_RECORDS_CC_EMAIL happened
//      to hold was published to every buyer.
//
// It is now its own message, sent independently and reported on. The customer's
// receipt carries no CC at all.

export const TAX_RECORDS_CC_EMAIL =
  process.env.TAX_RECORDS_CC_EMAIL || 'pbagcr@peptidescostarica.net';

/**
 * Every address that should receive the accounting copy.
 *
 * TAX_RECORDS_CC_EMAIL accepts a comma-separated list when the business needs
 * more than one private accounting recipient. Accounting mail is sent through
 * its own SMTP transport, independently from the customer's receipt.
 */
export function taxRecordsRecipients(value = process.env.TAX_RECORDS_CC_EMAIL) {
  const configured = String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  return configured.length > 0 ? configured : ['pbagcr@peptidescostarica.net'];
}

/**
 * CC helper for internal mail only.
 *
 * Still used by the commission approval route, where the recipient is a sales
 * agent and the CC list is already internal. Never call this for anything a
 * customer receives.
 */
export function withTaxRecordsCc(existingCc = '') {
  const recipients = String(existingCc || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  recipients.push(TAX_RECORDS_CC_EMAIL);

  const seen = new Set();
  return recipients
    .filter((email) => {
      const key = email.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(', ');
}

/** Accounting only wants the sale once it is final. */
export function isCompletedOrderStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();
  return normalized === 'completed' || normalized === 'order complete';
}

/**
 * The accountant's message.
 *
 * Reuses the receipt body — it is already a complete record of the sale — but
 * relabels it so an accountant opening the mailbox can tell at a glance which
 * order it belongs to without having to read a customer greeting first.
 */
export function buildTaxRecordsCopy({ order = {}, html = '', text = '' } = {}) {
  const orderNumber = order.order_number || order.orderNumber || 'sin número';
  const customerName = order.customer_name || order.customerName || '';
  const header = `Copia contable — Pedido ${orderNumber}${customerName ? ` — ${customerName}` : ''}`;

  return {
    // Every configured address on one message, so a blocked mailbox and a
    // reachable one always hold the identical record.
    to: taxRecordsRecipients().join(', '),
    subject: header,
    html: `<p style="font:600 14px/1.5 system-ui,sans-serif;color:#334155;margin:0 0 16px">${header}</p>${html}`,
    text: `${header}\n\n${text}`,
  };
}

/**
 * The accountant's copy of an approved payout slip.
 *
 * Accounting sees the business from both sides: completed sales coming in, and
 * approved payouts going out. The order copy above covers the first; this
 * covers the second.
 *
 * Sent as its own message rather than a CC on the payee's invoice, and for a
 * reason the order copy learned the hard way: an affiliate is an outside party,
 * so a CC hands them the accountant's address. Separately sent, it is also
 * separately logged and separately survivable.
 */
export function buildTaxRecordsPayoutCopy({ payout = {}, html = '', text = '' } = {}) {
  const payee = payout.name || payout.email || 'sin nombre';
  const period = payout.period ? ` — ${payout.period}` : '';
  const header = `Copia contable — Pago aprobado (${payout.kind || 'comisión'}) — ${payee}${period}`;

  return {
    to: taxRecordsRecipients().join(', '),
    subject: header,
    html: `<p style="font:600 14px/1.5 system-ui,sans-serif;color:#334155;margin:0 0 16px">${header}</p>${html}`,
    text: `${header}\n\n${text}`,
  };
}

/**
 * Hand one prepared accounting message to the transport. Never throws.
 *
 * Shared by the order copy and the payout copy so both are logged the same way
 * and neither can fail its caller.
 */
async function dispatchTaxRecordsCopy({ transporter, from, message, logPrefix }) {
  if (!transporter) {
    console.error(`${logPrefix} No mail transport configured — accounting copy NOT sent.`);
    return { sent: false, error: 'no transporter' };
  }

  const sender = String(from || '').trim();

  try {
    const info = await transporter.sendMail({ ...message, from: sender });
    // Names the sender as well as the recipients: the current failure is caused
    // by the From domain, so a log line without it cannot explain a rejection.
    console.log(`${logPrefix} Accounting copy sent from ${sender} to ${message.to}: ${info.messageId}`);
    return { sent: true, messageId: info.messageId, to: message.to, from: sender };
  } catch (error) {
    // Loud, because silence here is exactly what hid the previous failure.
    console.error(`${logPrefix} Accounting copy FAILED to ${message.to}:`, error.message);
    return { sent: false, error: error.message };
  }
}

/**
 * Send the accountant their copy of an approved payout. Never throws.
 *
 * Callers run this after the payee's own send, and only once the slip is
 * actually approved — a rejected slip is not an expense and accounting has no
 * use for it.
 *
 * @returns {Promise<{sent: boolean, skipped?: string, messageId?: string, error?: string}>}
 */
export async function sendTaxRecordsPayoutCopy({
  transporter,
  from,
  payout = {},
  html = '',
  text = '',
  logPrefix = '[Tax records]',
} = {}) {
  return dispatchTaxRecordsCopy({
    transporter,
    from,
    message: buildTaxRecordsPayoutCopy({ payout, html, text }),
    logPrefix,
  });
}

/**
 * Send the accountant their copy. Never throws.
 *
 * Callers run this after the customer send and must not have to guard it — an
 * accounting copy that fails is worth a loud log line, never a failed request
 * or an unsent customer receipt.
 *
 * @returns {Promise<{sent: boolean, skipped?: string, messageId?: string, error?: string}>}
 */
export async function sendTaxRecordsCopy({
  transporter,
  from,
  order = {},
  html = '',
  text = '',
  logPrefix = '[Tax records]',
} = {}) {
  if (!isCompletedOrderStatus(order.status)) {
    return { sent: false, skipped: 'not-completed' };
  }

  return dispatchTaxRecordsCopy({
    transporter,
    from,
    message: buildTaxRecordsCopy({ order, html, text }),
    logPrefix,
  });
}
