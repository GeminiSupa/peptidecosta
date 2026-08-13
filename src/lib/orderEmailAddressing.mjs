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
