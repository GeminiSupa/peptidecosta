import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { FALLBACK_EXCHANGE_RATE, fetchLiveUsdToCrcRate } from '@/lib/pricing';
import {
  EXCHANGE_RATE_MAX_AGE_MS,
  EXCHANGE_RATE_SETTING_ID,
  syncProductCrcPrices,
} from '@/lib/exchangeRate';
import {
  RATE_HISTORY_LIMIT,
  RATE_MODE_API,
  RATE_MODE_MANUAL,
  checkManualRate,
  readRateMode,
} from '@/lib/exchangeRateMode.mjs';

/**
 * The superadmin switch between the API rate and a hand-set rate.
 *
 *   GET                                     current setting + today's API rate
 *   PUT { mode: 'api' }                     follow the feed again
 *   PUT { mode: 'manual', manualRate, confirmed? }
 *
 * Superadmin only, on both methods. The row it writes is locked against every
 * browser session by fix-checkout-limits-and-rate-lock.sql, so this route is
 * the only way to change it.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function readRow(supabase) {
  const { data, error } = await supabase
    .from('site_settings')
    .select('value, updated_at')
    .eq('id', EXCHANGE_RATE_SETTING_ID)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function describe(value, updatedAt, apiQuote) {
  const info = readRateMode(value);
  return {
    mode: info.mode,
    effectiveRate: Number(value?.usd_crc) || null,
    manualRate: info.manualRate,
    manualSetAt: info.manualSetAt,
    manualSetBy: info.manualSetBy,
    apiRate: apiQuote?.rate ?? info.lastApiRate,
    apiRateIsLive: Boolean(apiQuote),
    updatedAt: value?.fetched_at || updatedAt || null,
    history: Array.isArray(value?.history) ? value.history : [],
  };
}

export async function GET(request) {
  const auth = await verifyAdminSession(request, { requireSuperadmin: true });
  if (auth.error) return auth.error;

  try {
    const supabase = getSupabaseAdmin();
    const row = await readRow(supabase);
    const info = readRateMode(row?.value);
    const apiQuote = await fetchLiveUsdToCrcRate({ previousRate: info.lastApiRate });
    return NextResponse.json({ ok: true, ...describe(row?.value, row?.updated_at, apiQuote) });
  } catch (error) {
    console.error('[admin/exchange-rate GET]', error);
    return NextResponse.json({ error: error.message || 'Could not load the exchange rate setting' }, { status: 500 });
  }
}

export async function PUT(request) {
  const auth = await verifyAdminSession(request, { requireSuperadmin: true });
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const mode = String(body.mode || '').trim();
    if (![RATE_MODE_API, RATE_MODE_MANUAL].includes(mode)) {
      return NextResponse.json({ error: 'Choose Automatic or Manual.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const row = await readRow(supabase);
    const info = readRateMode(row?.value);
    const apiQuote = await fetchLiveUsdToCrcRate({ previousRate: info.lastApiRate });
    const apiRate = apiQuote?.rate ?? info.lastApiRate;
    const now = new Date().toISOString();
    // By name only: this row is publicly readable, so no email goes in it.
    const actor = String(auth.profile.name || 'A superadmin').trim();
    const previousHistory = Array.isArray(row?.value?.history) ? row.value.history : [];

    let value;
    if (mode === RATE_MODE_MANUAL) {
      const check = checkManualRate({ rate: body.manualRate, apiRate, confirmed: body.confirmed === true });
      if (!check.ok) {
        return NextResponse.json({
          error: check.message,
          code: check.code,
          apiRate: apiRate ?? null,
          deviationPct: check.deviationPct ?? null,
        }, { status: check.code === 'needs_confirmation' ? 409 : 400 });
      }
      value = {
        base: 'USD',
        quote: 'CRC',
        usd_crc: check.rate,
        source: 'manual',
        fetched_at: now,
        mode: RATE_MODE_MANUAL,
        manual_rate: check.rate,
        manual_set_at: now,
        manual_set_by: actor,
        last_api_rate: apiRate ?? null,
        history: [{ mode, rate: check.rate, by: actor, at: now }, ...previousHistory].slice(0, RATE_HISTORY_LIMIT),
      };
    } else {
      const rate = apiRate ?? FALLBACK_EXCHANGE_RATE;
      value = {
        base: 'USD',
        quote: 'CRC',
        usd_crc: rate,
        source: apiQuote ? apiQuote.source : 'last-api-rate',
        // With no fresh quote, stamp it just past the refresh age so the next
        // read asks the feed again — but not so old that it trips the
        // stale-rate alert email.
        fetched_at: apiQuote ? now : new Date(Date.now() - EXCHANGE_RATE_MAX_AGE_MS).toISOString(),
        mode: RATE_MODE_API,
        history: [{ mode, rate, by: actor, at: now }, ...previousHistory].slice(0, RATE_HISTORY_LIMIT),
      };
    }

    const { error: writeError } = await supabase
      .from('site_settings')
      .upsert({ id: EXCHANGE_RATE_SETTING_ID, value, updated_at: now });
    if (writeError) throw writeError;

    console.info(`[admin/exchange-rate] ${auth.user.email} set mode=${mode} rate=${value.usd_crc}`);

    // The saved rate already prices checkout. Product CRC strings are brought
    // along too; if that fails the rate still stands and the next API-mode
    // refresh or re-save repairs them.
    let productRowsSynced = 0;
    let syncWarning = null;
    try {
      productRowsSynced = await syncProductCrcPrices(supabase, value.usd_crc);
    } catch (syncError) {
      console.error('[admin/exchange-rate] product CRC sync failed:', syncError);
      syncWarning = 'The rate is saved, but some product colón prices could not be refreshed. Save again to retry.';
    }

    return NextResponse.json({
      ok: true,
      ...describe(value, now, apiQuote),
      productRowsSynced,
      syncWarning,
    });
  } catch (error) {
    console.error('[admin/exchange-rate PUT]', error);
    return NextResponse.json({ error: error.message || 'Could not save the exchange rate' }, { status: 500 });
  }
}
