import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { bulkWholesaleDealState } from '@/lib/bulkWholesaleCampaign.mjs';
import { getLiveDeal } from '@/lib/dealsEngine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(bulkWholesaleDealState(await getLiveDeal(getSupabaseAdmin())));
  } catch (error) {
    console.error('[deals/bulk-wholesale]', error);
    return NextResponse.json({ error: 'Could not verify the bulk weekly deal.' }, { status: 503 });
  }
}
