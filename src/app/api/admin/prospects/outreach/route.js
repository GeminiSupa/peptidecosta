import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { isProspectsTableMissing } from '@/lib/prospects.mjs';

export const dynamic = 'force-dynamic';

const HISTORY_LIMIT = 50;

const SELECT_FIELDS = [
  'id', 'channel', 'to_identity', 'subject', 'body', 'status',
  'error', 'permission_basis', 'sent_by', 'created_at',
].join(',');

/**
 * Everything we have ever sent this prospect.
 *
 * `prospect_outreach` was written on every send and read by nothing, so the
 * one question a rep asks before touching a prospect again — "what did we
 * already say to them, and when?" — had no answer anywhere in the product.
 * The audit trail the send route builds is only an audit trail if something
 * can show it.
 */
export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  const prospectId = new URL(request.url).searchParams.get('prospectId');
  if (!prospectId) return NextResponse.json({ error: 'Prospect ID is required' }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('prospect_outreach')
    .select(SELECT_FIELDS)
    .eq('prospect_id', prospectId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT);

  if (isProspectsTableMissing(error)) {
    return NextResponse.json({ outreach: [], setupRequired: true, migration: 'prospect-outreach-migration.sql' });
  }
  if (error) {
    console.error('[Prospect outreach] History failed:', error.message);
    return NextResponse.json({ error: 'Unable to load outreach history' }, { status: 500 });
  }

  const rows = data || [];
  // "Sent by 4f2a-…" tells a rep nothing. Resolved in one lookup rather than
  // joined, because prospect_outreach references auth.users and PostgREST
  // cannot embed across that boundary.
  const senderIds = [...new Set(rows.map((row) => row.sent_by).filter(Boolean))];
  let senders = {};
  if (senderIds.length) {
    const { data: profiles } = await supabase
      .from('admin_profiles')
      .select('user_id,name,email')
      .in('user_id', senderIds);
    senders = Object.fromEntries((profiles || []).map((profile) => [
      profile.user_id,
      profile.name || profile.email || null,
    ]));
  }

  return NextResponse.json({
    outreach: rows.map(({ sent_by: sentBy, ...row }) => ({
      ...row,
      sent_by_label: senders[sentBy] || null,
    })),
    setupRequired: false,
  });
}
