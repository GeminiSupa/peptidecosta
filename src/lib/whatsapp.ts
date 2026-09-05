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

// The link and the greeting live in whatsappLink.mjs, which pulls in nothing, so
// the sentence a customer reads can be tested without Supabase or a browser.
// Re-exported here because every caller already imports from '@/lib/whatsapp'.
export { DEFAULT_GREETING, buildWhatsAppLink } from './whatsappLink.mjs';
import { readClickAttribution } from './whatsappLink.mjs';

/**
 * Record one WhatsApp click, with the campaign that led to it.
 *
 * This is where the attribution went when it came out of the customer's own
 * message. It carries the utm values and referrer the storefront already keeps
 * in localStorage, so an agent can still see which campaign produced a chat —
 * from the CRM, rather than from a bracketed note in the customer's greeting.
 *
 * Fails quietly on purpose. It runs on the click that opens WhatsApp, and a
 * logging problem must never stand between a customer and the conversation
 * they are trying to start. The insert also predates the table it writes to
 * (`whatsapp_leads` did not exist, so every click was being discarded) — the
 * warning below is what makes that visible instead of silent.
 *
 * @param source - which button was used, e.g. 'catalog_sticky_cta'
 * @param lang - the language the page was in, when the caller knows it
 */
export const logWhatsAppSource = async (source: string, lang: string = '') => {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    const sessionId = typeof window !== 'undefined' ? localStorage.getItem('cart_session_id') : undefined;
    const attribution = readClickAttribution(localStorage, lang);
    const { error } = await supabase.from('whatsapp_leads').insert({
      session_id: sessionId,
      source,
      ...attribution,
      clicked_at: new Date().toISOString(),
    });
    // supabase-js returns the failure rather than throwing it, so without this
    // check a missing table or a blocked insert looks exactly like a success.
    if (error) console.warn('Failed to log WhatsApp source:', error.message);
  } catch (err) {
    console.warn('Failed to log WhatsApp source:', err);
  }
};
