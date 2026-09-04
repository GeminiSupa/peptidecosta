/**
 * Confirmations for anything that puts mail in a customer's inbox.
 *
 * A send cannot be taken back. The resend button sits inches from the buttons
 * that only change the record, and one stray click put a second receipt in a
 * real customer's inbox — which for the pharmacy buyers these receipts exist
 * for is the very thing that makes their records untidy.
 *
 * Modelled on confirmDelete: the dialog names the recipient and what they are
 * about to be sent, so it is something to check against rather than a reflex to
 * click through. A dialog that only says "Are you sure?" trains people to say
 * yes without reading, which is worse than no dialog at all.
 */

export function buildSendMessage(subject, recipient, details = []) {
  const lines = (Array.isArray(details) ? details : [details])
    .map((line) => (line == null || line === false || line === true ? '' : String(line).trim()))
    .filter(Boolean);

  const to = String(recipient || '').trim();

  // The opener names the thing, the To: line names the person. Wording it as
  // "…to the customer?" read wrong the moment the same dialog was reused for
  // the accountant's copy.
  return [
    `Send this ${subject}?`,
    '',
    to ? `  To: ${to}` : '  No email address on this order.',
    ...lines.map((line) => `  ${line}`),
    '',
    'This email cannot be taken back once it is sent.',
  ].join('\n');
}

/**
 * @returns true when the operator confirmed. False when they cancelled, and
 *   false in any non-browser context — a send must never proceed by default.
 */
export function confirmCustomerEmail(subject, recipient, details) {
  if (typeof window === 'undefined') return false;
  return window.confirm(buildSendMessage(subject, recipient, details));
}
