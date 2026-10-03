import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { planPayoutSettlement } from '@/lib/payoutSettlement.mjs';
import { recordAdminActivity } from '@/lib/adminActivityLog.mjs';

export async function POST(request) {
  const auth = await verifyAdminSession(request, { requireSuperadmin: true });
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    if (!body.payoutId) return NextResponse.json({ error: 'payoutId is required' }, { status: 400 });
    const supabase = getSupabaseAdmin();
    const { data: payout, error: fetchError } = await supabase
      .from('affiliate_payouts').select('*').eq('id', body.payoutId).single();
    if (fetchError || !payout) return NextResponse.json({ error: 'Payout not found' }, { status: 404 });

    const plan = planPayoutSettlement(payout.status, {
      ...body,
      recordedBy: auth.user.email,
      paymentInitiatedAt: payout.payment_initiated_at,
    });
    if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: plan.status });
    const { data, error } = await supabase.from('affiliate_payouts')
      .update(plan.patch).eq('id', payout.id).select('*').single();
    if (error) throw error;
    await recordAdminActivity(supabase, {
      actor: auth.profile,
      action: 'payout.settled',
      subjectType: 'payout',
      subjectId: payout.id,
      subjectLabel: payout.affiliate_name || payout.affiliate_email,
      detail: {
        status: { from: String(payout.status || ''), to: String(data?.status || '') },
        // One payout stated in two currencies, never a sum of the two.
        amount: { from: '', to: `$${payout.usd_commission || 0} or ₡${payout.crc_commission || 0}` },
      },
      request,
    });
    return NextResponse.json({ success: true, payout: data });
  } catch (error) {
    console.error('[affiliates/payouts/settle]', error);
    return NextResponse.json({ error: error.message || 'Could not record payout settlement' }, { status: 500 });
  }
}
