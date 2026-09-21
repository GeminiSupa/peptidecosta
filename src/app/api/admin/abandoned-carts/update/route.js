import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { stashInBin } from '@/lib/adminBin.mjs';

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
      const { data: existing } = await supabase
        .from('abandoned_carts')
        .select('*')
        .eq('session_id', sessionId);
      if (existing?.length) {
        const binned = await stashInBin(supabase, {
          entityType: 'cart',
          rows: existing,
          deletedBy: auth.user.email || auth.profile.email || null,
        });
        if (!binned.ok) {
          return NextResponse.json({ error: binned.error?.message || 'Could not copy this cart to the Bin' }, { status: 500 });
        }
      }
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
    const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(cartKey));

    const { data: bySession, error: sessionReadError } = await supabase
      .from('abandoned_carts')
      .select('*')
      .eq('session_id', cartKey);

    if (sessionReadError) {
      console.error('[admin/abandoned-carts/delete] session read failed:', sessionReadError.message);
      return NextResponse.json({ error: sessionReadError.message }, { status: 500 });
    }

    let rows = Array.isArray(bySession) ? bySession : [];
    if (rows.length === 0 && looksLikeUuid) {
      const { data: byId, error: idReadError } = await supabase
        .from('abandoned_carts')
        .select('*')
        .eq('id', cartKey);

      if (idReadError) {
        console.error('[admin/abandoned-carts/delete] id read failed:', idReadError.message);
        return NextResponse.json({ error: idReadError.message }, { status: 500 });
      }
      rows = Array.isArray(byId) ? byId : [];
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Cart not found or already deleted' }, { status: 404 });
    }

    const binned = await stashInBin(supabase, {
      entityType: 'cart',
      rows,
      deletedBy: auth.user.email || auth.profile.email || null,
    });
    if (!binned.ok) {
      return NextResponse.json({ error: binned.error?.message || 'Could not copy this cart to the Bin' }, { status: 500 });
    }

    const ids = rows.map((row) => row.id).filter(Boolean);
    const { data: deleted, error: deleteError } = await supabase
      .from('abandoned_carts')
      .delete()
      .in('id', ids)
      .select('id');

    if (deleteError) {
      console.error('[admin/abandoned-carts/delete] delete failed:', deleteError.message);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    if (!deleted?.length) {
      return NextResponse.json({ error: 'Cart not found or already deleted' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, deleted: deleted.length, cartKey });
  } catch (err) {
    console.error('[admin/abandoned-carts/delete]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
