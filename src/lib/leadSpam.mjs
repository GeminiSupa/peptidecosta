/**
 * Bot filtering for the public lead forms.
 *
 * Everything that reaches /api/leads/contact is open to the internet with no
 * login and no CAPTCHA, and scripted submitters have found it. The cost is not
 * the rows: a junk lead with qualification data trips the database outbox
 * trigger, which emails the team and buzzes an agent's WhatsApp. The route's
 * rate limit only bounds how fast one address can push and does nothing about
 * a script that rotates them.
 *
 * The checks here are deliberately the cheap kind — nothing a visitor has to
 * solve, nothing a third party has to serve, no key to rotate. Two of them
 * cost a bot real work to defeat (it has to render the page and work out which
 * fields a human can actually see, and it has to wait), and the rest just
 * describe shapes a human's answers never take.
 *
 * They are graded, not stacked. A hard signal is one that a real visitor
 * cannot produce by accident, and any one of them is enough. A soft signal is
 * only suspicious, so two are needed together — that way an unusual but real
 * enquiry has to be unusual twice before it is dropped.
 *
 * Pure module with no request or browser in it, so the rules can be tested
 * directly, the same way landingLead.mjs is.
 */

/**
 * The honeypot field's name, shared so the form and the route cannot drift.
 *
 * `subject` rather than something like `company` or `website`: it is a name
 * form-spam scripts actively look for (it is where they expect to paste their
 * pitch), and it is not an autofill token, so no browser or password manager
 * will ever helpfully type into it and get a real customer thrown away.
 */
export const HONEYPOT_FIELD = 'subject';

/**
 * The floor on how long filling the form can plausibly take.
 *
 * The slowest of these forms is one name, one email and one phone; the fastest
 * real human, pasting from a password manager, is still several seconds. Two
 * and a half is well under that and well over what a script spends.
 */
export const MIN_FORM_FILL_MS = 2500;

/**
 * A name is never a link. Anything advertising in the field is not a lead.
 *
 * Deliberately not "contains an angle bracket": someone pasting themselves in
 * as `Ana Rojas <ana@example.com>` is a real person being tidy, so only an
 * actual anchor or closing tag counts.
 */
const LINKISH = /(https?:\/\/|www\.|<\s*a\b|<\/\s*[a-z]|\[url|\bt\.me\/|\bbit\.ly\b)/i;

/** Any letter, in any script — used only to tell text from a keyboard mash. */
const HAS_LETTER = /\p{L}/u;

/**
 * A short Latin-script name with no vowel in it: "Gf", "qwrt", "Ng".
 *
 * Named after what it actually catches — two fingers on a keyboard to get past
 * a required field — rather than "invalid name", because it is not one. Real
 * people do enter initials, so this stays a soft signal: "JM" alongside a real
 * number and a real address is still a lead, and only becomes a drop when
 * something else about the submission is wrong too.
 *
 * Capped at six characters and Latin-only so it cannot reach a genuine name it
 * has no business judging.
 */
const NOT_WORDLIKE = /^[A-Za-z]{1,6}$/;
const HAS_VOWEL = /[aeiouyáéíóúü]/i;

/**
 * Scripts the storefront is not written in. The shop sells in Costa Rica in
 * Spanish and English; a name in Cyrillic, Greek, Hebrew, Arabic, Han, Kana or
 * Hangul is not a customer who is going to take the call. Suspicious rather
 * than conclusive, because it is a statement about this shop's market and not
 * about the person.
 */
const OFF_SCRIPT = /[Ͱ-ӿ֐-ۿ぀-ヿ一-鿿가-힯]/;

/**
 * Throwaway inbox providers. Not exhaustive and not meant to be — it is a soft
 * signal, so the list only has to be right about the addresses it does name.
 */
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'sharklasers.com', 'grr.la',
  '10minutemail.com', 'tempmail.com', 'temp-mail.org', 'yopmail.com',
  'trashmail.com', 'dispostable.com', 'maildrop.cc', 'getnada.com',
  'mailnesia.com', 'throwawaymail.com', 'fakeinbox.com', 'moakt.com',
  'emailondeck.com', 'tempr.email', 'spam4.me', 'mail.tm', 'inboxkitten.com',
  'discard.email', 'mohmal.com', 'byom.de',
]);

const text = (value) => String(value ?? '').trim();

/** Digits only, so a number can be judged without its punctuation. */
const digitsOf = (value) => text(value).replace(/\D/g, '');

/**
 * The subscriber number, with a country code taken off.
 *
 * Costa Rican numbers are eight digits and US ones ten, and both arrive here
 * dialled either way. Without this, `+506 1111-1111` reads as 50611111111 —
 * eleven digits that are not all the same — and walks straight past the check
 * below, which is exactly how a form gets filled in practice.
 */
