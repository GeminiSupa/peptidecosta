import { buildAgentNameResolver, lookupHistoricalAgent } from '@/lib/agentAttribution.mjs';
import { findActiveProfile, profileOwnerName } from '@/lib/orderOwnership.mjs';

export async function loadTeamProfiles(supabase) {
  const { data, error } = await supabase.from('admin_profiles').select('*');
  if (error) throw error;
  return data || [];
}

/**
 * The team member who owns this order's customer from earlier closed orders,
 * or '' when the customer is new or their agent has left.
 *
 * Unlike applyCustomerHistoryAttribution, a superadmin counts as an owner here.
 * That function decides commission, where superadmins are not paid; this one
 * decides who may take the customer, and a superadmin's customers need the same
 * protection as anyone's.
 *
 * Throws when the lookup fails, so a caller guarding a claim can refuse rather
 * than let a returning customer through unchecked.
 */
export async function customerOwnerFor(supabase, order, profiles) {
  const match = await lookupHistoricalAgent(supabase, {
    phone: order?.customer_phone,
    email: order?.customer_email,
    resolveAgent: buildAgentNameResolver(profiles),
  });
  if (!match) return '';
  const profile = findActiveProfile(profiles, match.agent);
  return profile ? profileOwnerName(profile) : '';
}
