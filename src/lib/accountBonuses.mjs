// What a customer should see about savings on one of their orders.
//
// Built only from fields already stored on the order, plus an optional deal
// title looked up on the server. No dose, no health advice.

export function describeOrderBonuses(order, { dealTitle = '', lang = 'es' } = {}) {
  const isEn = lang === 'en';
  const lines = [];

  const title = String(dealTitle || '').trim();
  if (title) lines.push(title);

  const code = String(order?.promo_code || '').trim();
  if (code) lines.push(isEn ? `Promo code ${code}` : `Código ${code}`);

  const pct = Number(order?.volume_discount_pct);
  if (Number.isFinite(pct) && pct > 0) {
    lines.push(isEn ? `Volume saving ${pct}%` : `Ahorro por volumen ${pct}%`);
  }

  const reason = String(order?.manual_discount_reason || '').trim();
  if (reason) lines.push(reason);

  const currency = String(order?.currency || '').toUpperCase() === 'CRC' ? 'CRC' : 'USD';
  const amount = currency === 'CRC' ? Number(order?.discount_amount_crc) : Number(order?.discount_amount_usd);
  if (Number.isFinite(amount) && amount > 0) {
    const money = currency === 'CRC'
      ? `₡${Math.round(amount).toLocaleString('en-US')}`
      : `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    lines.push(isEn ? `Saving ${money}` : `Ahorro ${money}`);
  }

  return lines;
}

/** A staff login must never be removed by the customer-account delete. */
export function canDeleteCustomerAccount({ userId, staffUserIds = [] } = {}) {
  const id = String(userId || '').trim();
  if (!id) return false;
  return !(staffUserIds || []).some((staffId) => String(staffId) === id);
}
