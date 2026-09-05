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
 * The opening line used when a caller has no message of its own — the nav bar,
 * the catalog's sticky CTA, the footer. Keyed by the site's language toggle.
 *
 * Spanish is the fallback because the storefront itself defaults to Spanish
 * (`useState('es')`); an English default meant a Costa Rican customer reading a
 * Spanish page opened WhatsApp holding an English sentence.
 *
 * Kept ungendered ("me interesa", not "estoy interesado/a") — the customer is
 * the one who appears to have written it.
 */
const DEFAULT_GREETING: Record<string, string> = {
  en: "Hello I'm interested",
  es: 'Hola, me interesa',
};

/**
 * Build a WhatsApp link that includes a source identifier.
 * The source is embedded in the pre‑filled text so the sales team can see where the user came from.
 * Example: buildWhatsAppLink('50684046973', null, 'es')
 *   => "https://wa.me/50684046973?text=Hola%2C%20me%20interesa"
 *
 * @param phone - recipient in E.164 without the '+'
 * @param baseMessage - the message to pre-fill; falsy picks the greeting for `lang`
 * @param lang - 'es' | 'en', the language the customer is reading the site in
 */
export const buildWhatsAppLink = (
  phone: string,
  baseMessage?: string | null,
  lang: string = 'es'
): string => {
  const greeting = baseMessage || DEFAULT_GREETING[lang] || DEFAULT_GREETING.es;
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

  const encodedMessage = encodeURIComponent(`${greeting}${trackingText}`);
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
