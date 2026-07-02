import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(request) {
  const url = new URL(request.url);
  const target_url = url.searchParams.get('url');
  const campaign_id = url.searchParams.get('c');
  const subscriber_id = url.searchParams.get('s');

  if (!target_url) {
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
        .insert([{ campaign_id, subscriber_id, target_url, ip_address, user_agent }])
        .then(({ error }) => {
          if (error) console.error('Tracking click error:', error);
        });
    } catch (err) {
      console.error('Error processing tracking click:', err);
    }
  }

  // Redirect to the actual destination
  return NextResponse.redirect(target_url);
}
