/**
 * create-flash-sale.js
 *
 * Creates the 48-hour Cellular Optimization flash sale promo code.
 *
 * Sale terms:
 *   - 40% off MOTS-C, NAD+ (both sizes), and SS-31
 *   - Requires 5+ vials total (can mix products to reach 5)
 *   - Does NOT combine with the current bulk volume discount
 *     (enforced automatically: promo with min_units > 0 replaces the volume
 *      discount instead of stacking — see src/lib/promoEligibility.mjs)
 *   - Runs for exactly 48 hours from execution time
 *
 * Run:  node create-flash-sale.js
 */

const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// Parse .env.local manually (same pattern as other scripts in this repo)
const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  if (line.includes('=') && !line.startsWith('#')) {
    const [key, ...val] = line.split('=');
    env[key.trim()] = val.join('=').trim();
  }
});

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

async function createFlashSale() {
  // 48 hours from right now (Costa Rica = UTC-6, but we store in UTC)
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  // Products on sale — these strings are matched with .includes() against
  // cart item names (case-insensitive), so "NAD+" will match both NAD+ sizes.
  const targetProducts = 'MOTS-C,NAD+,SS-31';

  const code = 'CELLULAR40';

  console.log('Creating flash sale promo code:', code);
  console.log('  Products:', targetProducts);
  console.log('  Discount: 40%');
  console.log('  Min units: 5 (combinable across products)');
  console.log('  Valid until:', expiresAt.toISOString(), '(48 h from now)');
  console.log('  Bulk volume discount: EXCLUDED (auto-replaced by min_units logic)');
  console.log('');

  const { data, error } = await supabase
    .from('promo_codes')
    .insert([{
      code,
      discount_pct: 0.40,
      is_active: true,
      is_flash_sale: true,
      target_product: targetProducts,

      // min_units = 5 does two things simultaneously:
      //   1. Requires 5+ vials before the code activates.
      //   2. Flags this as a "bulk promo" which REPLACES the automatic volume
      //      discount (effectiveVolumeDiscountPct in promoEligibility.mjs),
      //      so the two deals cannot stack — exactly as requested.
      min_units: 5,

      // No max cap — if they want to buy 20 vials at 40%, great.
      max_units: null,

      valid_from: now.toISOString(),
      valid_until: expiresAt.toISOString(),

      hidden: false,

      // Show a sale ribbon on the targeted products in the catalog
      show_sale_badge: true,
      badge_style: 'custom',
      badge_text: '⚡ 48H FLASH SALE',
      badge_text_es: '⚡ OFERTA RELÁMPAGO 48H',
    }])
    .select()
    .single();

  if (error) {
    console.error('❌ Error creating promo code:', error.message);
    console.error(error);
    process.exit(1);
  }

  console.log('✅ Promo code created successfully!');
  console.log('');
  console.log('  Code:        ', data.code);
  console.log('  Discount:     40%');
  console.log('  Min units:    5 vials');
  console.log('  Products:    ', data.target_product);
  console.log('  Active from: ', data.valid_from);
  console.log('  Expires:     ', data.valid_until);
  console.log('  Sale badge:   yes (custom)');
  console.log('  Bulk sale:    NOT combinable (handled by min_units replacement logic)');
  console.log('');
  console.log('Share this code with customers: CELLULAR40');
}

createFlashSale();
