import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getTransactionalSmtpConfig } from '@/lib/transactionalSmtp';
import { getBusinessLinks } from '@/lib/settings';
import { buildReviewRequestEmail, reviewDestinations } from '@/lib/reviewRequestEmail.mjs';
import { getReviewSettings } from '@/lib/reviewSettings.mjs';
import { loadReviewAskHistory, recordReviewAsk, reviewClickUrl } from '@/lib/reviewAskHistory.mjs';
import { TRACKABLE_PLATFORMS, decideReviewAsk } from '@/lib/reviewAskPolicy.mjs';
import { writeDroppingMissingColumns, ORDER_REVIEW_PLATFORM_COLUMNS } from '@/lib/optionalColumns.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Send one review request now, chosen by a human in the admin panel.
 *
 * The automatic path waits and picks the site itself. This is the override for
 * when someone on the team knows something the rules do not — a customer who
 * said on the phone they would happily leave a review, say.
 *
 * GET reports what WOULD happen, so the panel can warn before sending: the
 * whole point of the confirmation is that the customer is usually already
 * queued to be asked automatically, and sending now cancels that rather than
 * adding to it.
 *
 * Only ever Google and Facebook. Trustpilot invitations are triggered by BCC
 * on the order-complete email and sent by Trustpilot on their own schedule;
 * there is no way to fire one on demand from here.
 */

async function loadOrder(supabase, orderId) {
  const { data, error } = await supabase
    .from('orders')
    .select('id, order_number, customer_email, customer_name, currency, status, review_requested_at, review_platform')
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const orderId = new URL(request.url).searchParams.get('orderId');
    if (!orderId) return NextResponse.json({ error: 'orderId is required' }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const order = await loadOrder(supabase, orderId);
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    const settings = await getReviewSettings(supabase);
    const { rows, ok } = await loadReviewAskHistory(supabase, order.customer_email);

    const alreadyAsked = Boolean(order.review_requested_at);
    const decision = ok
      ? decideReviewAsk({
        history: rows,
        firstChoice: 'google',
        trustpilotHasRoom: false,
        policy: {
          reaskAfterDays: settings.reaskAfterDays,
          maxAsksWithoutClick: settings.maxAsksWithoutClick,
        },
      })
      : null;

    return NextResponse.json({
      canSend: Boolean(order.customer_email),
      customerEmail: order.customer_email || '',
      customerName: order.customer_name || '',
      alreadyAsked,
      // What the customer has already been sent, so the panel can say "they
      // clicked Google in June" rather than only "already asked".
      history: (rows || []).map((r) => ({
        platforms: r.platforms,
        clicked: r.clicked_platform || null,
        askedAt: r.asked_at,
      })),
      // The sites the rules would offer if left alone, and the wait.
      suggested: decision?.ask ? decision.offer : [],
      suggestedReason: decision?.reason || (ok ? '' : 'review history unavailable'),
      waitDays: settings.waitDays,
      // Whether it is queued to go automatically, which is what the second
      // confirmation is about.
      queuedAutomatically: !alreadyAsked && settings.triggerStatuses.includes(order.status),
    });
  } catch (err) {
    console.error('[admin/reviews/send] GET', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const orderId = body?.orderId;
    const requested = Array.isArray(body?.platforms) ? body.platforms : [];
    const platforms = TRACKABLE_PLATFORMS.filter((p) => requested.includes(p));

    if (!orderId) return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    if (!platforms.length) {
      return NextResponse.json({ error: 'Choose Google, Facebook, or both' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const order = await loadOrder(supabase, orderId);
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    if (!order.customer_email) {
      return NextResponse.json({ error: 'This order has no customer email address' }, { status: 422 });
    }

    const smtp = getTransactionalSmtpConfig();
    if (!smtp.host || !smtp.user || !smtp.pass) {
      return NextResponse.json({ error: 'Transactional email is not configured' }, { status: 503 });
    }

    const settings = await getReviewSettings(supabase);
    const links = await getBusinessLinks().catch(() => ({}));
    const destinations = reviewDestinations(links, {
      ...process.env,
      REVIEW_LINK_GOOGLE: settings.googleReviewUrl || process.env.REVIEW_LINK_GOOGLE,
      REVIEW_LINK_FACEBOOK: settings.facebookReviewUrl || process.env.REVIEW_LINK_FACEBOOK,
    });

    // Recorded before sending, so the click links can carry the ask id and the
    // customer counts as asked even if the send then fails. Asked-and-not-sent
    // is recoverable; sent-and-not-recorded means asking them again later.
    const askId = await recordReviewAsk(supabase, {
      email: order.customer_email,
      order,
      platforms,
    });

    const offered = {
      google: platforms.includes('google') ? reviewClickUrl(askId, 'google', destinations.google) : '',
      facebook: platforms.includes('facebook') ? reviewClickUrl(askId, 'facebook', destinations.facebook) : '',
      trustpilot: '',
    };

    const { subject, html } = buildReviewRequestEmail({
      customerName: order.customer_name,
      lang: order.currency === 'CRC' ? 'es' : 'en',
      destinations: offered,
    });

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
    });

    await transporter.sendMail({
      from: `Peptides Costa Rica <${smtp.user}>`,
      to: order.customer_email.trim(),
      subject,
      html,
    });

    // Stamping the order stops the cron sending a second one in two days.
    await writeDroppingMissingColumns(
      { review_requested_at: new Date().toISOString(), review_platform: 'google' },
      ORDER_REVIEW_PLATFORM_COLUMNS,
      (row) => supabase.from('orders').update(row).eq('id', order.id),
    );

    return NextResponse.json({
      sent: true,
      to: order.customer_email,
      platforms,
      recorded: Boolean(askId),
    });
  } catch (err) {
    console.error('[admin/reviews/send] POST', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
