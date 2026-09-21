import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getLiveDeal } from '@/lib/dealsEngine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const deal = await getLiveDeal(getSupabaseAdmin());
    const now = Date.now();
    if (!deal
      || (deal.starts_at && now < Date.parse(deal.starts_at))
      || (deal.ends_at && now > Date.parse(deal.ends_at))) {
      return NextResponse.json({ deal: null });
    }
    return NextResponse.json({ deal: {
      id: deal.id, title_en: deal.title_en, title_es: deal.title_es,
      product_names: deal.product_names || [], discount_pct: deal.discount_pct,
      starts_at: deal.starts_at, ends_at: deal.ends_at,
      pricing_mode: deal.pricing_mode || 'shelf', min_units: deal.min_units || 0, max_units: deal.max_units || null,
      offers: deal.offers || null,
    }});
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Could not read weekly deal.' }, { status: 503 });
  }
}
