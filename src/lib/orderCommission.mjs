const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const round2 = (value) => Math.round(num(value) * 100) / 100;

export function orderCommissionRate(order, defaultRate = 0) {
  const override = num(order?.agent_commission_rate_override);
  if (override > 0) return override;
  return num(defaultRate);
}

export function orderCommissionSource(order) {
  return String(order?.agent_commission_source || '').trim();
}

export function computeOrderCommissionAmounts(order, defaultRate = 0, getAmounts) {
  const resolve = typeof getAmounts === 'function'
    ? getAmounts
    : (row) => ({ usd: num(row?.total_usd), crc: num(row?.total_crc) });
  const amounts = resolve(order) || {};
  const rate = orderCommissionRate(order, defaultRate);

  return {
    rate,
    source: orderCommissionSource(order),
    usdSales: num(amounts.usd),
    crcSales: num(amounts.crc),
    usdCommission: round2(num(amounts.usd) * (rate / 100)),
    crcCommission: round2(num(amounts.crc) * (rate / 100)),
  };
}

export function summarizeOrderCommissions(orders = [], defaultRate = 0, getAmounts) {
  const summary = {
    usdSales: 0,
    crcSales: 0,
    usdCommission: 0,
    crcCommission: 0,
    rates: new Set(),
  };

  for (const order of orders || []) {
    const row = computeOrderCommissionAmounts(order, defaultRate, getAmounts);
    summary.usdSales += row.usdSales;
    summary.crcSales += row.crcSales;
    summary.usdCommission += row.usdCommission;
    summary.crcCommission += row.crcCommission;
    summary.rates.add(row.rate);
  }

  return {
    usdSales: round2(summary.usdSales),
    crcSales: round2(summary.crcSales),
    usdCommission: round2(summary.usdCommission),
    crcCommission: round2(summary.crcCommission),
    rates: [...summary.rates].sort((a, b) => a - b),
  };
}

export function commissionRateLabel(rates = [], fallbackRate = 0) {
  const cleanRates = (rates.length ? rates : [fallbackRate])
    .map(num)
    .filter((rate) => rate > 0);

  if (cleanRates.length === 0) return '0%';
  const unique = [...new Set(cleanRates)];
  if (unique.length === 1) return `${unique[0]}%`;
  return `Variable (${unique.map((rate) => `${rate}%`).join(', ')})`;
}

export function decorateCommissionOrder(order, defaultRate = 0, getAmounts, sourceLabel = (value) => value || 'Standard sale') {
  const commission = computeOrderCommissionAmounts(order, defaultRate, getAmounts);
  return {
    ...order,
    commission_rate_applied: commission.rate,
    commission_source_label: sourceLabel(commission.source),
    commission_earned_usd: commission.usdCommission,
    commission_earned_crc: commission.crcCommission,
  };
}
