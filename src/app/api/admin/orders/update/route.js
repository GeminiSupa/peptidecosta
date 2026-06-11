import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { appendOrderActivity } from '@/lib/orderActivity';

export const runtime = 'nodejs';

export async function PATCH(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const { orderId, updates, activity } = body;

    if (!orderId || !updates || typeof updates !== 'object') {
      return NextResponse.json({ error: 'orderId and updates required' }, { status: 400 });
    }

    const allowed = [
      'status', 'tracking_number', 'sales_agent', 'internal_notes',
      'payment_proof_url', 'shipping_cost_crc', 'shipping_cost_usd',
    ];
    const patch = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) patch[key] = updates[key];
    }

    const supabase = getSupabaseAdmin();

    let activityLog;
    if (activity) {
      const { data: current } = await supabase
        .from('orders')
        .select('activity_log')
        .eq('id', orderId)
        .single();
      activityLog = appendOrderActivity(current?.activity_log, {
        type: activity.type || 'note',
        message: activity.message || '',
        by: auth.user.email,
      });
      patch.activity_log = activityLog;
    }

    const { data, error } = await supabase
      .from('orders')
      .update(patch)
      .eq('id', orderId)
      .select('*')
      .single();

    if (error) {
      console.error('[admin/orders/update]', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, order: data });
  } catch (err) {
    console.error('[admin/orders/update]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
