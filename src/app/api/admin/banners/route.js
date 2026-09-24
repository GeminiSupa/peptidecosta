import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { actorFrom, moveSettingsItemToBin } from '@/lib/recycleBinServer';

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

/**
 * Delete one banner — into the Bin, not out of existence.
 *
 * The banners are a JSON array under one `site_settings` row, so the generic
 * /api/admin/recycle-bin/delete route cannot handle them: there is no
 * `announcement_banners` table for it to read and delete from. This route
 * snapshots the one banner and rewrites the array without it, and the Bin tab
 * puts it back into the array on restore.
 *
 * The whole-array POST above is still how banners are created, edited and
 * switched on or off. It is not how they are removed any more — a POST that
 * simply left one out is exactly what used to lose the wording.
 */
export async function DELETE(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Which banner?' }, { status: 400 });

  const result = await moveSettingsItemToBin({
    table: 'announcement_banners',
    id,
    actor: actorFrom(auth.profile),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.notFound ? 404 : 409 });
  }

  return NextResponse.json({
    ok: true,
    banners: result.list,
    message: 'Moved to the Bin. You can restore it from the Bin tab.',
  });
}
