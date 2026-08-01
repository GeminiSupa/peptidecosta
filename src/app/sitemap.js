import { supabase } from '@/lib/supabase';
import { LIVE_SITE_URL } from '@/lib/publicUrl';

export default async function sitemap() {
  // Must match the canonicals in layout.js. Submitting main-site URLs from the
  // catalog's own sitemap asked Google to index pages that live elsewhere.
  const baseUrl = LIVE_SITE_URL;

  // Fetch blog posts for dynamic routes
  const { data: posts } = await supabase
    .from('blog_posts')
    .select('slug, updated_at, created_at')
    .eq('published', true);

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

  return [...staticUrls, ...blogUrls];
}
