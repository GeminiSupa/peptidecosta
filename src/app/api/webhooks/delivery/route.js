import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import {
  mapProviderDeliveryStatus,
  normalizeMarketingIdentity,
  shouldSuppressForDeliveryStatus,
} from '@/lib/marketingDelivery.mjs';

export const dynamic = 'force-dynamic';

function secureEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request) {
  const configuredSecret = process.env.DELIVERY_WEBHOOK_SECRET;
  if (!configuredSecret) return NextResponse.json({ error: 'Delivery webhook is not configured' }, { status: 503 });

  const suppliedSecret = request.headers.get('x-webhook-secret')
    || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!secureEqual(suppliedSecret, configuredSecret)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const payload = await request.json();
    const incoming = Array.isArray(payload) ? payload : Array.isArray(payload.events) ? payload.events : [payload];
    if (!incoming.length || incoming.length > 500) return NextResponse.json({ error: 'Provide between 1 and 500 events' }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const results = { processed: 0, ignored: 0, suppressed: 0 };

    for (const item of incoming) {
      const status = mapProviderDeliveryStatus(item.status || item.event || item.type);
      const channel = item.channel === 'whatsapp' ? 'whatsapp' : 'email';
      const identity = normalizeMarketingIdentity(item.email || item.phone || item.identity, channel);
      const providerId = String(item.provider_id || item.message_id || item.messageId || '').trim() || null;
      const providerEventId = String(item.event_id || item.eventId || '').trim() || null;

      if (!status || (!providerId && !identity)) {
        results.ignored++;
        continue;
      }

      if (providerEventId) {
        const { data: duplicate } = await supabase.from('marketing_delivery_events').select('id').eq('provider_event_id', providerEventId).maybeSingle();
        if (duplicate) {
          results.ignored++;
          continue;
        }
      }

      let delivery = null;
      if (providerId) {
        const { data } = await supabase.from('marketing_delivery_events').select('*').eq('provider_id', providerId).order('last_attempt_at', { ascending: false }).limit(1).maybeSingle();
        delivery = data;
      }

      const timestamp = item.timestamp ? new Date(item.timestamp).toISOString() : new Date().toISOString();
      if (delivery) {
        const { error } = await supabase.from('marketing_delivery_events').update({
          status,
          provider_event_id: providerEventId,
          error: item.error || item.reason || null,
          last_attempt_at: timestamp,
          delivered_at: status === 'delivered' ? timestamp : delivery.delivered_at,
          metadata: { ...(delivery.metadata || {}), provider: item.provider || 'smtp', webhook: true },
        }).eq('id', delivery.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('marketing_delivery_events').insert({
          contact_key: identity || `provider:${providerId}`,
          channel,
          status,
          attempt_count: 1,
          provider_id: providerId,
          provider_event_id: providerEventId,
          error: item.error || item.reason || null,
          last_attempt_at: timestamp,
          delivered_at: status === 'delivered' ? timestamp : null,
          metadata: { provider: item.provider || 'smtp', webhook: true, unmatched: true },
        });
        if (error) throw error;
      }

      if (identity && shouldSuppressForDeliveryStatus(status)) {
        const { error } = await supabase.from('marketing_suppressions').upsert({
          identity,
          channel,
          reason: status === 'complained' ? 'complaint' : 'hard_bounce',
          source: 'delivery_webhook',
          active: true,
          metadata: { provider: item.provider || 'smtp', provider_id: providerId },
          updated_at: new Date().toISOString(),
        }, { onConflict: 'identity,channel' });
        if (error) throw error;
        results.suppressed++;
      }
      results.processed++;
    }

    return NextResponse.json({ success: true, ...results });
  } catch (error) {
    console.error('[Delivery webhook]', error);
    return NextResponse.json({ error: 'Unable to process delivery events' }, { status: 500 });
  }
}
