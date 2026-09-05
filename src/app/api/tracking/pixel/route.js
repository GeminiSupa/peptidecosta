import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 1x1 transparent GIF
const PIXEL_BUFFER = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const prospectId = searchParams.get('p');
  
  if (prospectId) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Log in background
    supabase.from('prospect_activity_logs').insert({
      prospect_id: prospectId,
      activity_type: 'email_opened',
      activity_details: { user_agent: request.headers.get('user-agent') || 'unknown' },
    }).then(({ error }) => {
      if (error) console.error('[Pixel Tracking] Log failed:', error.message);
    });
  }
  
  return new NextResponse(PIXEL_BUFFER, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
}
