import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';

export const runtime = 'nodejs';

const MAX_AVATAR_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function extensionFor(file) {
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  if (file.type === 'image/gif') return 'gif';
  const nameExt = file.name?.split('.').pop()?.toLowerCase();
  return ['jpg', 'jpeg'].includes(nameExt) ? nameExt : 'jpg';
}

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const form = await request.formData();
    const file = form.get('file');
    const requestedUserId = String(form.get('userId') || '').trim();
    const userId = requestedUserId || auth.user.id;

    if (requestedUserId && requestedUserId !== auth.user.id && !auth.profile?.is_superadmin) {
      return NextResponse.json({ error: 'Forbidden: superadmin required' }, { status: 403 });
    }

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'Profile image is required' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'Upload a JPG, PNG, WebP, or GIF image.' }, { status: 400 });
    }
    if (file.size > MAX_AVATAR_BYTES) {
      return NextResponse.json({ error: 'Profile image must be 4MB or smaller.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const ext = extensionFor(file);
    const path = `${userId}/avatar-${Date.now()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from('team-avatars')
      .upload(path, buffer, {
        contentType: file.type || 'image/jpeg',
        upsert: true,
      });
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from('team-avatars').getPublicUrl(path);
    const avatarUrl = urlData.publicUrl;

    const { data: profile, error: profileError } = await supabase
      .from('admin_profiles')
      .update({ avatar_url: avatarUrl })
      .eq('user_id', userId)
      .select()
      .single();

    if (profileError) {
      const message = profileError.code === '42703'
        ? 'Run team-profile-avatars-migration.sql first.'
        : profileError.message;
      return NextResponse.json({ error: message }, { status: 500 });
    }

    return NextResponse.json({ success: true, avatarUrl, profile });
  } catch (error) {
    console.error('[Admin avatar upload]', error);
    return NextResponse.json({ error: error.message || 'Avatar upload failed' }, { status: 500 });
  }
}
