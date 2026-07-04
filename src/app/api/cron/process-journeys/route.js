import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function contactKey(email, phone) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (cleanEmail.includes('@')) return `email:${cleanEmail}`;
  const cleanPhone = String(phone || '').replace(/\D/g, '');
  return cleanPhone.length >= 8 ? `phone:${cleanPhone}` : null;
}

function personalize(value, contact) {
  const firstName = contact.first_name || contact.name?.split(' ')[0] || 'there';
  return String(value || '').replace(/\[FIRST_NAME\]/g, firstName).replace(/\[NAME\]/g, contact.name || firstName);
}

function toContact(row, type) {
  if (type === 'new_subscriber') return { email: row.email, first_name: row.first_name, last_name: row.last_name, name: [row.first_name, row.last_name].filter(Boolean).join(' ') };
  if (type === 'catalog_lead') {
    const isEmail = row.contact_method === 'email' || String(row.contact_value || '').includes('@');
    return { email: isEmail ? row.contact_value : null, phone: isEmail ? null : row.contact_value, name: row.name || null };
  }
  return {
    email: row.customer_email || row.email,
    phone: row.customer_phone || row.phone,
    name: row.customer_name || row.name,
  };
}

async function triggerRows(supabase, journey) {
  const type = journey.trigger?.type;
  const activatedAt = journey.activated_at || journey.created_at;
  if (type === 'new_subscriber') {
    return supabase.from('email_subscribers').select('*').eq('status', 'subscribed').gte('created_at', activatedAt).limit(1000);
  }
  if (type === 'abandoned_cart') {
    return supabase.from('abandoned_carts').select('*').eq('status', 'active').gte('created_at', activatedAt).limit(1000);
  }
  if (type === 'catalog_lead') {
    return supabase.from('catalog_leads').select('*').gte('created_at', activatedAt).limit(1000);
  }
  if (type === 'reorder_due') {
    const cutoff = new Date(Date.now() - Number(journey.trigger?.days || 30) * 86400000).toISOString();
    return supabase.from('orders').select('*').lte('created_at', cutoff).order('created_at', { ascending: false }).limit(2000);
  }
  return { data: [], error: null };
}

async function enrollContacts(supabase, journeys) {
  let enrolled = 0;
  const warnings = [];

  for (const journey of journeys) {
    const { data: rows, error } = await triggerRows(supabase, journey);
    if (error) {
      warnings.push(`${journey.name}: ${error.message}`);
      continue;
    }

    const seen = new Set();
    const payload = [];
    for (const row of rows || []) {
      if (String(row.status || '').toLowerCase() === 'cancelled') continue;
      const contact = toContact(row, journey.trigger?.type);
      const key = contactKey(contact.email, contact.phone);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const firstDelay = Number(journey.steps?.[0]?.delay_hours || 0);
      payload.push({
        journey_id: journey.id,
        contact_key: key,
        contact,
        current_step: 0,
        status: 'active',
        next_run_at: new Date(Date.now() + firstDelay * 3600000).toISOString(),
      });
    }

    if (!payload.length) continue;
    const { data, error: insertError } = await supabase
      .from('marketing_journey_enrollments')
      .upsert(payload, { onConflict: 'journey_id,contact_key', ignoreDuplicates: true })
      .select('id');
    if (insertError) warnings.push(`${journey.name}: ${insertError.message}`);
    else enrolled += data?.length || 0;
  }
  return { enrolled, warnings };
}

