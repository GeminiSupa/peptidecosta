import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { appendOrderActivity } from '@/lib/orderActivity';
import { agentMatchKeys } from '@/lib/agentOrders';
import { getOrderMailSettings } from '@/lib/transactionalSmtp';
import { taxRecordsRecipients } from '@/lib/taxRecordsEmail.mjs';
import { resolveTaxRecordsMailer } from '@/lib/taxRecordsSmtp.mjs';
import { stripOwnerAddress, ORDER_NOTIFICATION_OWNER_BCC } from '@/lib/orderEmailAddressing.mjs';
import { restoreInventoryForOrder, restoreSelectedQuantities } from '@/lib/inventoryRestoreServer';
import { planPartialRestock } from '@/lib/inventoryRestore.mjs';
import { commissionClawback, planRefund } from '@/lib/orderRefund.mjs';
import { affiliateCommissionPatch } from '@/lib/affiliateCommission.mjs';
import {
  buildAccountantRefundEmail,
  buildCustomerRefundEmail,
  buildTeamRefundEmail,
} from '@/lib/refundEmail.mjs';

export const runtime = 'nodejs';
// Three sends plus a stock restore. The mail budget dominates.
export const maxDuration = 60;

// Refunding is money leaving the business, so it sits behind the same gate as
// approving a payout rather than the ordinary admin gate the rest of the order
// panel uses.
const REQUIRE_SUPERADMIN = true;

/**
 * Has this agent already been paid for this order?
 *
 * An approved payout carries the orders it paid for in orders_data. If this
 * order is in one, the commission has left the business and has to be clawed
 * back; if it is not, the weekly scan simply stops counting the order and
 * nothing is owed.
 */
async function agentAlreadyPaidFor(supabase, orderNumber, orderId) {
  const { data, error } = await supabase
    .from('commission_payouts')
    .select('id, agent_email, agent_name, commission_rate, orders_data, override_orders_data')
    .eq('status', 'Approved');

  if (error) {
    // Fail safe: if we cannot prove they were paid, do not invent a debt.
    console.error('[admin/orders/refund] Could not read payouts:', error.message);
    return null;
  }

  const matches = (list) => Array.isArray(list) && list.some(
    (row) => row?.order_number === orderNumber || (orderId && row?.id === orderId),
  );

  return (data || []).find((payout) => matches(payout.orders_data)) || null;
}

/** The assigned agent's email address, for the copy that goes to them. */
async function findAgentEmail(supabase, salesAgent) {
  const wanted = String(salesAgent || '').trim().toLowerCase();
  if (!wanted) return null;

  const { data } = await supabase.from('admin_profiles').select('name, email');
  const profile = (data || []).find((row) => agentMatchKeys(row).has(wanted));
  return profile?.email || null;
}

/** Never throws — a mail problem must not undo a refund that is already recorded. */
async function send(transporter, message, label, results) {
  if (!transporter || !message.to) {
    results[label] = { sent: false, skipped: message.to ? 'no transport' : 'no recipient' };
    return;
  }
  try {
    const info = await transporter.sendMail(message);
    results[label] = { sent: true, messageId: info.messageId, to: message.to };
    console.log(`[admin/orders/refund] ${label} sent to ${message.to}: ${info.messageId}`);
  } catch (err) {
    results[label] = { sent: false, error: err.message, to: message.to };
    console.error(`[admin/orders/refund] ${label} FAILED to ${message.to}:`, err.message);
  }
}

