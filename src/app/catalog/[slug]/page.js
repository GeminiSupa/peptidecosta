import CatalogPage from '../page';
import { productUrlSlug, productUrlTitle } from '@/lib/catalogCategories.mjs';
import { supabase } from '@/lib/supabase';
import { LIVE_SITE_URL } from '@/lib/publicUrl';

export async function generateMetadata({ params }) {
  const { slug } = await params;
  let decoded = slug;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    decoded = slug;
  }
  let title = decoded.replace(/-/g, ' ');
  try {
    const { data } = await supabase.from('products').select('product');
    const match = (data || []).find((row) => productUrlSlug(row.product) === decoded);
    if (match) title = productUrlTitle(match.product);
  } catch {
    /* The address still works; the tab title falls back to the slug. */
  }
  const canonical = `${LIVE_SITE_URL}/catalog/${decoded}`;
  return {
    title,
    alternates: { canonical },
    openGraph: { title, url: canonical },
  };
}

export default function CatalogProductUrlPage() {
  return <CatalogPage />;
}
