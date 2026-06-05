const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
let url = '', key = '';
envContent.split('\n').forEach(line => {
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?/);
  if (m) {
    if (m[1] === 'NEXT_PUBLIC_SUPABASE_URL') url = m[2].trim();
    if (m[1] === 'SUPABASE_SERVICE_ROLE_KEY') key = m[2].trim();
  }
});

const sb = createClient(url, key);
const BASE = `${url}/storage/v1/object/public/product-pics/`;

// Map: product name keyword → exact bucket filename
// Based on files found in bucket
const PRODUCT_IMAGE_MAP = [
  // Named product-specific images
  { match: 'adamax',               file: 'ADAMAX 5mg.jpg' },
  { match: 'bac water 2ml',        file: 'BAC Water 2ml.jpg' },
  { match: 'bac water 3ml',        file: 'BAC Water 3ml.jpg' },
  { match: 'bac water 10ml',       file: 'BACWater10ml.jpg' },
  { match: 'bpc-157 + tb-500',     file: 'BPC 157 TB 500 20mmg.jpg' },
  { match: 'epithalon',            file: 'Epithalon 50mg.jpg' },
  { match: 'fat blaster',          file: 'FatBlaster10mg.jpg' },
  { match: 'genotropin',           file: 'Gentropin.png' },
  { match: 'hgh 50 iu',           file: 'Gentropin.png' },
  { match: 'ghk-cu 50mg',         file: 'GHK-CU50mg.jpg' },
  { match: 'glutathione',          file: 'Glutathione 1500mg.jpg' },
  { match: 'hcg 10,000',          file: 'HCG10000IU.jpg' },
  { match: 'hgh 12 iu',           file: 'HGH12IU.jpg' },
  { match: 'kisspeptin',           file: 'KissPeptin1010mg.jpg' },
  { match: 'kpv',                  file: 'KPV 10mg.webp' },
  { match: 'mots-c 10mg',         file: 'MOTS-C10mg.jpg' },
  { match: 'melanotan',            file: 'MT_II10MG.webp' },
  { match: 'selank',               file: 'Selank10mg.jpg' },
  { match: 'ss-31',                file: 'SS31 10mg.jpg' },

  // Timestamped uploads (from admin panel) — map by rough ordering in the bucket
  // These are the webp/jpg files uploaded via admin for products without named files.
  // We'll use the generic fallback for unmatched ones.
];

// Fallbacks for products that have no named image
const FALLBACK_MAP = [
  { match: ['retatrutide', 'tirzepatide', 'semaglutide', 'tesamorelin', '5-amino', 'slu-pp', 'fat blaster'],
    file: 'vial_costarica_hero.png' },
  { match: ['bpc-157', 'tb-4', 'klow', 'super human', 'pt-141', 'selank', 'adamax', 'semax', 'pinealon'],
    file: 'hero_peptide_vial.png' },
  { match: ['nad+', 'super human'],
    file: 'vials_group_costarica.png' },
];

async function restore() {
  // Fetch all files from bucket to build URL map
  const { data: files, error: listErr } = await sb.storage.from('product-pics').list('', { limit: 200 });
  if (listErr) { console.error('List error:', listErr); return; }

  const bucketFiles = new Set(files.map(f => f.name));
  console.log(`Found ${bucketFiles.size} files in bucket.`);

  // Fetch all products
  const { data: products, error: fetchErr } = await sb.from('products').select('id, product, image_url');
  if (fetchErr) { console.error('Fetch error:', fetchErr); return; }

  console.log(`Processing ${products.length} products...\n`);

  for (const p of products) {
    const nameLower = (p.product || '').toLowerCase();
    let targetFile = null;

    // 1. Try exact named product match
    for (const entry of PRODUCT_IMAGE_MAP) {
      if (nameLower.includes(entry.match.toLowerCase())) {
        if (bucketFiles.has(entry.file)) {
          targetFile = entry.file;
          break;
        }
      }
    }

    // 2. If no named match, use fallback
    if (!targetFile) {
      for (const fb of FALLBACK_MAP) {
        if (fb.match.some(kw => nameLower.includes(kw))) {
          targetFile = fb.file;
          break;
        }
      }
    }

    // 3. Default fallback
    if (!targetFile) {
      targetFile = 'modern_3d_vial_hero.png';
    }

    const newUrl = BASE + encodeURIComponent(targetFile);

    if (p.image_url === newUrl) {
      console.log(`✓ ${p.product} — already correct`);
      continue;
    }

    const { error: updateErr } = await sb.from('products').update({ image_url: newUrl }).eq('id', p.id);
    if (updateErr) {
      console.error(`✗ Failed to update ${p.product}: ${updateErr.message}`);
    } else {
      console.log(`✅ ${p.product} → ${targetFile}`);
    }
  }

  console.log('\n✅ Done restoring product images!');
}

restore();
