/**
 * The junk-order guard on the public checkout.
 *
 * Three orders arrived on 23 Sep 2026 from one address (187.13.207.71, a real
 * Chrome on Windows behind a VPN) ten minutes apart — name "test", phone
 * 506 8888 8888, emails f@b.com and a@b.com, street "sdfdsf", postal 44444.
 * Every one of them cleared the existing controls, because those controls
 * count requests and this was somebody filling the form slowly by hand. Each
 * one woke the whole sales team on WhatsApp.
 *
 * So this module looks at what was typed rather than how fast. It scores the
 * four fields a person cannot fake without leaving a mark — name, phone,
 * email, address — and refuses only when the evidence adds up.
 *
 * The rule the scoring exists to honour: a real customer must not be turned
 * away. So a single odd-looking field is never enough on its own. Weight 1
 * means "unusual", and two of those are needed to stop an order; weight 2 is
 * reserved for what no real customer ever sends — a name that is literally
 * "test", an address at example.com, the hidden field only a script fills in.
 * Each field is capped so one strange entry cannot reach the threshold alone.
 */

export const JUNK_BLOCK_SCORE = 3;

/** Words that are never a name, an email login, or a street. */
const JUNK_WORDS = new Set([
  'test', 'tests', 'testing', 'tester', 'prueba', 'pruebas', 'probando',
  'asdf', 'asdfg', 'asdfgh', 'asdasd', 'qwer', 'qwerty', 'zxcv', 'hjkl',
  'dummy', 'fake', 'falso', 'sample', 'demo', 'ejemplo', 'example',
  'noname', 'none', 'nada', 'null', 'undefined', 'xxx', 'xxxx',
  'aaa', 'aaaa', 'abc', 'abcd',
]);

/** Domains that exist to be typed when you do not want to be reached. */
const JUNK_EMAIL_DOMAINS = new Set([
  'example.com', 'example.org', 'example.net', 'test.com', 'test.net',
  'fake.com', 'dummy.com', 'asdf.com', 'qwerty.com', 'noemail.com',
  'nomail.com', 'mailinator.com', 'localhost', 'invalid',
]);

const collapse = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const digitsOf = (value) => String(value ?? '').replace(/\D/g, '');
const foldAccents = (value) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Letters only, accents folded, so "TEST" and "Tést" meet the same list. */
function wordKey(token) {
  return foldAccents(token).replace(/[^A-Za-z]/g, '').toLowerCase();
}

const isJunkWord = (token) => JUNK_WORDS.has(wordKey(token));

/** 88888888, 0000000000 — a digit held down where a phone should be. */
const isRepeatedDigits = (digits) => digits.length >= 4 && new Set(digits).size === 1;

/** 12345678 or 87654321, in either direction. */
function isSequentialDigits(digits) {
  if (digits.length < 5) return false;
  let up = true;
  let down = true;
  for (let i = 1; i < digits.length; i += 1) {
    const step = Number(digits[i]) - Number(digits[i - 1]);
    if (step !== 1) up = false;
    if (step !== -1) down = false;
  }
  return up || down;
}

/**
 * The phone without its country code.
 *
 * Scored on the national part, because 506 8888 8888 is not a repeated digit
 * until the 506 comes off, and that prefix is the one part of the number the
 * customer did not type.
 */
function nationalPart(phone) {
  const digits = digitsOf(phone);
  for (const dial of ['506', '507', '505', '504', '503', '502', '52', '57', '34', '92', '44', '49', '1']) {
    if (digits.length > dial.length + 6 && digits.startsWith(dial)) return digits.slice(dial.length);
  }
  return digits;
}

/**
 * A run of letters with no vowel in it — "sdfdsf", "zxcvb".
 *
 * Names only. Addresses here carry real acronyms (CCSS, SRL, MSJ) and a postal
 * code is not a word, so the same rule there would refuse real people.
 */
function hasVowellessRun(value) {
  const tokens = collapse(value).split(/[^\p{L}]+/u).filter(Boolean);
  return tokens.some((token) => token.length >= 4 && !/[aeiouy]/i.test(foldAccents(token)));
}

function capField(signals, cap) {
  let running = 0;
  const kept = [];
  for (const signal of signals) {
    if (running >= cap) break;
    kept.push(signal);
    running += signal.weight;
  }
  return kept;
}

