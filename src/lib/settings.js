import { supabase } from './supabase';

const DEFAULT_BUSINESS_LINKS = {
  whatsappNumber: "50684046973",
  whatsappDisplay: "+506 8404-6973 (CR) / +1 831-471-5559 (US AI)",
  apiWhatsAppNumber: "18314715559",
  apiWhatsAppDisplay: "+1 831-471-5559",
  googleMapsUrl: "https://maps.app.goo.gl/G4MqFLWW7y9FXvKi9?g_st=ic",
  facebookUrl: "",
  instagramUrl: "",
  supportEmail: "support@peptidescostarica.net"
};

/**
 * Server-side / async helper to get business links
 */
export async function getBusinessLinks() {
  if (!supabase) return DEFAULT_BUSINESS_LINKS;
  
  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('id', 'business_links')
      .single();

    if (error || !data) {
      return DEFAULT_BUSINESS_LINKS;
    }

    return {
      ...DEFAULT_BUSINESS_LINKS,
      ...data.value
    };
  } catch (err) {
    console.error("Error fetching business links:", err);
    return DEFAULT_BUSINESS_LINKS;
  }
}
