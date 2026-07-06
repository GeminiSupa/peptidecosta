import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

const DAY = 24 * 60 * 60 * 1000;

function emailKey(value) {
  const email = String(value || '').trim().toLowerCase();
  return email.includes('@') ? `email:${email}` : null;
}

function phoneKey(value) {
  const phone = String(value || '').replace(/\D/g, '');
  return phone.length >= 8 ? `phone:${phone}` : null;
}

function contactKeys(email, phone) {
  return [emailKey(email), phoneKey(phone)].filter(Boolean);
}

function daysSince(value, now) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((now - date.getTime()) / DAY));
}

function engagementDate(row) {
  return row?.created_at || row?.clicked_at || row?.opened_at || row?.event_at || row?.timestamp || null;
}

async function safeRows(label, query, warnings) {
  const { data, error } = await query;
  if (error) {
    console.warn(`[Marketing Intelligence] ${label}:`, error.message);
    warnings.push(`${label} unavailable`);
    return [];
  }
  return data || [];
}

export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  const supabase = getSupabaseAdmin();
  const warnings = [];

  try {
    const [subscribers, orders, carts, catalogLeads, productViews, clicks, opens] = await Promise.all([
      safeRows('subscribers', supabase.from('email_subscribers').select('id,email,first_name,last_name,source,created_at').limit(5000), warnings),
      safeRows('orders', supabase.from('orders').select('customer_email,customer_phone,customer_name,total_usd,created_at,status').order('created_at', { ascending: false }).limit(5000), warnings),
      safeRows('carts', supabase.from('abandoned_carts').select('customer_email,customer_phone,customer_name,status,created_at,last_updated').order('created_at', { ascending: false }).limit(2500), warnings),
      safeRows('catalog leads', supabase.from('catalog_leads').select('contact_method,contact_value,created_at').order('created_at', { ascending: false }).limit(2500), warnings),
      safeRows('product views', supabase.from('product_views').select('contact_value,product_name,created_at').not('contact_value', 'is', null).order('created_at', { ascending: false }).limit(3000), warnings),
      // These legacy tables do not consistently expose `created_at`. Avoid an
      // invalid order clause and normalize whichever provider timestamp exists.
      safeRows('campaign clicks', supabase.from('campaign_clicks').select('*').limit(1000), warnings),
      safeRows('campaign opens', supabase.from('campaign_opens').select('*').limit(1000), warnings),
    ]);

    const contacts = new Map();
    const identities = new Map();

    function ensureContact({ email, phone, name, firstName, lastName, source, createdAt }) {
      const keys = contactKeys(email, phone);
      if (!keys.length) return null;

      let contact = keys.map(key => identities.get(key)).find(Boolean);
      if (!contact) {
        contact = {
          id: keys[0], email: null, phone: null, name: null,
          sources: new Set(), subscriberIds: new Set(),
          views: [], clicks: [], opens: [], orders: [], carts: [], leads: [],
          firstSeenAt: createdAt || null,
        };
        contacts.set(contact.id, contact);
      }

      keys.forEach(key => identities.set(key, contact));
      contact.email ||= email || null;
      contact.phone ||= phone || null;
      contact.name ||= name || [firstName, lastName].filter(Boolean).join(' ') || null;
      if (source) contact.sources.add(source);
      if (createdAt && (!contact.firstSeenAt || createdAt < contact.firstSeenAt)) contact.firstSeenAt = createdAt;
      return contact;
    }

    subscribers.forEach(subscriber => {
      const contact = ensureContact({
        email: subscriber.email,
        firstName: subscriber.first_name,
        lastName: subscriber.last_name,
        source: subscriber.source || 'subscriber',
        createdAt: subscriber.created_at,
      });
      if (contact) contact.subscriberIds.add(String(subscriber.id));
    });

    orders.forEach(order => {
      const contact = ensureContact({
        email: order.customer_email,
        phone: order.customer_phone,
        name: order.customer_name,
        source: 'customer',
        createdAt: order.created_at,
      });
      if (contact) contact.orders.push(order);
    });

    carts.forEach(cart => {
      const contact = ensureContact({
        email: cart.customer_email || cart.email,
        phone: cart.customer_phone || cart.phone,
        name: cart.customer_name || cart.name,
        source: 'cart',
        createdAt: cart.created_at || cart.last_updated,
      });
      if (contact) contact.carts.push(cart);
    });

    catalogLeads.forEach(lead => {
      const isEmail = String(lead.contact_method || '').toLowerCase() === 'email' || String(lead.contact_value || '').includes('@');
      const contact = ensureContact({
        email: isEmail ? lead.contact_value : null,
        phone: isEmail ? null : lead.contact_value,
        name: lead.name,
        source: 'catalog lead',
        createdAt: lead.created_at,
      });
      if (contact) contact.leads.push(lead);
    });

    productViews.forEach(view => {
      const value = view.contact_value;
      if (!value) return;
      const contact = identities.get(emailKey(value)) || identities.get(phoneKey(value));
      if (contact) contact.views.push(view);
    });

    const subscriberContacts = new Map();
    contacts.forEach(contact => contact.subscriberIds.forEach(id => subscriberContacts.set(id, contact)));
    clicks.forEach(click => subscriberContacts.get(String(click.subscriber_id))?.clicks.push(click));
    opens.forEach(open => subscriberContacts.get(String(open.subscriber_id))?.opens.push(open));

    const now = Date.now();
    const leads = [...contacts.values()].map(contact => {
      let score = 0;
      const reasons = [];
      const activeCarts = contact.carts.filter(cart => String(cart.status || 'active').toLowerCase() === 'active');
      const recentViews = contact.views.filter(view => (daysSince(view.created_at, now) ?? 999) <= 30);
      const recentClicks = contact.clicks.filter(click => (daysSince(engagementDate(click), now) ?? 999) <= 30);
      const recentOpens = contact.opens.filter(open => (daysSince(engagementDate(open), now) ?? 999) <= 30);
      const recentLeads = contact.leads.filter(lead => (daysSince(lead.created_at, now) ?? 999) <= 30);
      const latestOrder = contact.orders[0];
      const orderAge = daysSince(latestOrder?.created_at, now);
      const totalRevenue = contact.orders.reduce((sum, order) => sum + Number(order.total_usd || 0), 0);

      if (activeCarts.length) { score += 35; reasons.push('Active abandoned cart'); }
      if (recentViews.length) { score += Math.min(30, recentViews.length * 8); reasons.push(`${recentViews.length} recent product view${recentViews.length === 1 ? '' : 's'}`); }
      if (recentClicks.length) { score += Math.min(25, recentClicks.length * 10); reasons.push(`${recentClicks.length} recent email click${recentClicks.length === 1 ? '' : 's'}`); }
      if (recentOpens.length) { score += Math.min(10, recentOpens.length * 3); reasons.push('Recently opened email'); }
      if (recentLeads.length) { score += 20; reasons.push('Recent catalog lead'); }
      if (orderAge !== null && orderAge >= 30) { score += Math.min(30, 15 + Math.floor(orderAge / 30) * 5); reasons.push(`Reorder window: ${orderAge} days`); }
      else if (orderAge !== null && orderAge <= 30) { score += 10; reasons.push('Recent customer'); }

      score = Math.min(100, score);
      const segments = [];
      if (score >= 60) segments.push('hot');
      if (activeCarts.length) segments.push('abandoned_cart');
      if (recentClicks.length || recentViews.length >= 2) segments.push('engaged');
      if (orderAge !== null && orderAge >= 30) segments.push('reorder_due');
      if (!contact.orders.length && (recentLeads.length || activeCarts.length)) segments.push('new_prospect');

      const activityDates = [
        ...contact.views.map(row => row.created_at), ...contact.clicks.map(engagementDate),
        ...contact.opens.map(engagementDate), ...contact.orders.map(row => row.created_at),
        ...contact.carts.map(row => row.last_updated || row.created_at), ...contact.leads.map(row => row.created_at),
      ].filter(Boolean).sort().reverse();

      return {
        id: contact.id,
        name: contact.name || contact.email?.split('@')[0] || 'Unknown contact',
        email: contact.email,
        phone: contact.phone,
        score,
        temperature: score >= 60 ? 'hot' : score >= 30 ? 'warm' : 'cold',
        reasons: reasons.slice(0, 3),
        segments,
        sources: [...contact.sources],
        lastActivityAt: activityDates[0] || contact.firstSeenAt,
        orderCount: contact.orders.length,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        topProducts: [...new Set(recentViews.map(view => view.product_name).filter(Boolean))].slice(0, 3),
      };
    }).sort((a, b) => b.score - a.score || String(b.lastActivityAt || '').localeCompare(String(a.lastActivityAt || '')));

    const segmentDefinitions = [
      { id: 'hot', label: 'Hot leads', description: 'Intent score of 60 or higher' },
      { id: 'abandoned_cart', label: 'Active carts', description: 'Contacts with an unfinished cart' },
      { id: 'engaged', label: 'Recently engaged', description: 'Recent clicks or repeated product views' },
      { id: 'reorder_due', label: 'Reorder due', description: 'Customers whose last order was 30+ days ago' },
      { id: 'new_prospect', label: 'New prospects', description: 'New catalog leads or carts without an order' },
    ].map(segment => ({ ...segment, count: leads.filter(lead => lead.segments.includes(segment.id)).length }));

    return NextResponse.json({
      generatedAt: new Date(now).toISOString(),
      summary: {
        contacts: leads.length,
        hot: leads.filter(lead => lead.temperature === 'hot').length,
        warm: leads.filter(lead => lead.temperature === 'warm').length,
        revenueAtRisk: Math.round(leads.filter(lead => lead.segments.includes('reorder_due')).reduce((sum, lead) => sum + lead.totalRevenue, 0) * 100) / 100,
      },
      segments: segmentDefinitions,
      leads: leads.slice(0, 500),
      warnings: [...new Set(warnings)],
    });
  } catch (error) {
    console.error('[Marketing Intelligence] Failed:', error);
    return NextResponse.json({ error: 'Unable to build marketing intelligence' }, { status: 500 });
  }
}
