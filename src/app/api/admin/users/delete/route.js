import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { recordAdminActivity } from '@/lib/adminActivityLog.mjs';

export async function DELETE(request) {
  const auth = await verifyAdminSession(request, { requireSuperadmin: true });
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Read the profile before deleting: the cascade takes it with the login, and
    // a log entry saying only "deleted a user id" answers nothing. This is the
    // one deletion the Bin does not cover, so it is the only record there will be.
    const { data: gone } = await supabaseAdmin
      .from('admin_profiles').select('email, name, tier, permissions, is_superadmin')
      .eq('user_id', userId).maybeSingle();

    // Delete user from Auth. 
    // Since `admin_profiles.user_id` has ON DELETE CASCADE, the profile will be automatically removed.
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (authError) {
      console.error('Error deleting auth user:', authError);
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }

    await recordAdminActivity(supabaseAdmin, {
      actor: auth.profile,
      action: 'account.deleted',
      subjectType: 'account',
      subjectId: userId,
      subjectLabel: gone?.email || userId,
      detail: gone ? {
        was: { from: `${gone.tier || 'staff'}${gone.is_superadmin ? ' (superadmin)' : ''}`, to: 'deleted' },
        permissions: { from: `${(gone.permissions || []).length} areas`, to: 'none' },
      } : null,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
