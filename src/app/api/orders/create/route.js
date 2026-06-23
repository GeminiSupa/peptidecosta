import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

const REQUIRED_FIELDS = ['order_number', 'customer_name', 'customer_phone', 'items'];

function isFkViolation(error) {
  const msg = error?.message || '';
  return msg.includes('foreign key constraint') || error?.code === '23503';
}

export async function POST(request) {
  try {
    const body = await request.json();
    const order = body?.order;

    if (!order || typeof order !== 'object') {
      return NextResponse.json({ error: 'Missing order payload' }, { status: 400 });
    }

    for (const field of REQUIRED_FIELDS) {
      if (!order[field]) {
        return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 });
      }
    }

    if (!Array.isArray(order.items) || order.items.length === 0) {
      return NextResponse.json({ error: 'Order must include at least one item' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    let { data, error } = await supabase
      .from('orders')
      .insert(order)
      .select('id, order_number')
      .single();

    if (error && isFkViolation(error) && order.affiliate_id) {
      console.warn('[orders/create] Affiliate FK failed, retrying without affiliate fields:', error.message);
      const { affiliate_id, affiliate_commission_usd, affiliate_commission_crc, ...withoutAffiliate } = order;
      ({ data, error } = await supabase
        .from('orders')
        .insert(withoutAffiliate)
        .select('id, order_number')
        .single());
    }

    if (error) {
      console.error('[orders/create] Insert failed:', error.message, { order_number: order.order_number });
      try {
        await supabase.from('admin_notifications').insert({
          type: 'order_save_failed',
          title: `Order save failed: ${order.order_number}`,
          body: `${order.customer_name} — ${error.message}`.slice(0, 500),
          link_tab: 'orders',
          link_ref: order.order_number,
        });
      } catch {
        // notification table may not exist yet
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // --- NEW: Deduct Inventory & Check Low Stock Threshold ---
    try {
      for (const item of order.items) {
        if (!item.product || !item.qty) continue;

        // Fetch current inventory and threshold
        const { data: prodData, error: prodErr } = await supabase
          .from('products')
          .select('inventory_count, low_stock_threshold')
          .eq('product', item.product)
          .single();

        if (prodErr || !prodData || prodData.inventory_count === null) {
          continue; // Not tracking inventory for this product
        }

        const currentInventory = prodData.inventory_count;
        const threshold = prodData.low_stock_threshold !== null ? prodData.low_stock_threshold : 5;
        const newInventory = Math.max(0, currentInventory - item.qty);

        // Update the inventory count
        await supabase
          .from('products')
          .update({ inventory_count: newInventory })
          .eq('product', item.product);

        // Check if we just crossed the threshold, or hit zero
        const crossedThreshold = currentInventory > threshold && newInventory <= threshold;
        const hitZero = currentInventory > 0 && newInventory === 0;

        if (crossedThreshold || hitZero) {
          await supabase.from('admin_notifications').insert({
            type: 'low_inventory',
            title: hitZero ? `Out of Stock: ${item.product}` : `Low Stock Alert: ${item.product}`,
            body: `Inventory has dropped to ${newInventory} unit(s).`,
            link_tab: 'spreadsheet',
          });
        }
      }
    } catch (invErr) {
      console.error('[orders/create] Inventory deduction failed:', invErr);
      // We don't fail the order if inventory deduction fails
    }
    // --------------------------------------------------------

    const updatePromises = [];
    if (body.sessionId) {
      updatePromises.push(
        supabase
          .from('abandoned_carts')
          .update({ status: 'converted' })
          .eq('session_id', body.sessionId)
      );
    }
    if (order.customer_phone) {
      updatePromises.push(
        supabase
          .from('abandoned_carts')
          .update({ status: 'converted' })
          .eq('customer_phone', order.customer_phone)
      );
    }
    if (order.customer_email) {
      updatePromises.push(
        supabase
          .from('abandoned_carts')
          .update({ status: 'converted' })
          .eq('customer_email', order.customer_email)
      );
    }
    if (order.promo_code) {
      updatePromises.push(
        (async () => {
          const { data: pCode } = await supabase.from('promo_codes').select('usage_count').eq('code', order.promo_code).single();
          if (pCode) {
            await supabase.from('promo_codes').update({ usage_count: (pCode.usage_count || 0) + 1 }).eq('code', order.promo_code);
          }
        })()
      );
    }

    if (updatePromises.length > 0) {
      try {
        await Promise.all(updatePromises);
      } catch (cartErr) {
        console.warn('[orders/create] Abandoned cart update failed:', cartErr.message);
      }
    }

    return NextResponse.json({ ok: true, id: data.id, orderNumber: data.order_number });
  } catch (err) {
    console.error('[orders/create] Unexpected error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
