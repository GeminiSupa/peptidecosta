import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';

export const runtime = 'nodejs';

const cartHasItems = (cartData) => Array.isArray(cartData) && cartData.length > 0;

export async function PATCH(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const { sessionId, updates } = body;

    if (!sessionId || !updates || typeof updates !== 'object') {
      return NextResponse.json({ error: 'sessionId and updates required' }, { status: 400 });
    }

    const allowed = [
      'customer_name',
      'customer_phone',
      'customer_email',
      'cart_data',
      'currency',
      'lang',
    ];
    const patch = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) patch[key] = updates[key];
    }

    if (patch.cart_data !== undefined && !cartHasItems(patch.cart_data)) {
      const supabase = getSupabaseAdmin();
      const { error } = await supabase
        .from('abandoned_carts')
        .delete()
        .eq('session_id', sessionId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, deleted: true, sessionId });
    }

    patch.last_updated = new Date().toISOString();

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('abandoned_carts')
      .update(patch)
      .eq('session_id', sessionId)
      .select('*')
      .single();

    if (error) {
      console.error('[admin/abandoned-carts/update]', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, cart: data });
  } catch (err) {
    console.error('[admin/abandoned-carts/update]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
