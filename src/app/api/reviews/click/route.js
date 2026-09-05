import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getBusinessLinks } from '@/lib/settings';
import { reviewDestinations } from '@/lib/reviewRequestEmail.mjs';
import { TRACKABLE_PLATFORMS } from '@/lib/reviewAskPolicy.mjs';
import { LIVE_SITE_URL } from '@/lib/publicUrl';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The review buttons in our own email point here, so a click is recorded before
 * the customer is sent on to Google or Facebook.
 *
 * A click is the only signal we ever get. Nobody can see whether a review was
 * actually written, and a Trustpilot invitation cannot be tracked at all
 * because Trustpilot sends that email itself. So "clicked" is read as "probably
 * reviewed there", which is what stops us asking the same person about the same
 * site again.
 *
 * The destination is resolved here from settings rather than carried in the
 * URL. That is deliberate: a redirect that takes its target from a query
 * parameter is an open redirect, and this link is emailed to strangers.
 *
 * Nothing about recording may cost the customer their click: every failure path
 * still redirects.
 */
export async function GET(request) {
  const url = new URL(request.url);
  const askId = url.searchParams.get('a');
  const platform = String(url.searchParams.get('p') || '').toLowerCase();

  const links = await getBusinessLinks().catch(() => ({}));
  const destinations = reviewDestinations(links);

  const target = TRACKABLE_PLATFORMS.includes(platform) ? destinations[platform] : '';
  // An unknown site, or one with no link configured, still has to go somewhere
  // a customer can use.
  const destination = target || LIVE_SITE_URL;

  if (askId && TRACKABLE_PLATFORMS.includes(platform)) {
    try {
      const supabase = getSupabaseAdmin();
      // First click only. Someone opening the email twice, or a mail client
      // pre-fetching links, must not rewrite which site they chose or when.
      const { error } = await supabase
        .from('review_asks')
        .update({ clicked_platform: platform, clicked_at: new Date().toISOString() })
        .eq('id', askId)
        .is('clicked_platform', null);
      if (error) console.warn('[reviews/click] could not record the click:', error.message);
    } catch (err) {
      console.warn('[reviews/click] recording threw:', err.message);
    }
  }

  return NextResponse.redirect(destination, { status: 302 });
}
