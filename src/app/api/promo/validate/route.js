import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(request) {
  try {
    const { code } = await request.json();

    if (!code) {
      return NextResponse.json({ valid: false, error: 'No code provided' }, { status: 400 });
    }

    // Standardize code to uppercase and trimmed
    const cleanCode = code.trim().toUpperCase();

    // Query the database for the code and join the affiliate table to get the commission rate
    const { data: promo, error } = await supabase
      .from('promo_codes')
      .select(`
        id,
        code,
        discount_pct,
        is_active,
        valid_from,
        valid_until,
        target_product,
        is_flash_sale,
        affiliate_id,
        affiliates (
          commission_rate
        )
      `)
      .eq('code', cleanCode)
      .eq('is_active', true)
      .single();

    if (error || !promo) {
      return NextResponse.json({ valid: false, error: 'Invalid or inactive promo code.' });
    }

    // Check date boundaries if they exist
    const now = new Date();
    if (promo.valid_from && now < new Date(promo.valid_from)) {
      return NextResponse.json({ valid: false, error: 'Promo code is not yet active.' });
    }
    if (promo.valid_until && now > new Date(promo.valid_until)) {
      return NextResponse.json({ valid: false, error: 'Promo code has expired.' });
    }

    // Success: Return the discount and affiliate data to the frontend
    return NextResponse.json({
      valid: true,
      code: promo.code,
      discount_pct: promo.discount_pct,
      target_product: promo.target_product,
      is_flash_sale: promo.is_flash_sale,
      affiliate_id: promo.affiliate_id,
      commission_rate: promo.affiliates?.commission_rate || 0.10 // Fallback to 10% if undefined
    });

  } catch (err) {
    console.error('[Promo API] Validation error:', err);
    return NextResponse.json({ valid: false, error: 'Server error validating code' }, { status: 500 });
  }
}
