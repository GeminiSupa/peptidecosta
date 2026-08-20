import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { isShieldHubPayConfigured, normalizeShieldHubPayName, processShieldHubPayTransaction } from '@/lib/shieldHubPay';
import { claimOrderForPayment, releaseOrderClaim, describeOrderPaymentState } from '@/lib/cardPaymentLock';
import { getPublicSiteUrl } from '@/lib/publicUrl';
import { classifyPaymentOutcome, declineReasonFrom, gatewayStatusToOrderStatus } from '@/lib/paymentOutcome.mjs';
import { buildOrderNotificationPayload } from '@/lib/adminOrderEmail.mjs';

export const runtime = 'nodejs';

// Admin-only sandbox payment testing. Charges go to the Shield Hub Pay SANDBOX
// account (mode: 'test') — no real money ever moves. Orders created here are
// unmistakably marked (TEST- prefix, payment_method 'card-test') so they can't
// be confused with, or counted alongside, real customer orders. The public
// checkout routes have no path to this mode: it exists only behind superadmin
// auth on this route.

const APP_URL = getPublicSiteUrl();

function normalizeCard(card = {}) {
  const expiry = String(card.expiry || '').replace(/\s+/g, '');
  const [rawMonth, rawYear] = expiry.includes('/') ? expiry.split('/') : [card.expiryMonth, card.expiryYear];
  const expiryMonth = String(rawMonth || '').replace(/\D/g, '').padStart(2, '0').slice(0, 2);
  const yearDigits = String(rawYear || '').replace(/\D/g, '');
  const expiryYear = yearDigits.length === 4 ? yearDigits.slice(2) : yearDigits;

  return {
    holder: normalizeShieldHubPayName(card.holder, 'Test Admin'),
    number: String(card.number || '').replace(/\D/g, ''),
    cvv: String(card.cvv || '').replace(/\D/g, ''),
    expiry_month: expiryMonth,
    expiry_year: expiryYear,
  };
}

function statusToOrderStatus(status) {
  return gatewayStatusToOrderStatus(status, {
    onUnknown: (raw) => console.warn(`[admin/test-payment] Unrecognised gateway status "${raw}"; order left pending for review.`),
  });
}

/**
 * Send the admin the receipt a real customer would get for this outcome.
 *
 * Customer copy only, and only to the address of the superadmin who pressed
 * the button. The team's own alert is deliberately not sent: every real card
 * order already produces one, so there is nothing to learn from a sandbox copy
 * and no reason to put a TEST order in everyone's inbox.
 *
 * It goes through /api/order-notification rather than rendering the template
 * here, so what lands in the inbox has travelled the exact path a real receipt
 * travels — same builder, same SMTP settings, same failure modes.
 *
 * Never throws: a sandbox mail problem must not fail the payment test itself.
 */
