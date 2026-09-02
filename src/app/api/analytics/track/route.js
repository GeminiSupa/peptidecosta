import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { writeDroppingMissingColumns } from '@/lib/optionalColumns.mjs';
import { rateLimit } from '@/lib/rateLimit.mjs';
import { allowedAnalyticsCorsOrigin, isAllowedAnalyticsOrigin } from '@/lib/analyticsOrigins.mjs';

export const runtime = 'nodejs';

const clean = (value, limit = 300) => String(value ?? '').trim().slice(0, limit);
const cleanPath = (value) => {
  const path = clean(value, 600);
  return path.startsWith('/') ? path : '/';
};
const cleanEmail = (value) => clean(value, 200).toLowerCase();
const cleanPhone = (value) => clean(value, 40).replace(/\D/g, '');

function corsHeaders(origin) {
  const allowed = allowedAnalyticsCorsOrigin(origin);
  return {
    ...(allowed ? { 'Access-Control-Allow-Origin': allowed } : {}),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function sourceLabel({ utmSource, referrer, hostname }) {
  if (utmSource) return utmSource;
  if (referrer) {
    try {
      const refHost = new URL(referrer).hostname.replace(/^www\./, '');
      if (refHost && refHost !== hostname.replace(/^www\./, '')) return refHost;
    } catch {}
  }
  return 'direct';
}

async function getCustomerIdentity(supabase, email, phone) {
  if (email) {
    const { data, error } = await supabase
      .from('orders')
      .select('id, customer_name')
      .ilike('customer_email', email)
      .limit(1);
    if (!error && data?.length) return { known: true, name: data[0].customer_name };
  }
  const tail = phone && phone.length >= 8 ? phone.slice(-8) : '';
  if (tail) {
    const { data, error } = await supabase
      .from('orders')
      .select('id, customer_name')
      .ilike('customer_phone', `%${tail}%`)
      .limit(1);
    if (!error && data?.length) return { known: true, name: data[0].customer_name };
  }
  return { known: false, name: null };
}

export function OPTIONS(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('origin') || '') });
}

export async function POST(request) {
  const origin = request.headers.get('origin') || '';
  const headers = corsHeaders(origin);
  if (origin && !isAllowedAnalyticsOrigin(origin)) {
    return NextResponse.json({ error: 'origin_not_allowed' }, { status: 403, headers });
  }

  try {
    const forwarded = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '';
    const ip = forwarded.split(',')[0].trim() || 'unknown';
    if (!rateLimit(`analytics:${ip}`, 240)) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers });
    }

    const body = await request.json();
    const visitorId = clean(body.visitorId, 100);
    const sessionId = clean(body.sessionId, 100);
    const eventType = clean(body.eventType, 50).toLowerCase() || 'page_view';
    if (!visitorId || !sessionId) {
      return NextResponse.json({ error: 'visitor_and_session_required' }, { status: 400, headers });
    }

    const hostname = clean(body.hostname, 160).toLowerCase();
    const path = cleanPath(body.path);
    const referrer = clean(body.referrer, 800);
    const utmSource = clean(body.utmSource, 120).toLowerCase();
    const utmMedium = clean(body.utmMedium, 120).toLowerCase();
    const utmCampaign = clean(body.utmCampaign, 180);
    const gclid = clean(body.gclid, 240);
    const fbclid = clean(body.fbclid, 240);
    const email = cleanEmail(body.contact?.email);
    const phone = cleanPhone(body.contact?.phone);
    const supabase = getSupabaseAdmin();

    const { data: previous } = await supabase
      .from('visitor_sessions')
      .select('known_customer, customer_name, first_touch_source, created_at, city, region, country')
      .eq('session_id', sessionId)
      .maybeSingle();
    const identity = await getCustomerIdentity(supabase, email, phone);
    const knownCustomer = Boolean(previous?.known_customer) || identity.known;
    const customerName = previous?.customer_name || identity.name || null;
    const source = sourceLabel({ utmSource, referrer, hostname });
    const location = body.location && typeof body.location === 'object' ? body.location : {};
    const now = new Date().toISOString();
    const startedAt = previous?.created_at || now;
    const sessionDuration = Math.max(0, Math.floor((new Date(now).getTime() - new Date(startedAt).getTime()) / 1000));
    const sessionRow = {
      session_id: sessionId,
      visitor_id: visitorId,
      hostname,
      current_path: path,
      page_title: clean(body.pageTitle, 240),
      referrer,
      utm_source: utmSource || null,
      utm_medium: utmMedium || null,
      utm_campaign: utmCampaign || null,
      gclid: gclid || null,
      fbclid: fbclid || null,
      first_touch_source: previous?.first_touch_source || source,
      last_touch_source: source,
      known_customer: knownCustomer,
      customer_name: customerName,
      cart_items: Math.max(0, Math.min(999, Number(body.cartItems) || 0)),
      ip_address: ip,
      city: clean(location.city, 120) || previous?.city || 'Unknown',
      region: clean(location.region, 120) || previous?.region || 'Unknown',
      country: clean(location.country, 120) || previous?.country || 'Unknown',
      device_info: clean(request.headers.get('user-agent'), 800),
      catalog_duration: sessionDuration,
      last_active: now,
      created_at: startedAt,
    };

    const optionalSessionColumns = [
      'visitor_id', 'hostname', 'current_path', 'page_title', 'referrer',
      'utm_source', 'utm_medium', 'utm_campaign', 'gclid', 'fbclid',
      'first_touch_source', 'last_touch_source', 'known_customer', 'customer_name', 'cart_items',
    ];
    const { error: sessionError } = await writeDroppingMissingColumns(
      sessionRow,
      optionalSessionColumns,
      (row) => supabase.from('visitor_sessions').upsert(row, { onConflict: 'session_id' })
    );
    if (sessionError) throw sessionError;

    if (eventType !== 'heartbeat') {
      const ipHash = createHash('sha256')
        .update(`${process.env.SUPABASE_SERVICE_ROLE_KEY || 'analytics'}:${ip}`)
        .digest('hex');
      const metadata = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
        ? JSON.parse(JSON.stringify(body.metadata).slice(0, 4000))
        : {};
      const { error: eventError } = await supabase.from('analytics_events').insert({
        visitor_id: visitorId,
        session_id: sessionId,
        event_type: eventType,
        hostname,
        path,
        page_title: clean(body.pageTitle, 240),
        referrer,
        utm_source: utmSource || null,
        utm_medium: utmMedium || null,
        utm_campaign: utmCampaign || null,
        gclid: gclid || null,
        fbclid: fbclid || null,
        known_customer: knownCustomer,
        ip_hash: ipHash,
        metadata,
      });
      if (eventError && !/analytics_events|schema cache|does not exist/i.test(eventError.message || '')) {
        throw eventError;
      }
    }

    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    console.error('[analytics/track]', error.message);
    return NextResponse.json({ error: 'analytics_write_failed' }, { status: 500, headers });
  }
}
