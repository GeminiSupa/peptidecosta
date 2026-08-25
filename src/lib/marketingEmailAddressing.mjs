const EXCLUDED_MARKETING_COPY_ADDRESSES = new Set([
  'omerforce@gmail.com',
]);

const recipientKey = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  const angleAddress = normalized.match(/<([^<>]+)>/);
  return (angleAddress?.[1] || normalized).trim();
};

/**
 * Keep internal addresses out of marketing CC/BCC copies when they have been
 * explicitly excluded. This is intentionally separate from subscriber
 * suppression: copy headers bypass the campaign audience and its opt-out
 * checks entirely.
 */
export function filterMarketingCopyRecipients(value) {
  const recipients = (Array.isArray(value) ? value : String(value || '').split(','))
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .filter((entry) => !EXCLUDED_MARKETING_COPY_ADDRESSES.has(recipientKey(entry)));

  return recipients.length > 0 ? recipients.join(', ') : undefined;
}

export function marketingCopyHeader(name, value) {
  const recipients = filterMarketingCopyRecipients(value);
  return recipients ? { [name]: recipients } : {};
}
