// Saving the address from an order onto the customer's account.
//
// Checkout keeps the address on the order. It did not copy it into the
// account, so a person who had just typed their address still saw an empty
// address book. Amazon does the opposite: the address used to place the order
// becomes a saved address, and the next checkout can start from it.

import { parseShippingAddress } from './correosAddress.mjs';

function clean(value, max) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return max ? text.slice(0, max) : text;
}

export function addressRowFromOrder(order, userId) {
  const blob = String(order?.shipping_address || '').trim();
  const name = clean(order?.customer_name, 120);
  if (!userId || !blob || !name) return null;

  const parsed = parseShippingAddress(blob);
  const directions = blob
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line, index) => line && index !== parsed.lineIndex)
    .join(', ');

  return {
    customer_user_id: userId,
    label: 'Home',
    recipient_name: name,
    phone: clean(order?.customer_phone, 40) || null,
    country_code: 'CR',
    province: parsed.province || null,
    canton: parsed.canton || null,
    district: parsed.district || null,
    detailed_address: clean(directions || blob, 500),
    postal_code: parsed.postalCode || null,
    is_default: true,
  };
}

function addressKey(row) {
  return [row?.detailed_address, row?.district, row?.canton, row?.province]
    .map((part) => String(part || '').trim().toLowerCase())
    .join('|');
}

/** Insert the order's address when this account does not already have it. */
export async function rememberOrderAddress(admin, userId, order) {
  const row = addressRowFromOrder(order, userId);
  if (!row) return false;

  const { data: existing, error } = await admin
    .from('customer_addresses')
    .select('id, detailed_address, district, canton, province, is_default')
    .eq('customer_user_id', userId);

  if (error) throw error;
  const saved = existing || [];
  if (saved.some((item) => addressKey(item) === addressKey(row))) return false;
  if (saved.some((item) => item.is_default)) row.is_default = false;

  const { error: insertError } = await admin.from('customer_addresses').insert(row);
  if (insertError) throw insertError;
  return true;
}
