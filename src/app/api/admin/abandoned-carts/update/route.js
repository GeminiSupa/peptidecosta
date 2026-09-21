import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { actorFrom, moveToBin } from '@/lib/recycleBinServer';

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

    // The cart key is usually a session_id and sometimes the primary key, so
    // this still tries both — it just goes through the Bin now, which snapshots
    // whatever it matched before removing it.
    const bySession = await moveToBin(
      { table: 'abandoned_carts', ids: [cartKey], idColumn: 'session_id', actor: actorFrom(auth.profile) },
      supabase,
    );

    // No match on session_id is the ordinary case for a key that is really an
    // id, and the id attempt below covers it. Only a real failure stops here.
    if (!bySession.ok && !bySession.notFound) {
      console.error('[admin/abandoned-carts/delete] session delete failed:', bySession.error);
      return NextResponse.json({ error: bySession.error }, { status: 500 });
    }

    if (bySession.ok) {
      deletedIds.push(...(bySession.rows || []).map((row) => row.id).filter(Boolean));
    }

    const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cartKey);
    if (deletedIds.length === 0 && looksLikeUuid) {
      const byId = await moveToBin(
        { table: 'abandoned_carts', ids: [cartKey], actor: actorFrom(auth.profile) },
        supabase,
      );

      if (!byId.ok && !byId.notFound) {
        console.error('[admin/abandoned-carts/delete] id delete failed:', byId.error);
        return NextResponse.json({ error: byId.error }, { status: 500 });
      }

      if (byId.ok) {
        deletedIds.push(...(byId.rows || []).map((row) => row.id).filter(Boolean));
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
