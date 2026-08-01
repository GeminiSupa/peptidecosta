import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { isActiveProfile, isPendingApproval, isSubUser } from '@/lib/subUserTier.mjs';
import {
  adminPermissionsForPath,
  profileHasAnyAdminPermission,
} from '@/lib/adminApiPermissions.mjs';

/**
 * Verify the caller is an authenticated admin via Supabase JWT (Bearer token).
 * Returns { user, profile } on success, or { error: NextResponse } on failure.
 *
 * Sub-users are rejected BY DEFAULT, and that default is the whole security
 * story for the tier. Most routes in this app are gated on nothing more than
 * "does this person have an admin_profiles row", so a sub-user login would
 * otherwise reach the customer list, the broadcast sender and order creation.
 * Routes a sub-user is genuinely meant to call opt in with
 * { allowSubUser: true } — a short list: their own earnings and referral link.
 * Default-deny means the other routes need no audit and no edit.
 *
 * Pending and suspended accounts are rejected for everyone, sub-user or staff,
 * so approval really does gate access and suspending someone takes effect at
 * once rather than at their next login.
 */
export async function verifyAdminSession(
  request,
  {
    requireSuperadmin = false,
    allowSubUser = false,
    requirePermission = null,
    requireAnyPermission = null,
    skipPathPermission = false,
  } = {}
) {
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

  if (!isActiveProfile(profile)) {
    const message = isPendingApproval(profile)
      ? 'Your account is waiting for approval'
      : 'Your account has been suspended';
    return { error: NextResponse.json({ error: message }, { status: 403 }) };
  }

  if (isSubUser(profile) && !allowSubUser) {
    return { error: NextResponse.json({ error: 'Forbidden: not available to sub-users' }, { status: 403 }) };
  }

  if (requireSuperadmin && !profile.is_superadmin) {
    return { error: NextResponse.json({ error: 'Forbidden: superadmin required' }, { status: 403 }) };
  }

  const explicitPermissions = requireAnyPermission
    || (requirePermission ? [requirePermission] : null);
  const pathPermissions = skipPathPermission
    ? []
    : adminPermissionsForPath(request.nextUrl?.pathname || new URL(request.url).pathname);
  const requiredPermissions = explicitPermissions || pathPermissions;

  if (
    requiredPermissions.length > 0
    && !profileHasAnyAdminPermission(profile, requiredPermissions)
  ) {
    return {
      error: NextResponse.json(
        { error: `Forbidden: ${requiredPermissions.join(' or ')} permission required` },
        { status: 403 }
      ),
    };
  }

  return { user, profile };
}

/** AI modes callable without admin auth (public storefront chat). */
export const PUBLIC_AI_MODES = new Set(['customer_chat']);
