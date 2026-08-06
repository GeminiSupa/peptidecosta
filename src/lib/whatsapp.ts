import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { safeLocalStorage as localStorage } from '@/lib/storage';

/**
 * Cleans and formats a phone number for WhatsApp API usage.
 * Assumes default country codes based on length (e.g., 8 digits -> Costa Rica +506, 10 digits -> US/Canada +1).
 * @param phone - The raw phone number string
 * @returns The cleaned phone number in E.164 format (without the '+')
 */
export const cleanPhoneNumber = (phone: string | null | undefined): string => {
  if (!phone) return '';
  let cleaned = phone.replace(/[^0-9]/g, '');
  if (cleaned.startsWith('00')) {
    cleaned = cleaned.substring(2);
  }
  // Standard Costa Rican 8-digit phone number -> prepend '506'
  if (cleaned.length === 8) {
    cleaned = '506' + cleaned;
  }
  // Standard US/Canada 10-digit phone number -> prepend '1'
  else if (cleaned.length === 10) {
    cleaned = '1' + cleaned;
  }
  return cleaned;
};

/**
 * Build a WhatsApp link that includes a source identifier.
 * The source is embedded in the pre‑filled text so the sales team can see where the user came from.
 * Example: buildWhatsAppLink('50684046973', 'homepage')
 *   => "https://wa.me/50684046973?text=Hello%20I%27m%20interested%20from%20homepage"
 */
export const buildWhatsAppLink = (
  phone: string,
  baseMessage = "Hello I'm interested"
): string => {
  let trackingText = '';
  
  if (typeof window !== 'undefined') {
    const source = localStorage.getItem('lead_utm_source');
    const campaign = localStorage.getItem('lead_utm_campaign');
    const referrer = localStorage.getItem('lead_referrer');
    
    let sourceLabel = '';
    if (source) {
      sourceLabel = source;
    } else if (referrer) {
      try {
        const url = new URL(referrer);
        sourceLabel = url.hostname.replace('www.', '');
      } catch (e) {
        // ignore invalid urls
      }
    }
    
    if (sourceLabel) {
      trackingText = `\n\n[Source: ${sourceLabel}${campaign ? ` (Camp: ${campaign})` : ''}]`;
    }
  }

  const encodedMessage = encodeURIComponent(`${baseMessage}${trackingText}`);
  return `https://wa.me/${phone}?text=${encodedMessage}`;
};

/**
 * Log a WhatsApp click source to Supabase for analytics.
 * Creates a row in the `whatsapp_leads` table with session id and source.
 * If Supabase is not configured the call is a no‑op.
 */
export const logWhatsAppSource = async (source: string) => {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    const sessionId = typeof window !== 'undefined' ? localStorage.getItem('cart_session_id') : undefined;
    await supabase.from('whatsapp_leads').insert({
      session_id: sessionId,
      source,
      clicked_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('Failed to log WhatsApp source:', err);
  }
};
