import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { appendOrderActivity } from '@/lib/orderActivity';
import { agentMatchKeys } from '@/lib/agentOrders';

export const runtime = 'nodejs';

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const { order } = body;

    if (!order?.customer_name || !order?.customer_phone || !Array.isArray(order.items) || order.items.length === 0) {
      return NextResponse.json({ error: 'customer_name, customer_phone, and items are required' }, { status: 400 });
    }

    const orderNum = order.order_number || `WPCR-${Date.now().toString(36).toUpperCase()}`;
    const activityLog = appendOrderActivity([], {
      type: 'manual_entry',
      message: `Manual order created by ${auth.user.email}`,
      by: auth.user.email,
    });

    const row = {
      ...order,
      order_number: orderNum,
      source: 'admin_manual',
      status: order.status || 'Pending',
      payment_method: order.payment_method || 'whatsapp',
      activity_log: activityLog,
    };

    if (!auth.profile.is_superadmin) {
      const requestedAgent = String(row.sales_agent || '').trim().toLowerCase();
      if (requestedAgent && !agentMatchKeys(auth.profile).has(requestedAgent)) {
        return NextResponse.json({ error: 'Forbidden: staff can only create orders assigned to themselves' }, { status: 403 });
      }
      row.sales_agent = row.sales_agent || auth.profile.name || auth.profile.email || auth.user.email;
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('orders')
      .insert(row)
      .select('*')
      .single();

    if (error) {
      const { affiliate_id, affiliate_commission_usd, affiliate_commission_crc, ...withoutAffiliate } = row;
      if (affiliate_id && error.message?.includes('foreign key')) {
        const retry = await supabase.from('orders').insert(withoutAffiliate).select('*').single();
        if (retry.error) {
          return NextResponse.json({ error: retry.error.message }, { status: 500 });
        }
        return NextResponse.json({ ok: true, order: retry.data });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const updatePromises = [];
    if (row.customer_phone) {
      const cleanPhone = row.customer_phone.replace(/\D/g, '');
      const phoneSearch = cleanPhone.length >= 8 ? cleanPhone.slice(-8) : cleanPhone;
      updatePromises.push(
        supabase
          .from('abandoned_carts')
          .delete()
          .ilike('customer_phone', `%${phoneSearch}%`)
      );
    }
    if (row.customer_email) {
      updatePromises.push(
        supabase
          .from('abandoned_carts')
          .delete()
          .eq('customer_email', row.customer_email)
      );
    }

    if (updatePromises.length > 0) {
      try {
        await Promise.all(updatePromises);
      } catch (cartErr) {
        console.warn('[admin/orders/create] Abandoned cart update failed:', cartErr.message);
      }
    }

    return NextResponse.json({ ok: true, order: data });
  } catch (err) {
    console.error('[admin/orders/create]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
