import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import {
  isMissingWhatsAppChannelsSchema,
  validateManualWhatsAppChannel,
} from '@/lib/whatsappChannels.mjs';

export const runtime = 'nodejs';

function migrationResponse() {
  return NextResponse.json({
    error: 'WhatsApp number management is not installed. Run add-whatsapp-multichannel-crm.sql first.',
  }, { status: 409 });
}

export async function GET(request) {
  const auth = await verifyAdminSession(request, { requireSuperadmin: true });
  if (auth.error) return auth.error;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('whatsapp_channels')
    .select('id, phone_number_id, waba_id, display_phone_number, name, source, status, created_at, updated_at')
    .neq('phone_number_id', 'legacy-default')
    .order('created_at', { ascending: true });

  if (error && isMissingWhatsAppChannelsSchema(error)) return migrationResponse();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ channels: data || [] });
}

export async function POST(request) {
  const auth = await verifyAdminSession(request, { requireSuperadmin: true });
  if (auth.error) return auth.error;

  try {
    const validation = validateManualWhatsAppChannel(await request.json());
    if (validation.error) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const input = validation.value;
    const now = new Date().toISOString();
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('whatsapp_channels')
      .upsert({
        phone_number_id: input.phoneNumberId,
        waba_id: input.wabaId,
        display_phone_number: input.displayPhoneNumber,
        name: input.name,
        source: 'cloud_api',
        status: 'active',
        metadata: {
          manually_added: true,
          added_by: auth.profile.email || auth.user.email || null,
        },
        updated_at: now,
      }, { onConflict: 'phone_number_id' })
      .select('*')
      .single();

    if (error && isMissingWhatsAppChannelsSchema(error)) return migrationResponse();
    if (error) throw error;
    return NextResponse.json({ ok: true, channel: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Could not add WhatsApp number.' }, { status: 500 });
  }
}

export async function PATCH(request) {
  const auth = await verifyAdminSession(request, { requireSuperadmin: true });
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const channelId = String(body.channelId || '').trim();
    const status = String(body.status || '').trim().toLowerCase();
    if (!channelId) {
      return NextResponse.json({ error: 'channelId is required.' }, { status: 400 });
    }
    if (!['active', 'disabled'].includes(status)) {
      return NextResponse.json({ error: 'Status must be active or disabled.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('whatsapp_channels')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', channelId)
      .neq('phone_number_id', 'legacy-default')
      .select('*')
      .maybeSingle();

    if (error && isMissingWhatsAppChannelsSchema(error)) return migrationResponse();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'WhatsApp number not found.' }, { status: 404 });
    return NextResponse.json({ ok: true, channel: data });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Could not update WhatsApp number.' }, { status: 500 });
  }
}
