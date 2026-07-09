import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

const TRIGGERS = new Set(['new_subscriber', 'abandoned_cart', 'catalog_lead', 'reorder_due']);
const CHANNELS = new Set(['email', 'whatsapp']);
const CONDITIONS = new Set(['has_active_cart', 'email_engaged', 'no_order_since_enrollment']);

function validateJourney(body) {
  const name = String(body.name || '').trim();
  const trigger = body.trigger || {};
  const steps = Array.isArray(body.steps) ? body.steps : [];
  if (!name) return 'Journey name is required';
  if (!TRIGGERS.has(trigger.type)) return 'Unsupported journey trigger';
  if (!steps.length) return 'Add at least one journey step';
  if (steps.length > 12) return 'Journeys support up to 12 steps';
  for (const step of steps) {
    const delay = Number(step.delay_hours || 0);
    if (!Number.isFinite(delay) || delay < 0 || delay > 8760) return 'Step delay must be between 0 and 8760 hours';
    if (step.type === 'condition') {
      if (!CONDITIONS.has(step.condition)) return 'Every decision step needs a supported condition';
      if (!['continue', 'stop', 'skip_next'].includes(step.on_false)) return 'Choose what happens when a condition is false';
      continue;
    }
    if (!CHANNELS.has(step.channel)) return 'Every step needs a supported channel';
    if (!String(step.message || '').trim() && !String(step.html_content || '').trim()) return 'Every step needs a message';
    if (step.channel === 'email' && !String(step.subject || '').trim()) return 'Email steps need a subject';
  }
  return null;
}

function cleanJourney(body) {
  return {
    name: String(body.name).trim().slice(0, 120),
    description: String(body.description || '').trim().slice(0, 500) || null,
    trigger: {
      type: body.trigger.type,
      days: body.trigger.type === 'reorder_due' ? Math.max(1, Math.min(365, Number(body.trigger.days || 30))) : undefined,
    },
    steps: body.steps.map((step, index) => ({
      id: step.id || `step_${index + 1}`,
      type: step.type === 'condition' ? 'condition' : 'action',
      ...(step.type === 'condition' ? {
        condition: step.condition,
        on_false: step.on_false || 'stop',
      } : {
        channel: step.channel,
        subject: step.channel === 'email' ? String(step.subject || '').trim().slice(0, 180) : null,
        message: String(step.message || '').trim().slice(0, 5000),
        html_content: step.channel === 'email' && step.html_content ? String(step.html_content).slice(0, 300000) : null,
        template_campaign_id: step.template_campaign_id || null,
        template_campaign_title: step.template_campaign_title ? String(step.template_campaign_title).slice(0, 180) : null,
      }),
      delay_hours: Math.max(0, Number(step.delay_hours || 0)),
    })),
    updated_at: new Date().toISOString(),
  };
}

