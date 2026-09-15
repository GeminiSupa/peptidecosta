import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { BULK_WHOLESALE_SETTINGS_ID, bulkWholesalePromoState, normalizeBulkWholesaleSettings } from '@/lib/bulkWholesaleCampaign.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data: row, error: settingsError } = await supabase
      .from('site_settings').select('value').eq('id', BULK_WHOLESALE_SETTINGS_ID).maybeSingle();
    if (settingsError) return NextResponse.json({ error: 'Could not verify the bulk offer.' }, { status: 503 });
    const settings = normalizeBulkWholesaleSettings(row?.value);
    if (!settings.enabled || !settings.promoCode) return NextResponse.json(bulkWholesalePromoState(null, settings));

    const { data, error } = await supabase
      .from('promo_codes')
      .select('code, discount_pct, min_units, max_units, target_product, is_active, valid_from, valid_until, usage_limit, usage_count')
      .eq('code', settings.promoCode)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: 'Could not verify the bulk offer.' }, { status: 503 });
    }

    return NextResponse.json(bulkWholesalePromoState(data, settings));
  } catch (error) {
    console.error('[promo/bulk-wholesale]', error);
    return NextResponse.json({ error: 'Could not verify the bulk offer.' }, { status: 503 });
  }
}
