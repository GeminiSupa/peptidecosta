import { supabase } from '@/lib/supabase';
import { LIVE_SITE_URL } from '@/lib/publicUrl';
import { productUrlSlug } from '@/lib/catalogCategories.mjs';

export default async function sitemap() {
  // Must match the canonicals in layout.js. Submitting main-site URLs from the
  // catalog's own sitemap asked Google to index pages that live elsewhere.
  const baseUrl = LIVE_SITE_URL;

  // `supabase` is null when the Supabase environment variables are absent, and
  // this runs at BUILD time, while /sitemap.xml is prerendered. Calling .from()
  // on null threw and took the whole build down with it — which is what failed
  // the first branch preview of this project, where those variables are not
  // set. The product and blog URLs are the only part that needs the database,
  // so without one we still publish the static pages rather than nothing.
  const databaseReady = Boolean(supabase);

  // Fetch blog posts for dynamic routes
  const { data: posts } = databaseReady
    ? await supabase
        .from('blog_posts')
        .select('slug, updated_at, created_at')
        .eq('published', true)
    : { data: [] };

  const blogUrls = (posts || []).map((post) => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: post.updated_at || post.created_at || new Date(),
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  const staticUrls = [
    '',
    '/catalog',
    '/about',
    // Primary nav destinations — previously missing, so the pages the header
    // actually links to were never submitted.
    '/info-center',
    '/affiliate-program',
    '/bulk-discounts',
    '/deal-of-the-week',
    '/contact',
    '/faq',
    '/blog',
    '/coa-database',
    '/our-service-locations',
    '/privacy-policy',
    '/return-refund-policy',
    '/shipping-policy',
    '/customer-feedback'
  ].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === '' || route === '/catalog' ? 'daily' : 'weekly',
    priority: route === '' ? 1 : route === '/catalog' ? 0.9 : 0.8,
  }));

  const [{ data: productRows }, { data: hiddenRow }] = databaseReady
    ? await Promise.all([
        supabase.from('products').select('product'),
        supabase.from('site_settings').select('value').eq('id', 'hidden_products').maybeSingle(),
      ])
    : [{ data: [] }, { data: null }];
  const hidden = new Set(Array.isArray(hiddenRow?.value?.names) ? hiddenRow.value.names : []);
  const seenSlugs = new Set();
  const productUrls = [];
  for (const row of productRows || []) {
    if (!row?.product || hidden.has(row.product)) continue;
    const slug = productUrlSlug(row.product);
    if (!slug || seenSlugs.has(slug)) continue;
    seenSlugs.add(slug);
    productUrls.push({
      url: `${baseUrl}/catalog/${slug}`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.6,
    });
  }

  return [...staticUrls, ...productUrls, ...blogUrls];
}
