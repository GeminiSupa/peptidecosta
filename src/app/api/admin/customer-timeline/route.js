import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

const digits = value => String(value || '').replace(/\D/g, '');
const lower = value => String(value || '').trim().toLowerCase();

async function safeRows(label, promise, warnings) {
  const { data, error } = await promise;
  if (error) {
    warnings.push(`${label} unavailable`);
    return [];
  }
  return data || [];
}

function matchesContact(row, email, phone) {
  const emails = [row.email, row.customer_email, row.contact_value].map(lower).filter(value => value.includes('@'));
  const phones = [row.phone, row.customer_phone, row.contact_value].map(digits).filter(value => value.length >= 8);
  return Boolean((email && emails.includes(email)) || (phone && phones.includes(phone)));
}

function event(type, date, title, description, metadata = {}) {
  return { type, date, title, description, metadata };
}

export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const email = lower(url.searchParams.get('email'));
  const phone = digits(url.searchParams.get('phone'));
  if (!email && !phone) return NextResponse.json({ error: 'Email or phone is required' }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const warnings = [];
  try {
    const [subscribers, ordersRaw, cartsRaw, leadsRaw, viewsRaw, enrollmentsRaw, deliveriesRaw, suppressionsRaw] = await Promise.all([
      email ? safeRows('subscribers', supabase.from('email_subscribers').select('*').eq('email', email).limit(10), warnings) : [],
      safeRows('orders', supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(5000), warnings),
      safeRows('carts', supabase.from('abandoned_carts').select('*').order('created_at', { ascending: false }).limit(3000), warnings),
      safeRows('catalog leads', supabase.from('catalog_leads').select('*').order('created_at', { ascending: false }).limit(3000), warnings),
      safeRows('product views', supabase.from('product_views').select('*').order('created_at', { ascending: false }).limit(5000), warnings),
      safeRows('journeys', supabase.from('marketing_journey_enrollments').select('*,marketing_journeys(name,status)').order('enrolled_at', { ascending: false }).limit(3000), warnings),
      safeRows('deliveries', supabase.from('marketing_delivery_events').select('*').order('last_attempt_at', { ascending: false }).limit(5000), warnings),
      safeRows('suppressions', supabase.from('marketing_suppressions').select('*').eq('active', true).limit(3000), warnings),
    ]);

    const orders = ordersRaw.filter(row => matchesContact(row, email, phone));
    const carts = cartsRaw.filter(row => matchesContact(row, email, phone));
    const leads = leadsRaw.filter(row => matchesContact(row, email, phone));
    const views = viewsRaw.filter(row => matchesContact(row, email, phone));
    const contactKeys = new Set([email, phone].filter(Boolean));
    const enrollments = enrollmentsRaw.filter(row => contactKeys.has(String(row.contact_key || '').replace(/^(email:|phone:)/, '')));
    const deliveries = deliveriesRaw.filter(row => contactKeys.has(String(row.contact_key || '')));
    const suppressions = suppressionsRaw.filter(row => contactKeys.has(row.channel === 'email' ? lower(row.identity) : digits(row.identity)));

    const subscriberIds = subscribers.map(row => row.id);
    const [clicks, opens] = await Promise.all([
      subscriberIds.length ? safeRows('campaign clicks', supabase.from('campaign_clicks').select('*, at:clicked_at').in('subscriber_id', subscriberIds).order('clicked_at', { ascending: false }).limit(1000), warnings) : [],
      subscriberIds.length ? safeRows('campaign opens', supabase.from('campaign_opens').select('*, at:opened_at').in('subscriber_id', subscriberIds).order('opened_at', { ascending: false }).limit(1000), warnings) : [],
    ]);

    const timeline = [
      ...orders.map(row => event('order', row.created_at, `Order ${String(row.status || 'placed').toLowerCase()}`, `${Number(row.total_usd || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} · ${(row.items || []).length || 0} item(s)`, { id: row.id, status: row.status })),
      ...carts.map(row => event('cart', row.last_updated || row.created_at, row.status === 'active' ? 'Cart left unfinished' : 'Cart updated', `${(row.cart_data || row.items || []).length || 0} item(s)`, { id: row.id, status: row.status })),
      ...views.map(row => event('view', row.created_at, 'Product viewed', row.product_name || row.product_id || 'Catalog product')),
      ...leads.map(row => event('lead', row.created_at, 'Catalog lead captured', row.contact_method || 'catalog')),
      ...clicks.map(row => event('click', row.at, 'Email link clicked', row.target_url || 'Campaign link', { campaignId: row.campaign_id })),
      ...opens.map(row => event('open', row.at, 'Email opened', 'Campaign engagement', { campaignId: row.campaign_id })),
      ...enrollments.map(row => event('journey', row.enrolled_at, `Entered ${row.marketing_journeys?.name || 'journey'}`, `${row.status} · step ${Number(row.current_step || 0) + 1}`, { status: row.status })),
      ...deliveries.map(row => event('delivery', row.last_attempt_at, `${row.channel} ${row.status}`, row.error || `Attempt ${row.attempt_count}`, { status: row.status, channel: row.channel })),
      ...suppressions.map(row => event('suppression', row.updated_at || row.created_at, `${row.channel} marketing blocked`, row.reason.replaceAll('_', ' '), { reason: row.reason })),
      ...subscribers.map(row => event('subscriber', row.created_at, 'Joined email audience', row.source || 'subscriber')),
    ].filter(item => item.date).sort((a, b) => new Date(b.date) - new Date(a.date));

    const latestOrder = orders[0];
    const profileName = latestOrder?.customer_name || carts.find(row => row.customer_name || row.name)?.customer_name || carts.find(row => row.name)?.name || [subscribers[0]?.first_name, subscribers[0]?.last_name].filter(Boolean).join(' ') || email.split('@')[0] || 'Customer';
    const products = [...new Set(views.map(row => row.product_name).filter(Boolean))].slice(0, 8);
    const totalRevenue = orders.reduce((sum, row) => sum + Number(row.total_usd || 0), 0);

    return NextResponse.json({
      profile: {
        name: profileName,
        email: email || latestOrder?.customer_email || null,
        phone: phone || latestOrder?.customer_phone || null,
        subscriberStatus: subscribers[0]?.status || 'unknown',
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        orderCount: orders.length,
        activeCarts: carts.filter(row => row.status === 'active').length,
        productInterests: products,
        activeJourneys: enrollments.filter(row => row.status === 'active').length,
        suppressions: suppressions.map(row => ({ channel: row.channel, reason: row.reason })),
      },
      timeline: timeline.slice(0, 250),
      warnings: [...new Set(warnings)],
    });
  } catch (error) {
    console.error('[Customer Timeline]', error);
    return NextResponse.json({ error: 'Unable to build customer timeline' }, { status: 500 });
  }
}
