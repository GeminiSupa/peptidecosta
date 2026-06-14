import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { recalcPayoutAmounts } from '@/lib/commissionPayouts';

export async function PATCH(request) {
  const auth = await verifyAdminSession(request, { requireSuperadmin: true });
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const { payoutId } = body;

    if (!payoutId) {
      return NextResponse.json({ error: 'payoutId is required' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: payout, error: fetchError } = await supabaseAdmin
      .from('commission_payouts')
      .select('*')
      .eq('id', payoutId)
      .single();

    if (fetchError || !payout) {
      return NextResponse.json({ error: 'Payout not found' }, { status: 404 });
    }

    if (payout.status !== 'Pending') {
      return NextResponse.json(
        { error: 'Only pending payouts can be edited' },
        { status: 400 }
      );
    }

    const usdSales = body.usd_sales !== undefined ? Number(body.usd_sales) : Number(payout.usd_sales || 0);
    const crcSales = body.crc_sales !== undefined ? Number(body.crc_sales) : Number(payout.crc_sales || 0);
    const commissionRate =
      body.commission_rate !== undefined
        ? Number(body.commission_rate)
        : Number(payout.commission_rate || 0);
    const weeklySalary =
      body.weekly_salary_paid !== undefined
        ? Number(body.weekly_salary_paid)
        : Number(payout.weekly_salary_paid || 0);
    const salaryCurrency = body.salary_currency || payout.salary_currency || 'USD';
    const adminNotes =
      body.admin_notes !== undefined ? String(body.admin_notes) : payout.admin_notes;

    const recalc = recalcPayoutAmounts({
      usdSales,
      crcSales,
      commissionRate,
      weeklySalary,
      salaryCurrency,
    });

    const { error: updateError } = await supabaseAdmin
      .from('commission_payouts')
      .update({
        usd_sales: usdSales,
        crc_sales: crcSales,
        commission_rate: commissionRate,
        weekly_salary_paid: weeklySalary,
        salary_currency: salaryCurrency,
        usd_commission: recalc.usd_commission,
        crc_commission: recalc.crc_commission,
        total_payout_usd: recalc.total_payout_usd,
        total_payout_crc: recalc.total_payout_crc,
        admin_notes: adminNotes,
      })
      .eq('id', payoutId);

    if (updateError) {
      console.error('[Commission Payouts] Update failed:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Commission Payouts] PATCH error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  const auth = await verifyAdminSession(request, { requireSuperadmin: true });
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const payoutId = searchParams.get('payoutId');
    const hardDelete = searchParams.get('hardDelete') === 'true';

    if (!payoutId) {
      return NextResponse.json({ error: 'payoutId is required' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: payout, error: fetchError } = await supabaseAdmin
      .from('commission_payouts')
      .select('id, status')
      .eq('id', payoutId)
      .single();

    if (fetchError || !payout) {
      return NextResponse.json({ error: 'Payout not found' }, { status: 404 });
    }

    if (payout.status !== 'Pending' && !hardDelete) {
      return NextResponse.json(
        { error: 'Only pending payouts can be removed, unless hard deleting' },
        { status: 400 }
      );
    }

    if (hardDelete) {
      const { error: deleteError } = await supabaseAdmin
        .from('commission_payouts')
        .delete()
        .eq('id', payoutId);

      if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, deleted: true });
    }

    const { error: updateError } = await supabaseAdmin
      .from('commission_payouts')
      .update({
        status: 'Rejected',
        approved_at: new Date().toISOString(),
      })
      .eq('id', payoutId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Commission Payouts] DELETE error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
