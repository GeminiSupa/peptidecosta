import { NextResponse } from 'next/server';

import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { canDeleteCustomerAccount } from '@/lib/accountBonuses.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FULL_COLUMNS = 'user_id, email, display_name, phone, locale, created_at, account_kind, organization_name';
const BASIC_COLUMNS = 'user_id, email, display_name, phone, locale, created_at';

export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  const admin = getSupabaseAdmin();
  let result = await admin
    .from('customer_profiles')
    .select(FULL_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(200);

  let questionsReady = true;
  if (result.error && /account_kind|organization_name|schema cache/i.test(result.error.message || '')) {
    questionsReady = false;
    result = await admin
      .from('customer_profiles')
      .select(BASIC_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(200);
  }

  if (result.error) {
    console.error('[admin/customer-accounts] list', result.error);
    return NextResponse.json({ error: 'Could not load customer accounts' }, { status: 500 });
  }

  return NextResponse.json({
    accounts: result.data || [],
    questionsReady,
  });
}

export async function DELETE(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;
  if (!auth.profile.is_superadmin) {
    return NextResponse.json({ error: 'Only a superadmin can delete a customer account.' }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }

  const userId = String(body?.userId || '').trim();
  if (!userId) {
    return NextResponse.json({ error: 'A customer account id is required.' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: staff } = await admin
    .from('admin_profiles')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (!canDeleteCustomerAccount({ userId, staffUserIds: staff ? [staff.user_id] : [] })) {
    return NextResponse.json({ error: 'That login is a staff account, so it was not deleted.' }, { status: 409 });
  }

  const { data: profile } = await admin
    .from('customer_profiles')
    .select('user_id, email')
    .eq('user_id', userId)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: 'No customer account matched that id.' }, { status: 404 });
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    console.error('[admin/customer-accounts] delete', error);
    return NextResponse.json({ error: 'The account could not be deleted.' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    email: profile.email,
    message: 'The login was deleted. Their orders stay. Saved addresses and the profile are gone.',
  });
}
