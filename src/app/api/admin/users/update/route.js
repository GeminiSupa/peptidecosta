import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';

export async function PUT(request) {
  const auth = await verifyAdminSession(request, { requireSuperadmin: true });
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const { userId, email, password, name, permissions, is_superadmin, commission_rate, weekly_salary, salary_currency, commission_structure, avatar_url } = body;

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // 1. Update Auth User if password is provided
    if (password) {
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: password
      });

      if (authError) {
        console.error('Error updating auth password:', authError);
        return NextResponse.json({ error: authError.message }, { status: 500 });
      }
    }

    // 2. Update profile in public.admin_profiles
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (permissions !== undefined) updateData.permissions = permissions;
    if (is_superadmin !== undefined) updateData.is_superadmin = is_superadmin;
    if (commission_rate !== undefined) updateData.commission_rate = parseFloat(commission_rate) || 0;
    if (weekly_salary !== undefined) updateData.weekly_salary = parseFloat(weekly_salary) || 0;
    if (salary_currency !== undefined) updateData.salary_currency = salary_currency;
    if (commission_structure !== undefined) updateData.commission_structure = commission_structure;
    if (avatar_url !== undefined) updateData.avatar_url = avatar_url || null;

    if (Object.keys(updateData).length > 0) {
      const { data: profileData, error: profileError } = await supabaseAdmin
        .from('admin_profiles')
        .update(updateData)
        .eq('user_id', userId)
        .select()
        .single();

      if (profileError) {
        console.error('Error updating admin profile:', profileError);
        return NextResponse.json({ error: profileError.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, user: profileData });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
