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
      month: 'short',
      day: 'numeric',
      ...(withYear ? { year: 'numeric' } : {}),
    });
  return `${fmt(start, !sameYear)} – ${fmt(end, true)}`;
}

export function recalcPayoutAmounts({
  usdSales = 0,
  crcSales = 0,
  commissionRate = 0,
  weeklySalary = 0,
  salaryCurrency = 'USD',
}) {
  const rate = Number(commissionRate || 0);
  const usdCommission = Number(usdSales || 0) * (rate / 100);
  const crcCommission = Number(crcSales || 0) * (rate / 100);
  let totalPayoutUsd = usdCommission;
  let totalPayoutCrc = crcCommission;
  const salary = Number(weeklySalary || 0);
  if (salaryCurrency === 'USD') totalPayoutUsd += salary;
  else totalPayoutCrc += salary;
  return {
    usd_commission: usdCommission,
    crc_commission: crcCommission,
    total_payout_usd: totalPayoutUsd,
    total_payout_crc: totalPayoutCrc,
  };
}

export function getOrderCount(payout) {
  const orders = payout?.orders_data;
  return Array.isArray(orders) ? orders.length : 0;
}
