import { NextResponse } from 'next/server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { rateLimit } from '@/lib/rateLimit.mjs';
import { isValidSessionId } from '@/lib/abandonedCartTracking.mjs';
import {
  EXIT_INTENT_DEFAULTS,
  generateOfferCode,
  identityKeys,
  normalizeOfferSettings,
  offerExpiryIso,
  primaryIdentityKey,
} from '@/lib/exitIntentOffer.mjs';

export const runtime = 'nodejs';

/**
 * Mint the exit-intent discount code for one visitor.
 *
 * The browser asks; this decides. Eligibility depends on the orders table and
 * on codes minted for other browsers, neither of which the storefront can see,
 * and every rule here would otherwise be a localStorage flag anyone can clear.
 *
 * Nothing minted here is trusted later either. The code is a normal promo_codes
 * row, so api/orders/create re-checks its dates, its usage limit and its
 * once-per-customer flag when the order is actually placed. This endpoint
 * decides who gets OFFERED a discount; that one decides who gets one.
 */

// Refusals are named for the log, not for the shopper. The storefront shows
// nothing at all when it cannot make an offer — a popup that appears only to
// say "you don't qualify" is worse than no popup.
const refuse = (reason) => NextResponse.json({ eligible: false, reason });

function requestIp(request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
}

async function loadSettings(supabase) {
  const { data, error } = await supabase
    .from('site_settings')
    .select('value')
    .eq('id', 'exit_intent_offer')
    .maybeSingle();

  // A missing row is the normal state before the migration's INSERT has run.
  // Falling back to the defaults keeps the offer working rather than silently
  // switching it off on a fresh database.
  if (error || !data) return { ...EXIT_INTENT_DEFAULTS };
  return normalizeOfferSettings(data.value);
}

/** An offer already minted for this person, under any of their identities. */
async function findExistingOffer(supabase, keys, sessionId) {
  const columns = 'code, discount_pct, valid_until, usage_limit, usage_count, is_active';
  const rows = [];

  if (keys.length > 0) {
    const { data } = await supabase
      .from('promo_codes')
      .select(columns)
      .eq('auto_issued', true)
      .in('issued_to', keys);
    rows.push(...(data || []));
  }

  // Checked separately rather than folded into an `.or()`: the session is a
  // different column, and building one filter string out of an email address
  // means quoting rules this does not need to get involved in.
  if (sessionId) {
    const { data } = await supabase
      .from('promo_codes')
      .select(columns)
      .eq('auto_issued', true)
      .eq('issued_session', sessionId);
    rows.push(...(data || []));
  }

  const seen = new Set();
  return rows.filter((row) => {
    if (seen.has(row.code)) return false;
    seen.add(row.code);
    return true;
  });
}

function liveOffer(rows, nowMs) {
  return rows.find((row) => (
    row.is_active
    && (row.usage_limit === null || Number(row.usage_count || 0) < Number(row.usage_limit))
    && Date.parse(row.valid_until || '') > nowMs
  )) || null;
}

/**
 * Has this person bought from us before?
 *
 * The offer is a first-purchase incentive, so a returning customer is not
 * refused for their own protection — they are simply not who it is for. Matched
 * the same way api/orders/create matches its once-per-customer codes, so the
 * two agree on what "the same customer" means.
 */
async function hasOrderedBefore(supabase, { email, phone }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (cleanEmail) {
    const { data } = await supabase
      .from('orders')
      .select('id')
      .ilike('customer_email', cleanEmail)
      .limit(1);
    if ((data || []).length > 0) return true;
  }

  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length >= 8) {
    const { data } = await supabase
      .from('orders')
      .select('id')
      .ilike('customer_phone', `%${digits.slice(-8)}%`)
      .limit(1);
    if ((data || []).length > 0) return true;
  }

  return false;
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }

  const sessionId = String(body?.sessionId || '');
  if (!isValidSessionId(sessionId)) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 400 });
  }

  const ip = requestIp(request);
  // Deliberately tight. One visitor needs this endpoint once; a burst from one
  // address is somebody cycling session ids looking for a second code.
  if (!rateLimit(`exit-intent:${ip || 'unknown'}`, 12)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const supabase = getSupabaseAdmin();
  const nowMs = Date.now();

  try {
    const settings = await loadSettings(supabase);
    if (!settings.enabled) return refuse('disabled');

    const identity = {
      email: body?.email,
      phone: body?.phone,
      sessionId,
    };
    const keys = identityKeys(identity);

    // Resuming comes first. A refresh, a second tab, or a visitor who left and
    // came back inside the window must see the SAME code and the same deadline
    // — re-minting would quietly restart a clock that is supposed to run out.
    const existing = await findExistingOffer(supabase, keys, sessionId);
    const live = liveOffer(existing, nowMs);
    if (live) {
      return NextResponse.json({
        eligible: true,
        resumed: true,
        code: live.code,
        discountPct: Number(live.discount_pct),
        expiresAt: live.valid_until,
        serverNow: new Date(nowMs).toISOString(),
      });
    }
    // They had one and let it lapse, or spent it. That was the offer.
    if (existing.length > 0) return refuse('already_issued');

    const cartTotalUsd = Number(body?.cartTotalUsd);
    if (!Number.isFinite(cartTotalUsd) || cartTotalUsd <= 0) return refuse('empty_cart');
    if (cartTotalUsd < settings.minCartUsd) return refuse('cart_below_minimum');

    if (await hasOrderedBefore(supabase, identity)) return refuse('returning_customer');

    const code = generateOfferCode(settings.discountPct);
    const { data: inserted, error } = await supabase
      .from('promo_codes')
      .insert([{
        code,
        discount_pct: settings.discountPct,
        is_active: true,
        valid_from: new Date(nowMs).toISOString(),
        valid_until: offerExpiryIso(nowMs, settings),
        // Single use, and single customer. Either alone would be enough to make
        // a leaked code worthless; together they also stop the same person
        // spending it twice from two devices inside the window.
        usage_limit: 1,
        once_per_customer: true,
        // Never shown in a sale badge, a catalog ribbon or an order email.
        // This code belongs to one person and should not read as a public offer.
        hidden: true,
        auto_issued: true,
        issued_to: primaryIdentityKey(identity),
        issued_session: sessionId,
      }])
      .select('code, discount_pct, valid_until')
      .single();

    if (error) {
      // 23505 is the unique index on issued_to doing its job: two tabs raced
      // and the other one won. The visitor still gets an offer — the one that
      // already exists — rather than an error for having been quick.
      if (error.code === '23505') {
        const raced = liveOffer(await findExistingOffer(supabase, keys, sessionId), nowMs);
        if (raced) {
          return NextResponse.json({
            eligible: true,
            resumed: true,
            code: raced.code,
            discountPct: Number(raced.discount_pct),
            expiresAt: raced.valid_until,
            serverNow: new Date(nowMs).toISOString(),
          });
        }
        return refuse('already_issued');
      }
      throw error;
    }

    return NextResponse.json({
      eligible: true,
      resumed: false,
      code: inserted.code,
      discountPct: Number(inserted.discount_pct),
      expiresAt: inserted.valid_until,
      serverNow: new Date(nowMs).toISOString(),
    });
  } catch (error) {
    console.error('[promo/exit-intent] mint failed:', error);
    // This is a marketing extra. It must never interrupt someone's shopping,
    // so a failure here reads to the storefront as "no offer today".
    return NextResponse.json({ eligible: false, reason: 'unavailable' }, { status: 503 });
  }
}
