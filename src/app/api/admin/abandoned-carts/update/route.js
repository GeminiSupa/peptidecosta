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

export async function DELETE(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));
    const cartKey = body.sessionId || body.id || body.cartKey;

    if (!cartKey) {
      return NextResponse.json({ error: 'sessionId, id, or cartKey required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const deletedIds = [];

    const { data: bySession, error: sessionError } = await supabase
      .from('abandoned_carts')
      .delete()
      .eq('session_id', cartKey)
      .select('id, session_id');

    if (sessionError) {
      console.error('[admin/abandoned-carts/delete] session delete failed:', sessionError.message);
      return NextResponse.json({ error: sessionError.message }, { status: 500 });
    }

    if (Array.isArray(bySession)) {
      deletedIds.push(...bySession.map((row) => row.id).filter(Boolean));
    }

    const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cartKey);
    if (deletedIds.length === 0 && looksLikeUuid) {
      const { data: byId, error: idError } = await supabase
        .from('abandoned_carts')
        .delete()
        .eq('id', cartKey)
        .select('id, session_id');

      if (idError) {
        console.error('[admin/abandoned-carts/delete] id delete failed:', idError.message);
        return NextResponse.json({ error: idError.message }, { status: 500 });
      }

      if (Array.isArray(byId)) {
        deletedIds.push(...byId.map((row) => row.id).filter(Boolean));
      }
    }

    if (deletedIds.length === 0) {
      return NextResponse.json({ error: 'Cart not found or already deleted' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, deleted: deletedIds.length, cartKey });
  } catch (err) {
    console.error('[admin/abandoned-carts/delete]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
