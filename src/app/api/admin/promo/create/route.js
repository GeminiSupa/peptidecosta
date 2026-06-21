import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';

export const runtime = 'nodejs';

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const { code, discount_pct, is_flash_sale, target_product } = body;

    if (!code || !discount_pct) {
      return NextResponse.json({ error: 'Code and discount_pct are required' }, { status: 400 });
    }

    const cleanCode = code.trim().toUpperCase();

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('promo_codes')
      .insert([{
        code: cleanCode,
        discount_pct,
        is_flash_sale: is_flash_sale || false,
        target_product: target_product || null,
        is_active: true
      }])
      .select('*')
      .single();

    if (error) {
      console.error('[admin/promo/create]', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, promo: data });
  } catch (err) {
    console.error('[admin/promo/create]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
