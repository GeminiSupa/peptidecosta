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
export function buildDeleteMessage(subject, details = []) {
  const lines = (Array.isArray(details) ? details : [details])
    .map((line) => (line == null || line === false || line === true ? '' : String(line).trim()))
    .filter(Boolean);

  return [
    `Delete this ${subject}?`,
    ...(lines.length ? ['', ...lines.map((line) => `  • ${line}`)] : []),
    '',
    'This cannot be undone.',
  ].join('\n');
}

/** Same, for deleting several things at once. */
export function buildBulkDeleteMessage(count, subject, subjectPlural) {
  const noun = count === 1 ? subject : subjectPlural || `${subject}s`;
  return `Delete ${count} ${noun}?\n\nThis cannot be undone.`;
}

export function confirmDelete(subject, details) {
  if (typeof window === 'undefined') return false;
  return window.confirm(buildDeleteMessage(subject, details));
}

export function confirmBulkDelete(count, subject, subjectPlural) {
  if (typeof window === 'undefined') return false;
  return window.confirm(buildBulkDeleteMessage(count, subject, subjectPlural));
}
