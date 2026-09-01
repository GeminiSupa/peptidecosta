import { createClient } from '@supabase/supabase-js';
import { defaultFreeBacConfig, normalizeFreeBacSize } from './bacWater.mjs';

/**
 * The free-water setting a catalog product carries into the cart. A row the
 * admin has saved carries its own values; one that predates the setting falls
 * back to the name-based default, so behaviour is identical until it is edited.
 */
export function resolveFreeBacConfig(item) {
  if (typeof item?.free_bac_water === 'boolean') {
    return {
      freeBacWater: item.free_bac_water,
      freeBacSizeMl: normalizeFreeBacSize(item.free_bac_size_ml),
      freeBacVialsPerItem: Number.isFinite(Number(item.free_bac_vials_per_item)) && Number(item.free_bac_vials_per_item) > 0
        ? Math.floor(Number(item.free_bac_vials_per_item))
        : 1,
    };
  }
  return defaultFreeBacConfig(item?.product);
}

export function getEmojiForCategory(cat) {
  const c = (cat || '').toLowerCase();
  if (c.includes('weight') || c.includes('peso')) return '⚖️';
  if (c.includes('sleep') || c.includes('sueño')) return '🌙';
  if (c.includes('sexual')) return '🔥';
  if (c.includes('skin') || c.includes('piel')) return '✨';
  if (c.includes('immune') || c.includes('inmune')) return '🛡️';
  if (c.includes('supply') || c.includes('suministro')) return '💧';
  if (c.includes('brain') || c.includes('cerebro')) return '🧠';
  if (c.includes('muscle') || c.includes('músculo')) return '💪';
  return '🧪';
}

export function getProductFallbackImage(productName, category) {
  const nameLower = (productName || '').toLowerCase();
  const catLower = (category || '').toLowerCase();

  if (nameLower.includes('bac water') || nameLower.includes('bacteriostatic')) {
    return '/modern_3d_vial_hero.png';
  }
  if (
    nameLower.includes('blend') ||
    nameLower.includes('stack') ||
    nameLower.includes('+') ||
    nameLower.includes('wolverine') ||
    nameLower.includes('group')
  ) {
    return productName.length % 2 === 0 ? '/vials_group_costarica.png' : '/modern_3d_vials_group.png';
  }
  if (catLower.includes('weight') || catLower.includes('peso') || catLower.includes('metabol')) {
    return '/vial_costarica_hero.png';
  }
  if (catLower.includes('recovery') || catLower.includes('healing') || catLower.includes('curación')) {
    return '/hero_peptide_vial.png';
  }
  if (catLower.includes('performance') || catLower.includes('hormon') || catLower.includes('rendimiento')) {
    return '/modern_3d_vial_hero.png';
  }
  if (catLower.includes('aging') || catLower.includes('longevity') || catLower.includes('longevidad')) {
    return '/vial_costarica_hero.png';
  }
  if (catLower.includes('cognitive') || catLower.includes('mood') || catLower.includes('cognitivo')) {
    return '/hero_peptide_vial.png';
  }
  if (catLower.includes('skin') || catLower.includes('hair') || catLower.includes('piel') || catLower.includes('cabello')) {
    return '/modern_3d_vial_hero.png';
  }
  if (productName.length % 3 === 0) return '/vial_costarica_hero.png';
  if (productName.length % 3 === 1) return '/modern_3d_vial_hero.png';
  return '/hero_peptide_vial.png';
}

export function mapDbProduct(item) {
  const now = new Date();
  const isSaleActive =
    item.discount &&
    (!item.sale_start_time || new Date(item.sale_start_time) <= now) &&
    (!item.sale_end_time || new Date(item.sale_end_time) >= now);

  return {
    product: item.product,
    category: item.category,
    priceUsd: item.price_usd,
    priceCrc: item.price_crc,
    originalPriceUsd: isSaleActive ? item.original_price_usd : null,
    originalPriceCrc: isSaleActive ? item.original_price_crc : null,
    discount: isSaleActive ? item.discount : null,
    status: item.inventory_count === 0 ? 'Out of Stock' : item.status,
    inventoryCount: item.inventory_count !== undefined ? item.inventory_count : null,
    lowStockThreshold: item.low_stock_threshold !== undefined ? item.low_stock_threshold : 5,
    coa: item.coa,
    imageUrl: item.image_url || getProductFallbackImage(item.product, item.category),
    descriptionEn: item.description_en || '',
    descriptionEs: item.description_es || '',
    emoji: item.emoji || getEmojiForCategory(item.category),
    ...resolveFreeBacConfig(item),
  };
}

const PRODUCT_SELECT =
  'product,category,price_usd,price_crc,original_price_usd,original_price_crc,discount,sale_start_time,sale_end_time,status,inventory_count,low_stock_threshold,coa,image_url,description_en,description_es,emoji,priority,free_bac_water,free_bac_size_ml,free_bac_vials_per_item';

/** Server-side catalog fetch with ISR-friendly caching. */
export async function fetchCatalogProductsServer() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!supabaseUrl || !key) return { products: [], dbBacked: false };

  const supabase = createClient(supabaseUrl, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .order('priority', { ascending: true });

  if (error || !data?.length) {
    return { products: [], dbBacked: false };
  }

  return {
    products: data.map(mapDbProduct),
    dbBacked: true,
  };
}
