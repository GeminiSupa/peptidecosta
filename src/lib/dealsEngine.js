/**
 * Server-side Deal of the Week operations.
 *
 * Kept out of the route handlers because launch and expiry are two halves of one
 * mechanism: expiry has to undo precisely what launch did, and the admin "End
 * deal now" button has to do exactly what the cron does. One module, one pair of
 * functions, no second copy of the restore logic to fall behind.
 *
 * All price and window arithmetic lives in src/lib/dealOfWeek.mjs, which is pure
 * and unit-tested. This file is only the database side of it.
 */

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getDatabaseBackedUsdToCrcRate } from '@/lib/exchangeRate';
import {
  weekWindow,
  snapshotBaseline,
  buildMarkdown,
  restorePayload,
  dealBannerText,
  dealBroadcastDrafts,
  toPercent,
} from '@/lib/dealOfWeek.mjs';

const BANNERS_SETTING_ID = 'announcement_banners';

/** The deal currently marked live, or null. Also used to block a second one. */
export async function getLiveDeal(supabase) {
  const { data, error } = await supabase
    .from('deals')
    .select('*')
    .eq('status', 'live')
    .maybeSingle();

  if (error) throw new Error(`Could not read the live deal: ${error.message}`);
  return data || null;
}

/** Recent deals for the admin screen, newest first. */
export async function listDeals(supabase, limit = 10) {
  const { data, error } = await supabase
    .from('deals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Could not list deals: ${error.message}`);
  return data || [];
}

async function readBanners(supabase) {
  const { data, error } = await supabase
    .from('site_settings')
    .select('value')
    .eq('id', BANNERS_SETTING_ID)
    .maybeSingle();

  // PGRST116 is "no row", which just means no banners have ever been saved.
  if (error && error.code !== 'PGRST116') {
    throw new Error(`Could not read banners: ${error.message}`);
  }
  return Array.isArray(data?.value) ? data.value : [];
}

async function writeBanners(supabase, banners) {
  const { error } = await supabase
    .from('site_settings')
    .upsert({ id: BANNERS_SETTING_ID, value: banners }, { onConflict: 'id' });

  if (error) throw new Error(`Could not save banners: ${error.message}`);
}

/**
 * Put the deal's banner into the site-wide ticker.
 *
 * Written into the same announcement_banners list the Announcements panel
 * manages, so it appears in that screen and can be edited or switched off by
 * hand like any other. The `dealId` marker is what lets expiry find and remove
 * it — a deal banner outliving its deal would advertise prices that have
 * already gone back up.
 */
async function upsertDealBanner(supabase, deal) {
  const banners = await readBanners(supabase);
  const bannerId = deal.banner_id || `deal-${deal.id}`;

  const entry = {
    id: bannerId,
    dealId: deal.id,
    textEn: dealBannerText(deal, 'en'),
    textEs: dealBannerText(deal, 'es'),
    isActive: true,
  };

  const existing = banners.findIndex((banner) => banner?.id === bannerId);
  const next = existing >= 0
    ? banners.map((banner, i) => (i === existing ? { ...banner, ...entry } : banner))
    : [...banners, entry];

  await writeBanners(supabase, next);
  return bannerId;
}

/** Drop the deal's banner out of the ticker, leaving every other banner alone. */
async function removeDealBanner(supabase, deal) {
  if (!deal?.banner_id && !deal?.id) return;
  const banners = await readBanners(supabase);
  const next = banners.filter(
    (banner) => banner?.id !== deal.banner_id && banner?.dealId !== deal.id
  );
  if (next.length !== banners.length) await writeBanners(supabase, next);
}

/**
 * Resolve the requested product names to rows, rejecting anything that does not
 * match exactly one product.
 *
 * Strict on purpose. A silently dropped name means the announcement promises a
 * discount that was never applied, which the customer discovers at checkout.
 */
async function resolveProducts(supabase, productNames) {
  const wanted = (productNames || []).map((name) => String(name || '').trim()).filter(Boolean);
  if (wanted.length === 0) throw new Error('Pick at least one product for the deal.');

  const { data, error } = await supabase
    .from('products')
    .select('id, product, price_usd, price_crc, original_price_usd, original_price_crc, discount, sale_start_time, sale_end_time')
    .in('product', wanted);

  if (error) throw new Error(`Could not read products: ${error.message}`);

  const found = data || [];
  const missing = wanted.filter(
    (name) => !found.some((row) => row.product === name)
  );
  if (missing.length > 0) {
    throw new Error(`No product matches: ${missing.join(', ')}`);
  }

  const priceless = found.filter((row) => !row.price_usd || !String(row.price_usd).trim());
  if (priceless.length > 0) {
    throw new Error(
      `These products have no USD price to discount: ${priceless.map((p) => p.product).join(', ')}`
    );
  }

  return found;
}

/**
 * Launch a deal: snapshot the current prices, mark them down, raise the banner.
 *
 * Announcements are NOT sent from here. The drafts come back for the admin to
 * review and send through the existing Announcements panel, so launching a deal
 * can never mail the whole customer list on a single click.
 */
export async function launchDeal({ productNames, discountPct, titleEn, titleEs, createdBy, now = new Date() }) {
  const supabase = getSupabaseAdmin();

  const pct = Number(discountPct);
  if (!Number.isFinite(pct) || pct <= 0 || pct >= 1) {
    throw new Error('The discount must be a fraction between 0 and 1 (0.15 for 15%).');
  }

  const alreadyLive = await getLiveDeal(supabase);
  if (alreadyLive) {
    throw new Error(
      `"${alreadyLive.title_en || 'A deal'}" is already live until ${alreadyLive.ends_at}. End it before starting another.`
    );
  }

  const products = await resolveProducts(supabase, productNames);
  const window = weekWindow(now);
  const { rate } = await getDatabaseBackedUsdToCrcRate();

  // Snapshot before touching anything. If the markdown loop fails partway, this
  // is the only record of what the prices were.
  const baseline = {};
  for (const product of products) {
    baseline[product.id] = snapshotBaseline(product);
  }

  const { data: deal, error: insertError } = await supabase
    .from('deals')
    .insert([{
      title_en: String(titleEn || '').trim() || null,
      title_es: String(titleEs || '').trim() || null,
      product_names: products.map((p) => p.product),
      discount_pct: pct,
      starts_at: window.startsAt,
      ends_at: window.endsAt,
      status: 'live',
      baseline,
      created_by: createdBy || null,
    }])
    .select('*')
    .single();

  if (insertError) {
    // The unique index on live deals is the backstop for two launches racing.
    throw new Error(`Could not create the deal: ${insertError.message}`);
  }

  // Mark the products down. On any failure, roll the whole thing back from the
  // baseline we just stored so a half-discounted catalog cannot survive the
  // request.
  try {
    for (const product of products) {
      const markdown = buildMarkdown(baseline[product.id], pct, window, rate);
      const { error } = await supabase.from('products').update(markdown).eq('id', product.id);
      if (error) throw new Error(`${product.product}: ${error.message}`);
    }
  } catch (err) {
    await restoreProducts(supabase, baseline);
    await supabase
      .from('deals')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', deal.id);
    throw new Error(`Markdown failed and was rolled back — ${err.message}`);
  }

  const bannerId = await upsertDealBanner(supabase, deal);
  await supabase.from('deals').update({ banner_id: bannerId }).eq('id', deal.id);

  return {
    deal: { ...deal, banner_id: bannerId },
    window,
    exchangeRate: rate,
    products: products.map((p) => ({
      product: p.product,
      was: baseline[p.id].price_usd,
      now: buildMarkdown(baseline[p.id], pct, window, rate).price_usd,
    })),
    drafts: dealBroadcastDrafts({ ...deal, banner_id: bannerId }),
  };
}

/** Replay every baseline entry back onto its product row. */
async function restoreProducts(supabase, baseline) {
  const restored = [];
  const failures = [];

  for (const [productId, snapshot] of Object.entries(baseline || {})) {
    const { error } = await supabase
      .from('products')
      .update(restorePayload(snapshot))
      .eq('id', productId);

    if (error) failures.push(`${snapshot.product}: ${error.message}`);
    else restored.push(snapshot.product);
  }

  return { restored, failures };
}

/**
 * End a deal and put the prices back.
 *
 * This is not housekeeping. Once sale_end_time passes, the catalog stops drawing
 * the ribbon and stops striking through the old price, but it never restores
 * price_usd — see the isSaleActive mapping in src/app/catalog/page.js. A deal
 * that is never ended therefore keeps selling at the discount forever, with
 * nothing on the page to reveal it. Both the cron and the admin button land
 * here.
 */
export async function endDeal(deal) {
  const supabase = getSupabaseAdmin();
  if (!deal) throw new Error('No deal to end.');

  const { restored, failures } = await restoreProducts(supabase, deal.baseline);

  // The banner comes down even if a price restore failed — an advertised
  // discount that is no longer being honoured is the worse of the two states.
  await removeDealBanner(supabase, deal);

  if (failures.length > 0) {
    // Left 'live' deliberately so the next cron run retries the failures and
    // the admin screen keeps showing the deal as needing attention.
    throw new Error(`Could not restore ${failures.length} product(s): ${failures.join('; ')}`);
  }

  const { error } = await supabase
    .from('deals')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('id', deal.id);

  if (error) throw new Error(`Prices restored but the deal row did not close: ${error.message}`);

  return { restored };
}

/** Cron entry point: end any live deal whose Sunday has passed. */
export async function expireDueDeals(now = new Date()) {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('deals')
    .select('*')
    .eq('status', 'live')
    .lte('ends_at', (now instanceof Date ? now : new Date(now)).toISOString());

  if (error) throw new Error(`Could not look for expired deals: ${error.message}`);

  const results = [];
  for (const deal of data || []) {
    try {
      const { restored } = await endDeal(deal);
      results.push({ id: deal.id, ok: true, restored });
    } catch (err) {
      // Keep going: one stuck deal must not stop the others being restored.
      console.error('[deals/expire]', deal.id, err.message);
      results.push({ id: deal.id, ok: false, error: err.message });
    }
  }

  return results;
}

/**
 * A draft for the admin screen: what a deal WOULD do, without writing anything.
 * Lets the panel show the resolved Sunday and the real before/after prices
 * before the admin commits.
 */
export async function previewDeal({ productNames, discountPct, titleEn, titleEs, now = new Date() }) {
  const supabase = getSupabaseAdmin();

  const pct = Number(discountPct);
  if (!Number.isFinite(pct) || pct <= 0 || pct >= 1) {
    throw new Error('The discount must be a fraction between 0 and 1 (0.15 for 15%).');
  }

  const products = await resolveProducts(supabase, productNames);
  const window = weekWindow(now);
  const { rate } = await getDatabaseBackedUsdToCrcRate();

  const draftDeal = {
    title_en: String(titleEn || '').trim() || null,
    title_es: String(titleEs || '').trim() || null,
    product_names: products.map((p) => p.product),
    discount_pct: pct,
  };

  return {
    window,
    exchangeRate: rate,
    percent: toPercent(pct),
    liveDeal: await getLiveDeal(supabase),
    products: products.map((product) => {
      const baseline = snapshotBaseline(product);
      const markdown = buildMarkdown(baseline, pct, window, rate);
      return {
        product: product.product,
        wasUsd: baseline.price_usd,
        nowUsd: markdown.price_usd,
        wasCrc: baseline.price_crc,
        nowCrc: markdown.price_crc,
      };
    }),
    banner: { en: dealBannerText(draftDeal, 'en'), es: dealBannerText(draftDeal, 'es') },
    drafts: dealBroadcastDrafts(draftDeal),
  };
}
