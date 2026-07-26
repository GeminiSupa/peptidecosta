import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendCatalogWelcomeCampaign } from '@/lib/campaignDelivery';
import { cleanPhoneNumber } from '@/lib/whatsapp';
import { insertWhatsAppMessage } from '@/lib/whatsappMessageLog';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

export async function POST(request) {
  try {
    const payload = await request.json();
    const {
      contact_method,
      contact_value,
      whatsapp_consent = false,
      language = 'es',
      ip_address,
      city,
      region,
      country,
      utm_source,
      utm_medium,
      utm_campaign,
      referrer
    } = payload;

    if (!contact_value) {
      return NextResponse.json({ error: 'Missing contact value' }, { status: 400 });
    }

    const cleanContact = contact_method === 'email' 
      ? contact_value.trim() 
      : cleanPhoneNumber(contact_value.trim());

    if (supabase) {
      // Security Check: Prevent duplicate promo codes for the same contact
      const { data: existingLead } = await supabase
        .from('catalog_leads')
        .select('id')
        .eq('contact_value', cleanContact)
        .maybeSingle();

      if (existingLead) {
        if (whatsapp_consent) {
          const { error: updateErr } = await supabase
            .from('catalog_leads')
            .update({
              whatsapp_consent: contact_method === 'whatsapp',
              marketing_consent: true,
              consent_at: new Date().toISOString(),
              consent_source: 'catalog_gate',
              language,
              ip_address,
              city,
              region,
              country,
              utm_source,
              utm_medium,
              utm_campaign,
              referrer
            })
            .eq('id', existingLead.id);

          if (updateErr) {
            console.error('[Leads Capture] Error updating existing lead consent:', updateErr);
          }
        }
        if (contact_method === 'email' && whatsapp_consent) {
          try {
            const result = await sendCatalogWelcomeCampaign(cleanContact);
            console.log('[Leads Capture] Existing lead welcome campaign result:', {
              email: cleanContact,
              sent: result.sent,
              skipped: result.skipped || null,
              campaignId: result.campaignId || result.campaign?.id || null,
            });
          } catch (mailErr) {
            console.error('[Leads Capture] Existing lead welcome campaign failed:', mailErr);
          }
        }
        console.log(`[Leads Capture] Contact ${cleanContact} already exists. Updated consent if provided.`);
        return NextResponse.json({ success: true, message: 'Already registered' });
      }
    }

    // NOTE: The automatic 15%-off new-customer discount has been disabled.
    // We no longer generate a WELCOME- promo code or advertise a discount to new leads.

    if (supabase) {
      // Insert into catalog_leads
      const { error: leadErr } = await supabase.from('catalog_leads').insert([{
        contact_method,
        contact_value: cleanContact,
        whatsapp_consent: contact_method === 'whatsapp' ? !!whatsapp_consent : false,
        marketing_consent: !!whatsapp_consent,
        consent_at: whatsapp_consent ? new Date().toISOString() : null,
        consent_source: 'catalog_gate',
        language,
        ip_address,
        city,
        region,
        country,
        utm_source,
        utm_medium,
        utm_campaign,
        referrer
      }]);

      if (leadErr) console.error('[Leads Capture] Error saving lead:', leadErr);
    }

    // Send the saved Marketing Studio welcome campaign to opted-in email leads.
    if (contact_method === 'email') {
      if (!whatsapp_consent) {
        console.log(`[Leads Capture] Email ${cleanContact} captured without marketing opt-in; welcome campaign skipped.`);
      } else {
        try {
          const result = await sendCatalogWelcomeCampaign(cleanContact);
          console.log('[Leads Capture] Catalog welcome campaign result:', {
            email: cleanContact,
            sent: result.sent,
            skipped: result.skipped || null,
            campaignId: result.campaignId || result.campaign?.id || null,
          });
        } catch (mailErr) {
          console.error('[Leads Capture] Welcome campaign failed:', mailErr);
        }
      }
    } 
    else if (contact_method === 'whatsapp') {
      if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
        console.warn('[Leads Capture] WhatsApp API credentials missing.');
      } else {
        try {
          const metaResponse = await fetch(
            `https://graph.facebook.com/v25.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: cleanContact,
                type: 'template',
                template: {
                  name: 'hello_world', // A generic approved template. Replace with 'catalog_welcome' when approved in Meta.
                  language: { code: 'en_US' }
                }
              }),
            }
          );
          const metaData = await metaResponse.json();
          if (!metaResponse.ok) {
            console.error('[Leads Capture] Meta API error:', metaData);
          } else {
            console.log('[Leads Capture] WhatsApp welcome sent:', metaData.messages?.[0]?.id);
            if (supabase) {
              const metaMessageId = metaData?.messages?.[0]?.id || null;
              await insertWhatsAppMessage(supabase, {
                wa_id: cleanContact,
                display_name: 'Catalog Lead',
                message_text: `¡Bienvenido a Péptidos Costa Rica! Explora nuestro catálogo. Para consultas 24/7 contáctanos al +506 8404-6973.`,
                message_type: 'template',
                direction: 'outbound',
                source: 'cloud_api',
                raw_payload: metaData,
                meta_message_id: metaMessageId,
                delivery_status: 'sent'
              });
            }
          }
        } catch (waErr) {
          console.error('[Leads Capture] WhatsApp message failed:', waErr);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Leads Capture] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
