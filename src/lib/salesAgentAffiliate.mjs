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
    && profile.is_superadmin !== true
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

// `self_generated` used to mean this too, at the identical 20%, but none of the
// reports counted it — an agent's own 20% orders went unexplained on their pay
// email. Merged into agent_referral and backfilled on 2026-08-29, orders and
// payout snapshots both.
export function isAgentReferralSource(source) {
  return String(source || '').trim() === SALES_AGENT_REFERRAL_SOURCE;
}

export function commissionSourceLabel(source) {
  if (isAgentReferralSource(source)) return 'Agent referral';
  if (source === 'custom_override') return 'Custom override';
  return 'Standard sale';
}
