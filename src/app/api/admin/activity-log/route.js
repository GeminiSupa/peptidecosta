import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import {
  ADMIN_ACTIVITY_RETENTION_DAYS,
  describeActivity,
  isMissingActivityTable,
  recordSignInOnce,
} from '@/lib/adminActivityLog.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Reading the activity log, and the one thing an ordinary account may write.
 *
 * GET is superadmin only, and says so with skipPathPermission so no permission
 * key can ever be ticked to reach it: a log of what everybody did is the owner's
 * to read, not something a staff permission covers. The reply is already written
 * out in plain English, so the panel cannot word an action differently from the
 * way the rest of the app does.
 *
 * POST records one thing only — that the caller signed in — and takes nothing
 * from the body at all. Sign-in has to come from the browser, because the
 * login itself happens against Supabase directly and never passes through this
 * app. Letting the browser name the account, or the action, would make the whole
 * log worth nothing, so both are read from the verified session instead. Every
 * other action in the log is written server-side by the route that performed it.
 */

const MAX_ROWS = 500;

export async function GET(request) {
  const auth = await verifyAdminSession(request, { requireSuperadmin: true, skipPathPermission: true });
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const actor = String(url.searchParams.get('actor') || '').trim();
  const action = String(url.searchParams.get('action') || '').trim();
  const subjectType = String(url.searchParams.get('subjectType') || '').trim();
  const search = String(url.searchParams.get('q') || '').trim();
  const limit = Math.min(Number(url.searchParams.get('limit')) || 200, MAX_ROWS);

  const supabaseAdmin = getSupabaseAdmin();
  let query = supabaseAdmin
    .from('admin_activity_log')
    .select('*')
    .order('at', { ascending: false })
    .limit(limit);

  if (actor) query = query.eq('actor_email', actor);
  if (action) query = query.eq('action', action);
  if (subjectType) query = query.eq('subject_type', subjectType);
  // One box over the two columns a person actually remembers: who, and what it
  // was done to. Escaped for the comma and parenthesis PostgREST reads as
  // syntax in an `or`, so a search for "O'Brien, Ltd (CR)" is a search and not
  // a 400.
  if (search) {
    const safe = search.replace(/[,()\\]/g, ' ').trim();
    if (safe) query = query.or(`actor_email.ilike.%${safe}%,subject_label.ilike.%${safe}%`);
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingActivityTable(error)) {
      return NextResponse.json({
        ok: true,
        available: false,
        entries: [],
        retentionDays: ADMIN_ACTIVITY_RETENTION_DAYS,
        message: 'The activity log is not switched on yet. Run add-admin-activity-log.sql in Supabase.',
      });
    }
    console.error('[activity-log]', error.message);
    return NextResponse.json({ error: 'Could not load the activity log' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    available: true,
    retentionDays: ADMIN_ACTIVITY_RETENTION_DAYS,
    entries: (data || []).map((row) => ({ ...row, summary: describeActivity(row) })),
  });
}

/** POST — "I just signed in". */
export async function POST(request) {
  // Staff and sub-users. Affiliates are recorded from their own dashboard
  // instead, through requireAffiliateSession: no route outside that dashboard
  // opens itself to the affiliate tier, and this one is not going to be the
  // exception that starts the list.
  const auth = await verifyAdminSession(request, { allowSubUser: true, skipPathPermission: true });
  if (auth.error) return auth.error;

  await recordSignInOnce(getSupabaseAdmin(), { actor: auth.profile, request });

  return NextResponse.json({ ok: true });
}
