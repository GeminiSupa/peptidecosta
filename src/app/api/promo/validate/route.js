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

    // Success: Return the discount and affiliate data to the frontend
    return NextResponse.json({
      valid: true,
      code: promo.code,
      discount_pct: promo.discount_pct,
      affiliate_id: promo.affiliate_id,
      commission_rate: promo.affiliates?.commission_rate || 0.10 // Fallback to 10% if undefined
    });

  } catch (err) {
    console.error('[Promo API] Validation error:', err);
    return NextResponse.json({ valid: false, error: 'Server error validating code' }, { status: 500 });
  }
}