export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;
  const supabase = getSupabaseAdmin();

  try {
    const [
      { data: journeys, error },
      { data: enrollments, error: enrollmentError },
      { data: engagement, error: engagementError },
      { data: orders, error: orderError },
    ] = await Promise.all([
      supabase.from('marketing_journeys').select('*').order('created_at', { ascending: false }),
      supabase.from('marketing_journey_enrollments').select('id,journey_id,contact_key,status,enrolled_at'),
      supabase.from('journey_engagement_events').select('journey_id,event_type'),
      supabase.from('orders').select('journey_id,customer_email,customer_phone,total_usd,created_at,status').order('created_at', { ascending: false }).limit(5000),
    ]);
    if (error) throw error;
    if (enrollmentError) throw enrollmentError;
    if (engagementError) throw engagementError;
    if (orderError) throw orderError;

    const counts = new Map();
    for (const enrollment of enrollments || []) {
      const item = counts.get(enrollment.journey_id) || { total: 0, active: 0, completed: 0, stopped: 0, failed: 0 };
      item.total++;
      if (enrollment.status === 'active') item.active++;
      if (enrollment.status === 'completed') item.completed++;
      if (enrollment.status === 'stopped') item.stopped++;
      if (enrollment.status === 'failed') item.failed++;
      counts.set(enrollment.journey_id, item);
    }

    const analytics = new Map();
    const getAnalytics = journeyId => {
      const item = analytics.get(journeyId) || { opens: 0, clicks: 0, directOrders: 0, directRevenue: 0, assistedOrders: 0, assistedRevenue: 0 };
      analytics.set(journeyId, item);
      return item;
    };
    for (const item of engagement || []) {
      const stats = getAnalytics(item.journey_id);
      if (item.event_type === 'open') stats.opens++;
      if (item.event_type === 'click') stats.clicks++;
    }
    const enrollmentsByContact = new Map();
    for (const enrollment of enrollments || []) {
      const list = enrollmentsByContact.get(enrollment.contact_key) || [];
      list.push(enrollment);
      enrollmentsByContact.set(enrollment.contact_key, list);
    }
    for (const order of orders || []) {
      if (String(order.status || '').toLowerCase() === 'cancelled') continue;
      const revenue = Number(order.total_usd || 0);
      if (order.journey_id) {
        const stats = getAnalytics(order.journey_id);
        stats.directOrders++;
        stats.directRevenue += revenue;
        continue;
      }
      const emailKey = order.customer_email ? `email:${String(order.customer_email).trim().toLowerCase()}` : null;
      const phoneKey = order.customer_phone ? `phone:${String(order.customer_phone).replace(/\D/g, '')}` : null;
      const candidates = [...(enrollmentsByContact.get(emailKey) || []), ...(enrollmentsByContact.get(phoneKey) || [])]
        .filter(enrollment => {
          const delta = new Date(order.created_at) - new Date(enrollment.enrolled_at);
          return delta >= 0 && delta <= 7 * 86400000;
        })
        .sort((a, b) => new Date(b.enrolled_at) - new Date(a.enrolled_at));
      if (candidates[0]) {
        const stats = getAnalytics(candidates[0].journey_id);
        stats.assistedOrders++;
        stats.assistedRevenue += revenue;
      }
    }

    return NextResponse.json({
      journeys: (journeys || []).map(journey => ({
        ...journey,
        enrollmentStats: counts.get(journey.id) || { total: 0, active: 0, completed: 0, stopped: 0, failed: 0 },
        analytics: analytics.get(journey.id) || { opens: 0, clicks: 0, directOrders: 0, directRevenue: 0, assistedOrders: 0, assistedRevenue: 0 },
      })),
    });
  } catch (error) {
    const missingTable = error.code === '42P01';
    return NextResponse.json({
      error: missingTable ? 'Journey analytics tables are not installed. Run the journey and attribution migrations in Supabase.' : 'Unable to load journeys',
      setupRequired: missingTable,
    }, { status: missingTable ? 503 : 500 });
  }
}

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;
  const supabase = getSupabaseAdmin();

  try {
    const body = await request.json();
    const validationError = validateJourney(body);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    const { data, error } = await supabase.from('marketing_journeys').insert(cleanJourney(body)).select().single();
    if (error) throw error;
    return NextResponse.json({ journey: data }, { status: 201 });
  } catch (error) {
    console.error('[Journeys] Create failed:', error);
    return NextResponse.json({ error: error.code === '42P01' ? 'Run marketing-journeys-migration.sql first.' : 'Unable to create journey' }, { status: 500 });
  }
}

export async function PUT(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;
  const supabase = getSupabaseAdmin();

  try {
    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: 'Journey ID is required' }, { status: 400 });

    if (body.action === 'status') {
      if (!['active', 'paused', 'draft'].includes(body.status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      const update = { status: body.status, updated_at: new Date().toISOString() };
      if (body.status === 'active') update.activated_at = new Date().toISOString();
      const { data, error } = await supabase.from('marketing_journeys').update(update).eq('id', body.id).select().single();
      if (error) throw error;
      return NextResponse.json({ journey: data });
    }

    const validationError = validateJourney(body);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    const { data: existing, error: lookupError } = await supabase.from('marketing_journeys').select('status').eq('id', body.id).single();
    if (lookupError) throw lookupError;
    if (existing.status === 'active') {
      return NextResponse.json({ error: 'Pause this journey before editing its trigger or steps.' }, { status: 409 });
    }
    const { data, error } = await supabase.from('marketing_journeys').update(cleanJourney(body)).eq('id', body.id).select().single();
    if (error) throw error;
    return NextResponse.json({ journey: data });
  } catch (error) {
    console.error('[Journeys] Update failed:', error);
    return NextResponse.json({ error: 'Unable to update journey' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Journey ID is required' }, { status: 400 });
  const { error } = await getSupabaseAdmin().from('marketing_journeys').delete().eq('id', id);
  if (error) return NextResponse.json({ error: 'Unable to delete journey' }, { status: 500 });
  return NextResponse.json({ success: true });
}
