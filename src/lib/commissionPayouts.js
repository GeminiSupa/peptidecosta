export function getPeriodLabel(period, customStart, customEnd) {
  const labels = {
    previous: 'Previous Week (Mon–Sun)',
    current: 'Current Week (Mon–Now)',
    'all-time': 'All-Time',
    custom:
      customStart && customEnd
        ? `${customStart} – ${customEnd}`
        : 'Custom Range',
  };
  return labels[period] || period;
}

export function formatPayoutPeriod(startDate, endDate) {
  if (!startDate || !endDate) return '—';
  const start = new Date(startDate);
  const end = new Date(endDate);
  const sameYear = start.getFullYear() === end.getFullYear();
  const fmt = (d, withYear) =>
    d.toLocaleDateString(undefined, {
      timeZone: 'America/Costa_Rica',
      month: 'short',
      day: 'numeric',
      ...(withYear ? { year: 'numeric' } : {}),
    });
  return `${fmt(start, !sameYear)} – ${fmt(end, true)}`;
}

import { FALLBACK_EXCHANGE_RATE } from '@/lib/pricing';

/**
 * overrideUsd / overrideCrc are a staff member's 2% on her sub-users' orders.
 * They default to 0, so every existing caller keeps its current behaviour and
 * only the weekly scan passes them.
 */
export function recalcPayoutAmounts({
  usdSales = 0,
  crcSales = 0,
  commissionRate = 0,
  usdCommissionOverride,
  crcCommissionOverride,
  weeklySalary = 0,
  salaryCurrency = 'USD',
  exchangeRate = FALLBACK_EXCHANGE_RATE,
  overrideUsd = 0,
  overrideCrc = 0,
}) {
  const rate = Number(commissionRate || 0);
  const usdCommission = usdCommissionOverride === undefined
    ? Number(usdSales || 0) * (rate / 100)
    : Number(usdCommissionOverride || 0);
  const crcCommission = crcCommissionOverride === undefined
    ? Number(crcSales || 0) * (rate / 100)
    : Number(crcCommissionOverride || 0);

  const salary = Number(weeklySalary || 0);
  const salaryUsd = salaryCurrency === 'USD' ? salary : salary / exchangeRate;
  const salaryCrc = salaryCurrency === 'CRC' ? salary : salary * exchangeRate;

  const overrideUsdAmount = Number(overrideUsd || 0);
  const overrideCrcAmount = Number(overrideCrc || 0);

  const totalPayoutUsd = usdCommission + salaryUsd + overrideUsdAmount;
  const totalPayoutCrc = crcCommission + salaryCrc + overrideCrcAmount;

  return {
    usd_commission: usdCommission,
    crc_commission: crcCommission,
    override_usd: overrideUsdAmount,
    override_crc: overrideCrcAmount,
    total_payout_usd: totalPayoutUsd,
    total_payout_crc: totalPayoutCrc,
  };
}

export function getOrderCount(payout) {
  const orders = payout?.orders_data;
  return Array.isArray(orders) ? orders.length : 0;
}
