import localFont from "next/font/local";
import Script from "next/script";
import "./globals.css";
import UTMTracker from "@/components/UTMTracker";
import GlobalContactForm from "@/components/GlobalContactForm";
import AnalyticsTracker from "@/components/AnalyticsTracker";
import { LIVE_SITE_URL } from "@/lib/publicUrl";
import { getTikTokPixelBootstrapScript } from "@/lib/tiktokPixel.mjs";

// Served from this repo, not next/font/google. Google's font CDN 404'd twice
// in one day mid-build (Inter, then Montserrat), and each failure took the
// whole deploy down while leaving production on stale code — an outage we
// could neither predict nor fix. These are the same latin subsets Google
// serves, and both are variable fonts, so one file per family covers every
// weight the CSS asks for.
const montserrat = localFont({
  src: "./fonts/montserrat-latin-variable.woff2",
  variable: "--font-montserrat",
  weight: "100 900",
  style: "normal",
  display: "swap",
  preload: true,
});

const inter = localFont({
  src: "./fonts/inter-latin-variable.woff2",
  variable: "--font-inter",
  weight: "100 900",
  style: "normal",
  display: "swap",
  preload: false,
});

export const metadata = {
  // This app IS the catalog site, so every canonical, hreflang and og:url it
  // emits has to resolve to its own origin. Pointing metadataBase at the main
  // WordPress domain made each page tell Google "the real version of me lives
  // somewhere else", which is exactly the instruction not to rank this site.
  metadataBase: new URL(LIVE_SITE_URL),
  title: {
    default: "Péptidos de Investigación en Costa Rica | Peptides Costa Rica",
    template: "%s | Peptides Costa Rica",
  },
  description: "Péptidos para investigación disponibles localmente en Costa Rica, con documentación de lote, precios claros y entrega coordinada dentro del país.",
  keywords: [
    "péptidos Costa Rica",
    "research peptides Costa Rica",
    "peptide catalog Costa Rica",
    "COA peptides",
    "laboratory research peptides",
    "Peptides Costa Rica",
  ],
  alternates: {
    canonical: '/',
    languages: {
      'es-CR': '/?lang=es',
      'en-US': '/?lang=en',
    },
  },
  openGraph: {
    title: "Péptidos de Investigación en Costa Rica",
    description: "Inventario local, documentación de lote y entrega dentro de Costa Rica.",
    url: '/',
    siteName: 'Peptides Costa Rica',
    locale: 'es_CR',
    alternateLocale: ['en_US'],
    type: 'website',
    images: [
      {
        url: '/catalog-promo-banner.webp',
        width: 1200,
        height: 630,
        alt: 'Peptides Costa Rica catalog preview',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Péptidos de Investigación en Costa Rica',
    description: 'Inventario local, documentación de lote y entrega dentro de Costa Rica.',
    images: ['/catalog-promo-banner.webp'],
  },
  robots: { index: true, follow: true },
  icons: {
    icon: '/favicon.png',
    shortcut: '/favicon.png',
    apple: '/favicon.png',
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1.0,
  viewportFit: "cover",
};

import { getBusinessLinks } from "@/lib/settings";

export default async function RootLayout({ children }) {
  const businessLinks = await getBusinessLinks();
  
  return (
    <html lang="es" className={`${montserrat.variable} ${inter.variable}`} suppressHydrationWarning>
      <head suppressHydrationWarning>
        <Script id="tiktok-pixel" strategy="beforeInteractive">
          {getTikTokPixelBootstrapScript()}
        </Script>
        {/* Mgid Sensor */}
        <Script id="mgid-sensor" strategy="afterInteractive">
          {`(function() {
              var d = document, w = window;
              w.MgSensorData = w.MgSensorData || [];
              w.MgSensorData.push({
                  cid:988745,
                  project: "a.mgid.com"
              });
              var l = "a.mgid.com";
              var n = d.getElementsByTagName("script")[0];
              var s = d.createElement("script");
              s.type = "text/javascript";
              s.async = true;
              var dt = !Date.now?new Date().valueOf():Date.now();
              s.src = "https://" + l + "/mgsensor.js?d=" + dt;
              n.parentNode.insertBefore(s, n);
          })();`}
        </Script>
        {/* /Mgid Sensor */}
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                if (typeof window !== 'undefined') {
                  const nativeRemoveChild = Node.prototype.removeChild;
                  Node.prototype.removeChild = function(child) {
                    if (child.parentNode !== this) {
                      return child;
                    }
                    return nativeRemoveChild.apply(this, arguments);
                  };
                  const nativeInsertBefore = Node.prototype.insertBefore;
                  Node.prototype.insertBefore = function(newNode, referenceNode) {
                    if (referenceNode && referenceNode.parentNode !== this) {
                      return newNode;
                    }
                    return nativeInsertBefore.apply(this, arguments);
                  };
                }
              })();
            `
          }}
        />
        <script
          type="application/ld+json"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "Organization",
                  "@id": `${LIVE_SITE_URL}/#organization`,
                  "name": "Peptides Costa Rica",
                  "url": LIVE_SITE_URL,
                  "logo": `${LIVE_SITE_URL}/logo.png`,
                  "contactPoint": {
                    "@type": "ContactPoint",
                    "telephone": businessLinks.whatsappDisplay,
                    "contactType": "customer service",
                    "areaServed": "CR",
                    "availableLanguage": ["es", "en"]
                  }
                },
                {
                  "@type": "WebSite",
                  "@id": `${LIVE_SITE_URL}/#website`,
                  "url": LIVE_SITE_URL,
                  "name": "Peptides Costa Rica",
                  "publisher": {
                    "@id": `${LIVE_SITE_URL}/#organization`
                  },
                  "inLanguage": ["es-CR", "en-US"]
                },
                {
                  "@type": "Store",
                  "@id": `${LIVE_SITE_URL}/#store`,
                  "name": "Peptides Costa Rica",
                  "url": `${LIVE_SITE_URL}/catalog`,
                  "image": `${LIVE_SITE_URL}/catalog-promo-banner.webp`,
                  "telephone": businessLinks.whatsappDisplay,
                  "areaServed": {
                    "@type": "Country",
                    "name": "Costa Rica"
                  },
                  "availableLanguage": ["Spanish", "English"],
                  "parentOrganization": {
                    "@id": `${LIVE_SITE_URL}/#organization`
                  }
                }
              ]
            })
          }}
        />
        {/* Preconnect to critical third-party origins */}
        <link rel="preconnect" href="https://www.googletagmanager.com" />
        <link rel="preconnect" href="https://analytics.tiktok.com" />
        <link rel="preconnect" href="https://cbanvzipzfmllexraiei.supabase.co" />
        {/* Preload the logo — it's the LCP element on catalog & home */}
        <link
          rel="preload"
          href="/logo.webp"
          as="image"
          type="image/webp"
        />
      </head>
      <body suppressHydrationWarning>
        <a className="skip-link" href="#main-content">Skip to main content</a>
        {/* Google Tag Manager — noscript fallback */}
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-M2GVDQ44"
            height="0"
            width="0"
            style={{ display: 'none', visibility: 'hidden' }}
          />
        </noscript>
        {children}
        <AnalyticsTracker />
        <UTMTracker />
        <GlobalContactForm />
        {/* Google Tag Manager */}
        <Script id="gtm" strategy="lazyOnload">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
          new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
          j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
          'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
          })(window,document,'script','dataLayer','GTM-M2GVDQ44');`}
        </Script>
      </body>
    </html>
  );
}
