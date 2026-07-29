import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getBaseOrderNotificationRecipients } from '@/lib/orderNotificationRecipients';
import {
  NOTIFICATION_CHANNELS,
  isMissingRecipientsTable,
  isUsableDestination,
  normalizeDestination,
} from '@/lib/notificationRecipients.mjs';

export const runtime = 'nodejs';

const MIGRATION_HINT = 'Run add-notification-recipients.sql to create the notification_recipients table.';

function validate({ label, channel, destination }) {
  if (!label || !String(label).trim()) return 'A name is required.';
  if (!NOTIFICATION_CHANNELS.includes(channel)) return 'Channel must be "whatsapp" or "email".';
  if (!isUsableDestination(channel, destination)) {
    return channel === 'whatsapp'
      ? 'Enter a WhatsApp number with its country code, 8 to 15 digits (for example 50660626224).'
      : 'Enter a valid email address.';
  }
  return null;
}

/**
 * The list, plus the owner inboxes still coming from ORDER_NOTIFICATION_TO.
 *
 * Showing that env value matters: it is invisible in the Vercel dashboard once
 * saved, so before this screen existed nobody could see who was actually on the
 * order email. It is reported as `envBaseEmails` so the UI can display it as
 * read-only and prompt for it to be folded into the managed list.
 */
export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('notification_recipients')
    .select('id, label, channel, destination, new_order, active, created_at')
    .order('channel', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    if (isMissingRecipientsTable(error)) {
      return NextResponse.json({ recipients: [], tableReady: false, hint: MIGRATION_HINT, envBaseEmails: getBaseOrderNotificationRecipients() });
    }
    console.error('[notification-recipients] List failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    recipients: data || [],
    tableReady: true,
    envBaseEmails: getBaseOrderNotificationRecipients(),
  });
}

export async function POST(request) {
  const auth = await verifyAdminSession(request, { requireSuperadmin: true });
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const channel = body?.channel;
    const problem = validate(body);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('notification_recipients')
      .insert({
        label: String(body.label).trim(),
        channel,
        destination: normalizeDestination(channel, body.destination),
        new_order: body.new_order !== false,
        active: body.active !== false,
      })
      .select()
      .single();

    if (error) {
      if (isMissingRecipientsTable(error)) {
        return NextResponse.json({ error: MIGRATION_HINT }, { status: 503 });
      }
      // 23505 is the unique index on (channel, lower(destination)).
      if (error.code === '23505') {
        return NextResponse.json({ error: 'That destination is already on the list.' }, { status: 409 });
      }
      console.error('[notification-recipients] Create failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ recipient: data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  const auth = await verifyAdminSession(request, { requireSuperadmin: true });
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    if (!body?.id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const patch = {};
    if (body.label !== undefined) patch.label = String(body.label).trim();
    if (body.new_order !== undefined) patch.new_order = body.new_order === true;
    if (body.active !== undefined) patch.active = body.active === true;
    if (body.destination !== undefined || body.channel !== undefined) {
      const channel = body.channel;
      const problem = validate({ label: body.label ?? 'x', channel, destination: body.destination });
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
      patch.channel = channel;
      patch.destination = normalizeDestination(channel, body.destination);
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('notification_recipients')
      .update(patch)
      .eq('id', body.id)
      .select()
      .single();

    if (error) {
      if (isMissingRecipientsTable(error)) {
        return NextResponse.json({ error: MIGRATION_HINT }, { status: 503 });
      }
      if (error.code === '23505') {
        return NextResponse.json({ error: 'That destination is already on the list.' }, { status: 409 });
      }
      console.error('[notification-recipients] Update failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ recipient: data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  const auth = await verifyAdminSession(request, { requireSuperadmin: true });
  if (auth.error) return auth.error;

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('notification_recipients').delete().eq('id', id);

  if (error) {
    if (isMissingRecipientsTable(error)) {
      return NextResponse.json({ error: MIGRATION_HINT }, { status: 503 });
    }
    console.error('[notification-recipients] Delete failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
