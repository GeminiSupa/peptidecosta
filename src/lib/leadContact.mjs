// A lead row only has `contact_method` + `contact_value`, so it can hold ONE
// contact point. Live chat already collects name, email AND phone, and the two
// it cannot store go into the `notes` blob:
//
//   Lead captured from website live chat.
//   Name: Alex Jimenez
//   Email: aljiracr@gmail.com
//   Phone: +506 70195752
//
// That is why a visitor who gave both shows up in the CRM with only one. These
// helpers read the real columns first and fall back to the notes blob, so every
// contact point a lead has ever given is reachable from one place.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_IN_TEXT_PATTERN = /[^\s<>()[\],;:]+@[^\s<>()[\],;:]+\.[A-Za-z]{2,}/;
const MIN_PHONE_DIGITS = 8;

function labelledNote(notes, label) {
  const match = String(notes || '').match(new RegExp(`^\\s*${label}:\\s*(.+)$`, 'im'));
  return match ? match[1].trim() : '';
}

function asEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return EMAIL_PATTERN.test(email) ? email : '';
}

function asPhone(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.includes('@')) return '';
  const digits = raw.replace(/\D/g, '');
  return digits.length >= MIN_PHONE_DIGITS ? digits : '';
}

/**
 * Whether a value is a number somebody could actually be rung back on.
 *
 * The same MIN_PHONE_DIGITS rule `asPhone` reads rows with, exported so the
 * forms and /api/leads/contact can apply it when a lead is written instead of
 * only when one is read. They disagreed: `cleanPhoneNumber` returns whatever
 * digits it is given, so a phone of "5" was truthy, satisfied "email or phone
 * required", and became a lead's entire contact_value — a row nobody can act
 * on, which still alerted the team. Read back through `leadPhone` that same
 * row reports no phone at all, which is how the disagreement stayed invisible.
 */
export function isDiallablePhone(value) {
  return Boolean(asPhone(value));
}

export function leadName(lead) {
  const direct = String(lead?.name || '').trim();
  if (direct) return direct;
  return labelledNote(lead?.notes, 'Name');
}

export function leadEmail(lead) {
  const direct = asEmail(lead?.email);
  if (direct) return direct;

  const contact = asEmail(lead?.contact_value);
  if (contact) return contact;

  const labelled = asEmail(labelledNote(lead?.notes, 'Email'));
  if (labelled) return labelled;

  // Older chat notes wrote the address without a label.
  return asEmail(String(lead?.notes || '').match(EMAIL_IN_TEXT_PATTERN)?.[0]);
}

export function leadPhone(lead) {
  const direct = asPhone(lead?.phone);
  if (direct) return direct;

  const contact = asPhone(lead?.contact_value);
  if (contact) return contact;

  return asPhone(labelledNote(lead?.notes, 'Phone'));
}

/**
 * Name, email and phone for one lead, plus which value the row already shows as
 * its headline so a caller can render the other one without repeating it.
 */
export function leadContactPoints(lead) {
  const email = leadEmail(lead);
  const phone = leadPhone(lead);
  const primary = String(lead?.contact_value || '').trim().toLowerCase();

  return {
    name: leadName(lead),
    email,
    phone,
    // `contact_value` holds the phone unformatted, so compare on digits.
    emailIsPrimary: Boolean(email) && email === primary,
    phoneIsPrimary: Boolean(phone) && phone === primary.replace(/\D/g, ''),
  };
}
