import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getReviewSettings } from '@/lib/reviewSettings.mjs';
import { missingColumnFrom } from '@/lib/optionalColumns.mjs';
import {
  FREE_PLAN_MONTHLY_ALLOWANCE,
  nextReleaseBatch,
  recoverableCustomers,
  roomLeftThisMonth,
  splitTrustpilotDelivery,
} from '@/lib/reviewDelivery.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Handing back the Trustpilot invitations Trustpilot never delivered.
 *
 * GET  reports what was lost and how many customers can be released.
 * POST releases a batch, newest customers first.
 *
 * Releasing does NOT email anybody. It clears the phantom "already asked" mark
 * so the customer becomes eligible again, and the invitation goes out on their
 * next completed order through the same BCC as everyone else's. That is the
 * whole point of doing it this way: no customer receives an extra message, and
 * the monthly cap still decides how many invitations actually leave.
 */

/** Rows are capped, not paged: 5000 is years of history at the current rate. */
const HISTORY_LIMIT = 5000;

async function loadAsks(supabase) {
  const columns = 'id, customer_email, platforms, clicked_platform, asked_at, order_number';

  // released_at arrives via add-review-ask-release.sql. Without it there is
  // nothing to release, so the screen says so plainly rather than offering a
  // button that would fail.
  let { data, error } = await supabase
    .from('review_asks')
    .select(`${columns}, released_at, released_reason`)
    .order('asked_at', { ascending: false })
    .limit(HISTORY_LIMIT);

  if (error && missingColumnFrom(error) === 'released_at') {
    const retry = await supabase
      .from('review_asks')
      .select(columns)
      .order('asked_at', { ascending: false })
      .limit(HISTORY_LIMIT);
    if (retry.error) return { rows: null, error: retry.error, canRelease: false };
    return { rows: retry.data || [], error: null, canRelease: false };
  }

  if (error) return { rows: null, error, canRelease: false };
  return { rows: data || [], error: null, canRelease: true };
}

/**
 * Everything both verbs need: the settings, the month-by-month split, and who
 * is recoverable. Shared so the POST cannot release on a different reading of
 * the data than the GET showed.
 */
async function buildReport(supabase, pastAllowanceOverride) {
  const settings = await getReviewSettings(supabase);
  const { rows, error, canRelease } = await loadAsks(supabase);
  if (error) return { error };

  const pastAllowance = Number.isFinite(Number(pastAllowanceOverride)) && pastAllowanceOverride !== null && pastAllowanceOverride !== ''
    ? Math.max(0, Math.round(Number(pastAllowanceOverride)))
    : FREE_PLAN_MONTHLY_ALLOWANCE;

  const options = {
    pastAllowance,
    currentAllowance: settings.trustpilotMonthlyCap,
    reaskAfterDays: settings.reaskAfterDays,
    now: Date.now(),
  };

  const { months } = splitTrustpilotDelivery(rows, options);
  const { ready, waiting } = recoverableCustomers(rows, options);

  const current = months.find((m) => m.isCurrentMonth);
  const sentThisMonth = current?.sent ?? 0;
  const roomLeft = roomLeftThisMonth(sentThisMonth, settings.trustpilotMonthlyCap);

  const releasedRows = canRelease ? rows.filter((r) => r.released_at).length : 0;

  return {
    rows,
    ready,
    waiting,
    report: {
      canRelease,
      migrationNeeded: canRelease ? null : 'add-review-ask-release.sql',
      pastAllowance,
      currentAllowance: settings.trustpilotMonthlyCap,
      reaskAfterDays: settings.reaskAfterDays,
      months,
      totals: {
        trustpilotAsks: months.reduce((n, m) => n + m.sent, 0),
        neverDelivered: months.reduce((n, m) => n + m.undelivered, 0),
        stillBlocked: months.reduce((n, m) => n + m.stillBlocked, 0),
        releasedRows,
      },
      readyCount: ready.length,
      waitingCount: waiting.length,
      sentThisMonth,
      roomLeft,
      // What the button should offer by default: never more than this month's
      // allowance can carry, and never more than there are customers to give.
      suggestedBatch: Math.min(roomLeft, ready.length),
      preview: ready.slice(0, 10).map((c) => ({
        email: c.email,
        orderNumber: c.orderNumber,
        lastAskedAt: c.lastAskedAt,
      })),
    },
  };
}

export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const supabase = getSupabaseAdmin();
    const pastAllowance = new URL(request.url).searchParams.get('pastAllowance');
    const built = await buildReport(supabase, pastAllowance);

    if (built.error) {
      return NextResponse.json({
        available: false,
        reason: 'The review history table does not exist yet. Run add-review-asks.sql.',
      });
    }

    return NextResponse.json({ available: true, ...built.report });
  } catch (err) {
    console.error('[admin/reviews/recovery]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));
    const supabase = getSupabaseAdmin();
    const built = await buildReport(supabase, body?.pastAllowance);

    if (built.error) {
      return NextResponse.json({ error: 'The review history could not be read.' }, { status: 500 });
    }
    if (!built.report.canRelease) {
      return NextResponse.json({
        error: 'Run add-review-ask-release.sql in the Supabase SQL editor first — there is nowhere to record a release yet.',
      }, { status: 409 });
    }

    // The batch is capped at what is actually recoverable. A number typed into
    // the box larger than that releases everyone and says so, rather than
    // reporting a count it did not achieve.
    const asked = Number(body?.limit);
    const limit = Number.isFinite(asked) && asked > 0
      ? Math.min(Math.floor(asked), built.ready.length)
      : built.report.suggestedBatch;

    if (limit <= 0) {
      return NextResponse.json({
        released: 0,
        customers: 0,
        message: built.ready.length === 0
          ? 'There is nobody left to release.'
          : 'This month has no Trustpilot allowance left. Releasing now would not send anything.',
      });
    }

    const { rowIds, emails } = nextReleaseBatch(built.ready, limit);
    if (rowIds.length === 0) {
      return NextResponse.json({ released: 0, customers: 0, message: 'There is nobody left to release.' });
    }

    const reason = `over the Trustpilot monthly allowance (released by ${auth.user?.email || auth.profile?.email || 'an admin'})`;

    // Chunked: a 300-customer release is a few hundred ids, and PostgREST puts
    // them all in the URL. Kept well under any gateway's limit.
    const CHUNK = 100;
    let released = 0;
    for (let i = 0; i < rowIds.length; i += CHUNK) {
      const slice = rowIds.slice(i, i + CHUNK);
      const { data, error } = await supabase
        .from('review_asks')
        .update({ released_at: new Date().toISOString(), released_reason: reason })
        .in('id', slice)
        .select('id');
      if (error) {
        // Say how far it got. A partial release is not a failure — those
        // customers really are free — and pretending otherwise would have the
        // next click release them a second time.
        console.error('[admin/reviews/recovery] release failed partway:', error.message);
        return NextResponse.json({
          error: `Released ${released} before this failed: ${error.message}`,
          released,
        }, { status: 500 });
      }
      released += (data || []).length;
    }

    return NextResponse.json({
      released,
      customers: emails.length,
      message: `${emails.length} customer${emails.length === 1 ? '' : 's'} can be invited again. The invitation goes out on their next completed order, up to ${built.report.currentAllowance} a month.`,
    });
  } catch (err) {
    console.error('[admin/reviews/recovery] POST', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
