const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = '/Users/apple/Desktop/costapeptides/.env.local';
let supabaseUrl = 'https://cbanvzipzfmllexraiei.supabase.co';
let supabaseServiceKey = '';

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.length > 0 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
        value = value.substring(1, value.length - 1);
      }
      if (key === 'NEXT_PUBLIC_SUPABASE_URL') supabaseUrl = value.trim();
      if (key === 'SUPABASE_SERVICE_ROLE_KEY') supabaseServiceKey = value.trim();
    }
  });
}

// Create client with service role key to bypass RLS policies
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const IMAGES_TO_UPLOAD = [
  'hero_peptide_vial.png',
  'modern_3d_vial_hero.png',
  'modern_3d_vials_group.png',
  'vial_costarica_hero.png',
  'vials_group_costarica.png'
];

async function migrate() {
  console.log('Starting migration of relevant images to Supabase Storage...');
  
  const publicUrls = {};

  for (const filename of IMAGES_TO_UPLOAD) {
    const filePath = path.join('/Users/apple/Desktop/costapeptides/public', filename);
    if (!fs.existsSync(filePath)) {
      console.warn(`File not found: ${filePath}`);
      continue;
    }

    const fileBuffer = fs.readFileSync(filePath);
    
    // Upload file to product-pics bucket
    console.log(`Uploading ${filename} to Supabase Storage...`);
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('product-pics')
      .upload(filename, fileBuffer, {
        contentType: 'image/png',
        upsert: true
      });

    if (uploadError) {
      console.error(`Error uploading ${filename}:`, uploadError.message);
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('product-pics')
      .getPublicUrl(filename);

    publicUrls[filename] = publicUrl;
    console.log(`Uploaded ${filename} successfully! Public URL: ${publicUrl}`);
  }

  console.log('Public URLs mapped:', publicUrls);

  // Now, fetch all products and update their image_url column
  console.log('Fetching products from database...');
  const { data: products, error: fetchError } = await supabase
    .from('products')
    .select('id, product, category, image_url');

  if (fetchError) {
    console.error('Error fetching products:', fetchError.message);
    return;
  }

  console.log(`Found ${products.length} products to evaluate.`);

  for (const p of products) {
    let targetImage = '';
    const nameLower = (p.product || '').toLowerCase();
    const catLower = (p.category || '').toLowerCase();

    // Mapping logic
    if (nameLower.includes('fat blaster')) {
      targetImage = 'modern_3d_vials_group.png';
    } else if (nameLower.includes('super human') || nameLower.includes('nad+')) {
      targetImage = 'vials_group_costarica.png';
    } else if (nameLower.includes('bpc-157') || nameLower.includes('tb-500') || nameLower.includes('tb-4') || nameLower.includes('klow') || nameLower.includes('pt-141') || nameLower.includes('selank') || nameLower.includes('adamax') || nameLower.includes('semax') || nameLower.includes('pinealon')) {
      targetImage = 'hero_peptide_vial.png';
    } else if (catLower.includes('weight') || nameLower.includes('glp-1') || nameLower.includes('tirzepatide') || nameLower.includes('semaglutide') || nameLower.includes('tesamorelin') || nameLower.includes('5-amino') || nameLower.includes('slu-pp332')) {
      targetImage = 'vial_costarica_hero.png';
    } else {
      targetImage = 'modern_3d_vial_hero.png';
    }

    const storageUrl = publicUrls[targetImage];

    if (storageUrl) {
      console.log(`Updating ${p.product} (ID: ${p.id}) image_url to: ${storageUrl}`);
      const { error: updateError } = await supabase
        .from('products')
        .update({ image_url: storageUrl })
        .eq('id', p.id);

      if (updateError) {
        console.error(`Error updating product ID ${p.id}:`, updateError.message);
      }
    }
  }

  console.log('✅ Migration completed successfully!');
}

migrate();
