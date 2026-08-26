import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { isProspectsTableMissing } from '@/lib/prospects.mjs';

export const dynamic = 'force-dynamic';

const LOOKUP_FIELDS = 'id,source_provider,source_external_id,status,owner_email';

/** Resolve the at-most-80 discovery results against the saved pipeline. */
export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const identities = (Array.isArray(body.identities) ? body.identities : [])
    .map((item) => ({
      provider: String(item?.provider || '').trim().slice(0, 40),
      externalId: String(item?.externalId || '').trim().slice(0, 240),
    }))
    .filter((item) => item.provider && item.externalId)
    .slice(0, 100);
  if (!identities.length) return NextResponse.json({ prospects: [] });

  const byProvider = new Map();
  for (const identity of identities) {
    if (!byProvider.has(identity.provider)) byProvider.set(identity.provider, new Set());
    byProvider.get(identity.provider).add(identity.externalId);
  }

  const supabase = getSupabaseAdmin();
  const results = await Promise.all([...byProvider.entries()].map(([provider, externalIds]) => (
    supabase
      .from('sales_prospects')
      .select(LOOKUP_FIELDS)
      .eq('source_provider', provider)
      .in('source_external_id', [...externalIds])
  )));
  const failed = results.find((result) => result.error);
  if (isProspectsTableMissing(failed?.error)) {
    return NextResponse.json({ prospects: [], setupRequired: true, migration: 'prospector-migration.sql' });
  }
  if (failed?.error) {
    console.error('[Prospects] Discovery lookup failed:', failed.error.message);
    return NextResponse.json({ error: 'Unable to check saved prospects' }, { status: 500 });
  }
  return NextResponse.json({ prospects: results.flatMap((result) => result.data || []) });
}
