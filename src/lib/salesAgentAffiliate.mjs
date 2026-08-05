export const SALES_AGENT_REFERRAL_RATE = 20;
export const SALES_AGENT_AFFILIATE_KIND = 'sales_agent';
export const SALES_AGENT_REFERRAL_SOURCE = 'agent_referral';

export function isSalesAgentAffiliate(affiliate) {
  return Boolean(
    affiliate?.admin_profile_user_id
    || affiliate?.affiliate_kind === SALES_AGENT_AFFILIATE_KIND
  );
}

export function isEligibleSalesAgentProfile(profile) {
  const tier = String(profile?.tier || 'staff').trim().toLowerCase();
  const status = String(profile?.status || 'active').trim().toLowerCase();
  return Boolean(
    profile
    && tier === 'staff'
    && status === 'active'
    && String(profile.name || profile.email || '').trim()
  );
}

export function applySalesAgentReferral(order, profile, { keepAffiliate = true } = {}) {
  if (!isEligibleSalesAgentProfile(profile)) return { ...order };

  const next = {
    ...order,
    sales_agent: String(profile.name || profile.email).trim(),
    agent_commission_rate_override: SALES_AGENT_REFERRAL_RATE,
    agent_commission_source: SALES_AGENT_REFERRAL_SOURCE,
    // This is one combined payout in the sales-agent report. Keeping these at
    // zero prevents the same order appearing in the affiliate payout run too.
    affiliate_commission_usd: 0,
    affiliate_commission_crc: 0,
  };

  if (!keepAffiliate) next.affiliate_id = null;
  return next;
}

export function commissionSourceLabel(source) {
  if (source === SALES_AGENT_REFERRAL_SOURCE) return 'Agent referral';
  if (source === 'self_generated') return 'Self-generated sale';
  if (source === 'custom_override') return 'Custom override';
  return 'Standard sale';
}
