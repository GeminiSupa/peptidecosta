const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const { createClient } = require('@supabase/supabase-js');

// 1. Manually parse .env.local to load credentials without requiring external packages
const envPath = path.join(__dirname, '../.env.local');
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
      process.env[key] = value.trim();
    }
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or ANON_KEY) must be set in .env.local');
  process.exit(1);
}

// 2. Initialize Supabase Client
const supabase = createClient(supabaseUrl, supabaseKey);

const EXCHANGE_RATE = 454.48;

const getEmojiForCategory = (cat) => {
  const c = (cat || '').toLowerCase();
  if (c.includes('weight') || c.includes('peso')) return '⚖️';
  if (c.includes('sleep') || c.includes('sueño')) return '🌙';
  if (c.includes('sexual')) return '🔥';
  if (c.includes('skin') || c.includes('piel')) return '✨';
  if (c.includes('immune') || c.includes('inmune')) return '🛡️';
  if (c.includes('supply') || c.includes('suministro')) return '💧';
  if (c.includes('brain') || c.includes('cerebro')) return '🧠';
  if (c.includes('muscle') || c.includes('músculo')) return '💪';
  return '💊';
};

async function seed() {
  console.log('🚀 Starting Supabase catalog seeding...');
  
  // Try to authenticate so RLS is satisfied
  try {
    console.log('🔑 Authenticating as admin user...');
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: 'info@peptidescostarica.net',
      password: 'CostaPeptides2026!'
    });
    if (authError) {
      console.log(`⚠️ Warning: Authentication failed (${authError.message}). Attempting unauthenticated seed...`);
    } else {
      console.log('✅ Authenticated successfully as admin!');
    }
  } catch (err) {
    console.log(`⚠️ Warning: Authentication error (${err.message}). Attempting unauthenticated seed...`);
  }
  
  // 3. Read and parse master_sheet.csv
  const csvPath = path.join(__dirname, '../public/master_sheet.csv');
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ Error: CSV file not found at ${csvPath}`);
    process.exit(1);
  }

  const csvContent = fs.readFileSync(csvPath, 'utf8');
  
  Papa.parse(csvContent, {
    header: false,
    skipEmptyLines: true,
    complete: async (results) => {
      const lines = results.data;
      
      // Find the header row (contains "product" or "producto")
      const headerRowIndex = lines.findIndex(l => 
        l.some(cell => cell && (cell.toLowerCase().includes('product') || cell.toLowerCase().includes('producto')))
      );

      if (headerRowIndex === -1) {
        console.error('❌ Error: Could not find the header row in CSV file.');
        process.exit(1);
      }

      const headers = lines[headerRowIndex].map(h => h.toLowerCase().trim());
      const dataLines = lines.slice(headerRowIndex + 1);

      console.log(`📊 Found headers: [${headers.join(', ')}]`);
      console.log(`📦 Parsing ${dataLines.length} potential data rows...`);

      const productsToInsert = [];

      dataLines.forEach((line, idx) => {
        // Skip rows with no product name
        if (!line[0] || line[0].trim() === '') return;

        const rowData = {};
        headers.forEach((header, colIdx) => {
          const key = header.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
          rowData[key] = line[colIdx] || '';
        });

        const productName = rowData.product || rowData.producto || line[0];
        const category = rowData.category || rowData.categoría || line[1] || 'General';
        const priceUsdStr = rowData.priceusd || rowData.price || rowData.precio || line[2] || '$0';
        const status = rowData.status || rowData.estado || line[3] || 'In Stock';
        
        const bulkDiscountEn = rowData.bulkdiscounten || rowData.bulkdiscount || '';
        const bulkDiscountEs = rowData.bulkdiscountes || '';
        const coaUrl = rowData.coaurl || rowData.coa || '';
        
        // Parse numerical USD
        const usdNum = parseFloat(priceUsdStr.replace(/[^0-9.]/g, '')) || 0;
        const calculatedCrc = Math.round(usdNum * EXCHANGE_RATE);
        const priceCrcStr = calculatedCrc > 0 ? `₡${calculatedCrc.toLocaleString('en-US')}` : '';

        // Determine final discount: Prefer Spanish if available, fallback to English
        const discount = bulkDiscountEs || bulkDiscountEn || '';

        productsToInsert.push({
          product: productName.trim(),
          category: category.trim(),
          price_usd: priceUsdStr.trim(),
          price_crc: priceCrcStr,
          discount: discount.trim(),
          status: status.trim(),
          coa: coaUrl.trim(),
          image_url: '', // Left blank to prioritize category emojis or uploadable media
          emoji: getEmojiForCategory(category),
          priority: idx
        });
      });

      console.log(`✅ Parsed ${productsToInsert.length} products successfully.`);

      try {
        // 4. Delete existing products to start fresh
        console.log('🧹 Clearing existing products from database...');
        const { error: deleteError } = await supabase
          .from('products')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows safely

        if (deleteError) {
          throw new Error(`Failed to delete products: ${deleteError.message}`);
        }
        console.log('✨ Database table public.products cleared.');

        // 5. Batch insert products
        console.log(`📥 Seeding ${productsToInsert.length} rows into public.products...`);
        const { data, error: insertError } = await supabase
          .from('products')
          .insert(productsToInsert)
          .select();

        if (insertError) {
          throw new Error(`Failed to insert products: ${insertError.message}`);
        }

        console.log(`🎉 Database seeded successfully! Inserted ${data.length} rows.`);
        process.exit(0);
      } catch (err) {
        console.error('❌ Database operation failed:', err.message);
        process.exit(1);
      }
    },
    error: (err) => {
      console.error('❌ CSV parsing error:', err.message);
      process.exit(1);
    }
  });
}

seed();