async function stopReachedGoals(supabase, enrollments) {
  if (!enrollments.length) return new Set();
  const oldestEnrollment = enrollments.reduce((oldest, item) => item.enrolled_at < oldest ? item.enrolled_at : oldest, enrollments[0].enrolled_at);
  const [{ data: orders }, { data: suppressions }, { data: replies }] = await Promise.all([
    supabase.from('orders').select('customer_email,customer_phone,created_at,status').gte('created_at', oldestEnrollment).limit(5000),
    supabase.from('marketing_suppressions').select('identity,channel').eq('active', true).limit(5000),
    supabase.from('whatsapp_messages').select('wa_id,created_at,direction').eq('direction', 'inbound').gte('created_at', oldestEnrollment).limit(5000),
  ]);
  const latestOrder = new Map();
  for (const order of orders || []) {
    if (String(order.status || '').toLowerCase() === 'cancelled') continue;
    const key = contactKey(order.customer_email, order.customer_phone);
    if (key && (!latestOrder.has(key) || order.created_at > latestOrder.get(key))) latestOrder.set(key, order.created_at);
  }

  const suppressedKeys = new Set((suppressions || []).map(item => `${item.channel === 'email' ? 'email' : 'phone'}:${item.channel === 'email' ? String(item.identity).toLowerCase() : String(item.identity).replace(/\D/g, '')}`));
  const latestReply = new Map();
  for (const reply of replies || []) {
    const key = `phone:${String(reply.wa_id || '').replace(/\D/g, '')}`;
    if (!latestReply.has(key) || reply.created_at > latestReply.get(key)) latestReply.set(key, reply.created_at);
  }

  const stopped = new Set();
  const stopReasons = new Map();
  for (const enrollment of enrollments) {
    const convertedAt = latestOrder.get(enrollment.contact_key);
    const repliedAt = latestReply.get(enrollment.contact_key);
    const rawIdentity = enrollment.contact_key.replace(/^(email:|phone:)/, '');
    const allSuppressed = (suppressions || []).some(item => item.channel === 'all' && String(item.identity).replace(/\D/g, '') === rawIdentity)
      || (suppressions || []).some(item => item.channel === 'all' && String(item.identity).toLowerCase() === rawIdentity);
    if (convertedAt && convertedAt > enrollment.enrolled_at) stopReasons.set(enrollment.id, 'Goal reached: customer purchased');
    else if (repliedAt && repliedAt > enrollment.enrolled_at) stopReasons.set(enrollment.id, 'Goal reached: customer replied');
    else if (suppressedKeys.has(enrollment.contact_key) || allSuppressed) stopReasons.set(enrollment.id, 'Stopped: marketing suppressed');
  }
  for (const [id, reason] of stopReasons) {
    stopped.add(id);
    await supabase.from('marketing_journey_enrollments').update({ status: 'stopped', last_error: reason, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id);
  }
  return stopped;
}

async function evaluateCondition(supabase, condition, enrollment) {
  const contact = enrollment.contact || {};
  if (condition === 'has_active_cart') {
    const { data } = await supabase.from('abandoned_carts').select('*').eq('status', 'active').limit(3000);
    return (data || []).some(row => contactKey(row.customer_email || row.email, row.customer_phone || row.phone) === enrollment.contact_key);
  }
  if (condition === 'no_order_since_enrollment') {
    const { data } = await supabase.from('orders').select('customer_email,customer_phone,status,created_at').gte('created_at', enrollment.enrolled_at).limit(3000);
    return !(data || []).some(row => String(row.status || '').toLowerCase() !== 'cancelled' && contactKey(row.customer_email, row.customer_phone) === enrollment.contact_key);
  }
  if (condition === 'replied_whatsapp') {
    if (!contact.phone) return false;
    const { count } = await supabase.from('whatsapp_messages').select('id', { count: 'exact', head: true }).eq('wa_id', String(contact.phone).replace(/\D/g, '')).eq('direction', 'inbound').gte('created_at', enrollment.enrolled_at);
    return Number(count || 0) > 0;
  }
  if (condition === 'email_engaged') {
    const { count: journeyEvents } = await supabase.from('journey_engagement_events').select('id', { count: 'exact', head: true }).eq('enrollment_id', enrollment.id).gte('created_at', enrollment.enrolled_at);
    if (Number(journeyEvents || 0) > 0) return true;
    if (!contact.email) return false;
    const { data: subscriber } = await supabase.from('email_subscribers').select('id').eq('email', String(contact.email).toLowerCase()).maybeSingle();
    if (!subscriber) return false;
    const [{ count: clicks }, { count: opens }] = await Promise.all([
      supabase.from('campaign_clicks').select('id', { count: 'exact', head: true }).eq('subscriber_id', subscriber.id).gte('created_at', enrollment.enrolled_at),
      supabase.from('campaign_opens').select('id', { count: 'exact', head: true }).eq('subscriber_id', subscriber.id).gte('created_at', enrollment.enrolled_at),
    ]);
    return Number(clicks || 0) + Number(opens || 0) > 0;
  }
  return true;
}

async function advanceEnrollment(supabase, enrollment, journey, nextIndex, now, reason = null) {
  const nextStep = journey.steps?.[nextIndex];
  const update = nextStep
    ? { current_step: nextIndex, next_run_at: new Date(Date.now() + Number(nextStep.delay_hours || 0) * 3600000).toISOString(), last_error: reason, updated_at: now }
    : { current_step: nextIndex, status: 'completed', completed_at: now, next_run_at: null, last_error: reason, updated_at: now };
  await supabase.from('marketing_journey_enrollments').update(update).eq('id', enrollment.id);
  return !nextStep;
}

async function processDueSteps(supabase, journeyMap) {
  const now = new Date().toISOString();
  const { data: enrollments, error } = await supabase
    .from('marketing_journey_enrollments')
    .select('*')
    .eq('status', 'active')
    .lte('next_run_at', now)
    .order('next_run_at', { ascending: true })
    .limit(100);
  if (error) throw error;

  const activeEnrollments = (enrollments || []).filter(item => journeyMap.has(item.journey_id));
  const stopped = await stopReachedGoals(supabase, activeEnrollments);
  let queued = 0;
  let completed = 0;

  for (const enrollment of activeEnrollments) {
    if (stopped.has(enrollment.id)) continue;
    const journey = journeyMap.get(enrollment.journey_id);
    const step = journey.steps?.[enrollment.current_step];
    if (!step) {
      await supabase.from('marketing_journey_enrollments').update({ status: 'completed', completed_at: now, updated_at: now }).eq('id', enrollment.id);
      completed++;
      continue;
    }

    if (step.type === 'condition') {
      const matched = await evaluateCondition(supabase, step.condition, enrollment);
      if (!matched && step.on_false === 'stop') {
        await supabase.from('marketing_journey_enrollments').update({ status: 'stopped', last_error: `Decision not met: ${step.condition}`, completed_at: now, updated_at: now }).eq('id', enrollment.id);
        stopped.add(enrollment.id);
        continue;
      }
      const nextIndex = enrollment.current_step + (!matched && step.on_false === 'skip_next' ? 2 : 1);
      if (await advanceEnrollment(supabase, enrollment, journey, nextIndex, now, matched ? null : `Skipped after decision: ${step.condition}`)) completed++;
      continue;
    }

    const contact = enrollment.contact || {};
    const destination = [contact.phone, contact.email].filter(Boolean).join('|');
    const hasChannel = step.channel === 'email' ? Boolean(contact.email) : Boolean(contact.phone);
    if (!destination || !hasChannel) {
      await supabase.from('marketing_journey_enrollments').update({ status: 'failed', last_error: `Contact has no ${step.channel}`, updated_at: now }).eq('id', enrollment.id);
      continue;
    }

    const channels = step.channel === 'email'
      ? { email: true, whatsapp: false, emailSubject: personalize(step.subject, contact) }
      : { email: false, whatsapp: true };
    const { error: queueError } = await supabase.from('scheduled_broadcasts').insert({
      audience: 'custom',
      custom_contacts: destination,
      channels,
      message: personalize(step.message, contact),
      scheduled_at: now,
      status: 'pending',
      journey_id: journey.id,
      journey_enrollment_id: enrollment.id,
      journey_step_id: step.id || `step_${enrollment.current_step + 1}`,
    });

    if (queueError) {
      await supabase.from('marketing_journey_enrollments').update({ last_error: queueError.message, updated_at: now }).eq('id', enrollment.id);
      continue;
    }

    const finished = await advanceEnrollment(supabase, enrollment, journey, enrollment.current_step + 1, now);
    queued++;
    if (finished) completed++;
  }

  return { queued, completed, stopped: stopped.size };
}

export async function GET(request) {
  if (process.env.CRON_SECRET && request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  try {
    const { data: journeys, error } = await supabase.from('marketing_journeys').select('*').eq('status', 'active');
    if (error) throw error;
    if (!journeys?.length) return NextResponse.json({ success: true, message: 'No active journeys', enrolled: 0, queued: 0 });

    const enrollmentResult = await enrollContacts(supabase, journeys);
    const processingResult = await processDueSteps(supabase, new Map(journeys.map(journey => [journey.id, journey])));
    return NextResponse.json({ success: true, ...enrollmentResult, ...processingResult });
  } catch (error) {
    console.error('[Journey runner]', error);
    return NextResponse.json({ error: error.code === '42P01' ? 'Journey migration is not installed' : 'Journey processing failed' }, { status: 500 });
  }
}
