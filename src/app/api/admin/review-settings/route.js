import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getReviewSettings, saveReviewSettings } from '@/lib/reviewSettings.mjs';
import { getBusinessLinks } from '@/lib/settings';
import { BUTTONS_PLACEHOLDER, reviewDestinations } from '@/lib/reviewRequestEmail.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The Social Reviews settings, read and written by the admin panel.
 *
 * Behind verifyAdminSession like every other admin route: these values decide
 * who gets emailed and how often, so they are not public reading, and a stranger
 * setting the wait to zero would mail every past customer at once.
 */
export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const supabase = getSupabaseAdmin();
    const settings = await getReviewSettings(supabase);

    // What the links actually resolve to today, so the panel can show the
    // inherited value as placeholder text rather than an empty box that looks
    // broken. A blank field means "use the site's business links".
    const effective = reviewDestinations(await getBusinessLinks().catch(() => ({})));

    // The statuses that actually exist on orders, so the panel offers real
    // choices. A hardcoded list drifts: it listed "Shipped" and "Completed",
    // neither of which any order has ever had, while omitting ones that do.
    let availableStatuses = [];
    try {
      const { data: rows } = await supabase.from('orders').select('status').limit(5000);
      const counts = new Map();
      for (const r of rows || []) {
        if (r.status) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
      }
      // Statuses already selected are kept even at zero orders, so a saved
      // setting never silently disappears from the screen that owns it.
      for (const s of settings.triggerStatuses) if (!counts.has(s)) counts.set(s, 0);
      availableStatuses = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([status, orders]) => ({ status, orders }));
    } catch (err) {
      console.warn('[admin/review-settings] could not list statuses:', err.message);
    }

    return NextResponse.json({
      settings,
      availableStatuses,
      effectiveLinks: {
        google: effective.google,
        facebook: effective.facebook,
        trustpilot: effective.trustpilot,
      },
    });
  } catch (err) {
    console.error('[admin/review-settings] GET', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Expected a settings object' }, { status: 400 });
    }

    const incoming = body.settings ?? body;

    // Normalising would silently blank a body with no {{buttons}}, which is the
    // safe thing to store but a terrible thing to do without saying so: someone
    // would save a template, see it vanish, and not know why. Rejected with the
    // reason instead.
    for (const [field, label] of [['emailBodyEs', 'Spanish'], ['emailBodyEn', 'English']]) {
      const value = String(incoming?.[field] ?? '').trim();
      if (value && !value.includes(BUTTONS_PLACEHOLDER)) {
        return NextResponse.json({
          error: `The ${label} email must contain ${BUTTONS_PLACEHOLDER} somewhere — that is where the review buttons go. Without it the email would arrive with nothing to click.`,
        }, { status: 422 });
      }
    }

    const supabase = getSupabaseAdmin();
    // saveReviewSettings normalises before writing, so the panel cannot store a
    // value the sending code would then have to defend itself against.
    const settings = await saveReviewSettings(supabase, incoming);

    return NextResponse.json({ settings });
  } catch (err) {
    console.error('[admin/review-settings] POST', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
