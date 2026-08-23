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
 * Ownership is settled in this order, strongest evidence first:
 *
 *   1. an agent who already claimed THIS lead        (`existing`)
 *   2. the agent who closed their earliest order     (`order_history`)
 *   3. the agent who already owns them as a lead     (`crm_lead`)
 *
 * Step 3 is the newest and covers the person an agent is midway through
 * working who has not bought yet. Without it a Google Ads enquiry from them
 * read as brand new and went to the campaign agent, who would then approach a
 * colleague's customer as a stranger.
 *
 * The matching rules themselves are NOT reimplemented here — they stay in
 * src/lib/agentAttribution.mjs and src/lib/leadOwnerHistory.mjs, which are unit
 * tested and shared with the CRM tabs and the backfill. This is only the
 * plumbing around them.
 */

import { agentMatchKeys } from '@/lib/agentOrders';
import { isEligibleSalesAgentProfile } from '@/lib/salesAgentAffiliate.mjs';
import {
  buildAgentNameResolver,
  emailKey,
  lookupHistoricalAgent,
  phoneKey,
  phoneLikePattern,
} from '@/lib/agentAttribution.mjs';
import { leadOwnerFromCrmLeads } from '@/lib/leadOwnerHistory.mjs';

// Re-exported so a route needs one import, not two. Defined in the .mjs module
// because it is pure and the unit tests cannot resolve the `@/` alias.
export { contactKeysFor } from '@/lib/agentAttribution.mjs';

/**
 * The agent's own name, but only while they can actually work the lead.
 *
 * An automatic assignment to somebody who has left, been suspended or is still
 * awaiting approval is worse than no assignment at all: the lead looks handled,
 * so nobody picks it up, and it quietly goes cold. Returning '' instead lets
 * the caller fall through to the campaign agent or the round-robin.
 *
 * This deliberately mirrors the order path — applyCustomerHistoryAttribution in
 * api/orders/create makes the same check with the same helper — so a customer
 * cannot be owned by one person for orders and another for leads.
 *
 * Only automatic attribution is filtered. An `existingOwner` is a decision a
 * human already made about this exact lead and is never second-guessed here.
 */
function activeAgentName(profiles, agent) {
  const wanted = String(agent || '').trim().toLowerCase();
  if (!wanted) return '';
  const profile = (profiles || []).find((row) => agentMatchKeys(row).has(wanted));
  if (!isEligibleSalesAgentProfile(profile)) return '';
  return String(profile.name || profile.email).trim();
}

/**
 * Owned leads whose phone or email could be this person.
 *
 * Each contact key is asked for separately rather than through one `.or()`,
 * matching lookupHistoricalAgent: the filters are built from free-text columns
 * that may not exist on every deployment, and a single combined query would
 * lose every result to one missing column. Failures are dropped individually
 * and the strict keys are re-derived in JS afterwards, so a loose SQL match
 * costs nothing.
 */
async function fetchOwnedLeadsFor(supabase, { phone, email }) {
  const emailMatch = emailKey(email);
  const phoneMatch = phoneKey(phone);
  const owned = () => supabase.from('catalog_leads').select('*').not('sales_agent', 'is', null);

  const queries = [];
  if (emailMatch) {
    // ilike without wildcards is an exact match that ignores casing.
    queries.push(owned().ilike('contact_value', emailMatch));
    queries.push(owned().ilike('email', emailMatch));
  }
  if (phoneMatch) {
    const pattern = phoneLikePattern(phoneMatch);
    queries.push(owned().ilike('contact_value', pattern));
    queries.push(owned().ilike('phone', pattern));
  }
  if (!queries.length) return [];

  const results = await Promise.allSettled(queries);
  return results.flatMap((result) => (
    result.status === 'fulfilled' ? result.value?.data || [] : []
  ));
}

/**
 * @param supabase        a Supabase client
 * @param phone           the lead's phone, if known
 * @param email           the lead's email, if known
 * @param existingOwner   an agent who already claimed this lead; always wins
 * @param label           log prefix, e.g. 'leads/capture'
 * @returns {Promise<{agent: string, source: string}>} source is '' when nobody owns them
 */
export async function resolveLeadOwnerDetailed(
  supabase,
  { phone, email, existingOwner = '', label = 'leads' } = {}
) {
  const claimed = String(existingOwner || '').trim();
  if (claimed) return { agent: claimed, source: 'existing' };
  if (!supabase || (!phone && !email)) return { agent: '', source: '' };

  try {
    const { data: profiles } = await supabase
      .from('admin_profiles')
      .select('name, email, tier, status, is_superadmin');
    const resolveAgent = buildAgentNameResolver(profiles);

    const closed = await lookupHistoricalAgent(supabase, { phone, email, resolveAgent });
    const fromOrders = activeAgentName(profiles, closed?.agent);
    if (fromOrders) return { agent: fromOrders, source: 'order_history' };

    const leads = await fetchOwnedLeadsFor(supabase, { phone, email });
    const owned = leadOwnerFromCrmLeads(leads, { phone, email, resolveAgent });
    const fromLeads = activeAgentName(profiles, owned?.agent);
    if (fromLeads) return { agent: fromLeads, source: 'crm_lead' };

    return { agent: '', source: '' };
  } catch (err) {
    // A lead is worth more than its attribution: an agent can still claim it by
    // hand, and the CRM derives the owner live from order history regardless.
    console.warn(`[${label}] History attribution skipped:`, err.message);
    return { agent: '', source: '' };
  }
}

/** The owning agent's name, or '' when the customer is new to us. */
export async function resolveLeadOwner(supabase, options = {}) {
  const { agent } = await resolveLeadOwnerDetailed(supabase, options);
  return agent;
}