export async function POST(request) {
  const auth = await verifyAdminSession(request, { requireSuperadmin: REQUIRE_SUPERADMIN });
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }

  const orderId = String(body?.orderId || '').trim();
  if (!orderId) {
    return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  try {
    const { data: order, error: readError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (readError) {
      console.error('[admin/orders/refund] read failed', orderId, readError);
      return NextResponse.json({ error: readError.message }, { status: 500 });
    }
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    // Every guard about how much may be given back lives in orderRefund.mjs and
    // is decided before anything is written.
    const plan = planRefund(order, {
      amount: body?.amount,
      reason: body?.reason,
      restoreStock: body?.restoreStock === true,
    });
    if (!plan.ok) {
      return NextResponse.json({ error: plan.error }, { status: plan.status });
    }

    const actor = auth.profile?.email || auth.user?.email || 'admin';

    // Which bottles came back, for a refund of part of an order. Capped against
    // what this order can still give back — the browser is free to ask for ten
    // of something that was bought twice, and stock that exists only in the
    // database ends as an order nobody can ship. A full refund ignores this and
    // uses the whole-order restore below instead.
    const restockLines = plan.fullyRefunded
      ? []
      : planPartialRestock(order, body?.restockItems);

    // --- commission ---------------------------------------------------------
    // Only an order the agent has ALREADY been paid for creates a debt. One that
    // has not been paid yet needs nothing: a refunded status is not commission
    // eligible, so the weekly scan drops it on its own.
    const paidPayout = order.sales_agent
      ? await agentAlreadyPaidFor(supabase, order.order_number, order.id)
      : null;

    const clawback = commissionClawback(plan, {
      rate: Number(paidPayout?.commission_rate || 0),
      alreadyPaid: Boolean(paidPayout),
    });

    // --- write the refund ---------------------------------------------------
    const events = Array.isArray(order.refund_events) ? order.refund_events : [];
    const patch = {
      status: plan.status,
      refunded_amount_usd: plan.totalRefundedUsd,
      refunded_amount_crc: plan.totalRefundedCrc,
      refunded_at: new Date().toISOString(),
      refund_reason: plan.reason || order.refund_reason || null,
      refund_events: [
        ...events,
        {
          amount_usd: plan.refundUsd,
          amount_crc: plan.refundCrc,
          reason: plan.reason || null,
          by: actor,
          at: new Date().toISOString(),
          stock_restored: plan.fullyRefunded ? plan.restoreStock : restockLines.length > 0,
          // Recorded per refund so a later partial refund knows what is left to
          // give back; restockableRemaining() subtracts these.
          restocked: restockLines,
        },
      ],
      activity_log: appendOrderActivity(order.activity_log, {
        type: 'refund',
        message: `Refunded ${plan.currency === 'CRC' ? '₡' : '$'}${plan.currency === 'CRC' ? plan.refundCrc : plan.refundUsd}${plan.reason ? ` — ${plan.reason}` : ''}`,
        by: actor,
      }),
    };

    const { data: updated, error: updateError } = await supabase
      .from('orders')
      .update(patch)
      .eq('id', orderId)
      .select('*')
      .maybeSingle();

    if (updateError) {
      console.error('[admin/orders/refund] update failed', order.order_number, updateError);
      return NextResponse.json({
        error: /column .* does not exist/i.test(updateError.message)
          ? 'The refund columns are missing. Run add-order-refunds.sql in Supabase first.'
          : updateError.message,
      }, { status: 500 });
    }

    // --- record the debt ----------------------------------------------------
    // After the order is written, never before: a debt for a refund that failed
    // to record would come off someone's pay for nothing.
    let adjustment = null;
    if (paidPayout && (clawback.owedUsd > 0 || clawback.owedCrc > 0)) {
      const { data: existing } = await supabase
        .from('commission_adjustments')
        .select('id, amount_usd, amount_crc')
        .eq('agent_email', paidPayout.agent_email)
        .eq('order_number', order.order_number)
        .maybeSingle();

      const row = {
        agent_email: paidPayout.agent_email,
        agent_name: paidPayout.agent_name || order.sales_agent || null,
        order_number: order.order_number,
        // Topped up rather than replaced, so a second refund on the same order
        // adds to the debt instead of overwriting the first one.
        amount_usd: Number(existing?.amount_usd || 0) + clawback.owedUsd,
        amount_crc: Number(existing?.amount_crc || 0) + clawback.owedCrc,
        reason: `Refund on order ${order.order_number}${plan.reason ? ` — ${plan.reason}` : ''}`,
        created_by: actor,
      };

      const { data: saved, error: adjError } = existing
        ? await supabase.from('commission_adjustments').update(row).eq('id', existing.id).select('*').maybeSingle()
        : await supabase.from('commission_adjustments').insert(row).select('*').maybeSingle();

      if (adjError) {
        // Loud, and reported back: the refund stands, but somebody has to know
        // the clawback did not get recorded.
        console.error('[admin/orders/refund] Commission adjustment FAILED:', adjError.message);
        adjustment = { recorded: false, error: adjError.message };
      } else {
        adjustment = { recorded: true, ...clawback, id: saved?.id };
      }
    }

    // --- stock --------------------------------------------------------------
    //
    // Two different jobs. A full refund reverses the order, so it uses the same
    // whole-order restore a cancellation does — every line back, stamped so it
    // can only ever happen once.
    //
    // A partial refund cannot use that: refunding one bottle of five would put
    // all five back and leave the shelf claiming stock the customer still has,
    // then stamp the order so the rest could never be returned. So it puts back
    // only the bottles the admin marked as returned, and records them on the
    // refund event so the next partial refund knows what is left.
    let stock = { restored: false, skipped: 'not requested' };
    if (!plan.fullyRefunded) {
      // Only the named bottles, and only after they were written to the refund
      // event above: if this write fails the shelf reads low, which is the
      // safe direction.
      stock = restockLines.length
        ? await restoreSelectedQuantities(supabase, updated, restockLines, { reason: `refund by ${actor}` })
        : { restored: false, skipped: 'no items marked as returned' };
    } else if (plan.restoreStock) {
      try {
        // The shared restore path, so a refund returns stock exactly the way a
        // cancellation does and cannot double-count what was already returned.
        stock = await restoreInventoryForOrder(supabase, { ...updated, status: 'cancelled' }, {
          reason: `refund by ${actor}`,
        });
      } catch (err) {
        console.error('[admin/orders/refund] Stock restore failed:', err.message);
        stock = { restored: false, error: err.message };
      }
    }

    // --- the affiliate's cut ------------------------------------------------
    // Sales agents are handled above, through the payout debt. An affiliate's
    // commission instead sits in a column on the order, written when the order
    // was placed and never revisited — so without this a refunded order kept
    // paying its affiliate on money the customer no longer has.
    let affiliateCommission = null;
    if (updated.affiliate_id) {
      const { data: affiliate } = await supabase
        .from('affiliates')
        .select('*')
        .eq('id', updated.affiliate_id)
        .maybeSingle();

      if (affiliate) {
        const before = {
          usd: Number(order.affiliate_commission_usd || 0),
          crc: Number(order.affiliate_commission_crc || 0),
        };
        const repriced = affiliateCommissionPatch(updated, affiliate);
        const { error: affError } = await supabase
          .from('orders')
          .update(repriced)
          .eq('id', orderId);

        if (affError) {
          console.error('[admin/orders/refund] affiliate commission NOT updated:', affError.message);
          affiliateCommission = { updated: false, error: affError.message };
        } else {
          Object.assign(updated, repriced);
          affiliateCommission = {
            updated: true,
            before,
            after: { usd: repriced.affiliate_commission_usd, crc: repriced.affiliate_commission_crc },
          };
          console.log(`[admin/orders/refund] ${order.order_number}: affiliate cut ${before.usd} -> ${repriced.affiliate_commission_usd} USD`);
        }
      }
    }

    // --- the three emails ---------------------------------------------------
    const { smtp, from } = getOrderMailSettings();
    const transporter = smtp.configured
      ? nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: { user: smtp.user, pass: smtp.pass },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
      })
      : null;

    const emails = {};
    if (!transporter) {
      console.error('[admin/orders/refund] SMTP not configured — no refund emails sent.');
    }

    // 1. The customer.
    const customerMail = buildCustomerRefundEmail({ order: updated, plan });
    await send(transporter, {
      from,
      to: String(updated.customer_email || '').trim(),
      replyTo: smtp.replyTo || undefined,
      ...customerMail,
    }, 'customer', emails);

    // 2. The team, with the agent copied so they hear it from us first.
    const agentEmail = await findAgentEmail(supabase, updated.sales_agent);
    const teamMail = buildTeamRefundEmail({ order: updated, plan, clawback: paidPayout ? clawback : null, actor });
    await send(transporter, {
      from,
      to: stripOwnerAddress('info@peptidescostarica.net'),
      cc: agentEmail && agentEmail.toLowerCase() !== ORDER_NOTIFICATION_OWNER_BCC ? agentEmail : undefined,
      bcc: ORDER_NOTIFICATION_OWNER_BCC,
      ...teamMail,
    }, 'team', emails);

    // 3. The accountant, on their own message.
    const accountantMail = buildAccountantRefundEmail({ order: updated, plan });
    const accountingMailer = resolveTaxRecordsMailer();
    await send(accountingMailer.transporter, {
      from: accountingMailer.from,
      to: taxRecordsRecipients().join(', '),
      ...accountantMail,
    }, 'accountant', emails);
    emails.accountant.transport = accountingMailer.source;

    console.log(`[admin/orders/refund] ${order.order_number}: ${plan.status} ${plan.refundUsd} USD by ${actor}`);

    return NextResponse.json({
      ok: true,
      order: updated,
      status: plan.status,
      refundedUsd: plan.refundUsd,
      refundedCrc: plan.refundCrc,
      totalRefundedUsd: plan.totalRefundedUsd,
      totalRefundedCrc: plan.totalRefundedCrc,
      fullyRefunded: plan.fullyRefunded,
      adjustment,
      affiliateCommission,
      stock,
      emails,
    });
  } catch (err) {
    console.error('[admin/orders/refund]', err);
    return NextResponse.json({ error: err.message || 'Could not record the refund' }, { status: 500 });
  }
}
