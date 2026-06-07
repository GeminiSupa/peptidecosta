import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET() {
  try {
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase
      .from('customer_inquiries')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Admin Inquiries] Fetch error:', error);
      return NextResponse.json({ error: 'Failed to fetch inquiries' }, { status: 500 });
    }

    return NextResponse.json({ success: true, inquiries: data || [] });
  } catch (err) {
    console.error('[Admin Inquiries] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