function scoreName(name) {
  const clean = collapse(name);
  if (!clean) return [];
  const tokens = clean.split(' ').filter(Boolean);

  // Every word is filler: "test", "test test", "prueba prueba". A real name
  // that merely contains one of these words ("Teresa Testa") is untouched,
  // which is why this asks about all the tokens rather than any of them.
  if (tokens.every((token) => isJunkWord(token))) {
    return [{ field: 'name', signal: 'placeholderName', weight: 3 }];
  }
  if (hasVowellessRun(clean)) {
    return [{ field: 'name', signal: 'nameKeyboardMash', weight: 1 }];
  }
  return [];
}

function scorePhone(phone) {
  const national = nationalPart(phone);
  if (!national) return [];

  if (isRepeatedDigits(national)) {
    return [{ field: 'phone', signal: 'phoneRepeatedDigit', weight: 1 }];
  }
  if (isSequentialDigits(national)) {
    return [{ field: 'phone', signal: 'phoneSequential', weight: 1 }];
  }
  return [];
}

function scoreEmail(email) {
  const clean = collapse(email).toLowerCase();
  if (!clean || !clean.includes('@')) return [];

  const [local, domain = ''] = clean.split('@');
  if (JUNK_EMAIL_DOMAINS.has(domain)) {
    return [{ field: 'email', signal: 'placeholderEmailDomain', weight: 2 }];
  }

  const signals = [];
  // f@b.com — a one-letter login at a one-letter domain. Either alone is
  // merely unusual; together nobody has ever been reachable there.
  if (local.length <= 1) signals.push({ field: 'email', signal: 'emailLocalTooShort', weight: 1 });
  if (domain.split('.')[0].length <= 1) signals.push({ field: 'email', signal: 'emailDomainTooShort', weight: 1 });
  if (isJunkWord(local)) signals.push({ field: 'email', signal: 'placeholderEmailLogin', weight: 1 });
  return capField(signals, 1);
}

function scoreAddress(address) {
  const clean = collapse(address);
  if (!clean) return [];
  const signals = [];

  // 55555, 44444 — the postal box filled with one key. Scored here rather than
  // by the phone rules because a four-digit run is ordinary inside a street
  // number, and only suspicious when EVERY such run is one repeated digit.
  const numberRuns = clean.match(/\b\d{4,6}\b/g) || [];
  if (numberRuns.length && numberRuns.every((run) => isRepeatedDigits(run))) {
    signals.push({ field: 'address', signal: 'addressRepeatedPostal', weight: 1 });
  }

  if (clean.split(/[^\p{L}]+/u).filter(Boolean).some((token) => isJunkWord(token))) {
    signals.push({ field: 'address', signal: 'placeholderAddress', weight: 1 });
  }

  return capField(signals, 1);
}

/**
 * The hidden field.
 *
 * Nothing in the checkout writes to it and no customer can see it, so anything
 * at all in there came from a script filling every input on the page. Weighted
 * to block on its own — but still through the score, so this stays one rule
 * with one message rather than a second refusal path to keep in step.
 */
export const HONEYPOT_FIELD = 'pcr_hp';

export function scoreJunkOrder(order) {
  const signals = [
    ...(collapse(order?.[HONEYPOT_FIELD]) ? [{ field: 'honeypot', signal: 'honeypotFilled', weight: 3 }] : []),
    ...capField(scoreName(order?.customer_name), 3),
    ...capField(scorePhone(order?.customer_phone), 1),
    ...capField(scoreEmail(order?.customer_email), 2),
    ...capField(scoreAddress(order?.shipping_address), 1),
  ];

  const score = signals.reduce((total, entry) => total + entry.weight, 0);
  return { score, signals, blocked: score >= JUNK_BLOCK_SCORE };
}

/**
 * What a blocked order is told.
 *
 * Deliberately does not name the field that failed. A real customer needs one
 * instruction and a way through that does not depend on this form; naming the
 * rule would only teach the person probing it which box to change next.
 */
export function junkOrderMessage(lang = 'es') {
  return lang === 'en'
    ? 'We could not verify these details. Please check your name, phone and address — or message us on WhatsApp and we will place your order.'
    : 'No pudimos verificar estos datos. Revise su nombre, teléfono y dirección, o escríbanos por WhatsApp y hacemos su pedido.';
}

/** For the server log, so a refusal can be read back without guessing. */
export function junkOrderSummary(result) {
  return (result?.signals || []).map((entry) => `${entry.field}:${entry.signal}`).join(',');
}
