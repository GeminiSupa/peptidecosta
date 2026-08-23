import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import {
  FALLBACK_EXCHANGE_RATE,
  fetchLiveUsdToCrcRate,
  formatCrcPriceFromUsd,
  getUsdToCrcRate,
  isPlausibleRate,
} from '@/lib/pricing';

export const EXCHANGE_RATE_SETTING_ID = 'exchange_rate';
export const EXCHANGE_RATE_MAX_AGE_MS = 60 * 60 * 1000;
// How long a stored rate may keep pricing the storefront once every provider is
// unreachable. Past this we would rather quote a known constant than a number
// whose age we can no longer justify to a customer.
export const EXCHANGE_RATE_STALE_LIMIT_MS = 24 * 60 * 60 * 1000;

function normalizeRate(value) {
  // Band-checked, not merely positive: a bad quote that reached the database
  // before this guard existed must not keep pricing the storefront.
  const rate = Number(value?.usd_crc ?? value?.rate ?? value);
  return isPlausibleRate(rate) ? rate : null;
}

function normalizeDate(value) {
  const timestamp = value ? Date.parse(value) : NaN;
  return Number.isFinite(timestamp) ? timestamp : null;
}

function buildRatePayload(rate, source, now = new Date()) {
  const iso = now.toISOString();
  return {
    base: 'USD',
    quote: 'CRC',
    usd_crc: rate,
    source,
    fetched_at: iso,
  };
}

async function readStoredRate(supabase) {
  const { data, error } = await supabase
    .from('site_settings')
    .select('value, updated_at')
    .eq('id', EXCHANGE_RATE_SETTING_ID)
    .maybeSingle();

  if (error) throw error;

  const rate = normalizeRate(data?.value);
  if (!rate) return null;

  const updatedAt = data?.value?.fetched_at || data?.updated_at || null;
  return {
    rate,
    updatedAt,
    ageMs: normalizeDate(updatedAt) ? Date.now() - normalizeDate(updatedAt) : Infinity,
    source: data?.value?.source || 'database',
  };
}

export async function syncProductCrcPrices(supabase, rate) {
  const { data: products, error } = await supabase
    .from('products')
    .select('id, price_usd, price_crc, original_price_usd, original_price_crc');

  if (error) throw error;

  const updates = (products || [])
    .map((product) => {
      const priceCrc = formatCrcPriceFromUsd(product.price_usd, rate);
      const originalPriceCrc = formatCrcPriceFromUsd(product.original_price_usd, rate) || null;
      if (
        String(product.price_crc || '') === String(priceCrc || '') &&
        String(product.original_price_crc || '') === String(originalPriceCrc || '')
      ) {
        return null;
      }
      return supabase
        .from('products')
        .update({
          price_crc: priceCrc || product.price_crc || null,
          original_price_crc: originalPriceCrc,
        })
        .eq('id', product.id);
    })
    .filter(Boolean);

  const results = await Promise.all(updates);
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;

  return updates.length;
}

export async function getDatabaseBackedUsdToCrcRate({ syncProducts = false } = {}) {
  let supabase = null;

  try {
    supabase = getSupabaseAdmin();
    const stored = await readStoredRate(supabase);
    if (stored && stored.ageMs < EXCHANGE_RATE_MAX_AGE_MS) {
      return { ...stored, productRowsSynced: 0 };
    }

    // The stored rate is the anchor a new quote has to stay near, or be
    // corroborated against, before it is allowed to reprice the storefront.
    const live = await fetchLiveUsdToCrcRate({ previousRate: stored?.rate ?? null });
    if (!live && stored) {
      // Serve the stored rate only while it is still recent enough to defend.
      // Previously this had no limit, so one bad value could price the site
      // indefinitely if the providers stayed unreachable.
      if (stored.ageMs < EXCHANGE_RATE_STALE_LIMIT_MS) {
        return { ...stored, source: `${stored.source}:stale`, productRowsSynced: 0 };
      }
      return {
        rate: FALLBACK_EXCHANGE_RATE,
        updatedAt: stored.updatedAt,
        source: 'fallback:expired',
        productRowsSynced: 0,
      };
    }

    const rate = live ? live.rate : FALLBACK_EXCHANGE_RATE;
    const payload = buildRatePayload(rate, live ? live.source : 'fallback');

    const { error } = await supabase
      .from('site_settings')
      .upsert({
        id: EXCHANGE_RATE_SETTING_ID,
        value: payload,
        updated_at: payload.fetched_at,
      });

    if (error) throw error;

    const productRowsSynced = syncProducts ? await syncProductCrcPrices(supabase, rate) : 0;

    return {
      rate,
      updatedAt: payload.fetched_at,
      source: payload.source,
      productRowsSynced,
    };
  } catch (err) {
    console.warn('[exchange-rate] DB-backed exchange rate failed:', err.message);

    try {
      if (supabase) {
        const stored = await readStoredRate(supabase);
        if (stored) return { ...stored, source: `${stored.source}:stale`, productRowsSynced: 0 };
      }
    } catch {
      // fall through to live/fallback fetch
    }

    const rate = await getUsdToCrcRate();
    return {
      rate: normalizeRate(rate) || FALLBACK_EXCHANGE_RATE,
      updatedAt: new Date().toISOString(),
      source: 'fallback',
      productRowsSynced: 0,
    };
  }
}
