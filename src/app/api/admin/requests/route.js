import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Everything waiting on a superadmin, in one list.
 *
 * Approvals used to live wherever the thing being approved happened to live —
 * order owner changes sat in a small panel inside the Orders tab, which meant
 * the only way to find out somebody was waiting was to already be looking at
 * Orders. A request nobody notices is a request nobody answers.
 *
 * So this route gathers them. It does NOT re-implement any of the deciding:
 * each kind keeps its own PATCH, with its own rules and its own side effects,
 * and this is the list and the count in front of them.
 *
 * Two kinds today:
 *   order_owner       who a paid order belongs to
 *   affiliate_email   an affiliate changing the address their money is announced to
 */

const tableMissing = (error) => /relation .* does not exist|schema cache/i.test(error?.message || '');

export async function GET(request) {
  const auth = await verifyAdminSession(request, { requireSuperadmin: true, skipPathPermission: true });
  if (auth.error) return auth.error;

  const supabase = getSupabaseAdmin();
  const migrationsMissing = [];

  const [ownerRes, affiliateRes] = await Promise.all([
    supabase
      .from('order_owner_change_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(100),
    supabase
      .from('affiliate_change_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(100),
  ]);

  if (ownerRes.error && tableMissing(ownerRes.error)) migrationsMissing.push('add-order-owner-guard.sql');
  else if (ownerRes.error) console.error('[admin/requests] owner:', ownerRes.error.message);

  if (affiliateRes.error && tableMissing(affiliateRes.error)) migrationsMissing.push('add-affiliate-dashboard.sql');
  else if (affiliateRes.error) console.error('[admin/requests] affiliate:', affiliateRes.error.message);

  // Affiliate names, so the list reads "Jean Paul wants..." rather than a uuid.
  const affiliateIds = [...new Set((affiliateRes.data || []).map((row) => row.affiliate_id).filter(Boolean))];
  let affiliateNames = {};
  if (affiliateIds.length > 0) {
    const { data } = await supabase.from('affiliates').select('id, name, email').in('id', affiliateIds);
    affiliateNames = Object.fromEntries((data || []).map((row) => [row.id, row.name || row.email]));
  }

  const requests = [
    ...(ownerRes.data || []).map((row) => ({
      id: row.id,
      kind: 'order_owner',
      createdAt: row.created_at,
      title: `Move order ${row.order_number || ''} to ${row.to_agent}`.trim(),
      detail: row.from_agent
        ? `Currently ${row.from_agent}. Reason given: ${row.reason}`
        : `Reason given: ${row.reason}`,
      askedBy: row.requested_by_name || row.requested_by_email || 'Someone',
    })),
    ...(affiliateRes.data || []).map((row) => ({
      id: row.id,
      kind: 'affiliate_email',
      createdAt: row.created_at,
      title: `${affiliateNames[row.affiliate_id] || 'An affiliate'} wants to change their email`,
      detail: `From ${row.current_value || '(none)'} to ${row.requested_value}. Their payout notices go to this address.`,
      askedBy: affiliateNames[row.affiliate_id] || row.requested_by_email || 'An affiliate',
    })),
  ].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  return NextResponse.json({ ok: true, requests, migrationsMissing });
}

/**
 * Answer an affiliate's request. Order owner changes keep their own endpoint,
 * which the tab calls directly — the rules there are not duplicated here.
 *
 * Approving an email change writes it to BOTH the affiliate row and the login,
 * because they are the same address doing two jobs: signing in, and receiving
 * payout notices. Updating one and not the other would leave someone unable to
 * sign in, or money announced to an address they no longer read.
 */
export async function PATCH(request) {
  const auth = await verifyAdminSession(request, { requireSuperadmin: true, skipPathPermission: true });
  if (auth.error) return auth.error;

  let body = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Nothing to decide' }, { status: 400 });
  }

  const { requestId, decision, note } = body;
  if (!requestId || !['approve', 'reject'].includes(decision)) {
    return NextResponse.json({ error: 'A request and a decision are required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: row, error } = await supabase
    .from('affiliate_change_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (error || !row) {
    return NextResponse.json({ error: 'That request no longer exists.' }, { status: 404 });
  }
  if (row.status !== 'pending') {
    return NextResponse.json({ error: 'That request has already been answered.' }, { status: 409 });
  }

  if (decision === 'approve' && row.field === 'email') {
    const email = String(row.requested_value || '').trim().toLowerCase();

    const { data: affiliate } = await supabase
      .from('affiliates')
      .select('admin_profile_user_id')
      .eq('id', row.affiliate_id)
      .single();

    const { error: affiliateError } = await supabase
      .from('affiliates')
      .update({ email })
      .eq('id', row.affiliate_id);

    if (affiliateError) {
      console.error('[admin/requests] affiliate email:', affiliateError.message);
      return NextResponse.json({ error: 'Could not update the affiliate.' }, { status: 500 });
    }

    if (affiliate?.admin_profile_user_id) {
      const { error: authError } = await supabase.auth.admin.updateUserById(
        affiliate.admin_profile_user_id,
        { email, email_confirm: true }
      );
      if (authError) {
        // Put the affiliate row back rather than leaving the two addresses
        // disagreeing about which one is the login.
        await supabase.from('affiliates').update({ email: row.current_value }).eq('id', row.affiliate_id);
        console.error('[admin/requests] login email:', authError.message);
        return NextResponse.json(
          { error: `Could not move their login to that address: ${authError.message}` },
          { status: 500 }
        );
      }
      await supabase
        .from('admin_profiles')
        .update({ email })
        .eq('user_id', affiliate.admin_profile_user_id);
    }
  }

  const { error: settleError } = await supabase
    .from('affiliate_change_requests')
    .update({
      status: decision === 'approve' ? 'approved' : 'rejected',
      decided_by_email: auth.profile.email,
      decision_note: note || null,
      decided_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('status', 'pending');

  if (settleError) {
    console.error('[admin/requests] settle:', settleError.message);
    return NextResponse.json({ error: settleError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: decision === 'approve' ? 'Approved. Their new address is live.' : 'Rejected. Nothing changed.',
  });
}
