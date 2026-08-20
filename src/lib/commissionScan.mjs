const asTime = (value) => {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : null;
};

export function hasPositivePayout({ totalPayoutUsd = 0, totalPayoutCrc = 0 } = {}) {
  return Number(totalPayoutUsd || 0) > 0 || Number(totalPayoutCrc || 0) > 0;
}

export function payoutMatchesPeriod(payout, period) {
  if (!period?.start || !period?.end) return true;
  return asTime(payout?.start_date) === asTime(period.start)
    && asTime(payout?.end_date) === asTime(period.end);
}

export function summarizeCommissionScan(results = [], skippedNoPay = []) {
  const accountingSent = results.filter((row) => row?.accountingCopy?.sent).length;
  const accountingFailed = results.filter(
    (row) => row?.alreadySettled && row?.accountingCopy && !row.accountingCopy.sent
  ).length;

  return {
    reports: results.length,
    approved: results.filter((row) => row?.alreadySettled).length,
    pending: results.filter((row) => !row?.alreadySettled).length,
    accountingSent,
    accountingFailed,
    skippedNoPay: skippedNoPay.length,
    cleanupFailed: skippedNoPay.filter((row) => row?.cleanupError).length,
  };
}
