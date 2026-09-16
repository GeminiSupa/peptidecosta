import { launchDeal, endDeal, getLiveDeal } from '../src/lib/dealsEngine.js';
import { getSupabaseAdmin } from '../src/lib/supabaseAdmin.js';

async function main() {
  try {
    const supabase = getSupabaseAdmin();
    const live = await getLiveDeal(supabase);
    if (live) {
      console.log('Ending currently live deal...');
      await endDeal(live);
    }

    console.log('Launching new bulk wholesale deal...');
    const result = await launchDeal({
      productNames: [
        'GLP-1 10mg',
        'GLP-1 15mg',
        'Tirzepatide 15mg',
        'Tirzepatide 20mg',
        'Tirzepatide 30mg',
        'SS-31 25mg',
        'NAD+ 500mg',
        'NAD+ 1000mg',
        'MOTS-C 40mg',
        'KissPeptin-10 10mg',
        'GHK-CU 100mg'
      ],
      discountPct: 0.40,
      pricingMode: 'bulk_threshold',
      minUnits: 20,
      titleEn: 'Build your own bulk wholesale peptide order',
      titleEs: 'Arma tu propio pedido mayorista de péptidos',
      confirmedHighDiscount: true,
      allowUntrackedStock: true
    });
    console.log('Successfully launched!', result);
  } catch (err) {
    console.error('Failed:', err);
    process.exit(1);
  }
}

main();
