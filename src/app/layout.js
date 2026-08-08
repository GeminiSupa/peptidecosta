import { Montserrat, Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import UTMTracker from "@/components/UTMTracker";
import ChatWidget from "@/components/ChatWidget";
import GlobalContactForm from "@/components/GlobalContactForm";
import { LIVE_SITE_URL } from "@/lib/publicUrl";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["400", "600", "800"],
  display: "swap",
  preload: true,
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "700"],
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
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
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
        <UTMTracker />
        <ChatWidget />
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
