import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && (supabaseServiceKey || supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey)
  : null;

export async function POST(request) {
  try {
    const payload = await request.json();
    const { element_name, x_pct, y_pct, path, is_mobile = true } = payload;

    if (!element_name || x_pct === undefined || y_pct === undefined || !path) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    if (!supabase) {
      // Return 200 with saved: false so it doesn't log console errors on front-end if offline
      return NextResponse.json({ success: true, saved: false, message: 'Supabase offline' });
    }

    const { error } = await supabase
      .from('click_events')
      .insert([{
        element_name,
        x_pct: Math.round(x_pct),
        y_pct: Math.round(y_pct),
        path,
        is_mobile
      }]);

    if (error) {
      console.error('[Analytics Clicks API] DB insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, saved: true });
  } catch (err) {
    console.error('[Analytics Clicks API] Handler crash:', err);
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    if (!supabase) {
      return NextResponse.json({ success: true, count: 0, clicks: [] });
    }

    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get('limit') || 200);
    const mobileOnly = searchParams.get('mobile_only') !== 'false';

    let query = supabase
      .from('click_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (mobileOnly) {
      query = query.eq('is_mobile', true);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: data.length, clicks: data });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}
