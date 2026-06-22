import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';

export const runtime = 'nodejs';

export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('id', 'announcement_banners')
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[admin/banners]', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ banners: data?.value || [] });
  } catch (err) {
    console.error('[admin/banners]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const { banners } = body;

    if (!Array.isArray(banners)) {
      return NextResponse.json({ error: 'banners must be an array' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    
    // UPSERT the site_settings record
    const { error } = await supabase
      .from('site_settings')
      .upsert({ id: 'announcement_banners', value: banners }, { onConflict: 'id' });

    if (error) {
      console.error('[admin/banners/post]', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, banners });
  } catch (err) {
    console.error('[admin/banners/post]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
