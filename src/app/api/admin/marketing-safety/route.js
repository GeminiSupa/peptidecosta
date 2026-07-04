import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

function normalizeIdentity(value, channel) {
  const raw = String(value || '').trim();
  if (channel === 'email' || raw.includes('@')) return raw.toLowerCase();
  return raw.replace(/\D/g, '');
}

export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;
  const supabase = getSupabaseAdmin();

  try {
    const [{ data: suppressions, error }, { data: events, error: eventError }] = await Promise.all([
      supabase.from('marketing_suppressions').select('*').eq('active', true).order('created_at', { ascending: false }).limit(1000),
      supabase.from('marketing_delivery_events').select('status,channel,attempt_count,last_attempt_at,provider_event_id').order('last_attempt_at', { ascending: false }).limit(5000),
    ]);
    if (error) throw error;
    if (eventError) throw eventError;

    const last24Hours = Date.now() - 86400000;
    const recent = (events || []).filter(event => new Date(event.last_attempt_at).getTime() >= last24Hours);
    return NextResponse.json({
      suppressions: suppressions || [],
      summary: {
        suppressed: suppressions?.length || 0,
        delivered24h: recent.filter(event => event.status === 'delivered').length,
        failed24h: recent.filter(event => event.status === 'failed').length,
        bounced24h: recent.filter(event => event.status === 'bounced').length,
        complained24h: recent.filter(event => event.status === 'complained').length,
        webhookEvents24h: recent.filter(event => event.provider_event_id).length,
        blocked24h: recent.filter(event => event.status === 'suppressed').length,
        retries24h: recent.reduce((sum, event) => sum + Math.max(0, Number(event.attempt_count || 1) - 1), 0),
        webhookConfigured: Boolean(process.env.DELIVERY_WEBHOOK_SECRET),
      },
    });
  } catch (error) {
    const missingTable = error.code === '42P01';
    return NextResponse.json({
      error: missingTable ? 'Safety tables are not installed. Run marketing-safety-migration.sql in Supabase.' : 'Unable to load marketing safety data',
      setupRequired: missingTable,
    }, { status: missingTable ? 503 : 500 });
  }
}

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    if (!['email', 'whatsapp', 'all'].includes(body.channel)) return NextResponse.json({ error: 'Choose a valid channel' }, { status: 400 });
    const identity = normalizeIdentity(body.identity, body.channel);
    if (!identity || (body.channel === 'email' && !identity.includes('@')) || (body.channel === 'whatsapp' && identity.length < 8)) {
      return NextResponse.json({ error: 'Enter a valid email address or phone number' }, { status: 400 });
    }
    const { data, error } = await getSupabaseAdmin().from('marketing_suppressions').upsert({
      identity,
      channel: body.channel,
      reason: String(body.reason || 'manual').trim().slice(0, 120),
      source: 'admin',
      active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'identity,channel' }).select().single();
    if (error) throw error;
    return NextResponse.json({ suppression: data }, { status: 201 });
  } catch (error) {
    console.error('[Marketing Safety] Add suppression:', error);
    return NextResponse.json({ error: error.code === '42P01' ? 'Run marketing-safety-migration.sql first.' : 'Unable to add suppression' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Suppression ID is required' }, { status: 400 });
  const { error } = await getSupabaseAdmin().from('marketing_suppressions').update({ active: false, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return NextResponse.json({ error: 'Unable to remove suppression' }, { status: 500 });
  return NextResponse.json({ success: true });
}
