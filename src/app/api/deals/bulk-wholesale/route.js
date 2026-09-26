import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { bulkWholesaleDealState } from '@/lib/bulkWholesaleCampaign.mjs';
import { readCatalogDealCardEnabled } from '@/lib/catalogDealCard.mjs';
import { getLiveDeal } from '@/lib/dealsEngine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const [deal, cardEnabled] = await Promise.all([
      getLiveDeal(supabase),
      readCatalogDealCardEnabled(supabase),
    ]);
    return NextResponse.json({ ...bulkWholesaleDealState(deal), cardEnabled });
  } catch (error) {
    console.error('[deals/bulk-wholesale]', error);
    return NextResponse.json({ error: 'Could not verify the bulk weekly deal.' }, { status: 503 });
  }
}
