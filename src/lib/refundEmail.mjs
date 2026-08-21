/**
 * The three emails a refund sends.
 *
 * Refunds are recorded here and paid by hand in Shield Hub Pay, which means the
 * customer's money does not arrive the moment the button is pressed. So the
 * customer's mail says the refund is *approved and on its way*, never that it
 * has landed — telling somebody their money is back when it is still days out
 * is how a refund turns into a complaint.
 *
 * Three separate messages rather than one with everybody copied in, for the
 * reason taxRecordsEmail.mjs learned the hard way: a CC shares the fate of the
 * message it rides on, so a bounced customer address would take the team's copy
 * and the accountant's copy down with it. Sent apart, they are also logged
 * apart, so "did the accountant get it?" has an answer.
 *
 * Kept free of '@/lib' imports so tests/ can load it under `node --test`.
 */

const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export const formatRefundMoney = (value, currency) => {
  const amount = Number(value || 0);
  return currency === 'CRC'
    ? `₡${Math.round(amount).toLocaleString('en-US')}`
    : `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/** The refund figure in the order's own currency. */
function primaryAmount(plan, currency) {
  return currency === 'CRC' ? plan.refundCrc : plan.refundUsd;
}

function keptAmount(plan, currency) {
  return currency === 'CRC' ? plan.keptCrc : plan.keptUsd;
}

/**
 * The customer's message.
 *
 * Spanish or English on the same rule the order receipts use: the order's
 * currency decides, because a colón order is a Costa Rican customer.
 */
export function buildCustomerRefundEmail({ order = {}, plan = {}, lang } = {}) {
  const currency = plan.currency || order.currency || 'USD';
  const isEn = (lang || (currency === 'CRC' ? 'es' : 'en')) === 'en';
  const orderNumber = order.order_number || order.orderNumber || '';
  const amount = formatRefundMoney(primaryAmount(plan, currency), currency);
  const kept = formatRefundMoney(keptAmount(plan, currency), currency);
  const partial = !plan.fullyRefunded;

  const subject = isEn
    ? `Refund approved - Order #${orderNumber} - Peptides Costa Rica`
    : `Reembolso aprobado - Pedido #${orderNumber} - Péptidos Costa Rica`;

  const heading = isEn ? 'Refund Approved' : 'Reembolso Aprobado';

  // "On its way", not "returned". The transfer is made by hand afterwards, and
  // bank timings are not ours to promise.
  const lead = isEn
    ? `We have approved a refund of <strong>${amount}</strong> on your order <strong>#${escapeHtml(orderNumber)}</strong>. It is on its way back to the card you paid with.`
    : `Hemos aprobado un reembolso de <strong>${amount}</strong> de su pedido <strong>#${escapeHtml(orderNumber)}</strong>. Va en camino de vuelta a la tarjeta con la que pagó.`;

  const partialLine = partial
    ? (isEn
      ? `<p style="margin:0 0 16px;">The remaining <strong>${kept}</strong> of your order stays as it is.</p>`
      : `<p style="margin:0 0 16px;">El resto de su pedido, <strong>${kept}</strong>, se mantiene sin cambios.</p>`)
    : '';

  const timing = isEn
    ? 'Depending on your bank, it can take a few working days to appear on your statement.'
    : 'Según su banco, puede tardar algunos días hábiles en aparecer en su estado de cuenta.';

  const help = isEn
    ? 'If anything about this looks wrong, reply to this email or message us on WhatsApp and we will sort it out.'
    : 'Si algo de esto no le parece correcto, responda a este correo o escríbanos por WhatsApp y lo resolvemos.';

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;line-height:1.6;max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
      <div style="background-color:#0f172a;padding:32px;text-align:center;">
        <div style="color:#ffffff;font-size:14px;font-weight:800;letter-spacing:1.2px;margin:0 0 12px;">PEPTIDES COSTA RICA</div>
        <h1 style="color:#ffffff;font-size:26px;font-weight:800;margin:0;">${heading}</h1>
      </div>
      <div style="padding:32px;">
        <p style="margin:0 0 16px;font-size:15px;">${lead}</p>
        ${partialLine}
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px;text-align:center;margin:24px 0;">
          <div style="color:#166534;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">${isEn ? 'Refund amount' : 'Monto del reembolso'}</div>
          <div style="color:#15803d;font-size:28px;font-weight:900;margin-top:6px;">${amount}</div>
        </div>
        <p style="margin:0 0 16px;font-size:14px;color:#475569;">${timing}</p>
        <p style="margin:0;font-size:14px;color:#475569;">${help}</p>
      </div>
    </div>
  `;

  const text = [
    heading,
    '',
    isEn
      ? `We have approved a refund of ${amount} on your order #${orderNumber}. It is on its way back to the card you paid with.`
      : `Hemos aprobado un reembolso de ${amount} de su pedido #${orderNumber}. Va en camino de vuelta a la tarjeta con la que pagó.`,
    ...(partial
      ? [isEn ? `The remaining ${kept} of your order stays as it is.` : `El resto de su pedido, ${kept}, se mantiene sin cambios.`]
      : []),
    '',
    timing,
    help,
  ].join('\n');

  return { subject, html, text };
}

/**
 * The internal message: the team, plus the agent whose sale this was.
 *
 * Carries the commission consequence explicitly. An agent finding out that a
 * sale was reversed only when their pay is short is the complaint this line
 * exists to prevent.
 */
