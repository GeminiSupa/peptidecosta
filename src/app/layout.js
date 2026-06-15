import { Montserrat, Inter } from "next/font/google";
import "./globals.css";
import ExitIntentPopup from "@/components/ExitIntentPopup";
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "700"],
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

export default function RootLayout({ children }) {
  return (
    <html lang="es" className={`${montserrat.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        <script
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
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              "name": "Peptides Costa Rica",
              "url": "https://peptidescostarica.net",
              "logo": "https://peptidescostarica.net/logo.png",
              "contactPoint": {
                "@type": "ContactPoint",
                "telephone": "+506-8404-6973",
                "contactType": "customer service",
                "areaServed": "CR",
                "availableLanguage": ["es", "en"]
              }
            })
          }}
        />
      </head>
      <body suppressHydrationWarning>
        {children}
        <ExitIntentPopup />
      </body>
    </html>
  );
}
