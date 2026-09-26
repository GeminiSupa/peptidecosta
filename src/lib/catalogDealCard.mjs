/** The on/off switch for the big deal card at the top of the catalog. */
export const CATALOG_DEAL_CARD_SETTING_ID = 'catalog_deal_card';

/**
 * Missing or unreadable means on. The card still only appears while a weekly
 * deal is live — this switch is an extra way to hide it.
 */
export function catalogDealCardEnabled(value) {
  if (!value || typeof value !== 'object') return true;
  return value.enabled !== false;
}

export async function readCatalogDealCardEnabled(supabase) {
  const { data, error } = await supabase
    .from('site_settings')
    .select('value')
    .eq('id', CATALOG_DEAL_CARD_SETTING_ID)
    .maybeSingle();
  if (error) throw error;
  return catalogDealCardEnabled(data?.value);
}
