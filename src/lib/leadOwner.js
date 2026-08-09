/**
 * Resolves the owning agent for a lead at the moment it is created.
 *
 * Every route that writes to `catalog_leads` needs the same four steps: skip if
 * an agent already owns the lead, read the profiles so an order signed with an
 * agent's email resolves to their name, look the customer up in the order book,
 * and never let an attribution failure lose the lead. That block lived in
 * /api/leads/contact only, so leads arriving from the catalog gate, the
 * WhatsApp opt-in and Facebook Lead Ads were written with `sales_agent` null
 * even when the person was a returning customer with a closing agent on record.
 *
 * The matching rules themselves are NOT reimplemented here — they stay in
 * src/lib/agentAttribution.mjs, which is unit-tested and shared with the CRM
 * tabs and the backfill. This is only the plumbing around them.
 */

import { buildAgentNameResolver, lookupHistoricalAgent } from '@/lib/agentAttribution.mjs';

// Re-exported so a route needs one import, not two. Defined in the .mjs module
// because it is pure and the unit tests cannot resolve the `@/` alias.
export { contactKeysFor } from '@/lib/agentAttribution.mjs';

/**
 * @param supabase        a Supabase client
 * @param phone           the lead's phone, if known
 * @param email           the lead's email, if known
 * @param existingOwner   an agent who already claimed this lead; always wins
 * @param label           log prefix, e.g. 'leads/capture'
 * @returns the agent's name, or '' when the customer is new to the order book
 */
export async function resolveLeadOwner(supabase, { phone, email, existingOwner = '', label = 'leads' } = {}) {
  const claimed = String(existingOwner || '').trim();
  if (claimed) return claimed;
  if (!supabase || (!phone && !email)) return '';

  try {
    const { data: profiles } = await supabase.from('admin_profiles').select('name, email');
    const match = await lookupHistoricalAgent(supabase, {
      phone,
      email,
      resolveAgent: buildAgentNameResolver(profiles),
    });
    return match?.agent || '';
  } catch (err) {
    // A lead is worth more than its attribution: an agent can still claim it by
    // hand, and the CRM derives the owner live from order history regardless.
    console.warn(`[${label}] History attribution skipped:`, err.message);
    return '';
  }
}
