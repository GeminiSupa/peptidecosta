import { supabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * Build a WhatsApp link that includes a source identifier.
 * The source is embedded in the pre‑filled text so the sales team can see where the user came from.
 * Example: buildWhatsAppLink('50684046973', 'homepage')
 *   => "https://wa.me/50684046973?text=Hello%20I%27m%20interested%20from%20homepage"
 */
export const buildWhatsAppLink = (
  phone: string,
  source: string,
  baseMessage = "Hello I'm interested"
): string => {
  const encodedMessage = encodeURIComponent(`${baseMessage} from ${source}`);
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
