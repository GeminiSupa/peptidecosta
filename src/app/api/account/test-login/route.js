import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import {
  ACCOUNT_TEST_EMAIL,
  isAccountTestEmail,
  isAccountTestLoginEnabled,
} from '@/lib/accountTestLogin.mjs';

const TEST_PROFILE = {
  display_name: 'Cuenta de prueba',
  phone: '8888-0000',
  locale: 'es',
};

const TEST_ADDRESS = {
  label: 'Prueba',
  recipient_name: 'Cuenta de prueba',
  phone: '8888-0000',
  country_code: 'CR',
  province: 'San José',
  canton: 'Central',
  district: 'Carmen',
  detailed_address: 'Cuenta de prueba, no entregar',
  is_default: true,
};

function closed() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

function enabled() {
  return isAccountTestLoginEnabled(process.env.ACCOUNT_TEST_LOGIN);
}

async function ensureTestUser(admin) {
  const created = await admin.auth.admin.createUser({
    email: ACCOUNT_TEST_EMAIL,
    email_confirm: true,
  });

  if (!created.error) return;

  const already = /already|registered|exists/i.test(created.error?.message || '');
  if (!already) throw created.error;
}

async function ensureTestProfile(admin, userId) {
  const { data: existing } = await admin
    .from('customer_profiles')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) return;

  const { error } = await admin.from('customer_profiles').insert({
    user_id: userId,
    email: ACCOUNT_TEST_EMAIL,
    ...TEST_PROFILE,
  });
  if (error) throw error;
}

async function ensureTestAddress(admin, userId) {
  const { count, error: countError } = await admin
    .from('customer_addresses')
    .select('id', { count: 'exact', head: true })
    .eq('customer_user_id', userId);

  if (countError) throw countError;
  if (count > 0) return;

  const { error } = await admin.from('customer_addresses').insert({
    customer_user_id: userId,
    ...TEST_ADDRESS,
  });
  if (error) throw error;
}

async function openTestSession(admin) {
  const link = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: ACCOUNT_TEST_EMAIL,
  });
  if (link.error) throw link.error;

  const userId = link.data?.user?.id;
  if (!userId || !isAccountTestEmail(link.data?.user?.email)) {
    throw new Error('Test sign-in returned an unexpected account');
  }

  const tokenHash = link.data?.properties?.hashed_token;
  if (!tokenHash) throw new Error('Test sign-in did not return a token');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const anon = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const verified = await anon.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  });
  if (verified.error || !verified.data?.session) {
    throw verified.error || new Error('Test sign-in could not open a session');
  }
  return { session: verified.data.session, userId };
}

export async function GET() {
  if (!enabled()) return closed();
  return NextResponse.json({ enabled: true });
}

export async function POST() {
  if (!enabled()) return closed();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  try {
    const admin = getSupabaseAdmin();

    const { count: orderCount, error: orderError } = await admin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .ilike('customer_email', ACCOUNT_TEST_EMAIL);

    if (orderError) throw orderError;
    if (orderCount > 0) {
      return NextResponse.json(
        { error: 'The test email is already on a real order, so sign-in was refused.' },
        { status: 409 },
      );
    }

    await ensureTestUser(admin);
    const { session, userId } = await openTestSession(admin);
    await ensureTestProfile(admin, userId);
    await ensureTestAddress(admin, userId);

    return NextResponse.json({
      ok: true,
      email: ACCOUNT_TEST_EMAIL,
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
  } catch (error) {
    console.error('[account/test-login] failed:', error?.message || error);
    return NextResponse.json(
      { error: 'The test account could not be opened.' },
      { status: 500 },
    );
  }
}
