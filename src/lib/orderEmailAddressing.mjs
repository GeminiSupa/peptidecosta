const splitList = (value = '') => String(value || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

const emailKey = (value) => String(value || '').trim().toLowerCase();

export const ORDER_NOTIFICATION_INBOX = 'info@peptidescostarica.net';
export const ORDER_NOTIFICATION_OWNER_BCC = 'omerforce@gmail.com';
export const ORDER_NOTIFICATION_EXCLUDED_AGENTS = new Set([
  'aziza@peptidescostarica.net',
  'sean@peptidescostarica.net',
]);

/**
 * A visible recipient list with the owner's address taken out.
 *
 * The owner is BCC'd on the mail that matters, so naming them in a To or CC as
 * well puts the address on the envelope twice and shows it to everyone else on
 * the message. This is the same rule buildOrderEmailAddressing() applies to the
 * order CC, lifted out so the payout and report mail can hold to it too.
 *
 * Falls back to the company inbox rather than returning nothing: a send with no
 * visible recipient fails outright, and a list that was only ever the owner
 * still has to reach somebody.
 *
 * Not for per-recipient sends. Lead alerts address each destination in its own
 * message, where a To is the delivery itself and not a duplicate listing.
 */
export function stripOwnerAddress(list) {
  const kept = splitList(Array.isArray(list) ? list.join(',') : list)
    .filter((email) => emailKey(email) !== emailKey(ORDER_NOTIFICATION_OWNER_BCC));

  return kept.length > 0 ? kept.join(', ') : ORDER_NOTIFICATION_INBOX;
}

/**
 * New-order headers:
 *   To:  the company inbox
 *   BCC: Omer only
 *   CC:  all enabled agent recipients except Aziza and Sean
 */
export function buildOrderEmailAddressing(recipients = []) {
  const to = ORDER_NOTIFICATION_INBOX;
  const bcc = [ORDER_NOTIFICATION_OWNER_BCC];
  const reserved = new Set([emailKey(to), emailKey(ORDER_NOTIFICATION_OWNER_BCC)]);

  const cc = splitList(Array.isArray(recipients) ? recipients.join(',') : recipients)
    .filter((email) => {
      const key = emailKey(email);
      if (!key || reserved.has(key) || ORDER_NOTIFICATION_EXCLUDED_AGENTS.has(key)) return false;
      reserved.add(key);
      return true;
    });

  return { to, cc, bcc };
}
