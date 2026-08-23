/**
 * Who already owns this person, according to the CRM's own lead book.
 *
 * The order book answers this first — src/lib/agentAttribution.mjs — and stays
 * the stronger signal, because an agent who closed a sale plainly owns that
 * customer. But an agent can be halfway through working somebody who has not
 * bought yet, and that person was invisible here: a Google Ads enquiry from
 * them read as a brand-new lead and went to the campaign agent, who would then
 * ring a stranger's customer and open the conversation from scratch.
 *
 * So this is the second look. Same two contact keys, same "earliest wins" rule,
 * read off `catalog_leads` instead of `orders`.
 *
 * Kept free of '@/lib' imports so tests/ can load it under `node --test`.
 */

import { emailKey, phoneKey } from './agentAttribution.mjs';

/**
 * The contact keys one lead row stands for.
 *
 * A lead carries its detail in `contact_value` — one free-text field holding
 * either an address or a number — and, on rows written since the columns were
 * added, in `email` / `phone` as well. All three are read, because a customer
 * who first arrived by phone and now fills in the ad form by email has to be
 * recognised as the same person.
 *
 * The `@` test decides which key a value becomes, and the phone branch is only
 * reached when it fails: `phoneKey` strips non-digits, so an address like
 * user123456789@x.com would otherwise yield a perfectly plausible phone key
 * and hand that number's owner somebody else's lead.
 */
export function leadContactKeys(lead) {
  const keys = new Set();
  for (const value of [lead?.contact_value, lead?.email, lead?.phone]) {
    const email = emailKey(value);
    if (email) {
      keys.add(`email:${email}`);
      continue;
    }
    const phone = phoneKey(value);
    if (phone) keys.add(`phone:${phone}`);
  }
  return keys;
}

/**
 * When this lead became that agent's.
 *
 * `assigned_at` is the honest answer and `created_at` the fallback for rows
 * predating it. Unparseable dates sort last rather than first, so a bad
 * timestamp can never win the "earliest owner" contest below.
 */
function leadOwnedAt(lead) {
  const raw = lead?.assigned_at || lead?.ownership_updated_at || lead?.created_at || null;
  const time = raw ? new Date(raw).getTime() : NaN;
  return Number.isNaN(time) ? Infinity : time;
}

/**
 * Folds owned leads into `contact key -> earliest owning agent`.
 *
 * A key claimed by two different agents is deleted rather than awarded to
 * either. That is the same call `findAmbiguousContactKeys` makes for orders,
 * for the same reason: a detail two agents both own is almost always a shared
 * placeholder, and guessing between them takes a real customer off the person
 * who actually has them. Dropping it instead falls through to the campaign
 * agent — today's behaviour, which is known and safe.
 *
 * `resolveAgent` runs before the comparison so that "Korinne" and
 * "korinneda@icloud.com" count as one agent rather than contesting each other
 * and disqualifying their own customer.
 */
export function buildLeadOwnerIndex(leads, { resolveAgent = (value) => value } = {}) {
  const byKey = new Map();
  const contested = new Set();

  for (const lead of Array.isArray(leads) ? leads : []) {
    const agent = String(resolveAgent(String(lead?.sales_agent || '').trim()) || '').trim();
    if (!agent) continue;
    const at = leadOwnedAt(lead);

    for (const key of leadContactKeys(lead)) {
      const current = byKey.get(key);
      if (!current) {
        byKey.set(key, { agent, at });
        continue;
      }
      if (current.agent.toLowerCase() !== agent.toLowerCase()) contested.add(key);
      if (at < current.at) byKey.set(key, { agent, at });
    }
  }

  for (const key of contested) byKey.delete(key);
  return byKey;
}

/**
 * The agent who owns this contact in the lead book, or null if nobody does.
 *
 * When the phone and the email point at different agents the earlier claim
 * wins, and an exact tie goes to the email — matching `findHistoricalAgent`,
 * which the lead routes already treat as the more stable identity.
 */
export function leadOwnerFromCrmLeads(leads, { phone, email, resolveAgent } = {}) {
  const index = buildLeadOwnerIndex(leads, resolveAgent ? { resolveAgent } : undefined);
  if (index.size === 0) return null;

  const emailMatch = emailKey(email);
  const phoneMatch = phoneKey(phone);
  const byEmail = emailMatch ? index.get(`email:${emailMatch}`) || null : null;
  const byPhone = phoneMatch ? index.get(`phone:${phoneMatch}`) || null : null;

  if (!byPhone) return byEmail;
  if (!byEmail) return byPhone;
  return byPhone.at < byEmail.at ? byPhone : byEmail;
}
