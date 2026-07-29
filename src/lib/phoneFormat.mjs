/**
 * Turning what a customer types into something WhatsApp will accept.
 *
 * Checkout used to be a single free-text box, and the country was guessed from
 * the digit count — 8 digits meant Costa Rica, 10 meant the US, anything else
 * was passed to Meta untouched and rejected with "the phone number is
 * malformed". A German customer typing 0176 21429442, or a Costa Rican typing
 * a 7-digit typo, got no order confirmation and no error either.
 *
 * The checkout form now asks for the country explicitly, so the country code
 * is chosen rather than inferred. These helpers are the shared vocabulary for
 * that: the form composes with `toE164`, and re-opens a saved number with
 * `splitE164`.
 */

/** Costa Rica first — it is the default and the overwhelming majority of orders. */
export const PHONE_COUNTRIES = [
  { code: 'CR', dial: '506', flag: '🇨🇷', name: 'Costa Rica', nationalDigits: 8 },
  { code: 'US', dial: '1', flag: '🇺🇸', name: 'USA / Canada', nationalDigits: 10 },
  { code: 'MX', dial: '52', flag: '🇲🇽', name: 'México', nationalDigits: 10 },
  { code: 'PA', dial: '507', flag: '🇵🇦', name: 'Panamá', nationalDigits: 8 },
  { code: 'NI', dial: '505', flag: '🇳🇮', name: 'Nicaragua', nationalDigits: 8 },
  { code: 'GT', dial: '502', flag: '🇬🇹', name: 'Guatemala', nationalDigits: 8 },
  { code: 'HN', dial: '504', flag: '🇭🇳', name: 'Honduras', nationalDigits: 8 },
  { code: 'SV', dial: '503', flag: '🇸🇻', name: 'El Salvador', nationalDigits: 8 },
  { code: 'CO', dial: '57', flag: '🇨🇴', name: 'Colombia', nationalDigits: 10 },
  { code: 'ES', dial: '34', flag: '🇪🇸', name: 'España', nationalDigits: 9 },
  { code: 'DE', dial: '49', flag: '🇩🇪', name: 'Deutschland', nationalDigits: null },
  { code: 'GB', dial: '44', flag: '🇬🇧', name: 'United Kingdom', nationalDigits: null },
  { code: 'PK', dial: '92', flag: '🇵🇰', name: 'Pakistan', nationalDigits: 10 },
];

export const DEFAULT_PHONE_COUNTRY = 'CR';

/** Longest dial codes first, so '506' wins over '50' when both could match. */
const DIALS_BY_LENGTH = [...PHONE_COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);

export function findPhoneCountry(code) {
  return PHONE_COUNTRIES.find((country) => country.code === code) || PHONE_COUNTRIES[0];
}

const digitsOnly = (value) => String(value ?? '').replace(/\D/g, '');

/**
 * National number + chosen country -> E.164 digits, no leading '+'.
 *
 * Trunk prefixes are stripped: a German writing 0176… and a Brit writing 07911…
 * both mean "drop the 0 once the country code is in front". Numbers that
 * already start with their own country code are left alone rather than
 * doubled, because browsers autofill full international numbers into this box.
 */
export function toE164(nationalNumber, countryCode = DEFAULT_PHONE_COUNTRY) {
  const country = findPhoneCountry(countryCode);
  let digits = digitsOnly(nationalNumber);
  if (!digits) return '';

  // 00 506 8888 8888 -> 506 8888 8888
  if (digits.startsWith('00')) digits = digits.slice(2);

  if (digits.startsWith(country.dial)) {
    const remainder = digits.slice(country.dial.length);
    // Only treat it as already-prefixed when what follows is a plausible
    // national number. '5065060' in a Costa Rica field is a typo, not
    // '+506 5060'.
    if (remainder.length >= 7) return digits;
    if (country.nationalDigits && remainder.length === country.nationalDigits) return digits;
  }

  digits = digits.replace(/^0+/, '');
  return country.dial + digits;
}

/**
 * E.164 digits -> { countryCode, nationalNumber } for re-filling the form.
 *
 * Legacy orders stored bare 8-digit Costa Rica numbers, so a number with no
 * recognisable country code is read as Costa Rica rather than discarded.
 */
export function splitE164(stored) {
  const digits = digitsOnly(stored);
  if (!digits) return { countryCode: DEFAULT_PHONE_COUNTRY, nationalNumber: '' };

  for (const country of DIALS_BY_LENGTH) {
    if (!digits.startsWith(country.dial)) continue;
    const remainder = digits.slice(country.dial.length);
    if (remainder.length < 6) continue;
    if (country.nationalDigits && remainder.length !== country.nationalDigits) continue;
    return { countryCode: country.code, nationalNumber: remainder };
  }

  const home = findPhoneCountry(DEFAULT_PHONE_COUNTRY);
  if (digits.length === home.nationalDigits) {
    return { countryCode: home.code, nationalNumber: digits };
  }

  return { countryCode: DEFAULT_PHONE_COUNTRY, nationalNumber: digits };
}

/**
 * Whether an E.164 string is worth handing to Meta.
 *
 * Meta accepts 8–15 digits including the country code. Countries with a known
 * fixed national length are checked against it too, which is what catches the
 * 7-digit Costa Rica typos that used to reach the API and fail there.
 */
export function isValidE164(value, countryCode = null) {
  const digits = digitsOnly(value);
  if (digits.length < 8 || digits.length > 15) return false;

  if (countryCode) {
    const country = findPhoneCountry(countryCode);
    if (country.nationalDigits) {
      const expected = country.dial.length + country.nationalDigits;
      return digits.length === expected;
    }
  }

  return true;
}
