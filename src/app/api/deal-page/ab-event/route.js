import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { rateLimit } from '@/lib/rateLimit.mjs';
import { isAllowedAnalyticsOrigin } from '@/lib/analyticsOrigins.mjs';
import { DEAL_PAGE_EXPERIMENT, normalizeVariant } from '@/lib/dealPageExperiment.mjs';

/**
 * Records a Deal of the Week page view or button click for the A/B test.
 * Orders are recorded by /api/orders/create, never from the browser.
 *
 * Always answers 200 on a storage problem: a lost analytics row must never
 * surface as an error on a shopper's page.
 */

export const runtime = 'nodejs';

const CLIENT_EVENTS = new Set(['view', 'cta_click']);
const clean = (value, limit) => String(value ?? '').trim().slice(0, limit);

export async function POST(request) {
  const origin = request.headers.get('origin') || '';
  if (origin && !isAllowedAnalyticsOrigin(origin)) {
    return NextResponse.json({ error: 'origin_not_allowed' }, { status: 403 });
  }

  const forwarded = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '';
  const ip = forwarded.split(',')[0].trim() || 'unknown';
  if (!rateLimit(`deal-page-ab:${ip}`, 60)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const variant = normalizeVariant(body?.variant);
  const event = clean(body?.event, 20);
  const visitorId = clean(body?.visitorId, 100);
  if (!variant || !CLIENT_EVENTS.has(event) || !visitorId) {
    return NextResponse.json({ error: 'variant_event_and_visitor_required' }, { status: 400 });
  }

  try {
    const { error } = await getSupabaseAdmin().from('ab_test_events').insert({
      experiment: DEAL_PAGE_EXPERIMENT,
      variant,
      event,
      visitor_id: visitorId,
      session_id: clean(body?.sessionId, 100) || null,
      deal_id: clean(body?.dealId, 80) || null,
      lang: body?.lang === 'en' ? 'en' : 'es',
    });
    if (error) {
      console.warn('[deal-page/ab-event] not saved:', error.message);
      return NextResponse.json({ saved: false });
    }
    return NextResponse.json({ saved: true });
  } catch (error) {
    console.warn('[deal-page/ab-event] not saved:', error.message);
    return NextResponse.json({ saved: false });
  }
}
