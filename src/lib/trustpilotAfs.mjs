/**
 * The Trustpilot Automatic Feedback Service (AFS) data block.
 *
 * Trustpilot reads this off the copy of the email BCC'd to the AFS address and
 * uses it to decide who to invite, in what language, and against which order.
 * It is never visible to the customer — it is a <script> tag, so a mail client
 * renders nothing.
 *
 * One implementation, because there are now two senders: the order-complete
 * receipt, and the test send from the Social Reviews panel. A test that builds
 * its own block proves only that the test works.
 */

/**
 * @param {object} input
 * @param {string} input.recipientEmail - who Trustpilot should invite
 * @param {string} [input.recipientName]
 * @param {string} [input.referenceId] - the order number, so Trustpilot can
 *        show the review as verified against a real purchase
 * @param {string} [input.locale] - 'en-US' or 'es-ES'
 * @returns {string} the block, ready to append to the HTML body
 */
export function trustpilotAfsSnippet({
  recipientEmail,
  recipientName = 'Cliente',
  referenceId = '',
  locale = 'es-ES',
} = {}) {
  return `
<script type="application/json+trustpilot">
{
  "recipientEmail": ${JSON.stringify(String(recipientEmail || '').trim())},
  "recipientName": ${JSON.stringify(recipientName || 'Cliente')},
  "referenceId": ${JSON.stringify(referenceId || '')},
  "locale": ${JSON.stringify(locale)}
}
</script>`;
}

/**
 * Whether an address is a Trustpilot AFS invitation address.
 *
 * Used before BCC'ing anything: the order-complete email carries the customer's
 * name, address, items and totals, so a mistyped address here would forward all
 * of that to a stranger's mailbox rather than simply failing to work.
 */
export function isTrustpilotAfsAddress(value) {
  return /^[^\s@]+@invite\.trustpilot\.com$/i.test(String(value || '').trim());
}
