import { NextResponse } from 'next/server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import {
  CustomerSessionError,
  resolveCustomerOrderOwner,
} from '@/lib/customerOrderOwnership.mjs';
import { helpTopicSubject, stockAlertSubject } from '@/lib/accountExtras.mjs';
import { rateLimit } from '@/lib/rateLimit.mjs';

const MESSAGE_LIMIT = 2000;

export async function GET(request) {
  const admin = getSupabaseAdmin();
  let customer;
  try {
    customer = await resolveCustomerOrderOwner(admin, request.headers.get('authorization'));
  } catch (error) {
    if (error instanceof CustomerSessionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
  if (!customer?.email) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const { data, error } = await admin
    .from('customer_inquiries')
    .select('id, subject, message, status, admin_reply, created_at')
    .eq('customer_email', customer.email)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    console.error('[account/requests] read:', error.message);
    return NextResponse.json({ requests: [] });
  }

  return NextResponse.json({ requests: data || [] });
}

export async function POST(request) {
  const admin = getSupabaseAdmin();
  let customer;
  try {
    customer = await resolveCustomerOrderOwner(admin, request.headers.get('authorization'));
  } catch (error) {
    if (error instanceof CustomerSessionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
  if (!customer?.email) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  if (!rateLimit(`account-request:${customer.email}`, 8)) {
    return NextResponse.json({ error: 'Please wait a few minutes and try again.' }, { status: 429 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }

  const kind = body?.kind === 'stock' ? 'stock' : 'help';
  const subject = kind === 'stock'
    ? stockAlertSubject(body?.product)
    : helpTopicSubject(body?.topic);
  const message = String(body?.message || '').trim().slice(0, MESSAGE_LIMIT);

  if (!subject) {
    return NextResponse.json({ error: 'Choose what this is about.' }, { status: 400 });
  }
  if (kind === 'help' && message.length < 5) {
    return NextResponse.json({ error: 'Please write a short message.' }, { status: 400 });
  }

  const { data: profile } = await admin
    .from('customer_profiles')
    .select('display_name')
    .eq('user_id', customer.id)
    .maybeSingle();

  const name = String(profile?.display_name || '').trim() || customer.email;

  const { error } = await admin.from('customer_inquiries').insert({
    customer_name: name,
    customer_email: customer.email,
    subject,
    message: message || subject,
    status: 'New',
  });

  if (error) {
    console.error('[account/requests] insert:', error.message);
    return NextResponse.json({ error: 'Could not save that.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
