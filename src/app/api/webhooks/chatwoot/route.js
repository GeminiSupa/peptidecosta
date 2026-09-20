import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import {
  buildChatwootLeadUpdates,
  chatwootCrmNotification,
  chatwootEventKey,
  leadIdFromChatwootEvent,
  normalizeChatwootEvent,
  verifyChatwootSignature,
} from '@/lib/chatwootWebhook.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (value) => String(value ?? '').trim();
const tableMissing = (error) => error?.code === '42P01' || /does not exist|schema cache/i.test(error?.message || '');

async function findLead(supabase, event) {
  if (event.conversationId) {
    const { data, error } = await supabase
      .from('catalog_leads')
      .select('*')
      .eq('chatwoot_conversation_id', event.conversationId)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  const directLeadId = leadIdFromChatwootEvent(event);
  if (directLeadId) {
    const { data, error } = await supabase.from('catalog_leads').select('*').eq('id', directLeadId).maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  const baseUrl = clean(process.env.CHATWOOT_BASE_URL).replace(/\/+$/, '');
  const accountId = clean(process.env.CHATWOOT_ACCOUNT_ID);
  if (baseUrl && accountId && event.conversationId) {
    const url = `${baseUrl}/app/accounts/${accountId}/conversations/${event.conversationId}`;
    const { data, error } = await supabase
      .from('catalog_leads')
      .select('*')
      .eq('chatwoot_conversation_url', url)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }
  return null;
}

async function resolveRecipientEmail(supabase, event, lead) {
  if (event.assigneeEmail) return event.assigneeEmail;
  const owner = clean(lead.sales_agent || lead.owner || lead.assigned_to).toLowerCase();
  if (!owner) return null;
  const { data: byEmail } = await supabase
    .from('admin_profiles').select('email,name').ilike('email', owner).limit(1).maybeSingle();
  if (byEmail?.email) return clean(byEmail.email).toLowerCase();
  const { data: byName } = await supabase
    .from('admin_profiles').select('email,name').ilike('name', owner).limit(1).maybeSingle();
  return clean(byName?.email).toLowerCase() || null;
}

export async function POST(request) {
  const secret = clean(process.env.CHATWOOT_WEBHOOK_SECRET);
  if (!secret) return NextResponse.json({ error: 'Chatwoot webhook is not configured' }, { status: 503 });

  const rawBody = await request.text();
  const signatureValid = verifyChatwootSignature({
    rawBody,
    signature: request.headers.get('x-chatwoot-signature'),
    timestamp: request.headers.get('x-chatwoot-timestamp'),
    secret,
  });
  if (!signatureValid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const receivedAt = new Date().toISOString();
  const event = normalizeChatwootEvent(payload, receivedAt);
  const supported = ['conversation_created', 'conversation_updated', 'conversation_status_changed', 'message_created'];
  if (!supported.includes(event.event) || !event.conversationId) {
    return NextResponse.json({ success: true, ignored: true });
  }

  const configuredAccount = clean(process.env.CHATWOOT_ACCOUNT_ID);
  const configuredInbox = clean(process.env.CHATWOOT_INBOX_ID);
  if ((configuredAccount && clean(event.accountId) !== configuredAccount)
      || (configuredInbox && clean(event.inboxId) !== configuredInbox)) {
    return NextResponse.json({ success: true, ignored: true, reason: 'different_account_or_inbox' });
  }

  const eventKey = chatwootEventKey({
    deliveryId: request.headers.get('x-chatwoot-delivery'),
    rawBody,
  });

  try {
    const supabase = getSupabaseAdmin();
    const { data: duplicate, error: duplicateError } = await supabase
      .from('chatwoot_events').select('id').eq('event_key', eventKey).maybeSingle();
    if (duplicateError) throw duplicateError;
    if (duplicate) return NextResponse.json({ success: true, duplicate: true });

    const lead = await findLead(supabase, event);
    if (!lead) {
      const { error: unmatchedError } = await supabase.from('chatwoot_events').insert({
        event_key: eventKey,
        event_type: event.event,
        conversation_id: event.conversationId,
        message_id: event.messageId,
        direction: event.direction,
        conversation_status: event.status,
        actor_name: event.assigneeName || event.contactName || null,
        actor_email: event.assigneeEmail || null,
        occurred_at: event.occurredAt,
        received_at: receivedAt,
      });
      if (unmatchedError) throw unmatchedError;
      return NextResponse.json({ success: true, matched: false });
    }

    const updates = buildChatwootLeadUpdates(event, lead, receivedAt);
    const { error: updateError } = await supabase.from('catalog_leads').update(updates).eq('id', lead.id);
    if (updateError) throw updateError;

    const { error: eventError } = await supabase.from('chatwoot_events').insert({
      event_key: eventKey,
      lead_id: lead.id,
      event_type: event.event,
      conversation_id: event.conversationId,
      message_id: event.messageId,
      direction: event.direction,
      conversation_status: event.status,
      actor_name: event.assigneeName || event.contactName || null,
      actor_email: event.assigneeEmail || null,
      occurred_at: event.occurredAt,
      received_at: receivedAt,
    });
    if (eventError && eventError.code !== '23505') throw eventError;

    const recipientEmail = await resolveRecipientEmail(supabase, event, { ...lead, ...updates });
    const notification = chatwootCrmNotification(
      { ...event, assigneeEmail: recipientEmail || event.assigneeEmail }, lead, eventKey,
    );
    if (notification) {
      const { error: notificationError } = await supabase.from('admin_notifications').insert(notification);
      if (notificationError && notificationError.code !== '23505') {
        console.warn('[Chatwoot webhook] CRM notification:', notificationError.message);
      }
    }

    return NextResponse.json({ success: true, matched: true, leadId: lead.id, event: event.event });
  } catch (error) {
    console.error('[Chatwoot webhook]', error);
    if (tableMissing(error)) {
      return NextResponse.json({ error: 'Run chatwoot-crm-sync-migration.sql first.' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Unable to process Chatwoot event' }, { status: 500 });
  }
}
