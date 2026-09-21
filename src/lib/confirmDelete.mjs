/**
 * Delete confirmations that name what is about to be removed.
 *
 * "Delete this order? This cannot be undone." gives you nothing to check
 * against — you have to trust that the row you clicked is the row that will
 * go. Showing the order number, the customer and the total makes the dialog
 * something you can actually verify before saying yes.
 */

/**
 * Formats the confirmation body. Blank details are dropped, not shown empty.
 *
 * Call sites build their lines with `order?.status && \`Status: ${...}\``, so
 * `false` arrives here constantly when a field is absent. Stringifying it would
 * print a bullet reading "false" on almost every dialog.
 */
export function buildDeleteMessage(subject, details = [], options = {}) {
  const lines = (Array.isArray(details) ? details : [details])
    .map((line) => (line == null || line === false || line === true ? '' : String(line).trim()))
    .filter(Boolean);

  return [
    `Delete this ${subject}?`,
    ...(lines.length ? ['', ...lines.map((line) => `  • ${line}`)] : []),
    '',
    options.recoverable
      ? 'It will move to the Bin. You can restore it from there.'
      : 'This cannot be undone.',
  ].join('\n');
}

/** Same, for deleting several things at once. */
export function buildBulkDeleteMessage(count, subject, subjectPlural, options = {}) {
  const noun = count === 1 ? subject : subjectPlural || `${subject}s`;
  const footer = options.recoverable
    ? 'They will move to the Bin. You can restore them from there.'
    : 'This cannot be undone.';
  return `Delete ${count} ${noun}?\n\n${footer}`;
}

export function confirmDelete(subject, details, options) {
  if (typeof window === 'undefined') return false;
  return window.confirm(buildDeleteMessage(subject, details, options));
}

export function confirmBulkDelete(count, subject, subjectPlural, options) {
  if (typeof window === 'undefined') return false;
  return window.confirm(buildBulkDeleteMessage(count, subject, subjectPlural, options));
}
