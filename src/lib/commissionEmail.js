const formatMoney = (value, currency) => {
  const amount = Number(value || 0);
  if (currency === 'USD') {
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `₡${Math.round(amount).toLocaleString('en-US')}`;
};

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const formatCrDate = (value) => new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Costa_Rica',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
}).format(new Date(value));

export function buildAgentCommissionEmail({
  agentName,
  periodDisplay,
  commissionRate,
  weeklySalary,
  salaryCurrency,
  usdSales,
  crcSales,
  usdCommission,
  crcCommission,
  totalPayoutUsd,
  totalPayoutCrc,
  orders = [],
}) {
  const sortedOrders = [...orders].sort(
    (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  );
  const orderRows = sortedOrders.map((order, index) => {
    const isUsd = String(order.currency || '').toUpperCase() === 'USD';
    const orderAmount = isUsd
      ? formatMoney(order.total_usd || order.total || 0, 'USD')
      : formatMoney(order.total_crc || order.total || 0, 'CRC');
    return `
      <tr bgcolor="${index % 2 === 0 ? '#ffffff' : '#f8fafc'}">
        <td style="padding:12px 10px;border-top:1px solid #e2e8f0;font:600 12px Arial,sans-serif;color:#0f172a;">#${escapeHtml(order.order_number || order.id?.slice(0, 8) || 'N/A')}</td>
        <td style="padding:12px 10px;border-top:1px solid #e2e8f0;font:12px Arial,sans-serif;color:#475569;white-space:nowrap;">${formatCrDate(order.created_at)}</td>
        <td style="padding:12px 10px;border-top:1px solid #e2e8f0;font:12px Arial,sans-serif;color:#334155;">${escapeHtml(order.customer_name || 'N/A')}</td>
        <td align="right" style="padding:12px 10px;border-top:1px solid #e2e8f0;font:700 12px Arial,sans-serif;color:#0f172a;white-space:nowrap;">${orderAmount}</td>
      </tr>`;
  }).join('');

  const html = `<!doctype html>
  <html><body style="margin:0;padding:0;background-color:#eef2f7;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#eef2f7" style="background-color:#eef2f7;">
      <tr><td align="center" style="padding:28px 12px;">
        <table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:640px;background-color:#ffffff;border:1px solid #dbe3ee;">
          <tr><td align="center" bgcolor="#10233f" style="padding:28px 24px;background-color:#10233f;color:#ffffff;">
            <div style="font:700 14px Arial,sans-serif;letter-spacing:1.5px;color:#9ee7da;">PEPTIDES COSTA RICA</div>
            <div style="font:700 26px Arial,sans-serif;color:#ffffff;margin-top:10px;">Weekly pay report</div>
            <div style="font:13px Arial,sans-serif;color:#dbeafe;margin-top:8px;">${escapeHtml(periodDisplay)} · Costa Rica time</div>
          </td></tr>
          <tr><td style="padding:26px 24px;font-family:Arial,sans-serif;color:#334155;">
            <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#334155;">Hi ${escapeHtml(agentName)}, here is your finalized pay report for the previous work week.</p>

            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#e9fbf5" style="background-color:#e9fbf5;border:2px solid #86d9c2;">
              <tr><td align="center" style="padding:22px 16px;">
                <div style="font:700 11px Arial,sans-serif;color:#06745f;letter-spacing:1px;text-transform:uppercase;">Total payout (salary + commission)</div>
                <div style="font:700 28px Arial,sans-serif;color:#0f172a;margin-top:10px;">${formatMoney(totalPayoutUsd, 'USD')}</div>
                <div style="font:700 11px Arial,sans-serif;color:#64748b;margin:5px 0;letter-spacing:1px;">OR</div>
                <div style="font:700 28px Arial,sans-serif;color:#0f172a;">${formatMoney(totalPayoutCrc, 'CRC')}</div>
                <div style="font:700 12px Arial,sans-serif;color:#06745f;margin-top:12px;">Choose one currency option—not both.</div>
              </td></tr>
            </table>

            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:16px;">
              <tr>
                <td width="49%" align="center" valign="top" bgcolor="#f8fafc" style="padding:16px 8px;border:1px solid #dbe3ee;background-color:#f8fafc;">
                  <div style="font:700 10px Arial,sans-serif;color:#64748b;letter-spacing:.8px;text-transform:uppercase;">Base salary</div>
                  <div style="font:700 18px Arial,sans-serif;color:#0f172a;margin-top:8px;">${formatMoney(weeklySalary, salaryCurrency)}</div>
                </td>
                <td width="2%">&nbsp;</td>
                <td width="49%" align="center" valign="top" bgcolor="#f8fafc" style="padding:16px 8px;border:1px solid #dbe3ee;background-color:#f8fafc;">
                  <div style="font:700 10px Arial,sans-serif;color:#64748b;letter-spacing:.8px;text-transform:uppercase;">Commission (${Number(commissionRate || 0)}%)</div>
                  <div style="font:700 17px Arial,sans-serif;color:#0f172a;margin-top:8px;">${formatMoney(usdCommission, 'USD')}</div>
                  <div style="font:700 10px Arial,sans-serif;color:#64748b;margin:3px 0;">AND</div>
                  <div style="font:700 17px Arial,sans-serif;color:#0f172a;">${formatMoney(crcCommission, 'CRC')}</div>
                </td>
              </tr>
            </table>

            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:18px;">
              <tr>
                <td style="font:13px Arial,sans-serif;color:#475569;">Closed orders: <strong>${sortedOrders.length}</strong></td>
                <td align="right" style="font:13px Arial,sans-serif;color:#475569;">Sales: <strong>${formatMoney(usdSales, 'USD')} / ${formatMoney(crcSales, 'CRC')}</strong></td>
              </tr>
            </table>

            <div style="font:700 14px Arial,sans-serif;color:#0f172a;margin:24px 0 10px;">Completed orders · newest first</div>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #dbe3ee;">
              <tr bgcolor="#e8eef6">
                <th align="left" style="padding:10px;font:700 10px Arial,sans-serif;color:#475569;text-transform:uppercase;">Order</th>
                <th align="left" style="padding:10px;font:700 10px Arial,sans-serif;color:#475569;text-transform:uppercase;">Date</th>
                <th align="left" style="padding:10px;font:700 10px Arial,sans-serif;color:#475569;text-transform:uppercase;">Customer</th>
                <th align="right" style="padding:10px;font:700 10px Arial,sans-serif;color:#475569;text-transform:uppercase;">Amount</th>
              </tr>
              ${orderRows || '<tr><td colspan="4" align="center" style="padding:20px;font:13px Arial,sans-serif;color:#64748b;border-top:1px solid #e2e8f0;">No completed orders in this period.</td></tr>'}
            </table>
          </td></tr>
          <tr><td align="center" bgcolor="#f8fafc" style="padding:16px;border-top:1px solid #dbe3ee;font:11px Arial,sans-serif;color:#64748b;">Automated weekly report · Peptides Costa Rica</td></tr>
        </table>
      </td></tr>
    </table>
  </body></html>`;

  const text = [
    `Weekly pay report for ${periodDisplay}`,
    `Total payout (salary + commission): ${formatMoney(totalPayoutUsd, 'USD')} OR ${formatMoney(totalPayoutCrc, 'CRC')}`,
    'Choose one currency option—not both.',
    `Completed orders: ${sortedOrders.length}`,
    ...sortedOrders.map((order) => `${formatCrDate(order.created_at)} · #${order.order_number || order.id?.slice(0, 8) || 'N/A'} · ${order.customer_name || 'N/A'}`),
  ].join('\n');

  return { html, text };
}
