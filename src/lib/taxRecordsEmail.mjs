export const TAX_RECORDS_CC_EMAIL =
  process.env.TAX_RECORDS_CC_EMAIL || 'pbagcr@peptidescostarica.net';

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
