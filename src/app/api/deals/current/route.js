import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getLiveDeals } from '@/lib/dealsEngine';
import { combineLiveDeals, dealKindOf, isDealRunning } from '@/lib/dealOfWeek.mjs';

/** The fields the storefront is allowed to see. */
function publicDeal(deal) {
  if (!deal) return null;
  return {
    id: deal.id, title_en: deal.title_en, title_es: deal.title_es,
    product_names: deal.product_names || [], discount_pct: deal.discount_pct,
    starts_at: deal.starts_at, ends_at: deal.ends_at,
    pricing_mode: deal.pricing_mode || 'shelf',
    min_units: deal.min_units || 0, max_units: deal.max_units || null,
    offers: deal.offers || null,
  };
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const live = await getLiveDeals(getSupabaseAdmin());
    // `deal` pools the Deal of the Week with any live flash sale so the cart
    // compares every running offer at once and applies the best.
    const deal = combineLiveDeals(live);
    if (!deal) return NextResponse.json({ deal: null, weekly: null, flash: null });

    // The promotions are also returned apart, because pooling is a pricing
    // device, not a description. The Deal of the Week page must show the weekly
    // deal's own offers and its own end date - a flash sale listed under that
    // heading told customers it ran until Sunday when it ended the next night.
    const running = live.filter((row) => isDealRunning(row));
    const weekly = running.find((row) => dealKindOf(row) !== 'flash') || null;
    const flash = running.find((row) => dealKindOf(row) === 'flash') || null;

    return NextResponse.json({
      deal: publicDeal(deal),
      weekly: publicDeal(weekly),
      flash: publicDeal(flash),
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Could not read weekly deal.' }, { status: 503 });
  }
}
