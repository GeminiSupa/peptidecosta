import { supabase } from './supabase';
import { DEFAULT_BUSINESS_LINKS, normalizeBusinessLinks } from './businessLinks';

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

    return normalizeBusinessLinks(data.value);
  } catch (err) {
    console.error("Error fetching business links:", err);
    return DEFAULT_BUSINESS_LINKS;
  }
}
