import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { CATALOG_DEAL_CARD_SETTING_ID, readCatalogDealCardEnabled } from '@/lib/catalogDealCard.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    return NextResponse.json({ enabled: await readCatalogDealCardEnabled(getSupabaseAdmin()) });
  } catch (error) {
    console.error('[catalog-deal-card]', error);
    return NextResponse.json({ error: 'Could not read the catalog deal card switch.' }, { status: 503 });
  }
}

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));
    const enabled = body.enabled !== false;
    const { error } = await getSupabaseAdmin()
      .from('site_settings')
      .upsert({ id: CATALOG_DEAL_CARD_SETTING_ID, value: { enabled } });
    if (error) throw error;
    return NextResponse.json({ enabled });
  } catch (error) {
    console.error('[catalog-deal-card]', error);
    return NextResponse.json({ error: 'Could not save the catalog deal card switch.' }, { status: 503 });
  }
}
