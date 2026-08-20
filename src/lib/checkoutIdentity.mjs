/**
 * The customer-name check for the checkout form.
 *
 * It lives in its own module because the browser is not the authority: the
 * same rule runs again in api/orders/create, so a skipped field or a replayed
 * request cannot put junk into an order the sales team has to chase.
 *
 * The Costa Rican wrinkle is the reason the name rule is not "letters only".
 * A company incorporated without a trade name is legally named after its own
 * cédula jurídica — "3-102-736108 S.R.L." is a real company name, not a typo —
 * so a customer name that is mostly digits can be perfectly valid. What these
 * rules throw out is the junk a blank-check lets through: one character, a
 * held-down key, an email address pasted into the name box, a phone number
 * typed where the name goes.
 */

// Ten digits starting with 3: 3-101-XXXXXX for an S.A., 3-102-XXXXXX for an
// S.R.L. This is both a valid ID number and, for unnamed companies, a valid
// customer name.
const CORPORATE_ID_PATTERN = /^3\d{9}$/;

const collapse = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const digitsOf = (value) => String(value ?? '').replace(/\D/g, '');
const countLetters = (value) => (String(value).match(/\p{L}/gu) || []).length;

export function normalizeCustomerName(value) {
  return collapse(value);
}

export function validateCustomerName(value) {
  const name = normalizeCustomerName(value);

  if (!name) return { ok: false, reason: 'nameRequired', name };

  // An email or a URL in the name box is always a misread field, never a name.
  if (/@|https?:\/\/|www\./i.test(name)) return { ok: false, reason: 'nameIsContact', name };

  // "aaaa", "....", "1111" — one character held down. Spaces are dropped first
  // so "a a a" is caught too.
  if (new Set(name.replace(/\s/g, '')).size < 2) return { ok: false, reason: 'nameGibberish', name };

  if (countLetters(name) < 2) {
    // The unnamed-company case: the cédula jurídica on its own is the name.
    if (CORPORATE_ID_PATTERN.test(digitsOf(name))) return { ok: true, reason: null, name };
    return { ok: false, reason: 'nameNoLetters', name };
  }

  return { ok: true, reason: null, name };
}

const MESSAGES = {
  nameRequired: {
    en: 'Full name is required.',
    es: 'El nombre completo es requerido.',
  },
  nameIsContact: {
    en: 'Enter your name here, not an email address or a website.',
    es: 'Escriba su nombre aquí, no un correo ni un sitio web.',
  },
  nameGibberish: {
    en: 'Please enter your full name as it appears on your ID.',
    es: 'Ingrese su nombre completo tal como aparece en su identificación.',
  },
  nameNoLetters: {
    en: 'Please enter a name, not only numbers.',
    es: 'Ingrese un nombre, no solo números.',
  },
};

export function identityMessage(reason, lang = 'es') {
  const entry = MESSAGES[reason];
  if (!entry) return '';
  return lang === 'en' ? entry.en : entry.es;
}
