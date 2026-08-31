import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { formatPayoutPeriod } from '@/lib/commissionPayouts';
import { sendTaxRecordsPayoutCopy } from '@/lib/taxRecordsEmail.mjs';
import { resolveTaxRecordsMailer } from '@/lib/taxRecordsSmtp.mjs';

// A payout that was approved before the accounting copy moved onto the
// accounting mailbox never reached PBAG: the copy rode out as a CC on the
// agent's own invoice, which Rackspace refuses for its own domain. Approval
// cannot be repeated to fix that — the route refuses anything already approved,
// on purpose, so nobody pays an agent twice — so the copy needs its own way out.
//
// Sends the stored report, unchanged. It resends only what was already
// approved and emails only the accountant, so it cannot pay anyone, alter a
// payout, or reach the agent.

const APPROVED_STATUSES = ['Approved', 'Payment Initiated', 'Failed', 'Paid'];

const formatMoney = (value, currency) => {
  const amount = Number(value || 0);
  if (currency === 'USD') return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `₡${Math.round(amount).toLocaleString('en-US')}`;
};

export async function POST(request) {
  const auth = await verifyAdminSession(request, { requireSuperadmin: true });
  if (auth.error) return auth.error;

  try {
    const { payoutId } = await request.json();
    if (!payoutId) {
      return NextResponse.json({ error: 'payoutId is required.' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: payout, error: fetchError } = await supabaseAdmin
      .from('commission_payouts')
      .select('*')
      .eq('id', payoutId)
      .single();

    if (fetchError || !payout) {
      console.error('[Commission Accounting Resend] Error fetching payout:', fetchError);
      return NextResponse.json({ error: 'Payout record not found.' }, { status: 404 });
    }

    // Accounting records approved expenses. A pending or rejected slip is not
    // one yet, and sending it would file money that was never committed.
    if (!APPROVED_STATUSES.includes(payout.status)) {
      return NextResponse.json(
        { error: `Only an approved payout has an accounting copy. This one is ${payout.status}.` },
        { status: 400 }
      );
    }

    // The report as it was actually sent, not one rebuilt from today's orders:
    // re-deriving it could disagree with the figures the agent was paid on.
    if (!payout.email_html) {
      return NextResponse.json(
        { error: 'This payout has no stored report to resend. Approve a newer scan of the week instead.' },
        { status: 400 }
      );
    }

    const periodDisplay = formatPayoutPeriod(payout.start_date, payout.end_date);

    // The plain-text half of the original was never stored, only the HTML. This
    // rebuilds a summary for it rather than leaving it blank; the HTML body,
    // which is what accounting reads and files, is untouched.
    const summaryText = [
      `Pago aprobado para ${payout.agent_name || payout.agent_email}.`,
      `Periodo: ${periodDisplay}.`,
      `Total: ${formatMoney(payout.total_payout_usd, 'USD')} o ${formatMoney(payout.total_payout_crc, 'CRC')}.`,
      'Es el mismo pago expresado en dos monedas. No se suman.',
    ].join('\n');

    const accountingMailer = resolveTaxRecordsMailer();
    const accountingCopy = await sendTaxRecordsPayoutCopy({
      transporter: accountingMailer.transporter,
      from: accountingMailer.from,
      payout: {
        kind: 'comisión',
        name: payout.agent_name || payout.agent_email,
        email: payout.agent_email,
        period: periodDisplay,
      },
      html: payout.email_html,
      text: summaryText,
      resent: true,
      logPrefix: '[Commission Accounting Resend]',
    });
    accountingCopy.transport = accountingMailer.source;

    // Never throws, so a refusal arrives here as sent:false and has to be
    // reported. Reporting it as success is the exact failure this route exists
    // to undo.
    if (!accountingCopy.sent) {
      return NextResponse.json(
        { error: accountingCopy.error || 'The accounting mailbox did not accept the copy.', accountingCopy },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, accountingCopy });
  } catch (err) {
    console.error('[Commission Accounting Resend] Critical endpoint crash:', err);
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}
