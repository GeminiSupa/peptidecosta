import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';

export const runtime = 'nodejs';

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const { id, discount_pct, is_flash_sale, target_product, valid_from, valid_until, affiliate_id } = body;

    if (!id || !discount_pct) {
      return NextResponse.json({ error: 'ID and discount_pct are required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('promo_codes')
      .update({
        discount_pct,
        is_flash_sale: is_flash_sale || false,
        target_product: target_product || null,
        valid_from: valid_from || null,
        valid_until: valid_until || null,
        affiliate_id: affiliate_id || null
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error('[admin/promo/update]', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, promo: data });
  } catch (err) {
    console.error('[admin/promo/update]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