async function sendSandboxReceipt({ order, orderNumber, outcome, declineReason, to, lang, enabled = true }) {
  if (!enabled) return null;
  if (outcome === 'pending') return { sent: false, skipped: 'not-settled' };
  if (!to) return { sent: false, skipped: 'no-admin-email' };

  try {
    const payload = buildOrderNotificationPayload(
      // 'card-test' marks the order in the database; the receipt should read
      // as the card receipt it is standing in for.
      { ...order, payment_method: 'card', customer_email: to },
      orderNumber,
      {
        adminNotificationOnly: false,
        customerReceiptOnly: true,
        forceCustomerReceipt: true,
        notificationKind: 'payment-result',
        declineReason,
      },
    );
    // Sandbox orders are USD, which would always pick English. Most customers
    // read the Spanish one, so the panel chooses.
    payload.lang = lang;

    const response = await fetch(`${APP_URL.replace(/\/$/, '')}/api/order-notification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });
    const result = await response.json().catch(() => ({}));
    const customer = result?.results?.customerReceipt;

    if (customer?.sent) return { sent: true, to };
    return { sent: false, to, error: customer?.error || result?.error || `HTTP ${response.status}` };
  } catch (error) {
    console.error('[admin/test-payment] Sandbox receipt failed:', error.message);
    return { sent: false, to, error: error.message };
  }
}

export async function POST(request) {
  const auth = await verifyAdminSession(request, { requireSuperadmin: true });
  if (auth.error) return auth.error;

  try {
    if (!isShieldHubPayConfigured('test')) {
      return NextResponse.json(
        { error: 'Sandbox credentials are not configured (SHIELD_HUB_PAY_TEST_CLIENT_ID / SHIELD_HUB_PAY_TEST_API_SECRET).' },
        { status: 500 },
      );
    }

    const body = await request.json();
    const action = body.action || 'pay';
    const supabase = getSupabaseAdmin();

    if (action === 'create') {
      // Amount is admin-chosen but clamped to a sane sandbox range.
      const amount = Math.min(500, Math.max(0.5, Number(body.amount) || 1));
      const orderNumber = `TEST-${Date.now().toString(36).toUpperCase()}`;

      const { error } = await supabase.from('orders').insert({
        order_number: orderNumber,
        customer_name: 'TEST PAYMENT (admin sandbox)',
        customer_phone: '00000000',
        customer_email: auth.user?.email || 'test@admin.local',
        shipping_address: 'TEST — sandbox payment, nothing to ship',
        items: [{ product: 'TEST ITEM (sandbox payment)', qty: 1, price: amount }],
        currency: 'USD',
        total_usd: amount,
        total_crc: 0,
        payment_method: 'card-test',
        status: 'Pending - Card',
      });

      if (error) {
        return NextResponse.json({ error: `Could not create test order: ${error.message}` }, { status: 500 });
      }
      return NextResponse.json({ ok: true, orderNumber, amount });
    }

    if (action === 'cleanup') {
      const { data, error } = await supabase
        .from('orders')
        .delete()
        .eq('payment_method', 'card-test')
        .like('order_number', 'TEST-%')
        .select('order_number');

      if (error) {
        return NextResponse.json({ error: `Cleanup failed: ${error.message}` }, { status: 500 });
      }
      return NextResponse.json({ ok: true, deleted: (data || []).length });
    }

    if (action !== 'pay') {
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    const { orderNumber, card } = body;
    if (!orderNumber || !String(orderNumber).startsWith('TEST-')) {
      return NextResponse.json({ error: 'A TEST- order number is required' }, { status: 400 });
    }

    const { data: order, error: lookupErr } = await supabase
      .from('orders')
      .select('*')
      .eq('order_number', orderNumber)
      .maybeSingle();

    if (lookupErr || !order) {
      return NextResponse.json({ error: 'Test order not found' }, { status: 404 });
    }
    // Refuse to run sandbox charges against anything that is not a marked test order.
    if (order.payment_method !== 'card-test') {
      return NextResponse.json({ error: 'That order is not a test order' }, { status: 400 });
    }

    const normalizedCard = normalizeCard(card);
    if (!normalizedCard.holder || normalizedCard.number.length < 12 || normalizedCard.cvv.length < 3 || !normalizedCard.expiry_month || !normalizedCard.expiry_year) {
      return NextResponse.json({ error: 'Missing or invalid card details' }, { status: 400 });
    }

    // Same atomic claim the real payment routes use — this is exactly the
    // double-charge protection the panel exists to demonstrate.
    const claim = await claimOrderForPayment(supabase, orderNumber);
    if (!claim.claimed) {
      const state = await describeOrderPaymentState(supabase, orderNumber);
      if (state === 'settled') {
        return NextResponse.json({ ok: false, blocked: true, reason: 'already_paid', error: 'This test order is already paid' }, { status: 409 });
      }
      return NextResponse.json({ ok: false, blocked: true, reason: 'in_flight', error: 'A payment for this order is already being processed' }, { status: 409 });
    }

    const baseUrl = APP_URL.replace(/\/$/, '');
    let transaction;
    try {
      transaction = await processShieldHubPayTransaction({
        amount: Number(order.total_usd || 1).toFixed(2),
        currency: 'USD',
        transaction_reference: orderNumber,
        redirectback_url: `${baseUrl}/thank-you?order=${encodeURIComponent(orderNumber)}`,
        notification_url: `${baseUrl}/api/shieldhubpay/webhook`,
        customer: {
          first: 'Test',
          last: 'Admin',
          email: auth.user?.email || 'test@admin.local',
          phone: '00000000',
          ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1',
        },
        billing: {
          address: 'Test Address',
          postal_code: '10101',
          city: 'San Jose',
          state: 'San Jose',
          country: 'CR',
        },
        card: normalizedCard,
      }, { mode: 'test' });
    } catch (chargeErr) {
      await releaseOrderClaim(supabase, orderNumber);
      throw chargeErr;
    }

    const orderStatus = statusToOrderStatus(transaction.status);
    await supabase
      .from('orders')
      .update({
        status: orderStatus,
        payment_transaction_id: transaction?.id ? String(transaction.id) : null,
        payment_provider_status: transaction?.status || null,
      })
      .eq('order_number', orderNumber);

    const outcome = classifyPaymentOutcome(orderStatus);
    const declineReason = outcome === 'paid' ? null : declineReasonFrom(transaction);

    const receipt = await sendSandboxReceipt({
      order: { ...order, status: orderStatus },
      orderNumber,
      outcome,
      declineReason,
      to: auth.user?.email,
      lang: body.lang === 'en' ? 'en' : 'es',
      enabled: body.sendReceipt !== false,
    });

    return NextResponse.json({
      ok: outcome === 'paid',
      status: transaction.status,
      orderStatus,
      transactionId: transaction.id || null,
      receipt,
      error: outcome === 'paid'
        ? null
        : (declineReason || `Payment ${transaction.status || 'failed'}`),
    });
  } catch (err) {
    console.error('[test-payment]', err);
    return NextResponse.json({ error: err.message || 'Test payment failed' }, { status: 502 });
  }
}
