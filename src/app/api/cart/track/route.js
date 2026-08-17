import { NextResponse } from 'next/server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { rateLimit } from '@/lib/rateLimit.mjs';
import {
  buildAbandonedCartRow,
  isValidSessionId,
  recoveredCartPayload,
  shouldTrackCart,
} from '@/lib/abandonedCartTracking.mjs';

// Server-side abandoned-cart tracking.
//
// Replaces the storefront's direct browser writes to public.abandoned_carts.
// The table held name, phone, email, IP, geolocation, device string and cart
// contents for every shopper who started a checkout, and the anon key that
// could read all of it is published in the JS bundle. Routing the storefront
// through the service role here is what makes revoking those anon grants
// possible without breaking cart recovery.
//
// A session id is still chosen by the browser, so holding one lets you write or
// clear that one cart — the same capability a recovery link grants. What is no
// longer possible is reading, or deleting, carts you do not have the id for.

function requestIp(request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }

  const action = String(body?.action || '').toLowerCase();
  const sessionId = String(body?.sessionId || '');

  if (!isValidSessionId(sessionId)) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 400 });
  }

  const ip = requestIp(request);
  if (!rateLimit(`cart-track:${ip || 'unknown'}`, 120)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const supabase = getSupabaseAdmin();

  try {
    if (action === 'recover') {
      const { data, error } = await supabase
        .from('abandoned_carts')
        .select('session_id, cart_data, customer_name, customer_phone, customer_email')
        .eq('session_id', sessionId)
        .maybeSingle();

      if (error) throw error;
      return NextResponse.json({ ok: true, cart: recoveredCartPayload(data) });
    }

    if (action === 'clear') {
      const { error } = await supabase
        .from('abandoned_carts')
        .delete()
        .eq('session_id', sessionId);

      if (error) throw error;
      return NextResponse.json({ ok: true, cleared: true });
    }

    if (action === 'save') {
      if (!shouldTrackCart(body)) {
        // Nobody could be contacted about this cart, so there is nothing worth
        // storing — and no reason to keep an IP and device string for them.
        return NextResponse.json({ ok: true, skipped: 'unidentified' });
      }

      const row = buildAbandonedCartRow({
        sessionId,
        cart: body?.cart,
        customerName: body?.customerName,
        customerPhone: body?.customerPhone,
        customerEmail: body?.customerEmail,
        metadata: body?.metadata,
        lang: body?.lang,
        currency: body?.currency,
        requestIp: ip,
        userAgent: request.headers.get('user-agent'),
      });

      const { error } = await supabase
        .from('abandoned_carts')
        .upsert(row, { onConflict: 'session_id' });

      if (error) throw error;
      return NextResponse.json({ ok: true, saved: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error(`[cart/track] ${action} failed:`, error);
    // Cart tracking is a marketing convenience. It must never surface an error
    // that could interrupt someone's shopping, so this reports failure quietly.
    return NextResponse.json({ error: 'Cart tracking unavailable' }, { status: 503 });
  }
}