function subscriberDigits(digits) {
  if (digits.length === 11 && digits.startsWith('506')) return digits.slice(3);
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits;
}

/** 11111111, 12345678, 98765432 — a field filled to get past validation. */
function isFillerRun(digits) {
  if (digits.length < 7) return false;
  if (/^(\d)\1+$/.test(digits)) return true;
  let ascending = true;
  let descending = true;
  for (let i = 1; i < digits.length; i += 1) {
    const step = Number(digits[i]) - Number(digits[i - 1]);
    if (step !== 1) ascending = false;
    if (step !== -1) descending = false;
  }
  return ascending || descending;
}

/** Judged both as dialled and with the country code off, so neither hides it. */
function isFillerNumber(digits) {
  return isFillerRun(digits) || isFillerRun(subscriberDigits(digits));
}

/**
 * Decide whether a submission came from a person.
 *
 * @param {object} submission
 * @param {string} submission.name          the name as typed
 * @param {string} submission.email         the email as typed
 * @param {string} submission.phone         the phone as typed
 * @param {string} submission.honeypot      whatever arrived in HONEYPOT_FIELD
 * @param {number|null} submission.elapsedMs milliseconds the form was open for,
 *   or null/undefined when the client did not report it — a page cached from
 *   before this shipped says nothing, and silence is not held against it
 * @param {boolean} submission.hasBrowserOrigin whether the request carried an
 *   Origin header
 * @returns {{ spam: boolean, hard: string[], soft: string[], reasons: string[] }}
 */
export function classifyLeadSubmission({
  name = '',
  email = '',
  phone = '',
  honeypot = '',
  elapsedMs = null,
  hasBrowserOrigin = true,
} = {}) {
  const hard = [];
  const soft = [];

  const cleanName = text(name);
  const cleanEmail = text(email).toLowerCase();
  const phoneDigits = digitsOf(phone);

  // A field no human can see, reach by tab, or hear read out. Anything in it
  // came from something filling the DOM rather than the form.
  if (text(honeypot)) hard.push('honeypot');

  // Only judged when the client actually reported a duration. A negative one
  // means a clock that moved under us, which proves nothing either way.
  //
  // parseFloat and not Number(), which reads null, '' and false as a perfectly
  // finite zero — and zero is "submitted instantly". Every visitor on a page
  // cached from before the timer shipped sends no duration at all, so that one
  // coercion would have thrown all of them away on the day this went out.
  const elapsed = typeof elapsedMs === 'number' ? elapsedMs : Number.parseFloat(elapsedMs);
  const timed = Number.isFinite(elapsed);
  if (timed && elapsed >= 0 && elapsed < MIN_FORM_FILL_MS) {
    hard.push('too_fast');
  }

  if (LINKISH.test(cleanName)) hard.push('link_in_name');

  if (cleanName && !HAS_LETTER.test(cleanName)) soft.push('name_has_no_letters');
  if (NOT_WORDLIKE.test(cleanName) && !HAS_VOWEL.test(cleanName)) soft.push('name_not_wordlike');
  if (cleanName.length > 70 || cleanName.split(/\s+/).length > 8) soft.push('name_too_long');
  if (OFF_SCRIPT.test(cleanName)) soft.push('name_off_script');
  // Whatever this is, it is not what the person is called.
  if (cleanEmail && cleanName.toLowerCase() === cleanEmail) soft.push('name_is_email');

  const domain = cleanEmail.includes('@') ? cleanEmail.split('@').pop() : '';
  if (domain && DISPOSABLE_DOMAINS.has(domain)) soft.push('disposable_email');

  if (isFillerNumber(phoneDigits)) soft.push('filler_phone');

  // The last two are about the caller rather than the answers, and they are
  // the only things a script posting straight at the route — never loading a
  // page, never touching the honeypot — gives away.
  //
  // A browser sends Origin on every cross-origin POST and on same-origin ones
  // too; curl and most scripts send nothing. Every form on this site reports a
  // duration; nothing that skipped the form can.
  //
  // Both are soft, and deliberately so, because each has an innocent reading
  // on its own: a page cached from before the timer shipped sends no duration,
  // and the route is documented as taking posts from standalone ad pages we do
  // not control. Neither alone should turn a real enquiry away. Together they
  // describe something that never opened a form at all.
  if (!hasBrowserOrigin) soft.push('no_origin');
  if (!timed) soft.push('no_form_timer');

  return {
    spam: hard.length > 0 || soft.length >= 2,
    hard,
    soft,
    reasons: [...hard, ...soft],
  };
}
