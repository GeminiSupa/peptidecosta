/**
 * Customer-facing checkout lines and savings derived from the same deal choice
 * that prices the cart. Keeping this model pure makes the invoice presentation
 * testable without duplicating any offer-selection rules in React.
 */
export function buildCheckoutBreakdown({ lines = [], dealChoice = null, bacFreeLines = [] } = {}) {
  const paidLines = (Array.isArray(lines) ? lines : [])
    .map((line) => {
      const qty = Math.max(0, Math.floor(Number(line?.qty) || 0));
      const unitPrice = Math.max(0, Number(line?.unitPrice) || 0);
      return {
        product: String(line?.product || '').trim(),
        qty,
        unitPrice,
        lineTotal: qty * unitPrice,
      };
    })
    .filter((line) => line.product && line.qty > 0);

  const weeklyGiftLines = dealChoice?.kind === 'bundle'
    ? (dealChoice.bundle?.freeLines || []).map((line) => ({
        product: String(line?.product || '').trim(),
        qty: Math.max(0, Math.floor(Number(line?.qty) || 0)),
        unitPrice: Math.max(0, Number(line?.unitPrice) || 0),
        value: Math.max(0, Math.floor(Number(line?.qty) || 0)) * Math.max(0, Number(line?.unitPrice) || 0),
      })).filter((line) => line.product && line.qty > 0)
    : [];

  const bacGiftLines = (Array.isArray(bacFreeLines) ? bacFreeLines : [])
    .map((line) => ({
      sizeMl: Number(line?.sizeMl) === 10 ? 10 : 3,
      qty: Math.max(0, Math.floor(Number(line?.qty) || 0)),
    }))
    .filter((line) => line.qty > 0);

  const paidUnits = paidLines.reduce((sum, line) => sum + line.qty, 0);
  const weeklyGiftUnits = weeklyGiftLines.reduce((sum, line) => sum + line.qty, 0);
  const bacGiftUnits = bacGiftLines.reduce((sum, line) => sum + line.qty, 0);
  const merchandiseSubtotal = paidLines.reduce((sum, line) => sum + line.lineTotal, 0);
  const weeklyGiftValue = weeklyGiftLines.reduce((sum, line) => sum + line.value, 0);
  // A flash sale's percentage is its own; a Mix & Match takes its rate from
  // the winning offer. Either way the invoice shows what came off.
  const discountPct = dealChoice?.kind === 'mix' || dealChoice?.kind === 'flat'
    ? Number(dealChoice.offer?.discount_pct ?? dealChoice.mix?.discountPct) || 0
    : 0;

  return {
    paidLines,
    weeklyGiftLines,
    bacGiftLines,
    paidUnits,
    weeklyGiftUnits,
    bacGiftUnits,
    totalUnits: paidUnits + weeklyGiftUnits + bacGiftUnits,
    merchandiseSubtotal,
    weeklyGiftValue,
    totalProductValue: merchandiseSubtotal + weeklyGiftValue,
    discountPct,
    discountAmount: dealChoice?.kind === 'mix' || dealChoice?.kind === 'flat' ? Math.max(0, Number(dealChoice.savings) || 0) : 0,
    comparedMixPct: dealChoice?.kind === 'bundle' && dealChoice.mix?.qualifies
      ? Number(dealChoice.mix.discountPct) || 0
      : 0,
    comparedMixSavings: dealChoice?.kind === 'bundle' && dealChoice.mix?.qualifies
      ? Math.max(0, Number(dealChoice.mix.savings) || 0)
      : 0,
  };
}
