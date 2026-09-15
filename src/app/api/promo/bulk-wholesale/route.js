import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { BULK_WHOLESALE_CODE, bulkWholesalePromoState } from '@/lib/bulkWholesaleCampaign.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('promo_codes')
      .select('code, discount_pct, min_units, max_units, target_product, is_active, valid_from, valid_until, usage_limit, usage_count')
      .eq('code', BULK_WHOLESALE_CODE)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: 'Could not verify the bulk offer.' }, { status: 503 });
    }

    return NextResponse.json(bulkWholesalePromoState(data));
  } catch (error) {
    console.error('[promo/bulk-wholesale]', error);
    return NextResponse.json({ error: 'Could not verify the bulk offer.' }, { status: 503 });
  }
}
