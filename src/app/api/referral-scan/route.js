import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { deviceTypeFromUserAgent } from '@/lib/referralStats.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Records that someone landed via a referral link or QR code.
 *
 * Public by design — the caller is the catalog page, not an admin. It writes
 * only what arrived in the URL plus a coarse device bucket and country, and it
 * never returns data, so there is nothing here worth abusing beyond inserting
 * noise. The unique index on (session_id, agent, promo) means a reload or a
 * back-and-forth browse cannot inflate the count.
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));

    const clean = (value, max = 120) => {
      const text = String(value ?? '').trim();
      return text ? text.slice(0, max) : null;
    };

    const salesAgent = clean(body.salesAgent);
    const promoCode = clean(body.promoCode, 60);
    const referral = clean(body.referral);

    // Nothing to attribute — not an error, just an ordinary visit.
    if (!salesAgent && !promoCode && !referral) {
      return NextResponse.json({ ok: true, recorded: false });
    }

    const supabase = getSupabaseAdmin();

    const { error } = await supabase.from('referral_scans').insert({
      sales_agent: salesAgent,
      promo_code: promoCode,
      referral,
      utm_source: clean(body.utmSource, 60),
      utm_medium: clean(body.utmMedium, 60),
      utm_campaign: clean(body.utmCampaign, 60),
      session_id: clean(body.sessionId, 80),
      is_first_visit: body.isFirstVisit !== false,
      device_type: deviceTypeFromUserAgent(request.headers.get('user-agent')),
      country: clean(body.country, 4),
    });

    // A duplicate is the unique index doing its job, not a failure.
    if (error && !String(error.message || '').toLowerCase().includes('duplicate')) {
      console.warn('[referral-scan] insert failed:', error.message);
      return NextResponse.json({ ok: true, recorded: false });
    }

    return NextResponse.json({ ok: true, recorded: !error });
  } catch (err) {
    // Never let analytics break a customer's page load.
    console.warn('[referral-scan]', err?.message);
    return NextResponse.json({ ok: true, recorded: false });
  }
}
