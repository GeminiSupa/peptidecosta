import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Verify the caller is an authenticated admin via Supabase JWT (Bearer token).
 * Returns { user, profile } on success, or { error: NextResponse } on failure.
 */
export async function verifyAdminSession(request, { requireSuperadmin = false } = {}) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    return { error: NextResponse.json({ error: 'Server misconfigured' }, { status: 500 }) };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) {
    return { error: NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 }) };
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('admin_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (profileError || !profile) {
    return { error: NextResponse.json({ error: 'Forbidden: not an admin' }, { status: 403 }) };
  }

  if (requireSuperadmin && !profile.is_superadmin) {
    return { error: NextResponse.json({ error: 'Forbidden: superadmin required' }, { status: 403 }) };
  }

  return { user, profile };
}

/** AI modes callable without admin auth (public storefront chat). */
export const PUBLIC_AI_MODES = new Set(['customer_chat']);
