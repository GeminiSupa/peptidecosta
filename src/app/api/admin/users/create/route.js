import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';

export async function POST(request) {
  const auth = await verifyAdminSession(request, { requireSuperadmin: true });
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const { email, password, name, permissions, is_superadmin, commission_rate, weekly_salary, salary_currency, commission_structure, avatar_url } = body;

    if (!email || !password || !name) {
      return NextResponse.json({ error: 'Email, password, and name are required' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // 1. Create user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name }
    });

    if (authError) {
      console.error('Error creating auth user:', authError);
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }

    const userId = authData.user.id;

    // 2. Create profile in public.admin_profiles
    const profileRow = {
      user_id: userId,
      email: email,
      name: name,
      permissions: permissions || [],
      is_superadmin: is_superadmin || false,
      commission_rate: commission_rate !== undefined ? parseFloat(commission_rate) : 0,
      weekly_salary: weekly_salary !== undefined ? parseFloat(weekly_salary) : 0,
      salary_currency: salary_currency || 'USD',
      commission_structure: commission_structure || null,
    };
    if (avatar_url) profileRow.avatar_url = avatar_url;

    const { data: profileData, error: profileError } = await supabaseAdmin
      .from('admin_profiles')
      .insert([profileRow])
      .select()
      .single();

    if (profileError) {
      console.error('Error creating admin profile:', profileError);
      // Attempt to clean up auth user if profile creation fails
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, user: profileData });
  } catch (error) {
    console.error('Admin API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
