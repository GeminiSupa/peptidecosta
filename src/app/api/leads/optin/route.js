import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cleanPhoneNumber } from '@/lib/whatsapp';
import { resolveLeadOwner } from '@/lib/leadOwner';

// Records a WhatsApp marketing opt-in captured AFTER the initial signup (the
// "second-chance" re-prompt on the catalog). Sets whatsapp_consent=true for the
// number, updating an existing lead or creating one. Public by design — it only
// ever GRANTS consent for a number the visitor typed for themselves.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && (supabaseServiceKey || supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey)
  : null;

export async function POST(request) {
  try {
    const { phone, language = 'es' } = await request.json();
    const clean = cleanPhoneNumber(String(phone || '').trim());

    if (!clean || clean.length < 8 || clean.length > 15) {
      return NextResponse.json({ error: 'A valid WhatsApp number is required.' }, { status: 400 });
    }
    if (!supabase) {
      return NextResponse.json({ error: 'Not configured' }, { status: 500 });
    }

    const now = new Date().toISOString();

    // Update an existing lead if we already have this number; otherwise insert.
    const { data: existing } = await supabase
      .from('catalog_leads')
      .select('id')
      .eq('contact_value', clean)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('catalog_leads')
        .update({
          whatsapp_consent: true,
          marketing_consent: true,
          consent_at: now,
          consent_source: 'catalog_reprompt',
        })
        .eq('id', existing.id);
    } else {
      // Only on the insert branch: the update above touches a lead that already
      // exists, and re-deriving its owner could overwrite an agent's own claim.
      const salesAgent = await resolveLeadOwner(supabase, {
        phone: clean,
        label: 'leads/optin',
      });

      await supabase.from('catalog_leads').insert([{
        contact_method: 'whatsapp',
        contact_value: clean,
        sales_agent: salesAgent || null,
        whatsapp_consent: true,
        marketing_consent: true,
        consent_at: now,
        consent_source: 'catalog_reprompt',
        language,
      }]);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Leads Opt-in] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
