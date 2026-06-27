import { Montserrat, Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import ExitIntentPopup from "@/components/ExitIntentPopup";
import UTMTracker from "@/components/UTMTracker";
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
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
  metadataBase: new URL('https://peptidescostarica.net'),
  title: "Peptides Costa Rica | Catálogo Premium",
  description: "Descubra nuestra selección premium de péptidos de investigación en Costa Rica. Alta pureza, descuentos por volumen y envíos garantizados. ¡Optimice hoy mismo!",
  openGraph: {
    title: "Peptides Costa Rica | Catálogo Premium",
    description: "Descubra nuestra selección premium de péptidos de investigación en Costa Rica. Alta pureza, descuentos por volumen y envíos garantizados. ¡Optimice hoy mismo!",
    images: ['/logo.png'],
  },
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
              "@type": "Organization",
              "name": "Peptides Costa Rica",
              "url": "https://peptidescostarica.net",
              "logo": "https://peptidescostarica.net/logo.png",
              "contactPoint": {
                "@type": "ContactPoint",
                "telephone": businessLinks.whatsappDisplay,
                "contactType": "customer service",
                "areaServed": "CR",
                "availableLanguage": ["es", "en"]
              }
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
        <ExitIntentPopup />
        <UTMTracker />
        {/* Google Tag Manager */}
        <Script id="gtm" strategy="afterInteractive">
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
