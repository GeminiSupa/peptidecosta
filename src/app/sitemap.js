import { supabase } from '@/lib/supabase';

export default async function sitemap() {
  const baseUrl = 'https://peptidescostarica.net';

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
