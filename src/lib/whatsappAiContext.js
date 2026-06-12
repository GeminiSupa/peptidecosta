import { formatCartItemsSummary, sanitizeCustomerName } from '@/lib/whatsappRecovery';

/** Build CRM context for inbound WhatsApp AI replies. */
export async function buildWhatsAppCustomerContext(supabase, waId) {
  if (!supabase || !waId) return '';

  const cleanNum = String(waId).replace(/\D/g, '');
  const phoneTail = cleanNum.slice(-8);
  const sections = [];

  try {
    const { data: orders } = await supabase
      .from('orders')
      .select('id, order_number, status, customer_name, items, total_crc, total_usd, currency, created_at')
      .or(`customer_phone.ilike.%${phoneTail}%,customer_phone.ilike.%${cleanNum}%,whatsapp_wa_id.eq.${waId}`)
      .order('created_at', { ascending: false })
      .limit(3);

    if (orders?.length) {
      sections.push(
        'Recent Orders for this customer:\n' +
          orders
            .map((o) => {
              const items = formatCartItemsSummary(o.items);
              return `- Order #${o.order_number || o.id.slice(0, 8)} (${o.status || 'Pending'}): ${items}; total ${o.currency === 'USD' ? `$${o.total_usd}` : `₡${o.total_crc}`}`;
            })
            .join('\n')
      );
    }
  } catch (err) {
    console.warn('[WhatsApp AI] Order context failed:', err.message);
  }

  try {
    const { data: carts } = await supabase
      .from('abandoned_carts')
      .select('session_id, customer_name, cart_data, status, last_updated')
      .eq('status', 'active')
      .or(`customer_phone.ilike.%${phoneTail}%,customer_phone.ilike.%${cleanNum}%`)
      .order('last_updated', { ascending: false })
      .limit(2);

    const withItems = (carts || []).filter((c) => Array.isArray(c.cart_data) && c.cart_data.length > 0);
    if (withItems.length) {
      sections.push(
        'Active Abandoned Carts:\n' +
          withItems
            .map((c) => {
              const link = `https://catalog.peptidescostarica.net/catalog?recover_session=${c.session_id}`;
              return `- ${sanitizeCustomerName(c.customer_name)}: ${formatCartItemsSummary(c.cart_data)} | recovery link: ${link}`;
            })
            .join('\n')
      );
    }
  } catch (err) {
    console.warn('[WhatsApp AI] Abandoned cart context failed:', err.message);
  }

  return sections.join('\n\n');
}
