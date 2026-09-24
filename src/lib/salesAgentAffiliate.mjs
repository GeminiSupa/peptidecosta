// The rate every sales-agent referral used to pay, before it became a per-rep
// setting. Still the fallback whenever an affiliate has no usable rate of its
// own, so a rep nobody has configured is paid exactly what they were paid
// before. Do not repurpose it as "the" rate — read salesAgentReferralRate.
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

/**
 * What one sales-agent referral pays, as a whole-number percent.
 *
 * Read off the affiliate row so a rep's cut is something Joe sets in the
 * Affiliates tab, not something baked into this file. `commission_rate` is
 * stored as a fraction (0.2 = 20%), matching the affiliates table default, and
 * the order column wants a percent, so the two are not interchangeable — that
 * mismatch is exactly how a 20% rep would silently become a 0.2% one.
 *
 * Anything missing, zero, negative or above 100 falls back to the old flat 20
 * rather than paying a nonsense number off a half-filled row.
 */
export function salesAgentReferralRate(affiliate) {
  const fraction = Number(affiliate?.commission_rate);
  if (!Number.isFinite(fraction) || fraction <= 0) return SALES_AGENT_REFERRAL_RATE;
  const percent = Math.round(fraction * 1000) / 10;
  if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
    return SALES_AGENT_REFERRAL_RATE;
  }
  return percent;
}

/**
 * @param {object} order the order row being attributed
 * @param {object} profile the rep's admin_profiles row
 * @param {object} [options]
 * @param {boolean} [options.keepAffiliate=true] leave affiliate_id in place
 * @param {number} [options.rate] the rep's own percent, from
 *        salesAgentReferralRate(affiliate). Omitted means the flat 20, so
 *        every caller that has not been taught about per-rep rates keeps
 *        behaving exactly as it did.
 */
export function applySalesAgentReferral(order, profile, { keepAffiliate = true, rate } = {}) {
  if (!isEligibleSalesAgentProfile(profile)) return { ...order };

  const resolvedRate = Number.isFinite(Number(rate)) && Number(rate) > 0
    ? Number(rate)
    : SALES_AGENT_REFERRAL_RATE;

  const next = {
    ...order,
    sales_agent: String(profile.name || profile.email).trim(),
    agent_commission_rate_override: resolvedRate,
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
  if (source === 'custom_override') return 'Custom Percentage';
  return 'Standard sale';
}
