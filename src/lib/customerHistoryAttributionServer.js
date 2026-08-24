import { agentMatchKeys } from '@/lib/agentOrders';
import {
  CUSTOMER_HISTORY_SOURCE,
  buildAgentNameResolver,
  lookupHistoricalAgent,
} from '@/lib/agentAttribution.mjs';
import { isEligibleSalesAgentProfile } from '@/lib/salesAgentAffiliate.mjs';

export async function applyCustomerHistoryAttribution(supabase, order) {
  if (String(order?.sales_agent || '').trim()) return order;

  try {
    const { data: profiles } = await supabase.from('admin_profiles').select('*');
    const match = await lookupHistoricalAgent(supabase, {
      phone: order.customer_phone,
      email: order.customer_email,
      resolveAgent: buildAgentNameResolver(profiles),
    });
    if (!match) return order;

    const profile = (profiles || []).find((row) => agentMatchKeys(row).has(match.agent.toLowerCase()));
    if (!isEligibleSalesAgentProfile(profile)) return order;

    return {
      ...order,
      sales_agent: match.agent,
      agent_commission_source: CUSTOMER_HISTORY_SOURCE,
    };
  } catch (error) {
    console.warn('[customer-history-attribution] skipped:', error.message);
    return order;
  }
}
