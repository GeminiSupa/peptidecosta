import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getReviewSettings, saveReviewSettings } from '@/lib/reviewSettings.mjs';
import { getBusinessLinks } from '@/lib/settings';
import { reviewDestinations } from '@/lib/reviewRequestEmail.mjs';

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

    return NextResponse.json({
      settings,
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

    const supabase = getSupabaseAdmin();
    // saveReviewSettings normalises before writing, so the panel cannot store a
    // value the sending code would then have to defend itself against.
    const settings = await saveReviewSettings(supabase, body.settings ?? body);

    return NextResponse.json({ settings });
  } catch (err) {
    console.error('[admin/review-settings] POST', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
