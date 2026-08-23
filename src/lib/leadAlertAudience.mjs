/**
 * Who is told about a lead.
 *
 * The team profile is the source of truth for how to reach an agent. Their
 * email and WhatsApp number are already on `admin_profiles`, kept up to date in
 * Team Management, so a lead's owner is alerted from their own record rather
 * than from a second list somebody has to remember to tick.
 *
 * `notification_recipients` still supplies the destinations that belong to
 * nobody in particular — the ops inbox, an owner's CC, a second phone. Those
 * are always included.
 *
 * A row on that list that IS a team member's own — matched to a profile by
 * address, or by a label that is exactly their name — is treated as personal
 * and only fires when that member owns the lead. That is what stops the
 * campaign agent being told about a colleague's customer, and it now falls out
 * of the same rule for everyone instead of being a special case for one person.
 *
 * Kept free of '@/lib' imports so tests/ can load it under `node --test`.
 */

import { isUsableDestination, normalizeDestination } from './notificationRecipients.mjs';

const lower = (value) => String(value ?? '').trim().toLowerCase();

/** The profile for an agent named on a lead, or null when they are not on the team. */
export function findAgentProfile(profiles, agent) {
  const wanted = lower(agent);
  if (!wanted) return null;
  return (profiles || []).find((profile) => (
    lower(profile?.name) === wanted || lower(profile?.email) === wanted
  )) || null;
}

/**
 * The team member an alert row belongs to, or null when it is a shared one.
 *
 * The label decides. A row is one agent's own when its label is exactly their
 * name — "Dani" is Dani's; "Ops inbox", "Num 2" and "Joe (temp CC until info@
 * fixed)" are the team's. Exact, not a substring, so that last one keeps firing.
 *
 * The address is deliberately NOT enough on its own, because a shared inbox can
 * also be somebody's login: info@peptidescostarica.net is the ops inbox AND the
 * superadmin's account. Matching on the address alone quietly took the ops inbox
 * off every lead that was not his — a shared destination going silent, which is
 * the worst way for this to be wrong. It is only consulted for a row with no
 * label at all, which the schema does not allow but old data might.
 *
 * The failure directions are not equal, and that is what sets this rule: too
 * eager and a shared inbox stops being told, silently; too cautious and one
 * agent sees a lead that is not theirs, which somebody notices and reports.
 */
export function recipientOwnerProfile(row, profiles) {
  const label = lower(row?.label);
  const list = profiles || [];

  if (label) {
    return list.find((profile) => lower(profile?.name) && label === lower(profile?.name)) || null;
  }

  const destination = lower(row?.destination);
  if (!destination) return null;
  return list.find((profile) => {
    const whatsapp = normalizeDestination('whatsapp', profile?.whatsapp_number);
    if (lower(profile?.email) && destination === lower(profile?.email)) return true;
    return Boolean(whatsapp) && normalizeDestination('whatsapp', row?.destination) === whatsapp;
  }) || null;
}

/**
 * Splits the alert list for one lead into the two channels.
 *
 * @param rows      notification_recipients rows: { label, channel, destination }
 * @param profiles  admin_profiles rows: { name, email, whatsapp_number }
 * @param owner     the agent who owns the lead, or '' when nobody does
 * @param fallback  email addresses to use when the managed table is unavailable
 */
export function leadAlertAudience({ rows = [], profiles = [], owner = '', fallback = [] } = {}) {
  const ownerProfile = findAgentProfile(profiles, owner);
  const emails = [];
  const whatsapp = [];

  const addEmail = (value) => {
    if (isUsableDestination('email', value)) emails.push(String(value).trim());
  };
  const addWhatsApp = (label, value) => {
    if (isUsableDestination('whatsapp', value)) {
      whatsapp.push({ label: label || String(value), destination: normalizeDestination('whatsapp', value) });
    }
  };

  // The owner first, from their own profile, so they head the list.
  if (ownerProfile) {
    addEmail(ownerProfile.email);
    addWhatsApp(ownerProfile.name || ownerProfile.email, ownerProfile.whatsapp_number);
  }

  for (const row of rows) {
    const belongsTo = recipientOwnerProfile(row, profiles);
    // Somebody else's personal destination. Theirs to receive, not everyone's.
    if (belongsTo && belongsTo !== ownerProfile) continue;
    if (row?.channel === 'whatsapp') addWhatsApp(row.label, row.destination);
    else addEmail(row.destination);
  }

  for (const value of fallback) addEmail(value);

  const seenEmail = new Set();
  const seenPhone = new Set();
  return {
    emails: emails.filter((value) => {
      const key = lower(value);
      return seenEmail.has(key) ? false : seenEmail.add(key);
    }),
    whatsapp: whatsapp.filter((entry) => (
      seenPhone.has(entry.destination) ? false : seenPhone.add(entry.destination)
    )),
  };
}
