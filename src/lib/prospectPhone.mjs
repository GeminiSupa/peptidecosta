/**
 * Turning a number a directory published into one WhatsApp can actually dial.
 *
 * A prospect's number arrives however the business chose to write it. Costa
 * Rican sites overwhelmingly publish the bare national form — `tel:88887777`,
 * "Llámanos 8888 7777" — and the discovery pipeline stored exactly those eight
 * digits. `wa.me` reads its path as E.164, so `wa.me/88887777` is not the gym:
 * it is country code +888, which belongs to nobody. The rep opened WhatsApp,
 * saw an empty chat, and the pipeline recorded the prospect as reachable.
 *
 * The record already knows where the business is, so the country supplies the
 * dial code the business left off. When the country is unknown there is
 * nothing better to go on than what was published, and the number is passed
 * through as before rather than guessed at.
 */

import { PHONE_COUNTRIES, isValidE164 } from './phoneFormat.mjs';

/** Longest dial first, so '506' wins over '50'. */
const DIALS_BY_LENGTH = [...PHONE_COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);

/**
 * Country names as the directories spell them.
 *
 * Nominatim answers in the language it was asked for and OpenStreetMap's own
 * `addr:country` tags are whatever the mapper typed, so both the English and
 * the local spelling have to resolve. Accents are folded before lookup.
 */
const COUNTRY_ALIASES = {
  CR: ['costa rica'],
  US: ['united states', 'united states of america', 'usa', 'us', 'estados unidos', 'canada'],
  MX: ['mexico'],
  PA: ['panama'],
  NI: ['nicaragua'],
  GT: ['guatemala'],
  HN: ['honduras'],
  SV: ['el salvador'],
  CO: ['colombia'],
  ES: ['spain', 'espana'],
  DE: ['germany', 'deutschland'],
  GB: ['united kingdom', 'great britain', 'reino unido'],
  PK: ['pakistan'],
};

const digitsOnly = (value) => String(value ?? '').replace(/\D/g, '');

const foldAccents = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

/**
 * The dialing plan for a prospect's country, or null when it is not one we
 * hold a plan for. An unrecognised country is not an error — it only means the
 * number has to stand on its own.
 */
export function prospectDialPlan(country) {
  const name = foldAccents(country);
  if (!name) return null;
  const code = /^[a-z]{2}$/.test(name)
    ? name.toUpperCase()
    : Object.keys(COUNTRY_ALIASES).find((key) => COUNTRY_ALIASES[key].includes(name));
  return PHONE_COUNTRIES.find((entry) => entry.code === code) || null;
}

/**
 * The E.164 digits to hand `wa.me`, or null when this number cannot be dialed
 * internationally and no country is available to complete it.
 *
 * @param {string} value    a published number, in any formatting
 * @param {string} [country] the prospect's country, as the directory spelled it
 * @returns {string|null} digits without a leading '+'
 */
export function whatsappDialableNumber(value, country) {
  const digits = digitsOnly(value);
  if (digits.length < 8 || digits.length > 15) return null;

  const plan = prospectDialPlan(country);
  // Nothing to complete the number with. Pass it through as published rather
  // than refuse a lead over a country we simply do not have a plan for.
  if (!plan) return digits;

  // Already carries its own country code.
  if (digits.startsWith(plan.dial)) return isValidE164(digits, plan.code) ? digits : null;

  // The national form the business published, completed with its dial code.
  if (plan.nationalDigits && digits.length === plan.nationalDigits) {
    const qualified = `${plan.dial}${digits}`;
    return isValidE164(qualified, plan.code) ? qualified : null;
  }

  // A number from somewhere else is fine, as long as it carries a country code
  // of its own — a head office abroad, a foreign-owned clinic.
  const foreign = DIALS_BY_LENGTH.find((entry) => digits.startsWith(entry.dial));
  return foreign && isValidE164(digits) ? digits : null;
}
