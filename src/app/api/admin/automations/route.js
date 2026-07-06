import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';


export const dynamic = 'force-dynamic';

const FLOW_CATALOG = [
  {
    id: 'welcome_leads',
    name: 'Welcome New Leads',
    audience: 'leads_7_days',
    channel: 'email',
    subject: 'Welcome to Costa Peptides',
    message: `Welcome to Costa Peptides.

Thanks for checking out our catalog. If you need help choosing products, shipping options, or bulk pricing, reply here and our team will help.

View the catalog anytime:
https://catalog.peptidescostarica.net/catalog`
  },
  {
    id: 'abandoned_cart',
    name: 'Abandoned Cart Recovery',
    audience: 'abandoned_carts',
    channel: 'email',
    subject: 'Still need help with your Costa Peptides order?',
    message: `Hi,

Looks like you started an order but did not finish checkout. If you had a question about availability, payment, or delivery inside Costa Rica, our team can help.

You can return to the catalog here:
https://catalog.peptidescostarica.net/catalog`
  },
  {
    id: 'reorder_30_day',
    name: '30-Day Reorder Reminder',
    audience: 'all_customers',
    channel: 'email',
    subject: 'Time to restock?',
    message: `Hi,

It may be time to restock your research supplies. Costa Peptides offers fast local delivery, bulk pricing, and direct support if you need help planning your next order.

Browse the catalog:
https://catalog.peptidescostarica.net/catalog`
  },
  {
    id: 'winback_60_day',
    name: '60-Day Win-Back',
    audience: 'all_customers',
    channel: 'email',
    subject: 'Need anything from Costa Peptides?',
    message: `Hi,

We have not seen you in a while. If you need updated availability, pricing, or product guidance, reply to this email and we will help.

Catalog:
https://catalog.peptidescostarica.net/catalog`
  }
];

function dateDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

async function countRows(query) {
  const { count, error } = await query;
  if (error) {
    console.warn('[Automations] Count failed:', error.message);
    return 0;
  }
  return count || 0;
}

async function buildSummary(supabaseAdmin) {
  const sevenDaysAgo = dateDaysAgo(7);
  const thirtyDaysAgo = dateDaysAgo(30);
  const sixtyDaysAgo = dateDaysAgo(60);

  const [
    subscribers,
    newSubscribers,
    activeCarts,
    newCatalogLeads,
    reorderReady,
    winbackReady,
    scheduled,
    pendingBroadcasts
  ] = await Promise.all([
    countRows(supabaseAdmin.from('email_subscribers').select('id', { count: 'exact', head: true }).eq('status', 'subscribed')),
    countRows(supabaseAdmin.from('email_subscribers').select('id', { count: 'exact', head: true }).eq('status', 'subscribed').gte('created_at', sevenDaysAgo)),
    countRows(supabaseAdmin.from('abandoned_carts').select('id', { count: 'exact', head: true }).eq('status', 'active')),
    countRows(supabaseAdmin.from('catalog_leads').select('id', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo)),
    countRows(supabaseAdmin.from('orders').select('id', { count: 'exact', head: true }).not('customer_email', 'is', null).is('reorder_reminded_at', null).lte('created_at', thirtyDaysAgo).neq('status', 'Cancelled')),
    countRows(supabaseAdmin.from('orders').select('id', { count: 'exact', head: true }).not('customer_email', 'is', null).lte('created_at', sixtyDaysAgo).neq('status', 'Cancelled')),
    countRows(supabaseAdmin.from('scheduled_broadcasts').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
    supabaseAdmin.from('scheduled_broadcasts').select('*').order('scheduled_at', { ascending: true }).limit(8)
  ]);

  const opportunityMap = {
    welcome_leads: newSubscribers + newCatalogLeads,
    abandoned_cart: activeCarts,
    reorder_30_day: reorderReady,
    winback_60_day: winbackReady
  };

  const flows = FLOW_CATALOG.map(flow => ({
    ...flow,
    opportunities: opportunityMap[flow.id] || 0,
    status: opportunityMap[flow.id] > 0 ? 'ready' : 'watching'
  }));

  return {
    totals: {
      subscribers,
      newSubscribers,
      activeCarts,
      newCatalogLeads,
      reorderReady,
      winbackReady,
      scheduled
    },
    flows,
    scheduledBroadcasts: pendingBroadcasts.data || []
  };
}

export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const summary = await buildSummary(supabaseAdmin);
    return NextResponse.json(summary);
  } catch (err) {
    console.error('[Automations] Summary error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const { flowId } = await request.json();
    const flow = FLOW_CATALOG.find(item => item.id === flowId);

    if (!flow) {
      return NextResponse.json({ error: 'Unknown automation flow' }, { status: 400 });
    }

    const channels = flow.channel === 'email'
      ? { email: true, whatsapp: false, emailSubject: flow.subject }
      : { email: false, whatsapp: true };

    // Derive the internal broadcast URL from the incoming request host
    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const broadcastUrl = `${protocol}://${host}/api/admin/broadcast`;

    // Trigger the broadcast immediately — no scheduledAt so it sends right away
    const broadcastRes = await fetch(broadcastUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: request.headers.get('cookie') || '',
        authorization: request.headers.get('authorization') || '',
      },
      body: JSON.stringify({
        audience: flow.audience,
        channels,
        message: flow.message,
      }),
    });

    const broadcastData = await broadcastRes.json();

    if (!broadcastRes.ok || broadcastData.error) {
      throw new Error(broadcastData.error || 'Broadcast failed');
    }

    return NextResponse.json({
      success: true,
      queuedCount: broadcastData.queuedCount ?? 0,
      text: broadcastData.text || 'Automation triggered successfully.',
    });
  } catch (err) {
    console.error('[Automations] Schedule error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
