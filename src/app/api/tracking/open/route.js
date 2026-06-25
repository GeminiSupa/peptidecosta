import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// 1x1 transparent GIF base64 encoded
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

export async function GET(request) {
  const url = new URL(request.url);
  const campaign_id = url.searchParams.get('c');
  const subscriber_id = url.searchParams.get('s');

  if (campaign_id && subscriber_id) {
    try {
      // Get IP and User-Agent from headers
      const ip_address = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
      const user_agent = request.headers.get('user-agent') || 'unknown';

      // Fire and forget insert
      supabase
        .from('campaign_opens')
        .insert([{ campaign_id, subscriber_id, ip_address, user_agent }])
        .then(({ error }) => {
          if (error) console.error('Tracking open error:', error);
        });
    } catch (err) {
      console.error('Error processing tracking pixel:', err);
    }
  }

  // Always return the 1x1 GIF so the email client doesn't show a broken image
  return new NextResponse(TRANSPARENT_GIF, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
    },
  });
}
