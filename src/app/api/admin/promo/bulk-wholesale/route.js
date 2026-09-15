import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { BULK_WHOLESALE_SETTINGS_ID, normalizeBulkWholesaleSettings } from '@/lib/bulkWholesaleCampaign.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await verifyAdminSession(request, { requireSuperadmin: true });
  if (auth.error) return auth.error;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('site_settings').select('value').eq('id', BULK_WHOLESALE_SETTINGS_ID).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: normalizeBulkWholesaleSettings(data?.value) });
}

export async function POST(request) {
  const auth = await verifyAdminSession(request, { requireSuperadmin: true });
  if (auth.error) return auth.error;
  try {
    const settings = normalizeBulkWholesaleSettings((await request.json())?.settings);
    const supabase = getSupabaseAdmin();
    if (settings.enabled) {
      if (!settings.promoCode) return NextResponse.json({ error: 'Select a promo code before publishing the campaign.' }, { status: 422 });
      const { data: promo, error: promoError } = await supabase.from('promo_codes')
        .select('code, discount_pct, min_units, target_product').eq('code', settings.promoCode).maybeSingle();
      if (promoError || !promo) return NextResponse.json({ error: promoError?.message || 'Selected promo code was not found.' }, { status: 422 });
      if (Number(promo.min_units || 0) <= 0 || Number(promo.discount_pct || 0) <= 0 || !String(promo.target_product || '').trim()) {
        return NextResponse.json({ error: 'The selected code must have a discount, minimum units, and applicable products.' }, { status: 422 });
      }
    }
    const { error } = await supabase.from('site_settings').upsert({ id: BULK_WHOLESALE_SETTINGS_ID, value: settings });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Could not save campaign settings.' }, { status: 500 });
  }
}
