import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { ENGAGED_WINDOW_DAYS, DORMANT_WINDOW_DAYS } from '@/lib/campaignBehavior.mjs';

export const dynamic = 'force-dynamic';

// Only the window the filters care about is ever needed, and the oldest of the
// two windows bounds the whole query.
const HISTORY_DAYS = Math.max(ENGAGED_WINDOW_DAYS, DORMANT_WINDOW_DAYS);
const ROW_CAP = 20000;

function isMissingRelationError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return code === '42P01' || code === 'PGRST205' || message.includes('schema cache');
}

async function safeRows(label, query, warnings) {
  const { data, error } = await query;
  if (error) {
    if (!isMissingRelationError(error)) console.warn(`[Marketing segments] ${label}:`, error.message);
    warnings.push(label);
    return [];
  }
  return data || [];
}

/**
 * Engagement and order signals per address, so the campaign builder can show a
 * live recipient count for a behavioural filter before anyone hits send.
 *
 * Deliberately returns signals, not a count: the builder already knows which
 * subscribers are in the chosen scope and which tag is selected, and only it
 * knows about unsaved changes to either.
 */
export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  const supabase = getSupabaseAdmin();
  const warnings = [];
  const since = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  try {
    const [subscribers, opens, clicks, orders] = await Promise.all([
      safeRows('subscribers', supabase.from('email_subscribers').select('id, email').limit(ROW_CAP), warnings),
      safeRows('opens', supabase.from('campaign_opens').select('subscriber_id, created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(ROW_CAP), warnings),
      safeRows('clicks', supabase.from('campaign_clicks').select('subscriber_id, created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(ROW_CAP), warnings),
      safeRows('orders', supabase.from('orders').select('customer_email').limit(ROW_CAP), warnings),
    ]);

    const emailById = new Map(subscribers.map(row => [row.id, String(row.email || '').trim().toLowerCase()]));
    const signals = {};

    const touch = (email) => {
      if (!email) return null;
      if (!signals[email]) signals[email] = { lastOpenAt: null, lastClickAt: null, orderCount: 0 };
      return signals[email];
    };

    // Rows arrive newest-first, so the first sighting of an address is its most
    // recent event and later ones can be skipped.
    for (const row of opens) {
      const record = touch(emailById.get(row.subscriber_id));
      if (record && !record.lastOpenAt) record.lastOpenAt = row.created_at;
    }
    for (const row of clicks) {
      const record = touch(emailById.get(row.subscriber_id));
      if (record && !record.lastClickAt) record.lastClickAt = row.created_at;
    }
    for (const row of orders) {
      const record = touch(String(row.customer_email || '').trim().toLowerCase());
      if (record) record.orderCount += 1;
    }

    return NextResponse.json({
      signals,
      windows: { engagedDays: ENGAGED_WINDOW_DAYS, dormantDays: DORMANT_WINDOW_DAYS },
      // The builder shows this count before anyone sends, so it has to admit
      // when it is working from a partial read. The send itself is unbounded
      // and stays authoritative either way.
      truncated: [subscribers, opens, clicks, orders].some(rows => rows.length >= ROW_CAP),
      warnings,
    });
  } catch (err) {
    console.error('[Marketing segments]', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