export function buildTeamRefundEmail({ order = {}, plan = {}, clawback = null, actor = '' } = {}) {
  const currency = plan.currency || order.currency || 'USD';
  const orderNumber = order.order_number || order.orderNumber || '';
  const amount = formatRefundMoney(primaryAmount(plan, currency), currency);
  const kept = formatRefundMoney(keptAmount(plan, currency), currency);
  const label = plan.fullyRefunded ? 'REFUNDED' : 'PARTLY REFUNDED';

  const subject = `${label} #${orderNumber} - ${order.customer_name || 'Customer'} - ${amount}`;

  const commissionLine = clawback && (clawback.owedUsd > 0 || clawback.owedCrc > 0)
    ? `<tr><td style="padding:8px 0;color:#991b1b;font-weight:700;">Commission to recover</td><td style="padding:8px 0;text-align:right;color:#991b1b;font-weight:800;">${formatRefundMoney(currency === 'CRC' ? clawback.owedCrc : clawback.owedUsd, currency)}</td></tr>`
    : `<tr><td style="padding:8px 0;color:#64748b;">Commission</td><td style="padding:8px 0;text-align:right;color:#475569;">Not yet paid for this order — nothing to recover</td></tr>`;

  const row = (k, v) => `<tr><td style="padding:8px 0;color:#64748b;">${k}</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#0f172a;">${escapeHtml(String(v))}</td></tr>`;

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;line-height:1.6;max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
      <div style="background-color:#7f1d1d;padding:28px;text-align:center;">
        <div style="color:#ffffff;font-size:13px;font-weight:800;letter-spacing:1.2px;margin:0 0 10px;">PEPTIDES COSTA RICA</div>
        <h1 style="color:#ffffff;font-size:24px;font-weight:800;margin:0;">${label}</h1>
      </div>
      <div style="padding:28px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          ${row('Order', orderNumber)}
          ${row('Customer', order.customer_name || 'N/A')}
          ${row('Refunded now', amount)}
          ${row('Customer keeps', kept)}
          ${row('Sales agent', order.sales_agent || 'Unassigned')}
          ${row('Refunded by', actor || 'admin')}
          ${plan.reason ? row('Reason', plan.reason) : ''}
          ${row('Stock returned', plan.restoreStock ? 'Yes' : 'No')}
          ${commissionLine}
        </table>
        <p style="margin:20px 0 0;font-size:13px;color:#64748b;">
          This records the refund only. The money still has to be sent back by hand in Shield Hub Pay.
        </p>
      </div>
    </div>
  `;

  const text = [
    `${label} - order ${orderNumber}`,
    `Customer: ${order.customer_name || 'N/A'}`,
    `Refunded now: ${amount}`,
    `Customer keeps: ${kept}`,
    `Sales agent: ${order.sales_agent || 'Unassigned'}`,
    `Refunded by: ${actor || 'admin'}`,
    ...(plan.reason ? [`Reason: ${plan.reason}`] : []),
    `Stock returned: ${plan.restoreStock ? 'Yes' : 'No'}`,
    clawback && (clawback.owedUsd > 0 || clawback.owedCrc > 0)
      ? `Commission to recover: ${formatRefundMoney(currency === 'CRC' ? clawback.owedCrc : clawback.owedUsd, currency)} (taken off the next weekly pay)`
      : 'Commission: not yet paid for this order — nothing to recover',
    '',
    'This records the refund only. The money still has to be sent back by hand in Shield Hub Pay.',
  ].join('\n');

  return { subject, html, text };
}

/**
 * The accountant's copy.
 *
 * Their own message for the same reason the sales copy is: separately sent,
 * separately logged, and never a CC on a customer's mail.
 */
export function buildAccountantRefundEmail({ order = {}, plan = {} } = {}) {
  const currency = plan.currency || order.currency || 'USD';
  const orderNumber = order.order_number || order.orderNumber || '';
  const amount = formatRefundMoney(primaryAmount(plan, currency), currency);
  const header = `Copia contable — Reembolso ${plan.fullyRefunded ? 'total' : 'parcial'} — Pedido ${orderNumber}`;

  const html = `
    <p style="font:600 14px/1.5 system-ui,sans-serif;color:#334155;margin:0 0 16px">${header}</p>
    <table style="border-collapse:collapse;font:14px/1.6 system-ui,sans-serif;color:#334155;">
      <tr><td style="padding:4px 16px 4px 0;">Pedido</td><td><strong>${escapeHtml(orderNumber)}</strong></td></tr>
      <tr><td style="padding:4px 16px 4px 0;">Cliente</td><td>${escapeHtml(order.customer_name || 'N/A')}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;">Monto reembolsado</td><td><strong>${amount}</strong></td></tr>
      <tr><td style="padding:4px 16px 4px 0;">Total del pedido</td><td>${formatRefundMoney(currency === 'CRC' ? order.total_crc : order.total_usd, currency)}</td></tr>
      ${plan.reason ? `<tr><td style="padding:4px 16px 4px 0;">Motivo</td><td>${escapeHtml(plan.reason)}</td></tr>` : ''}
    </table>
    <p style="font:13px/1.5 system-ui,sans-serif;color:#64748b;margin:16px 0 0">
      El reembolso se envía manualmente por Shield Hub Pay; este correo es el registro contable.
    </p>
  `;

  const text = [
    header,
    `Pedido: ${orderNumber}`,
    `Cliente: ${order.customer_name || 'N/A'}`,
    `Monto reembolsado: ${amount}`,
    `Total del pedido: ${formatRefundMoney(currency === 'CRC' ? order.total_crc : order.total_usd, currency)}`,
    ...(plan.reason ? [`Motivo: ${plan.reason}`] : []),
  ].join('\n');

  return { subject: header, html, text };
}
