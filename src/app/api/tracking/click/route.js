import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyTrackingUrlToken } from '@/lib/marketingTokens';
import { resolveTrackingDestination, trackingSafeHosts } from '@/lib/trackingRedirect.mjs';
import { LIVE_SITE_URL } from '@/lib/publicUrl';

export async function GET(request) {
  const url = new URL(request.url);
  const target_url = url.searchParams.get('url');
  const campaign_id = url.searchParams.get('c');
  const subscriber_id = url.searchParams.get('s');

  const destination = resolveTrackingDestination(target_url, {
    isSigned: verifyTrackingUrlToken(target_url, url.searchParams.get('k')),
    safeHosts: trackingSafeHosts(LIVE_SITE_URL),
  });
  if (!destination) {
    console.warn('[Tracking] Refused an unsigned off-domain click redirect');
    return NextResponse.redirect(new URL('/', request.url));
  }

  if (campaign_id && subscriber_id) {
    try {
      const ip_address = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
      const user_agent = request.headers.get('user-agent') || 'unknown';

      // Fire and forget insert
      const supabaseAdmin = getSupabaseAdmin();
      supabaseAdmin
        .from('campaign_clicks')
        .insert([{ campaign_id, subscriber_id, target_url: destination.toString(), ip_address, user_agent }])
        .then(({ error }) => {
          if (error) console.error('Tracking click error:', error);
        });
    } catch (err) {
      console.error('Error processing tracking click:', err);
    }
  }

  const prospect_id = url.searchParams.get('p');
  if (prospect_id) {
    try {
      const user_agent = request.headers.get('user-agent') || 'unknown';
      const supabaseAdmin = getSupabaseAdmin();
      supabaseAdmin
        .from('prospect_activity_logs')
        .insert([{ prospect_id, activity_type: 'link_clicked', activity_details: { url: target_url, user_agent } }])
        .then(({ error }) => {
          if (error) console.error('[Link Tracking] Log failed:', error.message);
        });
    } catch (err) {
      console.error('Error processing prospect click:', err);
    }
  }

  // Redirect to the actual destination
  return NextResponse.redirect(destination.toString());
}
