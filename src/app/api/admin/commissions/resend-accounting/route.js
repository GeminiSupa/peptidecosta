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

// One slip. Never throws: a batch has to report the agent that failed and keep
// going, rather than losing every slip queued behind it.
async function resendOne(payout, mailer) {
  const label = payout.agent_name || payout.agent_email || 'unnamed';

  // Accounting records approved expenses. A pending or rejected slip is not
  // one yet, and sending it would file money that was never committed.
  if (!APPROVED_STATUSES.includes(payout.status)) {
    return { agent: label, sent: false, error: `not approved (${payout.status})` };
  }

  // The report as it was actually sent, not one rebuilt from today's orders:
  // re-deriving it could disagree with the figures the agent was paid on.
  if (!payout.email_html) {
    return { agent: label, sent: false, error: 'no stored report to resend' };
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

  const result = await sendTaxRecordsPayoutCopy({
    transporter: mailer.transporter,
    from: mailer.from,
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

  // A refusal arrives here as sent:false rather than as a throw. Passing that
  // through as success is the exact failure this route exists to undo.
  return {
    agent: label,
    period: periodDisplay,
    sent: result.sent,
    error: result.sent ? undefined : (result.error || 'the accounting mailbox did not accept the copy'),
    transport: mailer.source,
  };
}

export async function POST(request) {
  const auth = await verifyAdminSession(request, { requireSuperadmin: true });
  if (auth.error) return auth.error;

  try {
    const body = await request.json();

    // One slip, or a whole week of them. The caller names the slips rather than
    // a date range, so what goes out is exactly what the admin was looking at
    // when they clicked, and a filter that moves afterwards cannot widen it.
    const ids = Array.isArray(body?.payoutIds) && body.payoutIds.length > 0
      ? body.payoutIds
      : (body?.payoutId ? [body.payoutId] : []);

    if (ids.length === 0) {
      return NextResponse.json({ error: 'payoutId or payoutIds is required.' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: payouts, error: fetchError } = await supabaseAdmin
      .from('commission_payouts')
      .select('*')
      .in('id', ids);

    if (fetchError) {
      console.error('[Commission Accounting Resend] Error fetching payouts:', fetchError);
      return NextResponse.json({ error: 'Could not read those payouts.' }, { status: 500 });
    }

    if (!payouts || payouts.length === 0) {
      return NextResponse.json({ error: 'Payout record not found.' }, { status: 404 });
    }

    const mailer = resolveTaxRecordsMailer();

    // One at a time. The accounting mailbox is a single Rackspace login, and a
    // burst of parallel sends is what gets a mailbox rate limited.
    const results = [];
    for (const payout of payouts) {
      results.push(await resendOne(payout, mailer));
    }

    const sent = results.filter((r) => r.sent);
    const failed = results.filter((r) => !r.sent);

    // Partial success is still worth reporting in full: the agents that did not
    // go out have to be named, or the missing ones go unnoticed all over again.
    return NextResponse.json(
      { success: failed.length === 0, sentCount: sent.length, failedCount: failed.length, results },
      { status: sent.length === 0 ? 502 : 200 }
    );
  } catch (err) {
    console.error('[Commission Accounting Resend] Critical endpoint crash:', err);
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}
