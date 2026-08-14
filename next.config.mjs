/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['192.168.100.71', '192.168.18.57'],

  compress: true,

  // Baileys (WhatsApp) is ESM-only with optional native deps — let Node.js handle it at runtime
  serverExternalPackages: ['@whiskeysockets/baileys', 'jimp', 'sharp'],

  experimental: {
    optimizePackageImports: ['lucide-react'],
  },

  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 31536000,
    dangerouslyAllowSVG: false,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'peptidescostarica.net',
      },
      {
        protocol: 'https',
        hostname: 'catalog.peptidescostarica.net',
      },
    ],
  },

  // Retire the vercel.app URL without killing old links: any request arriving
  // on the deployment alias is permanently redirected to the live domain, path
  // and query intact. This covers every stale link in old mailers, QR codes and
  // bookmarks. The host match is exact, so branch preview deployments
  // (peptidecosta-git-*.vercel.app etc.) are untouched.
  //
  // Do NOT "shut down" the Vercel project itself - catalog.peptidescostarica.net
  // is a custom domain ON this project; removing the project takes the live
  // site with it.
  async redirects() {
    return [
      {
        source: '/:path((?!api(?:/|$)).*)',
        has: [{ type: 'host', value: 'peptidecosta.vercel.app' }],
        destination: 'https://catalog.peptidescostarica.net/:path*',
        permanent: true,
      },
      // /our-story and /about told the same founder story. /about is canonical:
      // it carries a page-specific <title>, the richer narrative, and the
      // existing sitemap history. Redirect rather than drop, so any shared
      // links keep working.
      {
        source: '/our-story',
        destination: '/about',
        permanent: true,
      },
    ];
  },

  // The Google Ads landing page ships as a standalone file at
  // public/lp/index.html rather than as a route, so it stays a straight copy of
  // what the contractor delivered. Static files only answer on their exact path,
  // so bare /lp would 404 — this gives the ads a clean URL to point at. Array
  // rewrites run after the filesystem check, so /lp/index.html keeps serving
  // itself and nothing else on the site is affected.
  async rewrites() {
    return [
      {
        source: '/lp',
        destination: '/lp/index.html',
      },
    ];
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      // Long-lived cache for static assets
      {
        source: '/(.*)\\.(png|jpg|jpeg|webp|avif|svg|gif|ico|woff|woff2)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

export default nextConfig;
